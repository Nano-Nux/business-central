package postgres_test

import (
	"context"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestConfiguredDatabaseDeliveryMigration(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	pool := deliveryTestPool(t, ctx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`ALTER TABLE orders DROP COLUMN delivery_payment_status; ALTER TABLE payment_settings DROP COLUMN delivery_payment_status_auto_complete; ALTER TABLE payments DROP COLUMN purpose;`)
	merchant, shop, order := uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Delivery migration',$1::text,'USD')`, merchant)
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$2,'Main','MAIN')`, shop, merchant)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,order_number,channel,status,currency_code,subtotal,shipping_total,grand_total) VALUES($1,$2,$1::uuid::text,'POS','FULFILLED','USD',100,7,107)`, order, merchant); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,line_total) VALUES($1,$2,1,'Migration item',1,100,100)`, merchant, order); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO payments(merchant_id,order_id,method,status,amount,idempotency_key) VALUES($1,$2,'Cash','CAPTURED',107,$2::uuid::text)`, merchant, order)
	migration, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "database", "0054_delivery_payment_status.sql"))
	if err != nil {
		t.Fatal(err)
	}
	exec(string(migration))
	var status, paid, purpose string
	var automatic bool
	if err = pool.QueryRow(ctx, `SELECT delivery_payment_status,grand_total::text FROM orders WHERE id=$1`, order).Scan(&status, &paid); err != nil || status != "COMPLETE" || paid != "107.00" {
		t.Fatalf("migration changed history: %q %q %v", status, paid, err)
	}
	if err = pool.QueryRow(ctx, `SELECT purpose FROM payments WHERE order_id=$1`, order).Scan(&purpose); err != nil || purpose != "ORDER" {
		t.Fatalf("legacy payment: %q %v", purpose, err)
	}
	exec(`INSERT INTO payment_settings(merchant_id,shop_id) VALUES($1,$2)`, merchant, shop)
	if err = pool.QueryRow(ctx, `SELECT delivery_payment_status_auto_complete FROM payment_settings WHERE shop_id=$1`, shop).Scan(&automatic); err != nil || automatic {
		t.Fatalf("default auto-complete enabled: %v", err)
	}
	exec(`UPDATE orders SET delivery_payment_status='UN_PAID' WHERE id=$1`, order)
	exec(string(migration))
	if err = pool.QueryRow(ctx, `SELECT delivery_payment_status FROM orders WHERE id=$1`, order).Scan(&status); err != nil || status != "UN_PAID" {
		t.Fatalf("repeat migration reset status: %q %v", status, err)
	}
}
