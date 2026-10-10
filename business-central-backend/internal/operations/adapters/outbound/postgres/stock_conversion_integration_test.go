package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	catalogpostgres "business-central-backend/internal/catalog/adapters/outbound/postgres"
	catalogdto "business-central-backend/internal/catalog/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfiguredDatabaseStockConversion(t *testing.T) {
	if os.Getenv("RUN_DB_TESTS") != "1" {
		t.Skip("set RUN_DB_TESTS=1 with an isolated test database")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	merchantID, merchantIdentity, staffIdentity := uuid.NewString(), uuid.NewString(), uuid.NewString()
	merchantMember, staffMember := uuid.NewString(), uuid.NewString()
	shopID, otherShopID, locationID, otherLocationID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	productID, unitID, sourceID, destinationID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	merchantRole, staffRole := uuid.NewString(), uuid.NewString()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO user_identities(id,email,password_hash) VALUES($1::uuid,'stock-merchant-' || $1::uuid::text || '@example.test','unused'),($2::uuid,'stock-staff-' || $2::uuid::text || '@example.test','unused')`, merchantIdentity, staffIdentity)
	exec(`INSERT INTO merchants(id,name,slug,default_currency_code,pos_complexity_level) VALUES($1,'Stock conversion test',$2,'USD','COMPLEX')`, merchantID, "stock-conversion-"+merchantID)
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM merchants WHERE id=$1::uuid`, merchantID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM user_identities WHERE id IN ($1::uuid,$2::uuid)`, merchantIdentity, staffIdentity)
	})
	exec(`INSERT INTO shops(id,merchant_id,name,code) VALUES($1,$3,'Main','MAIN'),($2,$3,'Other','OTHER')`, shopID, otherShopID, merchantID)
	exec(`INSERT INTO user_memberships(id,merchant_id,identity_id,display_name) VALUES($1,$3,$4,'Merchant'),($2,$3,$5,'Staff')`, merchantMember, staffMember, merchantID, merchantIdentity, staffIdentity)
	exec(`UPDATE user_memberships SET shop_id=$2::uuid WHERE id=$1::uuid`, staffMember, shopID)
	exec(`INSERT INTO roles(id,merchant_id,code,name) VALUES($1,$3,'merchant','Merchant'),($2,$3,'staff','Staff')`, merchantRole, staffRole, merchantID)
	exec(`INSERT INTO membership_roles(merchant_id,membership_id,role_id) VALUES($1,$2,$3),($1,$4,$5)`, merchantID, merchantMember, merchantRole, staffMember, staffRole)
	exec(`INSERT INTO locations(id,merchant_id,shop_id,code,name,location_type) VALUES($1,$3,$4,'STOCK','Stock room','STOCK_ROOM'),($2,$3,$5,'OTHER','Other room','STOCK_ROOM')`, locationID, otherLocationID, merchantID, shopID, otherShopID)
	exec(`INSERT INTO unit_definitions(id,merchant_id,code,name,dimension_code,allows_decimal) VALUES($1,$2,'EA','Each','COUNT',false)`, unitID, merchantID)
	exec(`INSERT INTO products(id,merchant_id,name,product_type) VALUES($1,$2,'Bottled water','PHYSICAL')`, productID, merchantID)
	exec(`INSERT INTO product_variants(id,merchant_id,product_id,sku,name,base_unit_id) VALUES($1,$3,$4,'CARTON','Carton of 30',$5),($2,$3,$4,'BOTTLE','Single bottle',$5)`, sourceID, destinationID, merchantID, productID, unitID)
	exec(`INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_id,unit_cost,event_key) VALUES($1,$2,'RECEIPT',$3,10,$4,10.00,$5)`, merchantID, sourceID, locationID, unitID, "stock-conversion-test:"+merchantID)
	service := NewService(pool)
	merchantClaims := &authdto.Claims{IdentityID: merchantIdentity, MerchantID: merchantID, MembershipID: merchantMember}
	staffClaims := &authdto.Claims{IdentityID: staffIdentity, MerchantID: merchantID, MembershipID: staffMember}
	rule, err := service.SaveStockConversionRule(ctx, merchantClaims, operationsdto.StockConversionRuleRequest{SourceVariantID: sourceID, DestinationVariantID: destinationID, DestinationQuantity: 30})
	if err != nil {
		t.Fatal(err)
	}
	request := operationsdto.StockConversionRequest{RuleID: rule.ID, LocationID: locationID, Quantity: 1}
	preview, err := service.PreviewStockConversion(ctx, staffClaims, request)
	if err != nil {
		t.Fatal(err)
	}
	if preview.SourceBefore != "10.000000" || preview.DestinationQuantity != 30 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	key := uuid.NewString()
	result, err := service.ApplyStockConversion(app.WithIdempotencyKey(ctx, key), staffClaims, request)
	if err != nil {
		t.Fatal(err)
	}
	if result.SourceQuantity != 1 || result.DestinationQuantity != 30 || result.TotalCost != "" {
		t.Fatalf("unexpected staff conversion: %+v", result)
	}
	duplicate, err := service.ApplyStockConversion(app.WithIdempotencyKey(ctx, key), staffClaims, request)
	if err != nil || duplicate.ID != result.ID {
		t.Fatalf("idempotency replay failed: %+v, %v", duplicate, err)
	}
	var sourceStock, destinationStock, totalValue string
	err = pool.QueryRow(ctx, `SELECT source.quantity_on_hand::text,destination.quantity_on_hand::text,
		(SELECT SUM(quantity_remaining*unit_cost)::text FROM inventory_cost_layers WHERE merchant_id=$1::uuid AND variant_id=$3::uuid)
		FROM inventory_balances source JOIN inventory_balances destination ON destination.merchant_id=source.merchant_id AND destination.location_id=source.location_id AND destination.variant_id=$3::uuid
		WHERE source.merchant_id=$1::uuid AND source.location_id=$2::uuid AND source.variant_id=$4::uuid`, merchantID, locationID, destinationID, sourceID).Scan(&sourceStock, &destinationStock, &totalValue)
	if err != nil {
		t.Fatal(err)
	}
	if sourceStock != "9.000000" || destinationStock != "30.000000" || totalValue != "10.00000000" {
		t.Fatalf("stock/value mismatch: %s %s %s", sourceStock, destinationStock, totalValue)
	}
	items, err := service.ListStockConversions(ctx, staffClaims)
	if err != nil || len(items) != 1 || items[0].TotalCost != "" {
		t.Fatalf("staff history leaked cost: %+v, %v", items, err)
	}
	merchantItems, err := service.ListStockConversions(ctx, merchantClaims)
	if err != nil || len(merchantItems) != 1 || merchantItems[0].TotalCost != "10.00" {
		t.Fatalf("merchant history lost converted value: %+v, %v", merchantItems, err)
	}
	_, err = service.PreviewStockConversion(ctx, staffClaims, operationsdto.StockConversionRequest{RuleID: rule.ID, LocationID: locationID, Quantity: 10})
	if err == nil {
		t.Fatal("preview allowed conversion of more stock than is available")
	}
	for _, mode := range []string{"SIMPLE", "MINI", "NANO", "COMPLEX"} {
		exec(`UPDATE merchants SET pos_complexity_level=$2 WHERE id=$1::uuid`, merchantID, mode)
		if mode == "SIMPLE" {
			_, createErr := catalogpostgres.NewRepository(pool).CreateVariant(ctx, merchantClaims, productID, catalogdto.VariantRequest{SKU: "CASE-" + uuid.NewString()[:8], Name: "Case of 60", BaseUnitID: unitID})
			if createErr != nil {
				t.Fatalf("simple mode could not add a pack size: %v", createErr)
			}
		}
		if mode == "MINI" || mode == "NANO" {
			_, updateErr := catalogpostgres.NewRepository(pool).UpdateProduct(ctx, merchantClaims, productID, catalogdto.ProductRequest{Name: "Bottled water renamed", ProductType: "PHYSICAL"})
			if updateErr != nil {
				t.Fatalf("mini mode could not edit existing complex product: %v", updateErr)
			}
			var variantName string
			if queryErr := pool.QueryRow(ctx, `SELECT name FROM product_variants WHERE id=$1::uuid`, sourceID).Scan(&variantName); queryErr != nil || variantName != "Carton of 30" {
				t.Fatalf("mode switch renamed explicit variant: %q, %v", variantName, queryErr)
			}
		}
		listed, listErr := service.ListStockConversionRules(ctx, merchantClaims)
		if listErr != nil || len(listed) != 1 || listed[0].ID != rule.ID {
			t.Fatalf("rule lost after mode %s: %+v, %v", mode, listed, listErr)
		}
		if mode == "NANO" {
			originalPrice, sellPrice := "2.00", "5.00"
			repository := catalogpostgres.NewRepository(pool)
			product, createErr := repository.CreateProduct(ctx, merchantClaims, catalogdto.ProductRequest{
				Name: "Nano uncategorized product", ProductType: "PHYSICAL",
				OriginalPrice: &originalPrice, SellPrice: &sellPrice,
			})
			if createErr != nil {
				t.Fatalf("nano product creation: %v", createErr)
			}
			variants, variantErr := repository.ListVariants(ctx, merchantClaims, product.ID)
			if variantErr != nil || len(variants) != 1 || variants[0].BaseUnitID == "" {
				t.Fatalf("nano managed variant missing: %+v, %v", variants, variantErr)
			}
			if len(product.CategoryIDs) != 0 || product.OriginalPrice == nil || *product.OriginalPrice != originalPrice || product.SellPrice == nil || *product.SellPrice != sellPrice {
				t.Fatalf("nano optional category/direct prices lost: %+v", product)
			}
		}
	}
	_, err = service.ApplyStockConversion(app.WithIdempotencyKey(ctx, uuid.NewString()), staffClaims, operationsdto.StockConversionRequest{RuleID: rule.ID, LocationID: otherLocationID, Quantity: 1})
	if err == nil {
		t.Fatal("staff converted stock outside assigned shop")
	}
}
