package events

import "time"

type SessionClosed struct {
	SessionID  string
	OccurredAt time.Time
}
