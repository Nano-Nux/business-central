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
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	claims := &authdto.Claims{MerchantID: uuid.NewString(), IdentityID: uuid.NewString(), MembershipID: uuid.NewString(), PlatformAdmin: true}
	shopID := uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Telegram test',($1::uuid)::text,'USD')`, claims.MerchantID)
	// Register cleanup before creating child records so failed assertions leave no fixtures.
	defer func() {
		for _, query := range []string{
			`DELETE FROM audit_events WHERE merchant_id=$1::uuid`,
			`DELETE FROM telegram_pairing_codes WHERE merchant_id=$1::uuid`,
			`DELETE FROM telegram_group_connections WHERE merchant_id=$1::uuid`,
			`DELETE FROM merchants WHERE id=$1::uuid`,
		} {
			if _, err := pool.Exec(context.Background(), query, claims.MerchantID); err != nil {
				t.Error(err)
			}
		}
		if _, err := pool.Exec(context.Background(), `DELETE FROM user_identities WHERE id=$1::uuid`, claims.IdentityID); err != nil {
			t.Error(err)
		}
	}()
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
