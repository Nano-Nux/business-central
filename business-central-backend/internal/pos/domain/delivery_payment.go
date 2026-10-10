package domain

import "fmt"

const DeliveryUnpaid = "UN_PAID"
const DeliveryComplete = "COMPLETE"

// Offline receipts created before independent delivery status collected the
// full total. Preserve that already-recorded collection when replaying them.
func DeliveryPaymentStatusForReplay(requested, snapshot string) string {
	if requested == "" && snapshot == "" {
		return DeliveryComplete
	}
	return requested
}

// ResolveDeliveryPayment snapshots the shop default for a new checkout.
func ResolveDeliveryPayment(requested string, autoComplete bool) (string, error) {
	if requested != "" && requested != DeliveryUnpaid && requested != DeliveryComplete {
		return "", fmt.Errorf("delivery_payment_status must be UN_PAID or COMPLETE")
	}
	if autoComplete || requested == DeliveryComplete {
		return DeliveryComplete, nil
	}
	return DeliveryUnpaid, nil
}
