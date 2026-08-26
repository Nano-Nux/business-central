package events

import "time"

type UserCreated struct {
	IdentityID string
	MerchantID string
	OccurredAt time.Time
}
