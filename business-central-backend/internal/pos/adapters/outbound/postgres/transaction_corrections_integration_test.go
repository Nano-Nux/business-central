package postgres_test

import (
	authdto "business-central-backend/internal/auth/application/dto"
	historypg "business-central-backend/internal/operations/adapters/outbound/postgres"
	pospg "business-central-backend/internal/pos/adapters/outbound/postgres"
	posdto "business-central-backend/internal/pos/application/dto"
	"context"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestConfiguredDatabaseTransactionCorrections(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	pool := deliveryTestPool(t, ctx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	merchant, shop, location, unit, product, variant, list, identity, member, role := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Correction test',$1::text,'USD')`, merchant)
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$2,'Main','MAIN')`, shop, merchant)
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1::uuid,$1::text||'@example.test','unused')`, identity)
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name) VALUES($1,$2,$3,'Owner')`, member, merchant, identity)
	exec(`INSERT INTO roles(id,merchant_id,code,name) VALUES($1,$2,'merchant','Owner')`, role, merchant)
	exec(`INSERT INTO membership_roles(merchant_id,membership_id,role_id) VALUES($1,$2,$3)`, merchant, member, role)
	exec(`INSERT INTO role_permissions(role_id,permission_code) VALUES($1,'tenant.write')`, role)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$2,$3,'MAIN','Main','SHOP')`, location, merchant, shop)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code) VALUES($1,$2,'EA','Each','COUNT')`, unit, merchant)
	exec(`INSERT INTO products(id,merchant_id,name,product_type) VALUES($1,$2,'Widget','PHYSICAL')`, product, merchant)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id,is_stock_tracked) VALUES($1,$2,$3,'WIDGET','Widget',$4,true)`, variant, merchant, product, unit)
	exec(`INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1,$2,'RETAIL','USD',true)`, list, merchant)
	exec(`INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount) VALUES($1,$2,$3,10)`, merchant, list, variant)
	exec(`INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_cost,event_key) VALUES($1,$2,'ADJUSTMENT',$3,20,3,'opening')`, merchant, variant, location)
	c := &authdto.Claims{IdentityID: identity, MerchantID: merchant, MembershipID: member}
	svc := pospg.NewService(pool)
	history := historypg.NewService(pool)
	order, err := svc.CreateSale(ctx, c, posdto.CreateSaleRequest{ShopID: shop, PaymentMethod: "Cash", IdempotencyKey: uuid.NewString(), Lines: []posdto.SaleLineRequest{{VariantID: variant, Quantity: "2"}}})
	if err != nil {
		t.Fatal(err)
	}
	detail, err := history.GetTransactionHistoryDetail(ctx, c, order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Entry.ProductName != "Widget" {
		t.Fatalf("history product names = %q, want Widget", detail.Entry.ProductName)
	}
	guardTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = guardTx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true),set_config('app.purge_order',$3,true),set_config('app.purge_merchant',$2,true)`, identity, merchant, order.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = guardTx.Exec(ctx, `DELETE FROM payments WHERE merchant_id=$1 AND order_id=$2`, merchant, order.ID); err == nil {
		t.Fatal("direct ledger delete bypassed the guarded correction")
	}
	_ = guardTx.Rollback(ctx)
	request := posdto.TransactionEditRequest{ShopID: shop, ExpectedUpdatedAt: detail.Order.UpdatedAt.Format(time.RFC3339Nano), IdempotencyKey: uuid.NewString(), PaymentMethod: "Cash", DeliveryFee: "2", DeliveryPaymentStatus: "UN_PAID", CustomerName: "Edited", Note: "Corrected", Lines: []posdto.TransactionLineRequest{{VariantID: variant, Quantity: "3", UnitPrice: "12", DiscountAmount: "1", TaxAmount: "2"}}}
	wrong := *c
	wrong.MerchantID = uuid.NewString()
	if _, err = svc.UpdateTransaction(ctx, &wrong, order.ID, request); err == nil {
		t.Fatal("cross merchant edit succeeded")
	}
	stale := request
	stale.ExpectedUpdatedAt = "2000-01-01T00:00:00Z"
	stale.IdempotencyKey = uuid.NewString()
	if _, err = svc.UpdateTransaction(ctx, c, order.ID, stale); err == nil {
		t.Fatal("stale edit succeeded")
	}
	exec(`DELETE FROM membership_roles WHERE merchant_id=$1 AND membership_id=$2`, merchant, member)
	if _, err = svc.UpdateTransaction(ctx, c, order.ID, request); err == nil {
		t.Fatal("staff edit succeeded")
	}
	exec(`INSERT INTO membership_roles(merchant_id,membership_id,role_id) VALUES($1,$2,$3)`, merchant, member, role)
	changed, err := svc.UpdateTransaction(ctx, c, order.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	if changed.ID != order.ID || changed.GrandTotal != "39.00" {
		t.Fatalf("unexpected edit: %+v", changed)
	}
	if _, err = svc.UpdateTransaction(ctx, c, order.ID, request); err != nil {
		t.Fatal("edit retry", err)
	}
	var balance string
	err = pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE merchant_id=$1 AND variant_id=$2`, merchant, variant).Scan(&balance)
	if err != nil || balance != "17.000000" {
		t.Fatalf("balance %s: %v", balance, err)
	}
	detail, err = history.GetTransactionHistoryDetail(ctx, c, order.ID)
	if err != nil {
		t.Fatal(err)
	}
	request.IdempotencyKey = uuid.NewString()
	request.ExpectedUpdatedAt = detail.Order.UpdatedAt.Format(time.RFC3339Nano)
	request.Lines[0].Quantity = "1000"
	if _, err = svc.UpdateTransaction(ctx, c, order.ID, request); err == nil {
		t.Fatal("expected insufficient stock rollback")
	}
	detail, err = history.GetTransactionHistoryDetail(ctx, c, order.ID)
	if err != nil || detail.Order.GrandTotal != "39.00" {
		t.Fatalf("rollback failed: %v", err)
	}
	var paymentID string
	if err = pool.QueryRow(ctx, `SELECT id::text FROM payments WHERE merchant_id=$1 AND order_id=$2 AND purpose='ORDER'`, merchant, order.ID).Scan(&paymentID); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.CreateRefund(ctx, c, order.ID, posdto.CreateRefundRequest{PaymentID: paymentID, Amount: "1", IdempotencyKey: uuid.NewString(), Reason: "Correction regression"}); err != nil {
		t.Fatal(err)
	}
	detail, err = history.GetTransactionHistoryDetail(ctx, c, order.ID)
	if err != nil {
		t.Fatal(err)
	}
	del := posdto.TransactionDeleteRequest{ShopID: shop, ExpectedUpdatedAt: detail.Order.UpdatedAt.Format(time.RFC3339Nano), IdempotencyKey: uuid.NewString()}
	if err = svc.DeleteTransaction(ctx, c, order.ID, del); err != nil {
		t.Fatal(err)
	}
	if err = svc.DeleteTransaction(ctx, c, order.ID, del); err != nil {
		t.Fatal("delete retry", err)
	}
	for _, table := range []string{"orders", "order_lines", "payments", "refunds"} {
		var count int
		column := "order_id"
		if table == "orders" {
			column = "id"
		}
		if err = pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE merchant_id=$1 AND "+column+"=$2", merchant, order.ID).Scan(&count); err != nil || count != 0 {
			t.Fatalf("%s retained data: %d %v", table, count, err)
		}
	}
	if err = pool.QueryRow(ctx, `SELECT quantity_on_hand::text FROM inventory_balances WHERE merchant_id=$1 AND variant_id=$2`, merchant, variant).Scan(&balance); err != nil || balance != "20.000000" {
		t.Fatalf("stock not restored: %s %v", balance, err)
	}
}
