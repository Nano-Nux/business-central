package postgres

import (
	"testing"

	"business-central-backend/internal/app"
)

func TestCapturedPaymentMethodRequiresProviderAuthorization(t *testing.T) {
	method, err := capturedPaymentMethod("cash")
	if err != nil || method != "CASH" {
		t.Fatalf("cash method = %q, err = %v", method, err)
	}
	for _, method := range []string{"CARD", "QR", "BANK_TRANSFER", "WALLET", "ONLINE"} {
		_, err := capturedPaymentMethod(method)
		apiErr, ok := err.(*app.Error)
		if !ok || apiErr.Code != "PAYMENT_AUTHORIZATION_REQUIRED" || apiErr.Status != 409 {
			t.Fatalf("method %s error = %#v", method, err)
		}
	}
}
