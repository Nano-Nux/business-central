package application

import (
	"encoding/json"
	"testing"

	catalogdto "business-central-backend/internal/catalog/application/dto"
)

func TestValidateProductDates(t *testing.T) {
	valid := "2026-08-14"
	if err := validateProductDates(catalogdto.ProductRequest{ManufactureDate: &valid, ExpiredDate: &valid}); err != nil {
		t.Fatalf("valid product dates rejected: %v", err)
	}
	invalid := "14/08/2026"
	if err := validateProductDates(catalogdto.ProductRequest{ExpiredDate: &invalid}); err == nil {
		t.Fatal("invalid product date was accepted")
	}
	empty := "  "
	normalized := normalizeProductDates(catalogdto.ProductRequest{ExpiredDate: &empty})
	if normalized.ExpiredDate != nil {
		t.Fatal("blank optional product date was not normalized to nil")
	}
}

func TestProductRequestWithMiniPricing(t *testing.T) {
	origPrice := "15.50"
	sellPrice := "29.99"
	req := catalogdto.ProductRequest{
		Name:          "Widget",
		OriginalPrice: &origPrice,
		SellPrice:     &sellPrice,
	}
	if req.OriginalPrice == nil || *req.OriginalPrice != "15.50" {
		t.Fatalf("expected OriginalPrice 15.50, got %v", req.OriginalPrice)
	}
	if req.SellPrice == nil || *req.SellPrice != "29.99" {
		t.Fatalf("expected SellPrice 29.99, got %v", req.SellPrice)
	}
}

func TestProductRequestUnmarshalJSON_NumericAndStringPrices(t *testing.T) {
	// 1. Unmarshal with numeric prices (e.g. from frontend form or numbers)
	numericJSON := `{"name":"Coffee","original_price":12.5,"sell_price":25,"standard_variant":{"base_unit_id":"unit-1","original_price":12.5,"sell_price":25}}`
	var req1 catalogdto.ProductRequest
	if err := json.Unmarshal([]byte(numericJSON), &req1); err != nil {
		t.Fatalf("failed to unmarshal ProductRequest with numeric prices: %v", err)
	}
	if req1.Name != "Coffee" {
		t.Errorf("expected name Coffee, got %s", req1.Name)
	}
	if req1.OriginalPrice == nil || *req1.OriginalPrice != "12.5" {
		t.Errorf("expected OriginalPrice 12.5, got %v", req1.OriginalPrice)
	}
	if req1.SellPrice == nil || *req1.SellPrice != "25" {
		t.Errorf("expected SellPrice 25, got %v", req1.SellPrice)
	}
	if req1.StandardVariant == nil {
		t.Fatalf("expected StandardVariant not nil")
	}
	if req1.StandardVariant.OriginalPrice == nil || *req1.StandardVariant.OriginalPrice != "12.5" {
		t.Errorf("expected StandardVariant.OriginalPrice 12.5, got %v", req1.StandardVariant.OriginalPrice)
	}
	if req1.StandardVariant.SellPrice == nil || *req1.StandardVariant.SellPrice != "25" {
		t.Errorf("expected StandardVariant.SellPrice 25, got %v", req1.StandardVariant.SellPrice)
	}

	// 2. Unmarshal with string prices
	stringJSON := `{"name":"Tea","original_price":"8.00","sell_price":"15.50"}`
	var req2 catalogdto.ProductRequest
	if err := json.Unmarshal([]byte(stringJSON), &req2); err != nil {
		t.Fatalf("failed to unmarshal ProductRequest with string prices: %v", err)
	}
	if req2.OriginalPrice == nil || *req2.OriginalPrice != "8.00" {
		t.Errorf("expected OriginalPrice 8.00, got %v", req2.OriginalPrice)
	}
	if req2.SellPrice == nil || *req2.SellPrice != "15.50" {
		t.Errorf("expected SellPrice 15.50, got %v", req2.SellPrice)
	}

	// 3. Unmarshal with null / omitted prices
	nullJSON := `{"name":"Water"}`
	var req3 catalogdto.ProductRequest
	if err := json.Unmarshal([]byte(nullJSON), &req3); err != nil {
		t.Fatalf("failed to unmarshal ProductRequest with omitted prices: %v", err)
	}
	if req3.OriginalPrice != nil {
		t.Errorf("expected nil OriginalPrice, got %v", req3.OriginalPrice)
	}
	if req3.SellPrice != nil {
		t.Errorf("expected nil SellPrice, got %v", req3.SellPrice)
	}
}
