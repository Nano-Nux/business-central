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

func TestBrandAllowsOptionalSlug(t *testing.T) {
	if err := Brand("Acme", nil); err != nil {
		t.Fatalf("expected nil slug to be allowed for brand, got %v", err)
	}
	if err := Brand("", nil); err == nil {
		t.Fatal("expected empty brand name to be rejected")
	}
}

func TestCategoryAllowsOptionalSlug(t *testing.T) {
	if err := Category("Beverages", nil); err != nil {
		t.Fatalf("expected nil slug to be allowed for category, got %v", err)
	}
	if err := Category("", nil); err == nil {
		t.Fatal("expected empty category name to be rejected")
	}
}
