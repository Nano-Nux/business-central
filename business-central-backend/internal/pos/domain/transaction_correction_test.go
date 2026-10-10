package domain

import "testing"

func TestCorrectionLine(t *testing.T) {
	for _, row := range []struct {
		quantity, price, discount, tax string
		valid                          bool
	}{
		{"1.5", "12.50", "1", "0.50", true}, {"1", "0", "0", "0", true}, {"0", "1", "0", "0", false}, {"NaN", "1", "0", "0", false}, {"1", "+Inf", "0", "0", false}, {"1", "10", "11", "0", false}, {"1", "10", "0", "-1", false},
	} {
		if err := ValidateCorrectionLine(row.quantity, row.price, row.discount, row.tax); (err == nil) != row.valid {
			t.Fatalf("%+v: %v", row, err)
		}
	}
}
