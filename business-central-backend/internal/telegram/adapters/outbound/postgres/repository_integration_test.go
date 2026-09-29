package postgres

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/domain"
	"business-central-backend/internal/telegram/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfiguredDatabaseTelegramPairingAndMembership(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 to validate the configured PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool := telegramTestPool(t, ctx)
	claims := &authdto.Claims{MerchantID: uuid.NewString(), IdentityID: uuid.NewString(), MembershipID: uuid.NewString(), PlatformAdmin: true}
	shopID := uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Telegram test',($1::uuid)::text,'USD')`, claims.MerchantID)
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1,$2,'test')`, claims.IdentityID, claims.IdentityID+"@example.test")
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$2,'Test shop','TEST')`, shopID, claims.MerchantID)
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name) VALUES($1,$2,$3,'Test administrator')`, claims.MembershipID, claims.MerchantID, claims.IdentityID)
	exec(`INSERT INTO merchant_modules(merchant_id,module_code,status) VALUES($1,'telegram_automation','ENABLED')`, claims.MerchantID)
	exec(`INSERT INTO shop_modules(merchant_id,shop_id,module_code) VALUES($1,$2,'telegram_automation')`, claims.MerchantID, shopID)
	repo := NewRepository(pool)
	codeHash := strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", "")
	code, err := repo.CreatePairingCode(ctx, claims, shopID, codeHash, time.Now().UTC().Add(15*time.Minute))
	if err != nil {
		t.Fatalf("create pairing code: %v", err)
	}
	in := outbound.ConnectionInput{CodeHash: codeHash, ChatID: -time.Now().UnixNano(), Title: "Test group", Type: "supergroup", CreatorUserID: 42, CreatorDisplayName: "Admin", BotStatus: "administrator", BotIsAdmin: true, BotPermissions: map[string]any{"can_manage_chat": true}}
	g, err := repo.ConnectGroup(ctx, in)
	if err != nil {
		t.Fatalf("connect unused pairing code: %v", err)
	}
	if g.MerchantID != claims.MerchantID || g.ShopID != shopID || g.ConnectionStatus != "ACTIVE" {
		t.Fatalf("incorrect connection: %+v", g)
	}
	t.Run("order lifecycle", func(t *testing.T) { testTelegramOrderLifecycle(t, ctx, pool, repo, g) })
	var status, consumedBy string
	if err := pool.QueryRow(ctx, `SELECT status,consumed_by_connection_id FROM telegram_pairing_codes WHERE id=$1::uuid`, code.ID).Scan(&status, &consumedBy); err != nil || status != "CONSUMED" || consumedBy != g.ID {
		t.Fatalf("pairing consumption: %s %s %v", status, consumedBy, err)
	}
	assertCode := func(err error, code string) {
		t.Helper()
		var apiErr *app.Error
		if !errors.As(err, &apiErr) || apiErr.Code != code {
			t.Fatalf("want %s, got %v", code, err)
		}
	}
	_, err = repo.ConnectGroup(ctx, in)
	assertCode(err, "INVALID_PAIRING_CODE")
	in.CodeHash = strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", "")
	secondCode, err := repo.CreatePairingCode(ctx, claims, shopID, in.CodeHash, time.Now().UTC().Add(15*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	_, err = repo.ConnectGroup(ctx, in)
	assertCode(err, "GROUP_ALREADY_CONNECTED")
	// An unrelated database constraint must not be reported as an existing group.
	in.ChatID--
	in.Type = "private"
	_, err = repo.ConnectGroup(ctx, in)
	assertCode(err, "INTERNAL_ERROR")
	if err := pool.QueryRow(ctx, `SELECT status FROM telegram_pairing_codes WHERE id=$1::uuid`, secondCode.ID).Scan(&status); err != nil || status != "ACTIVE" {
		t.Fatalf("failed connection consumed code: %s %v", status, err)
	}
	for _, health := range []struct {
		status string
		admin  bool
	}{{"ADMINISTRATOR", true}, {"MEMBER", false}, {"LEFT", false}} {
		if err := repo.UpdateConnectionHealth(ctx, g.TelegramChatID, health.status, health.admin, map[string]any{"can_manage_chat": health.admin}, ""); err != nil {
			t.Fatalf("membership %s: %v", health.status, err)
		}
	}
	updated, err := repo.GetGroup(ctx, claims, g.ID, true)
	if err != nil || updated.ConnectionStatus != "ERROR" || updated.BotMembershipStatus != "LEFT" {
		t.Fatalf("membership not persisted: %+v %v", updated, err)
	}
	for _, query := range []string{
		`SELECT count(*) FROM audit_events WHERE merchant_id=$1::uuid AND action='TELEGRAM_GROUP_CONNECTED'`,
		`SELECT count(*) FROM outbox_events WHERE merchant_id=$1::uuid AND event_type='TELEGRAM_GROUP_CONNECTED'`,
		`SELECT count(*) FROM audit_events WHERE merchant_id=$1::uuid AND action='TELEGRAM_BOT_REMOVED'`,
	} {
		var count int
		if err := pool.QueryRow(ctx, query, claims.MerchantID).Scan(&count); err != nil || count != 1 {
			t.Fatalf("missing or duplicate event: %d %v", count, err)
		}
	}
	if err := repo.UpdateConnectionHealth(ctx, in.ChatID-1, "MEMBER", false, nil, ""); err != nil {
		t.Fatalf("unpaired membership should be ignored: %v", err)
	}
}

func testTelegramOrderLifecycle(t *testing.T, ctx context.Context, pool *pgxpool.Pool, repo *Repository, g tdto.Group) {
	t.Helper()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	locationID, productID, variantID, unitID, priceListID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$2,$3,'SHOP','Test stock','SHOP')`, locationID, g.MerchantID, g.ShopID)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name) VALUES($1,$2,'EA','Each')`, unitID, g.MerchantID)
	exec(`INSERT INTO products(id,merchant_id,name) VALUES($1,$2,'wo phone')`, productID, g.MerchantID)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id,is_stock_tracked) VALUES($1,$2,$3,'WO-001','Standard',$4,false)`, variantID, g.MerchantID, productID, unitID)
	exec(`INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1,$2,'DEFAULT','USD',true)`, priceListID, g.MerchantID)
	exec(`INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount) VALUES($1,$2,$3,800000)`, g.MerchantID, priceListID, variantID)
	makeInput := func() outbound.DraftInput {
		return outbound.DraftInput{ConnectionID: g.ID, ChatID: g.TelegramChatID, MessageID: time.Now().UnixNano(), UpdateID: time.Now().UnixNano(), UserID: 42, Items: []domain.TakeOrderItem{{ProductName: "wo phone", Quantity: 1}}, OriginalCommand: "/takeorder wo phone quantity=1", ExpiresAt: time.Now().Add(30 * time.Minute), ConfirmTokenHash: strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", ""), CancelTokenHash: strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", "")}
	}
	for _, action := range []string{"CONFIRM", "CANCEL"} {
		in := makeInput()
		if action == "CANCEL" {
			in.Items[0].ProductName, in.Items[0].SKU = "", "WO-001"
		}
		draft, err := repo.CreateDraft(ctx, in)
		if err != nil {
			t.Fatalf("create draft by name/SKU: %v", err)
		}
		if draft.Order.Description != "wo phone" || draft.Order.GrandTotal != "800000.00" {
			t.Fatalf("incorrect draft: %+v", draft.Order)
		}
		if err := repo.StoreBotResponse(ctx, draft.Order.ID, 1234); err != nil {
			t.Fatal(err)
		}
		if _, err := repo.ResolveCallback(ctx, in.ConfirmTokenHash, g.TelegramChatID, 42); err != nil {
			t.Fatalf("resolve draft callback: %v", err)
		}
		order, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, action, "TELEGRAM", 42, true)
		if err != nil {
			t.Fatalf("transition %s: %v", action, err)
		}
		wantStatus := "CONFIRMED"
		if action == "CANCEL" {
			wantStatus = "CANCELLED"
		}
		if order.Status != wantStatus || order.BotResponseMessageID != 1234 {
			t.Fatalf("incorrect transition: %+v", order)
		}
		if _, err := repo.TransitionOrder(ctx, nil, draft.Order.ID, action, "TELEGRAM", 42, true); err == nil {
			t.Fatal("repeated transition accepted")
		}
		var consumed int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM telegram_callback_tokens WHERE order_id=$1::uuid AND consumed_at IS NOT NULL`, draft.Order.ID).Scan(&consumed); err != nil || consumed != 2 {
			t.Fatalf("callbacks not consumed: %d %v", consumed, err)
		}
		var eventID string
		if err := pool.QueryRow(ctx, `SELECT id FROM outbox_events WHERE merchant_id=$1::uuid AND aggregate_id=$2::uuid AND event_type=$3`, g.MerchantID, draft.Order.ID, "TELEGRAM_ORDER_"+wantStatus).Scan(&eventID); err != nil {
			t.Fatal(err)
		}
		if err := repo.FinishOutboxDelivery(ctx, eventID, errors.New("temporary provider error")); err != nil {
			t.Fatal(err)
		}
		if err := repo.FinishOutboxDelivery(ctx, eventID, nil); err != nil {
			t.Fatal(err)
		}
	}
	// A later write failure must roll back the order and line already inserted.
	invalid := makeInput()
	invalid.CancelTokenHash = invalid.ConfirmTokenHash
	if _, err := repo.CreateDraft(ctx, invalid); err == nil {
		t.Fatal("duplicate callback hash accepted")
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE merchant_id=$1::uuid`, g.MerchantID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("failed draft left partial order: %d %v", count, err)
	}
	missing := makeInput()
	missing.Items[0].ProductName = "missing product"
	_, err := repo.CreateDraft(ctx, missing)
	var apiErr *app.Error
	if !errors.As(err, &apiErr) || apiErr.Code != "PRODUCT_NOT_FOUND" {
		t.Fatalf("incorrect missing product error: %v", err)
	}
}
