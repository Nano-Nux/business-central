package database

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestConfiguredDatabaseHasAuthenticationSchema(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 to run against DATABASE_URL")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required when RUN_DB_TESTS=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	for _, table := range []string{"user_identities", "user_memberships", "roles", "permissions", "membership_roles", "refresh_tokens"} {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, "public."+table).Scan(&exists); err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("required table %s is missing; apply business-central-backend/schema.sql first", table)
		}
	}
}

func TestConfiguredDatabaseSynchronizationMigrations(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 to run against DATABASE_URL")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required when RUN_DB_TESTS=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := Migrate(ctx, pool); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	for _, column := range []string{"shop_id", "operation_type"} {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_changes' AND column_name=$1)`, column).Scan(&exists); err != nil {
			t.Fatalf("check sync_changes.%s: %v", column, err)
		}
		if !exists {
			t.Fatalf("sync_changes.%s was not migrated", column)
		}
	}
	var repairDrafts bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.repair_drafts') IS NOT NULL`).Scan(&repairDrafts); err != nil {
		t.Fatal(err)
	}
	if !repairDrafts {
		t.Fatal("repair_drafts migration was not applied")
	}
	for _, table := range []string{"service_order_work_items", "service_work_item_payment_allocations"} {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT to_regclass('public.'||$1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("%s migration was not applied", table)
		}
	}
	for _, check := range [][2]string{
		{"service_order_items", "work_item_id"},
		{"repair_work_item_devices", "additional_fee"},
		{"repair_work_item_devices", "waiting_start_date"},
		{"repair_work_item_devices", "waiting_end_date"},
	} {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2)`, check[0], check[1]).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("%s.%s was not migrated", check[0], check[1])
		}
	}
	var onePricePerVariant bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'product_prices'::regclass AND conname = 'product_prices_one_per_list_variant')`).Scan(&onePricePerVariant); err != nil {
		t.Fatalf("check product price uniqueness constraint: %v", err)
	}
	if !onePricePerVariant {
		t.Fatal("product price uniqueness constraint was not applied")
	}
}
