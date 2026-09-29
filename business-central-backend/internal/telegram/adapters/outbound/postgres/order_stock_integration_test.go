package postgres

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	"business-central-backend/internal/telegram/domain"
	"business-central-backend/internal/telegram/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfiguredDatabaseTelegramMultiProductStock(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 with a test DATABASE_URL that permits creating schemas")
	}
	if os.Getenv("DATABASE_URL") == "" {
		t.Fatal("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	adminPool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer adminPool.Close()
	// Use the actual canonical schema in a private namespace. Immutable stock
	// records can then be cleaned up without disabling their production triggers.
	schemaName := "telegram_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	quotedSchema := pgx.Identifier{schemaName}.Sanitize()
	if _, err = adminPool.Exec(ctx, `CREATE SCHEMA `+quotedSchema); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := adminPool.Exec(context.Background(), `DROP SCHEMA `+quotedSchema+` CASCADE`); err != nil {
			t.Error(err)
		}
	}()
	config, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schemaName + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	schema, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(schema)); err != nil {
		t.Fatalf("initialize isolated canonical schema: %v", err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	merchantID, shopID, connectionID, locationID, unitID, priceListID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1,'Multi-product test','multi-product-test','USD')`, merchantID)
	exec(`INSERT INTO shops(id,merchant_id,code,name) VALUES($1,$2,'SHOP','Test shop')`, shopID, merchantID)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$2,$3,'SHOP','Test stock','SHOP')`, locationID, merchantID, shopID)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name) VALUES($1,$2,'EA','Each')`, unitID, merchantID)
	exec(`INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1,$2,'DEFAULT','USD',true)`, priceListID, merchantID)
	exec(`INSERT INTO telegram_group_connections(id,merchant_id,shop_id,telegram_chat_id,group_title,group_type,bot_admin_status) VALUES($1,$2,$3,-100123,'Test group','supergroup',true)`, connectionID, merchantID, shopID)
	variantIDs := []string{uuid.NewString(), uuid.NewString()}
	for index, name := range []string{"wo phone", "travel-mate-p214"} {
		productID := uuid.NewString()
		exec(`INSERT INTO products(id,merchant_id,name) VALUES($1,$2,$3)`, productID, merchantID, name)
		exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id) VALUES($1,$2,$3,$4,'Standard',$5)`, variantIDs[index], merchantID, productID, []string{"WO-001", "LAPTOP"}[index], unitID)
		exec(`INSERT INTO variant_inventory_policies(merchant_id,variant_id,track_reservations) VALUES($1,$2,true) ON CONFLICT(merchant_id,variant_id) DO UPDATE SET track_reservations=true`, merchantID, variantIDs[index])
		exec(`INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount) VALUES($1,$2,$3,$4)`, merchantID, priceListID, variantIDs[index], []int{800000, 1000000}[index])
		exec(`INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_cost,event_key) VALUES($1,$2,'ADJUSTMENT',$3,10,600000,$4)`, merchantID, variantIDs[index], locationID, "opening:"+variantIDs[index])
	}
	repo := NewRepository(pool)
	invoices := pospostgres.NewService(pool)
	invoiceClaims := &authdto.Claims{MerchantID: merchantID}
	assertInvoice := func(orderID, wantStatus string, wantName *string, wantVisible bool) {
		t.Helper()
		rows, err := invoices.ListInvoices(ctx, invoiceClaims)
		if err != nil {
			t.Fatal(err)
		}
		for _, invoice := range rows {
			if invoice.ID != orderID {
				continue
			}
			if !wantVisible || invoice.Status != wantStatus || invoice.Channel != "TELEGRAM" || (invoice.Customer == nil) != (wantName == nil) || (wantName != nil && *invoice.Customer != *wantName) {
				t.Fatalf("incorrect invoice: %+v", invoice)
			}
			return
		}
		if wantVisible {
			t.Fatalf("invoice missing for %s", orderID)
		}
	}
	input := func() outbound.DraftInput {
		return outbound.DraftInput{ConnectionID: connectionID, ChatID: -100123, MessageID: time.Now().UnixNano(), UserID: 42, UpdateID: time.Now().UnixNano(), CustomerName: "မနှင်း", Items: []domain.TakeOrderItem{{ProductName: "wo phone", Quantity: 1}, {ProductName: "travel-mate-p214", Quantity: 2}}, ExpiresAt: time.Now().Add(30 * time.Minute), ConfirmTokenHash: strings.Repeat("a", 32) + strings.ReplaceAll(uuid.NewString(), "-", ""), CancelTokenHash: strings.Repeat("b", 32) + strings.ReplaceAll(uuid.NewString(), "-", "")}
	}
	assertStock := func(wantOnHand, wantReserved []float64) {
		t.Helper()
		for i, id := range variantIDs {
			var onHand, reserved float64
			if err := pool.QueryRow(ctx, `SELECT quantity_on_hand::float8,quantity_reserved::float8 FROM inventory_balances WHERE merchant_id=$1::uuid AND variant_id=$2::uuid AND location_id=$3::uuid`, merchantID, id, locationID).Scan(&onHand, &reserved); err != nil || onHand != wantOnHand[i] || reserved != wantReserved[i] {
				t.Fatalf("stock %d: on hand %g reserved %g; want %g %g; %v", i, onHand, reserved, wantOnHand[i], wantReserved[i], err)
			}
		}
	}
	draft, err := repo.CreateDraft(ctx, input())
	if err != nil {
		t.Fatalf("create multi-product draft: %v", err)
	}
	if (draft.Order.CustomerName == nil || *draft.Order.CustomerName != "မနှင်း") || len(draft.Order.Items) != 2 || draft.Order.GrandTotal != "2800000.00" {
		t.Fatalf("incorrect draft: %+v", draft.Order)
	}
	assertStock([]float64{10, 10}, []float64{1, 2})
	assertInvoice(draft.Order.ID, "Pending", draft.Order.CustomerName, true)
	var customerName, customerType, customerLabel, paymentStatus string
	if err := pool.QueryRow(ctx, `SELECT c.display_name,c.customer_type,c.metadata->>'label',p.status FROM orders o JOIN customers c ON c.merchant_id=o.merchant_id AND c.id=o.customer_id JOIN payments p ON p.merchant_id=o.merchant_id AND p.order_id=o.id WHERE o.id=$1::uuid`, draft.Order.ID).Scan(&customerName, &customerType, &customerLabel, &paymentStatus); err != nil || customerName != *draft.Order.CustomerName || customerType != "GUEST" || customerLabel != "Online-Telegram-Customer" || paymentStatus != "PENDING" {
		t.Fatalf("customer/payment not linked: %s %s %s %s %v", customerName, customerType, customerLabel, paymentStatus, err)
	}
	claims := &authdto.Claims{MerchantID: merchantID, MembershipID: uuid.NewString(), PlatformAdmin: true}
	listed, err := repo.ListOrders(ctx, claims, connectionID, true)
	if err != nil || len(listed) != 1 || len(listed[0].Items) != 2 || (listed[0].CustomerName == nil || *listed[0].CustomerName != "မနှင်း") {
		t.Fatalf("list lost customer/lines: %+v %v", listed, err)
	}
	otherTenant := &authdto.Claims{MerchantID: uuid.NewString(), MembershipID: uuid.NewString()}
	listed, err = repo.ListOrders(ctx, otherTenant, connectionID, false)
	if err != nil || len(listed) != 0 {
		t.Fatalf("cross-tenant order exposed: %+v %v", listed, err)
	}
	if _, err := repo.TransitionOrder(ctx, otherTenant, draft.Order.ID, "CONFIRM", "WEBSITE", 0, false); err == nil {
		t.Fatal("cross-tenant confirmation accepted")
	}
	confirmed, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, "CONFIRM", "TELEGRAM", 42, true)
	if err != nil || len(confirmed.Items) != 2 || (confirmed.CustomerName == nil || *confirmed.CustomerName != "မနှင်း") {
		t.Fatalf("confirm all lines: %+v %v", confirmed, err)
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	assertInvoice(draft.Order.ID, "Paid", draft.Order.CustomerName, true)
	if confirmed.PaymentStatus != "Paid" {
		t.Fatalf("confirmation missing paid status: %+v", confirmed)
	}
	var captured, captureEvents int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE merchant_id=$1::uuid AND status='CAPTURED' AND amount=2800000 AND captured_at IS NOT NULL`, merchantID).Scan(&captured); err != nil || captured != 1 {
		t.Fatalf("payment not captured: %d %v", captured, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounting_events WHERE merchant_id=$1::uuid AND event_type='PAYMENT_CAPTURED'`, merchantID).Scan(&captureEvents); err != nil || captureEvents != 1 {
		t.Fatalf("capture accounting event missing: %d %v", captureEvents, err)
	}
	var sales int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM inventory_movements WHERE merchant_id=$1::uuid AND movement_type='SALE'`, merchantID).Scan(&sales); err != nil || sales != 2 {
		t.Fatalf("missing sales: %d %v", sales, err)
	}
	if _, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, "CONFIRM", "TELEGRAM", 42, true); err == nil {
		t.Fatal("duplicate confirmation accepted")
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	if err := repo.StoreBotResponse(ctx, draft.Order.ID, 1234); err != nil {
		t.Fatal(err)
	}
	deliveries, err := repo.ClaimOutboxDeliveries(ctx, 10)
	if err != nil || len(deliveries) != 1 || len(deliveries[0].Order.Items) != 2 || (deliveries[0].Order.CustomerName == nil || *deliveries[0].Order.CustomerName != "မနှင်း") {
		t.Fatalf("outbox lost order details: %+v %v", deliveries, err)
	}
	if err := repo.FinishOutboxDelivery(ctx, deliveries[0].EventID, nil); err != nil {
		t.Fatal(err)
	}
	repeated := input()
	repeated.Items = append(repeated.Items, domain.TakeOrderItem{SKU: "WO-001", Quantity: 2})
	draft, err = repo.CreateDraft(ctx, repeated)
	if err != nil || len(draft.Order.Items) != 2 || draft.Order.Items[0].Quantity != "3.000000" {
		t.Fatalf("repeated product not combined: %+v %v", draft, err)
	}
	assertStock([]float64{9, 8}, []float64{3, 2})
	if _, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, "CANCEL", "TELEGRAM", 42, true); err != nil {
		t.Fatal(err)
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	for _, kind := range []string{"missing", "stock", "callback", "combined_quantity"} {
		bad := input()
		switch kind {
		case "missing":
			bad.Items[1].ProductName = "missing product"
		case "stock":
			bad.Items[1].Quantity = 100
		case "callback":
			bad.CancelTokenHash = bad.ConfirmTokenHash
		case "combined_quantity":
			bad.Items = []domain.TakeOrderItem{{ProductName: "wo phone", Quantity: 60000000000000}, {ProductName: "wo phone", Quantity: 60000000000000}}
		}
		_, err := repo.CreateDraft(ctx, bad)
		if err == nil {
			t.Fatalf("%s failure accepted", kind)
		}
		if kind == "missing" {
			var e *app.Error
			if !errors.As(err, &e) || e.Code != "PRODUCT_NOT_FOUND" {
				t.Fatalf("incorrect missing item error: %v", err)
			}
		}
		assertStock([]float64{9, 8}, []float64{0, 0})
		var count int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE merchant_id=$1::uuid`, merchantID).Scan(&count); err != nil || count != 2 {
			t.Fatalf("partial %s order left: %d %v", kind, count, err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM customers WHERE merchant_id=$1::uuid`, merchantID).Scan(&count); err != nil || count != 2 {
			t.Fatalf("partial %s customer left: %d %v", kind, count, err)
		}
	}
	// Fail the final reservation after the earlier line has been processed.
	// The order status, earlier consumption, and SALE must all roll back.
	draft, err = repo.CreateDraft(ctx, input())
	if err != nil {
		t.Fatal(err)
	}
	inactiveIndex := 0
	if variantIDs[0] < variantIDs[1] {
		inactiveIndex = 1
	}
	exec(`UPDATE inventory_reservations r SET status='RELEASED',released_at=now() FROM order_lines ol WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid AND r.merchant_id=ol.merchant_id AND r.order_line_id=ol.id AND r.variant_id=$3::uuid`, merchantID, draft.Order.ID, variantIDs[inactiveIndex])
	_, err = repo.TransitionOrder(ctx, nil, draft.Order.ID, "CONFIRM", "TELEGRAM", 42, true)
	var reservationErr *app.Error
	if !errors.As(err, &reservationErr) || reservationErr.Code != "RESERVATION_INACTIVE" {
		t.Fatalf("inactive reservation confirmation: %v", err)
	}
	wantReserved := []float64{1, 2}
	wantReserved[inactiveIndex] = 0
	assertStock([]float64{9, 8}, wantReserved)
	var draftStatus string
	if err := pool.QueryRow(ctx, `SELECT status FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, draft.Order.ID).Scan(&draftStatus); err != nil || draftStatus != "DRAFT" {
		t.Fatalf("partial confirmation: %s %v", draftStatus, err)
	}
	assertInvoice(draft.Order.ID, "Pending", draft.Order.CustomerName, true)
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounting_events WHERE merchant_id=$1::uuid AND event_type='PAYMENT_CAPTURED'`, merchantID).Scan(&captureEvents); err != nil || captureEvents != 1 {
		t.Fatalf("failed confirmation leaked payment capture: %d %v", captureEvents, err)
	}
	if _, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, "CANCEL", "TELEGRAM", 42, true); err != nil {
		t.Fatal(err)
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	draft, err = repo.CreateDraft(ctx, input())
	if err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE telegram_order_sources SET expires_at=now()-interval '1 minute' WHERE order_id=$1::uuid`, draft.Order.ID)
	if err := repo.ExpireDrafts(ctx); err != nil {
		t.Fatal(err)
	}
	assertInvoice(draft.Order.ID, "", nil, false)
	if err := pool.QueryRow(ctx, `SELECT status FROM payments WHERE order_id=$1::uuid`, draft.Order.ID).Scan(&paymentStatus); err != nil || paymentStatus != "VOIDED" {
		t.Fatalf("expired payment not voided: %s %v", paymentStatus, err)
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	listed, err = repo.ListOrders(ctx, claims, connectionID, true)
	if err != nil || len(listed) != 4 || listed[0].Status != "EXPIRED" || len(listed[0].Items) != 2 {
		t.Fatalf("expiry did not preserve aggregate: %+v %v", listed, err)
	}
	var unused int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM telegram_callback_tokens WHERE order_id=$1::uuid AND consumed_at IS NULL`, draft.Order.ID).Scan(&unused); err != nil || unused != 0 {
		t.Fatalf("expiry left usable callbacks: %d %v", unused, err)
	}
	var customers int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM customers WHERE merchant_id=$1::uuid`, merchantID).Scan(&customers); err != nil || customers != 4 {
		t.Fatalf("guest customer records missing or failed drafts leaked customers: %d %v", customers, err)
	}
	// Decimal duplicates must fit the exact remaining stock: 0.1 + 0.2 = 0.3.
	holding := input()
	holding.Items = []domain.TakeOrderItem{{ProductName: "wo phone", Quantity: 8.7}}
	held, err := repo.CreateDraft(ctx, holding)
	if err != nil {
		t.Fatal(err)
	}
	fractional := input()
	fractional.Items = []domain.TakeOrderItem{{ProductName: "wo phone", Quantity: 0.1}, {SKU: "WO-001", Quantity: 0.2}}
	combined, err := repo.CreateDraft(ctx, fractional)
	if err != nil || len(combined.Order.Items) != 1 || combined.Order.Items[0].Quantity != "0.300000" {
		t.Fatalf("decimal duplicates exceeded available stock: %+v %v", combined, err)
	}
	assertStock([]float64{9, 8}, []float64{9, 0})
	for _, orderID := range []string{held.Order.ID, combined.Order.ID} {
		if _, err := repo.TransitionOrder(ctx, nil, orderID, "CANCEL", "TELEGRAM", 42, true); err != nil {
			t.Fatal(err)
		}
	}
	assertStock([]float64{9, 8}, []float64{0, 0})
	unnamed := input()
	unnamed.CustomerName = ""
	guest, err := repo.CreateDraft(ctx, unnamed)
	if err != nil || guest.Order.CustomerName != nil || guest.Order.PaymentStatus != "Pending" {
		t.Fatalf("unnamed customer was filled: %+v %v", guest, err)
	}
	assertInvoice(guest.Order.ID, "Pending", nil, true)
	if err := pool.QueryRow(ctx, `SELECT c.display_name,c.metadata->>'label' FROM orders o JOIN customers c ON c.merchant_id=o.merchant_id AND c.id=o.customer_id WHERE o.id=$1::uuid`, guest.Order.ID).Scan(&customerName, &customerLabel); err != nil || customerName != "" || customerLabel != "Online-Telegram-Customer" {
		t.Fatalf("source label replaced unnamed customer: %s %s %v", customerName, customerLabel, err)
	}
	if _, err := repo.TransitionOrder(ctx, nil, guest.Order.ID, "CONFIRM", "TELEGRAM", 42, true); err != nil {
		t.Fatal(err)
	}
	assertInvoice(guest.Order.ID, "Paid", nil, true)
	// The saved switch affects new orders only and uses the same atomic payment/stock transition.
	actorID := uuid.NewString()
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1,$2,'test')`, actorID, actorID+"@example.test")
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name,shop_id) VALUES($1,$2,$3,'Manager',$4)`, claims.MembershipID, merchantID, actorID, shopID)
	group, err := repo.GetGroup(ctx, claims, connectionID, false)
	if err != nil || group.AutoConfirmOrders {
		t.Fatalf("automatic confirmation must default OFF: %+v %v", group, err)
	}
	pending, err := repo.CreateDraft(ctx, input())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.SetAutoConfirm(ctx, otherTenant, connectionID, true, false); err == nil {
		t.Fatal("cross-tenant setting change allowed")
	}
	if group, err = repo.SetAutoConfirm(ctx, claims, connectionID, true, false); err != nil || !group.AutoConfirmOrders {
		t.Fatalf("enable failed: %+v %v", group, err)
	}
	automatic, err := repo.CreateDraft(ctx, input())
	if err != nil || automatic.Order.Status != "CONFIRMED" || automatic.Order.PaymentStatus != "Paid" || !automatic.Order.AutoConfirmed {
		t.Fatalf("new order not automatically paid: %+v %v", automatic, err)
	}
	assertInvoice(automatic.Order.ID, "Paid", automatic.Order.CustomerName, true)
	assertStock([]float64{7, 4}, []float64{1, 2})
	if err := pool.QueryRow(ctx, `SELECT status FROM orders WHERE id=$1::uuid`, pending.Order.ID).Scan(&draftStatus); err != nil || draftStatus != "DRAFT" {
		t.Fatalf("existing draft was confirmed: %s %v", draftStatus, err)
	}
	// Inject a failure after payment capture and the first stock sale. No draft,
	// customer, payment, reservation, sale, or retry job may remain for the failed order.
	var beforeOrders, beforeCustomers, beforePayments, beforeSales, beforeEvents int
	pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE merchant_id=$1::uuid`, merchantID).Scan(&beforeOrders)
	pool.QueryRow(ctx, `SELECT count(*) FROM customers WHERE merchant_id=$1::uuid`, merchantID).Scan(&beforeCustomers)
	pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE merchant_id=$1::uuid`, merchantID).Scan(&beforePayments)
	pool.QueryRow(ctx, `SELECT count(*) FROM inventory_movements WHERE merchant_id=$1::uuid AND movement_type='SALE'`, merchantID).Scan(&beforeSales)
	pool.QueryRow(ctx, `SELECT count(*) FROM outbox_events WHERE merchant_id=$1::uuid`, merchantID).Scan(&beforeEvents)
	exec(`CREATE FUNCTION fail_automatic_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.movement_type='SALE' THEN RAISE EXCEPTION 'injected automatic sale failure'; END IF; RETURN NEW; END $$`)
	exec(`CREATE TRIGGER fail_automatic_sale BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION fail_automatic_sale()`)
	if _, err := repo.CreateDraft(ctx, input()); err == nil {
		t.Fatal("automatic failure accepted")
	}
	exec(`DROP TRIGGER fail_automatic_sale ON inventory_movements`)
	for _, check := range []struct {
		query string
		want  int
	}{{`SELECT count(*) FROM orders WHERE merchant_id=$1::uuid`, beforeOrders}, {`SELECT count(*) FROM customers WHERE merchant_id=$1::uuid`, beforeCustomers}, {`SELECT count(*) FROM payments WHERE merchant_id=$1::uuid`, beforePayments}, {`SELECT count(*) FROM inventory_movements WHERE merchant_id=$1::uuid AND movement_type='SALE'`, beforeSales}, {`SELECT count(*) FROM outbox_events WHERE merchant_id=$1::uuid`, beforeEvents}} {
		var got int
		if err := pool.QueryRow(ctx, check.query, merchantID).Scan(&got); err != nil || got != check.want {
			t.Fatalf("automatic failure left partial writes: %d want %d %v", got, check.want, err)
		}
	}
	assertStock([]float64{7, 4}, []float64{1, 2})
	if _, err := repo.SetAutoConfirm(ctx, claims, connectionID, false, false); err != nil {
		t.Fatal(err)
	}
	later, err := repo.CreateDraft(ctx, input())
	if err != nil || later.Order.Status != "DRAFT" || later.Order.PaymentStatus != "Pending" || later.Order.AutoConfirmed {
		t.Fatalf("OFF did not restore manual confirmation: %+v %v", later, err)
	}
	var changes int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_events WHERE merchant_id=$1::uuid AND action='TELEGRAM_AUTO_CONFIRM_CHANGED' AND actor_membership_id=$2::uuid`, merchantID, claims.MembershipID).Scan(&changes); err != nil || changes != 2 {
		t.Fatalf("setting audit missing: %d %v", changes, err)
	}
	deliveries, err = repo.ClaimOutboxDeliveries(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, d := range deliveries {
		if d.Order.ID == automatic.Order.ID {
			found = true
			if !d.Order.AutoConfirmed || d.Order.PaymentStatus != "Paid" || d.MessageID != 0 || d.ReplyToMessageID == 0 {
				t.Fatalf("automatic receipt incomplete: %+v", d)
			}
		}
	}
	if !found {
		t.Fatal("automatic receipt not queued")
	}

}
