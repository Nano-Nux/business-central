package application

import (
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
