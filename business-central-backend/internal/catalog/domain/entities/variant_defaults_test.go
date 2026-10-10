package entities

import "testing"

func TestVariantDefaults(t *testing.T) {
	id := "12345678-1234-1234-1234-123456789012"
	sku, unit, label, err := VariantDefaults(id, "  ", "", " ", "unit-1", "packet")
	if err != nil || sku != "OPT-12345678123412341234123456789012" || unit != "unit-1" || label != "packet" {
		t.Fatalf("unexpected inherited defaults: %q %q %q %v", sku, unit, label, err)
	}
	same, _, _, _ := VariantDefaults(id, "", "", "", "unit-1", "packet")
	if same != sku {
		t.Fatal("replay changed the generated SKU")
	}
	sku, unit, label, err = VariantDefaults(id, " CUSTOM ", " unit-2 ", " carton ", "unit-1", "packet")
	if err != nil || sku != "CUSTOM" || unit != "unit-2" || label != "carton" {
		t.Fatal("explicit overrides were not preserved")
	}
	if _, _, _, err = VariantDefaults(id, "", "", "", "", ""); err == nil {
		t.Fatal("missing unit was accepted as a valid stored variant")
	}
}
