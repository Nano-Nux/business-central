package postgres

import (
	"bytes"
	"context"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestConfiguredDatabaseAutoConfirmMigrationDefaultsExistingGroupsOff(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("requires test PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool := telegramTestPool(t, ctx)
	merchant, shop, group := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Auto confirm migration',$1::uuid::text,'USD')`, []any{merchant}},
		{`INSERT INTO shops(id,merchant_id,code,name) VALUES($1,$2,'SHOP','Shop')`, []any{shop, merchant}},
		{`ALTER TABLE telegram_group_connections DROP COLUMN auto_confirm_orders`, nil},
		{`ALTER TABLE telegram_order_sources DROP COLUMN auto_confirmed`, nil},
		{`INSERT INTO telegram_group_connections(id,merchant_id,shop_id,telegram_chat_id,group_title,group_type) VALUES($1,$2,$3,-10042,'Group','supergroup')`, []any{group, merchant, shop}},
	} {
		if _, err := pool.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
	sql, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "migrations", "0051_telegram_auto_confirm.sql"))
	if err != nil {
		t.Fatal(err)
	}
	embedded, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "database", "0051_telegram_auto_confirm.sql"))
	if err != nil || !bytes.Equal(sql, embedded) {
		t.Fatal("runtime migration differs", err)
	}
	for i := 0; i < 2; i++ {
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
	}
	var enabled bool
	if err := pool.QueryRow(ctx, `SELECT auto_confirm_orders FROM telegram_group_connections WHERE id=$1::uuid`, group).Scan(&enabled); err != nil || enabled {
		t.Fatal("existing group did not default OFF", err)
	}
}
