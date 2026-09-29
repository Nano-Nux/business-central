package postgres

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	authdto "business-central-backend/internal/auth/application/dto"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	"github.com/google/uuid"
)

func TestConfiguredDatabaseTelegramCustomerPaymentMigration(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("requires test PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool := telegramTestPool(t, ctx)
	merchantID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Migration test',$1::text,'USD')`, merchantID); err != nil {
		t.Fatal(err)
	}
	draftID, confirmedID, cancelledID, posID, existingPaidID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for i, id := range []string{draftID, confirmedID, cancelledID, posID, existingPaidID} {
		channel := "TELEGRAM"
		if i == 3 {
			channel = "POS"
		}
		status := []string{"DRAFT", "CONFIRMED", "CANCELLED", "CONFIRMED", "CONFIRMED"}[i]
		name := []string{"Existing customer", "", "", "", "Existing customer"}[i]
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,order_number,channel,status,currency_code,subtotal,grand_total,billing_address) VALUES($1::uuid,$2::uuid,$1::text,$3,$4,'USD',100,100,jsonb_build_object('name',$5::text))`, id, merchantID, channel, status, name); err != nil {
			tx.Rollback(ctx)
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,line_total) VALUES($1,$2,1,'Migration item',1,100,100)`, merchantID, id); err != nil {
			tx.Rollback(ctx)
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	existingPaymentID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO payments(id,merchant_id,order_id,method,status,amount,idempotency_key) VALUES($1,$2,$3,'Existing online payment','CAPTURED',100,$1::uuid::text)`, existingPaymentID, merchantID, existingPaidID); err != nil {
		t.Fatal(err)
	}
	migrationPath := filepath.Join("..", "..", "..", "..", "..", "migrations", "0050_telegram_customers_payments.sql")
	sql, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatal(err)
	}
	embedded, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "database", "0050_telegram_customers_payments.sql"))
	if err != nil || !bytes.Equal(sql, embedded) {
		t.Fatalf("runtime migration differs: %v", err)
	}
	for i := 0; i < 2; i++ {
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatal(err)
		}
	}
	var customers, payments, events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM customers WHERE merchant_id=$1::uuid AND customer_type='GUEST' AND metadata->>'label'='Online-Telegram-Customer'`, merchantID).Scan(&customers); err != nil || customers != 4 {
		t.Fatalf("customer backfill not idempotent: %d %v", customers, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM payments WHERE merchant_id=$1::uuid`, merchantID).Scan(&payments); err != nil || payments != 3 {
		t.Fatalf("payment backfill not idempotent: %d %v", payments, err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounting_events WHERE merchant_id=$1::uuid AND event_type='PAYMENT_CAPTURED'`, merchantID).Scan(&events); err != nil || events != 1 {
		t.Fatalf("payment events not idempotent: %d %v", events, err)
	}
	var preserved bool
	if err := pool.QueryRow(ctx, `SELECT method='Existing online payment' AND status='CAPTURED' AND amount=100 FROM payments WHERE id=$1::uuid`, existingPaymentID).Scan(&preserved); err != nil || !preserved {
		t.Fatalf("existing payment changed: %v %v", preserved, err)
	}
	var leaked bool
	if err := pool.QueryRow(ctx, `SELECT COALESCE(current_setting('app.telegram_service',true),'')='on'`).Scan(&leaked); err != nil || leaked {
		t.Fatalf("migration leaked service authority: %v %v", leaked, err)
	}
	rows, err := pospostgres.NewService(pool).ListInvoices(ctx, &authdto.Claims{MerchantID: merchantID})
	if err != nil || len(rows) != 4 {
		t.Fatalf("migrated invoices: %+v %v", rows, err)
	}
	for _, invoice := range rows {
		switch invoice.ID {
		case draftID:
			if invoice.Customer == nil || *invoice.Customer != "Existing customer" || invoice.Status != "Pending" {
				t.Fatalf("draft invoice wrong: %+v", invoice)
			}
		case confirmedID:
			if invoice.Customer != nil || invoice.Status != "Paid" {
				t.Fatalf("unnamed confirmed invoice wrong: %+v", invoice)
			}
		case posID:
			if invoice.Customer == nil || *invoice.Customer != "Walk-in customer" || invoice.Status != "Pending" {
				t.Fatalf("POS invoice changed: %+v", invoice)
			}
		case existingPaidID:
			if invoice.Customer == nil || *invoice.Customer != "Existing customer" || invoice.Status != "Paid" {
				t.Fatalf("existing paid invoice changed: %+v", invoice)
			}
		default:
			t.Fatalf("cancelled Telegram invoice exposed: %+v", invoice)
		}
	}
}
