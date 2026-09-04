package http

import (
	"business-central-backend/internal/app"
	posdto "business-central-backend/internal/pos/application/dto"
	"testing"
)

func TestPosMatchesSearchAndFilters(t *testing.T) {
	trackedBarcode := "123456"
	item := posdto.CatalogItem{
		ID:             "variant-1",
		ProductID:      "product-1",
		ProductName:    "Espresso Blend",
		Name:           "Dark Roast 250g",
		SKU:            "COF-DRK-250",
		Barcode:        &trackedBarcode,
		IsStockTracked: true,
	}

	searchFields := map[string]string{
		"name":         item.Name,
		"product_name": item.ProductName,
		"sku":          item.SKU,
		"barcode":      posPtr(item.Barcode),
	}
	filterFields := map[string]string{
		"id":               item.ID,
		"variant_id":       item.ID,
		"product_id":       item.ProductID,
		"is_stock_tracked": posBool(item.IsStockTracked),
	}

	// 1. Matches by query across search fields
	if !posMatches(app.NewListQuery("espresso", "", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match query 'espresso'")
	}
	if !posMatches(app.NewListQuery("COF-DRK", "", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match query 'COF-DRK'")
	}
	if !posMatches(app.NewListQuery("123456", "", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match query '123456'")
	}
	if posMatches(app.NewListQuery("nonexistent", "", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item NOT to match query 'nonexistent'")
	}

	// 2. Querying "true" should NOT match tracked items just because is_stock_tracked=true
	if posMatches(app.NewListQuery("true", "", 0, 10), searchFields, filterFields) {
		t.Fatal("expected query 'true' NOT to match searchFields when 'true' is only in filterFields")
	}

	// 3. Filter by is_stock_tracked:true
	if !posMatches(app.NewListQuery("", "is_stock_tracked:true", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match filter 'is_stock_tracked:true'")
	}
	if posMatches(app.NewListQuery("", "is_stock_tracked:false", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item NOT to match filter 'is_stock_tracked:false'")
	}

	// 4. Combined query and filter
	if !posMatches(app.NewListQuery("espresso", "is_stock_tracked:true", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match both query and filter")
	}
	if posMatches(app.NewListQuery("espresso", "is_stock_tracked:false", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item NOT to match when filter is false")
	}

	// 5. Filter by ID
	if !posMatches(app.NewListQuery("", "id:variant-1", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item to match filter 'id:variant-1'")
	}
	if posMatches(app.NewListQuery("", "id:other-variant", 0, 10), searchFields, filterFields) {
		t.Fatal("expected item NOT to match filter 'id:other-variant'")
	}
}
