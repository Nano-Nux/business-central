package entities

import "testing"

func TestNewProductAppliesDomainDefaults(t *testing.T) {
	product, err := NewProduct(" Coffee ", "")
	if err != nil {
		t.Fatal(err)
	}
	if product.Name != "Coffee" || product.ProductType != "PHYSICAL" {
		t.Fatalf("unexpected product aggregate: %+v", product)
	}
}

func TestNewVariantRequiresBaseUnit(t *testing.T) {
	if _, err := NewVariant("COF-250", "Coffee 250g", ""); err == nil {
		t.Fatal("expected base unit validation error")
	}
}
