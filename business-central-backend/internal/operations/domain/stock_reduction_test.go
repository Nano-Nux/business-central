package domain

import "testing"

func TestStockReductionRequiresPositiveAuditableQuantity(t *testing.T) {
	for _, quantity := range []string{"1", "0.000001", "12.5"} {
		if err := ValidateStockReduction(quantity, "Damaged in storage", "event"); err != nil {
			t.Fatalf("valid quantity %s rejected: %v", quantity, err)
		}
	}
	for _, quantity := range []string{"0", "-1", "1/2", "1e3", "NaN", "0.0000001", "100000000000000"} {
		if err := ValidateStockReduction(quantity, "Damage", "event"); err == nil {
			t.Fatalf("invalid quantity %s accepted", quantity)
		}
	}
	if err := ValidateStockReduction("1", " ", "event"); err == nil {
		t.Fatal("reduction without an audit reason accepted")
	}
	if err := ValidateStockReduction("1", "Damage", ""); err == nil {
		t.Fatal("reduction without a replay key accepted")
	}
}
