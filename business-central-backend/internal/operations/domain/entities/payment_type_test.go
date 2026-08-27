package entities

import "testing"

func TestPaymentTypeCategories(t *testing.T) {
	for _, category := range []string{"CASH", "ONLINE", "DIGITAL"} {
		if err := PaymentType("Merchant option", category); err != nil {
			t.Fatalf("expected %s category to be valid: %v", category, err)
		}
	}
	if err := PaymentType("Merchant option", "CARD"); err == nil {
		t.Fatal("expected unsupported category to be rejected")
	}
}
