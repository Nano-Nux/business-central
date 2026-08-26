package entities

import "testing"

func TestSessionCanCloseAndReopen(t *testing.T) {
	session, err := NewSession("")
	if err != nil {
		t.Fatal(err)
	}
	session.Close()
	if session.Status != SessionClosed {
		t.Fatalf("status = %q", session.Status)
	}
	session.Reopen()
	if session.Status != SessionOpen {
		t.Fatalf("status = %q", session.Status)
	}
}

func TestSessionRejectsUnknownStatus(t *testing.T) {
	if _, err := NewSession("PAUSED"); err == nil {
		t.Fatal("expected status validation error")
	}
}

func TestRefundRequiresPositiveAmountAndIdempotency(t *testing.T) {
	if err := Refund("payment-1", "0", "refund-1"); err == nil {
		t.Fatal("expected a positive amount error")
	}
	if err := Refund("payment-1", "10.00", ""); err == nil {
		t.Fatal("expected an idempotency key error")
	}
	if err := Refund("payment-1", "10.00", "refund-1"); err != nil {
		t.Fatal(err)
	}
}
