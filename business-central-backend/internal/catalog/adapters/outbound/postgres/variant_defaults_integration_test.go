package postgres

import (
	authdto "business-central-backend/internal/auth/application/dto"
	catalogdto "business-central-backend/internal/catalog/application/dto"
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
	"time"
)

func TestConfiguredDatabaseNameOnlyVariant(t *testing.T) {
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
	merchant, otherMerchant, product, unit, otherUnit, source := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code) VALUES($1::uuid,'Variant defaults test',$1::uuid::text,'USD'),($2::uuid,'Other tenant',$2::uuid::text,'USD')`, merchant, otherMerchant)
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM merchants WHERE id IN ($1::uuid,$2::uuid)`, merchant, otherMerchant)
	})
	exec(`INSERT INTO products(id,merchant_id,name) VALUES($1,$2,'Cotton wool')`, product, merchant)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code) VALUES($1,$3,'PCS','Piece','COUNT'),($2,$4,'PCS','Other piece','COUNT')`, unit, otherUnit, merchant, otherMerchant)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id,unit_of_measure) VALUES($1,$2,$3,'STD-' || replace($3::uuid::text,'-',''),'Large pack',$4,'packet')`, source, merchant, product, unit)
	var storedLabel string
	if err := pool.QueryRow(ctx, `SELECT unit_of_measure FROM product_variants WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchant, source).Scan(&storedLabel); err != nil {
		t.Fatal(err)
	}
	service := NewService(pool)
	claims := &authdto.Claims{MerchantID: merchant}
	created, err := service.CreateVariant(ctx, claims, product, catalogdto.VariantRequest{Name: "Small packet"})
	if err != nil {
		t.Fatal(err)
	}
	if created.SKU != "OPT-"+strings.ReplaceAll(created.ID, "-", "") || created.BaseUnitID != unit || created.UnitOfMeasure != storedLabel || !created.IsStockTracked {
		t.Fatalf("wrong defaults: %+v", created)
	}
	explicit, err := service.CreateVariant(ctx, claims, product, catalogdto.VariantRequest{Name: "Custom", SKU: "CUSTOM", BaseUnitID: unit, UnitOfMeasure: "carton"})
	if err != nil || explicit.SKU != "CUSTOM" || explicit.UnitOfMeasure != "PCS" {
		t.Fatalf("overrides: %+v %v", explicit, err)
	}
	if _, err = service.CreateVariant(ctx, &authdto.Claims{MerchantID: otherMerchant}, product, catalogdto.VariantRequest{Name: "Cross tenant"}); err == nil {
		t.Fatal("cross-tenant product accepted")
	}
}
