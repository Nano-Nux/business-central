package http

import (
	"testing"

	"business-central-backend/internal/app"
	operationsdto "business-central-backend/internal/operations/application/dto"
)

func TestStorageMatchesSearchAndPartialFilters(t *testing.T) {
	item := operationsdto.StorageItem{ProductName: "Green Tea", VariantName: "500 g", Brand: "Leaf"}
	q := app.NewListQuery("tea", "brand:lea", 0, 25)
	if !storageMatches(item, q) {
		t.Fatal("storage search and partial filter should match")
	}
	q = app.NewListQuery("tea", "brand:other", 0, 25)
	if storageMatches(item, q) {
		t.Fatal("non-matching storage filter should be rejected")
	}
}

func TestStorageSort(t *testing.T) {
	key, descending := storageSort("stock_count:desc")
	if key != "stock_count" || !descending {
		t.Fatalf("unexpected sort: %q %v", key, descending)
	}
	if storageNumericSort("sell_price") == false {
		t.Fatal("sell price should use numeric sorting")
	}
}
