package postgres_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationspostgres "business-central-backend/internal/operations/adapters/outbound/postgres"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	posdto "business-central-backend/internal/pos/application/dto"
	syncpostgres "business-central-backend/internal/synchronization/adapters/outbound/postgres"
	syncdto "business-central-backend/internal/synchronization/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func deliveryTestPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("requires isolated PostgreSQL schema")
	}
	admin, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	name := "delivery_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	t.Log("isolated schema:", name)
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		rows, err := admin.Query(cleanupCtx, `SELECT tablename FROM pg_tables WHERE schemaname=$1`, name)
		if err != nil {
			t.Error(err)
			return
		}
		names := []string{}
		for rows.Next() {
			var table string
			if err := rows.Scan(&table); err != nil {
				t.Error(err)
			}
			names = append(names, table)
		}
		rows.Close()
		// Drop one table per transaction to stay within hosted PostgreSQL lock limits.
		for _, table := range names {
			if _, err := admin.Exec(cleanupCtx, "DROP TABLE IF EXISTS "+pgx.Identifier{name, table}.Sanitize()+" CASCADE"); err != nil {
				t.Error(err)
			}
		}
		if _, err := admin.Exec(cleanupCtx, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = name + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	schema, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	return pool
}

func TestConfiguredDatabaseDeliveryPayment(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()
	pool := deliveryTestPool(t, ctx)
	for _, mode := range []string{"NANO", "MINI", "SIMPLE", "COMPLEX"} {
		t.Run(mode, func(t *testing.T) {
			exec := func(sql string, args ...any) {
				t.Helper()
				if _, err := pool.Exec(ctx, sql, args...); err != nil {
					t.Fatal(err)
				}
			}
			merchant, shop, otherShop, location, otherLocation, unit, product, variant, list, identity, member := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
			exec(`INSERT INTO merchants(id,name,slug,default_currency_code,pos_complexity_level) VALUES($1::uuid,'Delivery test',$1::text,'USD',$2)`, merchant, mode)
			exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$3,'Main','MAIN'),($2,$3,'Other','OTHER')`, shop, otherShop, merchant)
			exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1::uuid,$1::text||'@example.test','unused')`, identity)
			exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name) VALUES($1,$2,$3,'Owner')`, member, merchant, identity)
			exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$3,$4,'MAIN','Main','SHOP'),($2,$3,$5,'OTHER','Other','SHOP')`, location, otherLocation, merchant, shop, otherShop)
			exec(`INSERT INTO payment_settings(merchant_id,shop_id,include_tax,tax_rate,delivery_payment_status_auto_complete) VALUES($1,$2,true,10,false),($1,$3,true,10,true)`, merchant, shop, otherShop)
			exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code) VALUES($1,$2,'EA','Each','COUNT')`, unit, merchant)
			exec(`INSERT INTO products(id,merchant_id,name,product_type) VALUES($1,$2,'Widget','PHYSICAL')`, product, merchant)
			exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id,is_stock_tracked) VALUES($1,$2,$3,'WIDGET','Widget',$4,false)`, variant, merchant, product, unit)
			exec(`INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1,$2,'RETAIL','USD',true)`, list, merchant)
			exec(`INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount) VALUES($1,$2,$3,100)`, merchant, list, variant)
			claims := &authdto.Claims{IdentityID: identity, MerchantID: merchant, MembershipID: member}
			service := pospostgres.NewService(pool)
			request := posdto.CreateSaleRequest{ShopID: shop, DeliveryFee: "7", ManualPromotion: "10", PaymentMethod: "Cash", IdempotencyKey: uuid.NewString(), Lines: []posdto.SaleLineRequest{{VariantID: variant, Quantity: "1"}}}
			order, err := service.CreateSale(ctx, claims, request)
			if err != nil {
				t.Fatal(err)
			}
			if order.GrandTotal != "106.00" || order.DeliveryPaymentStatus != "UN_PAID" {
				t.Fatalf("unexpected checkout: %+v", order)
			}
			history := operationspostgres.NewService(pool)
			detail, err := history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil {
				t.Fatal(err)
			}
			if detail.Entry.PaidTotal != "99.00" || detail.Entry.OutstandingTotal != "7.00" || detail.Entry.PaymentStatus != "COMPLETE" {
				t.Fatalf("wrong initial balance: %+v", detail.Entry)
			}
			collectionKey := uuid.NewString()
			var wg sync.WaitGroup
			errors := make(chan error, 2)
			for i := 0; i < 2; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					_, err := service.UpdateDeliveryPayment(ctx, claims, order.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "COMPLETE", ExpectedStatus: "UN_PAID", IdempotencyKey: collectionKey})
					errors <- err
				}()
			}
			wg.Wait()
			close(errors)
			for err := range errors {
				if err != nil {
					t.Fatal(err)
				}
			}
			detail, err = history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil {
				t.Fatal(err)
			}
			if detail.Entry.PaidTotal != "106.00" || detail.Entry.OutstandingTotal != "0.00" || detail.Order.GrandTotal != "106.00" || detail.Order.DeliveryPaymentStatus != "COMPLETE" {
				t.Fatalf("wrong completion: %+v", detail)
			}
			var count int
			if err = pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE merchant_id=$1 AND order_id=$2 AND purpose='DELIVERY'`, merchant, order.ID).Scan(&count); err != nil || count != 1 {
				t.Fatalf("duplicate collection: %d, %v", count, err)
			}
			reverseRequest := posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "UN_PAID", ExpectedStatus: "COMPLETE", IdempotencyKey: uuid.NewString()}
			for i := 0; i < 2; i++ {
				if _, err = service.UpdateDeliveryPayment(ctx, claims, order.ID, reverseRequest); err != nil {
					t.Fatal(err)
				}
			}
			detail, err = history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil {
				t.Fatal(err)
			}
			if detail.Entry.PaidTotal != "99.00" || detail.Entry.OutstandingTotal != "7.00" || detail.Order.GrandTotal != "106.00" {
				t.Fatalf("wrong reversal: %+v", detail.Entry)
			}
			if _, err = service.UpdateDeliveryPayment(ctx, claims, order.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "COMPLETE", ExpectedStatus: "UN_PAID", IdempotencyKey: uuid.NewString()}); err != nil {
				t.Fatal(err)
			}
			detail, err = history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil {
				t.Fatal(err)
			}
			if detail.Entry.PaidTotal != "106.00" || detail.Entry.OutstandingTotal != "0.00" {
				t.Fatalf("wrong re-collection: %+v", detail.Entry)
			}
			invoices, err := service.ListInvoices(ctx, claims)
			if err != nil || len(invoices) != 1 || invoices[0].DeliveryPaymentStatus != "COMPLETE" {
				t.Fatalf("invoice status: %+v, %v", invoices, err)
			}
			request.ShopID = otherShop
			request.IdempotencyKey = uuid.NewString()
			request.DeliveryPaymentStatus = "UN_PAID"
			autoOrder, err := service.CreateSale(ctx, claims, request)
			if err != nil || autoOrder.DeliveryPaymentStatus != "COMPLETE" {
				t.Fatalf("shop override: %+v, %v", autoOrder, err)
			}
			off := false
			updatedShop, err := service.UpdateShop(ctx, claims, otherShop, posdto.ShopRequest{Name: "Other", Code: "OTHER", DeliveryPaymentStatusAutoComplete: &off})
			if err != nil || updatedShop.DeliveryPaymentStatusAutoComplete {
				t.Fatalf("shop preference persistence: %+v, %v", updatedShop, err)
			}
			storedShop, err := service.GetShop(ctx, claims, otherShop)
			if err != nil || storedShop.DeliveryPaymentStatusAutoComplete {
				t.Fatalf("shop preference read: %+v, %v", storedShop, err)
			}
			oldDetail, err := history.GetTransactionHistoryDetail(ctx, claims, autoOrder.ID)
			if err != nil || oldDetail.Order.DeliveryPaymentStatus != "COMPLETE" {
				t.Fatal("switch retroactively changed an order", err)
			}
			if _, err = service.UpdateDeliveryPayment(ctx, claims, order.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "UN_PAID", ExpectedStatus: "UN_PAID", IdempotencyKey: uuid.NewString()}); err == nil {
				t.Fatal("stale status update accepted")
			}
			// A partially refunded delivery receipt is replenished only by its shortfall.
			var deliveryReceipt string
			if err = pool.QueryRow(ctx, `SELECT id::text FROM payments WHERE merchant_id=$1 AND order_id=$2 AND purpose='DELIVERY' AND status='CAPTURED' ORDER BY created_at DESC LIMIT 1`, merchant, order.ID).Scan(&deliveryReceipt); err != nil {
				t.Fatal(err)
			}
			if _, err = service.CreateRefund(ctx, claims, order.ID, posdto.CreateRefundRequest{PaymentID: deliveryReceipt, Amount: "2", Reason: "Partial delivery correction", IdempotencyKey: uuid.NewString()}); err != nil {
				t.Fatal(err)
			}
			if _, err = service.UpdateDeliveryPayment(ctx, claims, order.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "COMPLETE", ExpectedStatus: "UN_PAID", IdempotencyKey: uuid.NewString()}); err != nil {
				t.Fatal(err)
			}
			detail, err = history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil || detail.Entry.PaidTotal != "106.00" || detail.Entry.OutstandingTotal != "0.00" {
				t.Fatalf("partial refund recollection: %+v, %v", detail.Entry, err)
			}

			// Reopening after partial-refund replenishment reverses both remaining receipts.
			if _, err = service.UpdateDeliveryPayment(ctx, claims, order.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "UN_PAID", ExpectedStatus: "COMPLETE", IdempotencyKey: uuid.NewString()}); err != nil {
				t.Fatal(err)
			}
			detail, err = history.GetTransactionHistoryDetail(ctx, claims, order.ID)
			if err != nil || detail.Entry.PaidTotal != "99.00" || detail.Entry.OutstandingTotal != "7.00" || detail.Entry.PaymentStatus != "COMPLETE" {
				t.Fatalf("partial refund reversal: %+v, %v", detail.Entry, err)
			}
			// The actual synchronization path preserves both new and legacy receipts.
			syncRepo := syncpostgres.NewRepository(pool)
			syncClaims := *claims
			// Isolated test-schema permission helpers reference public; bypass only
			// that fixture authorization lookup. HTTP role/permission tests remain separate.
			syncClaims.PlatformAdmin = true
			handshake, err := syncRepo.RegisterDevice(ctx, &syncClaims, syncdto.RegisterDeviceRequest{DeviceIdentifier: uuid.NewString(), ClientSessionKey: uuid.NewString(), Scope: "SHOP:" + shop})
			if err != nil {
				t.Fatal(err)
			}
			push := func(status string) syncdto.OperationResult {
				t.Helper()
				req := request
				req.ShopID = shop
				req.DeliveryPaymentStatus = status
				snapshot := map[string]string{"currency_code": "USD", "subtotal": "100.00", "discount_total": "10.00", "tax_total": "9.00", "grand_total": "106.00"}
				if status != "" {
					snapshot["delivery_payment_status"] = status
				}
				payload, _ := json.Marshal(map[string]any{"shop_id": shop, "request": req, "snapshot": snapshot, "line_snapshots": []any{}, "inventory_snapshots": []any{}})
				response, err := syncRepo.Push(ctx, &syncClaims, syncdto.PushRequest{SessionID: handshake.Session.ID, Operations: []syncdto.Operation{{ClientOperationID: uuid.NewString(), EntityType: "POS_CHECKOUT", EntityID: uuid.NewString(), ShopID: &shop, OperationType: "CREATE", Payload: payload}}})
				if err != nil {
					t.Fatal(err)
				}
				if len(response.Results) != 1 {
					t.Fatal("missing replay result")
				}
				return response.Results[0]
			}
			for _, status := range []string{"UN_PAID", ""} {
				replay := push(status)
				if replay.Status != "APPLIED" {
					t.Fatalf("checkout replay: %+v", replay)
				}
				var payload struct {
					Order posdto.SaleOrder `json:"canonical_order"`
				}
				if err = json.Unmarshal(replay.ServerPayload, &payload); err != nil {
					t.Fatal(err)
				}
				replayDetail, err := history.GetTransactionHistoryDetail(ctx, claims, payload.Order.ID)
				want := "99.00"
				if status == "" {
					want = "106.00"
				}
				if err != nil || replayDetail.Entry.PaidTotal != want {
					t.Fatalf("replay balance: %+v, %v", replayDetail.Entry, err)
				}
			}
			exec(`UPDATE payment_settings SET delivery_payment_status_auto_complete=true WHERE merchant_id=$1 AND shop_id=$2`, merchant, shop)
			var before, after int
			if err = pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE merchant_id=$1`, merchant).Scan(&before); err != nil {
				t.Fatal(err)
			}
			mismatch := push("UN_PAID")
			if mismatch.Code != "CHECKOUT_RECONCILIATION_REQUIRED" {
				t.Fatalf("changed default should require review: %+v", mismatch)
			}
			if err = pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE merchant_id=$1`, merchant).Scan(&after); err != nil || before != after {
				t.Fatal("rejected replay retained an order", err)
			}
			exec(`UPDATE user_memberships SET shop_id=$2 WHERE id=$1`, member, shop)
			if _, err = service.UpdateDeliveryPayment(ctx, claims, autoOrder.ID, posdto.DeliveryPaymentRequest{DeliveryPaymentStatus: "COMPLETE", ExpectedStatus: "UN_PAID", IdempotencyKey: collectionKey}); err == nil {
				t.Fatal("cross-shop update allowed")
			}
			_, _, err = history.ListTransactionHistory(ctx, claims, app.ListQuery{PageSize: 10, Filters: map[string]string{"shop_id": shop}})
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}
