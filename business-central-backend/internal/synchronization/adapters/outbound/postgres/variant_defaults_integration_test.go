package postgres

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/synchronization/application/dto"
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
	"time"
)

func TestConfiguredDatabaseNameOnlyVariantReplay(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 with an isolated schema-initialized database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	merchant, product, unit, source, device, session, variant := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Replay defaults',$1::uuid::text,'USD')`, merchant)
	exec(`INSERT INTO products(id,merchant_id,name) VALUES($1,$2,'Cotton wool')`, product, merchant)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code) VALUES($1,$2,'PCS','Piece','COUNT')`, unit, merchant)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id) VALUES($1,$2,$3,'STD-'||replace($3::uuid::text,'-',''),'Large pack',$4)`, source, merchant, product, unit)
	exec(`INSERT INTO sync_devices(id,merchant_id,device_identifier) VALUES($1,$2,'defaults-device')`, device, merchant)
	exec(`INSERT INTO sync_sessions(id,merchant_id,device_id,client_session_key) VALUES($1,$2,$3,'defaults-session')`, session, merchant, device)
	payload, _ := json.Marshal(map[string]string{"product_id": product, "name": "Small packet"})
	operation := dto.Operation{ClientOperationID: uuid.NewString(), EntityType: "CATALOG_VARIANT", EntityID: variant, OperationType: "CREATE", Payload: payload}
	claims := &authdto.Claims{MerchantID: merchant, PlatformAdmin: true}
	repository := NewRepository(pool)
	first, err := repository.applyOperation(ctx, tx, claims, device, session, operation)
	if err != nil || first.Status != "APPLIED" {
		t.Fatalf("first apply: %+v %v", first, err)
	}
	var stored catalogVariantSyncPayload
	if err = json.Unmarshal(first.ServerPayload, &stored); err != nil {
		t.Fatal(err)
	}
	if stored.SKU != "OPT-"+strings.ReplaceAll(variant, "-", "") || stored.BaseUnitID != unit || stored.UnitOfMeasure != "PCS" || stored.IsStockTracked == nil || !*stored.IsStockTracked {
		t.Fatalf("wrong replay defaults: %+v", stored)
	}
	replay, err := repository.applyOperation(ctx, tx, claims, device, session, operation)
	if err != nil || replay.Status != "APPLIED" || replay.ServerOperationID != first.ServerOperationID || replay.ClientOperationID != operation.ClientOperationID {
		t.Fatalf("idempotent replay: %+v %v", replay, err)
	}
	updatePayload, _ := json.Marshal(map[string]any{"product_id": product, "name": "Renamed packet", "sku": stored.SKU, "base_unit_id": stored.BaseUnitID, "unit_of_measure": stored.UnitOfMeasure, "attributes": map[string]any{}, "is_stock_tracked": true})
	version := int64(1)
	update := dto.Operation{ClientOperationID: uuid.NewString(), EntityType: "CATALOG_VARIANT", EntityID: variant, OperationType: "UPDATE", BaseVersion: &version, Payload: updatePayload}
	updated, err := repository.applyOperation(ctx, tx, claims, device, session, update)
	if err != nil || updated.Status != "APPLIED" {
		t.Fatalf("update: %+v %v", updated, err)
	}
	updatedReplay, err := repository.applyOperation(ctx, tx, claims, device, session, update)
	if err != nil || updatedReplay.Status != "APPLIED" || updatedReplay.ClientOperationID != update.ClientOperationID {
		t.Fatalf("update replay: %+v %v", updatedReplay, err)
	}
	var renamed catalogVariantSyncPayload
	if err = json.Unmarshal(updatedReplay.ServerPayload, &renamed); err != nil || renamed.SKU != stored.SKU || renamed.Name != "Renamed packet" {
		t.Fatal("renaming changed the generated identifier")
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM product_variants WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchant, variant).Scan(&count); err != nil || count != 1 {
		t.Fatal("replay duplicated the variant")
	}
}
