package domain

import "testing"

func TestResolveDeliveryPayment(t *testing.T) {
	for _, tt := range []struct {
		requested string
		auto      bool
		want      string
	}{
		{"", false, DeliveryUnpaid}, {"", true, DeliveryComplete},
		{DeliveryUnpaid, true, DeliveryComplete}, {DeliveryComplete, false, DeliveryComplete},
		{DeliveryUnpaid, false, DeliveryUnpaid},
	} {
		got, err := ResolveDeliveryPayment(tt.requested, tt.auto)
		if err != nil || got != tt.want {
			t.Fatalf("%+v: got %q, %v", tt, got, err)
		}
	}
	if _, err := ResolveDeliveryPayment("PAID", true); err == nil {
		t.Fatal("invalid status accepted")
	}
}

func TestLegacyOfflineDeliveryCollection(t *testing.T) {
	if DeliveryPaymentStatusForReplay("", "") != DeliveryComplete {
		t.Fatal("legacy collected fee became unpaid")
	}
	if DeliveryPaymentStatusForReplay(DeliveryUnpaid, DeliveryUnpaid) != DeliveryUnpaid {
		t.Fatal("new unpaid choice was overridden")
	}
	if DeliveryPaymentStatusForReplay("", DeliveryUnpaid) != "" {
		t.Fatal("new snapshot must still reconcile with current defaults")
	}
}
