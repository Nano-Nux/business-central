package events

import "time"

type ProductCreated struct {
	ProductID  string
	MerchantID string
	OccurredAt time.Time
}
