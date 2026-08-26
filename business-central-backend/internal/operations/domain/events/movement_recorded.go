package events

import "time"

type MovementRecorded struct {
	MovementID string
	OccurredAt time.Time
}
