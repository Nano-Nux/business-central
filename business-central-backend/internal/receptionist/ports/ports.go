package ports

import (
	"context"
	"encoding/json"
	"errors"

	"business-central-backend/internal/receptionist/domain"
)

// ErrCalendarRejected means the provider definitively rejected event creation.
// Transport failures and server errors must remain pending for reconciliation.
var ErrCalendarRejected = errors.New("calendar rejected event creation")

type Repository interface {
	Settings(context.Context) (domain.Settings, error)
	SaveSettings(context.Context, domain.Settings) error
	Token(context.Context) (string, error)
	SaveToken(context.Context, string) error
	SaveState(context.Context, string, string) error
	State(context.Context, string) (string, error)
	ConsumeState(context.Context, string) (string, error)
	CreateConversation(context.Context, string, string) (domain.Conversation, error)
	Authorize(context.Context, string, string) error
	Conversation(context.Context, string) (domain.Conversation, error)
	Append(context.Context, string, domain.Message) error
	ConsumeUsage(context.Context, int) error
	ListConversations(context.Context, int, int) ([]domain.Conversation, int, error)
	ListBookings(context.Context, int, int, string) ([]domain.Booking, int, error)
	Booking(context.Context, string) (domain.Booking, error)
	Reserve(context.Context, domain.Booking) error
	Reserved(context.Context, string, domain.Slot) ([]domain.Slot, error)
	FinishBooking(context.Context, domain.Booking) error
	WithLock(context.Context, string, func() error) error
}
type ToolCall struct {
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
	ID   string          `json:"id,omitempty"`
}
type Reply struct {
	Text  string
	Calls []ToolCall
	State json.RawMessage
}

// Raw model state is returned intact to preserve function-call identifiers and
// thought signatures required by some Gemini models. It is never client input.
type LLM interface {
	Reply(context.Context, string, []domain.Message, []Exchange) (Reply, error)
}
type Exchange struct {
	State   json.RawMessage
	Calls   []ToolCall
	Results []any
}
type Calendar interface {
	Busy(context.Context, string, domain.Settings, domain.Slot) ([]domain.Slot, error)
	Find(context.Context, string, domain.Booking) (string, bool, error)
	Create(context.Context, string, domain.Booking) (string, error)
}
type OAuth interface {
	Configured() bool
	URL(string, string) string
	Exchange(context.Context, string, string) (string, error)
}
