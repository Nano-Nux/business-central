package application

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

func TestCredentialsAreAuthenticatedAndContextBound(t *testing.T) {
	s := &Service{EncryptionKey: []byte(strings.Repeat("k", 32))}
	encrypted, e := s.seal("private-refresh")
	if e != nil {
		t.Fatal(e)
	}
	plain, e := s.open(encrypted)
	if e != nil || plain != "private-refresh" {
		t.Fatalf("round trip: %s %v", plain, e)
	}
	b, e := base64.RawURLEncoding.DecodeString(encrypted)
	if e != nil {
		t.Fatal(e)
	}
	b[len(b)-1] ^= 1
	if _, e = s.open(base64.RawURLEncoding.EncodeToString(b)); e == nil {
		t.Fatal("tampered ciphertext accepted")
	}
	s.EncryptionKey = []byte(strings.Repeat("z", 32))
	if _, e = s.open(encrypted); e == nil {
		t.Fatal("wrong key accepted")
	}
	if _, e = s.open("invalid"); e == nil {
		t.Fatal("malformed credential accepted")
	}
}

type replyFunc func(context.Context, string, []domain.Message, []ports.Exchange) (ports.Reply, error)

func (f replyFunc) Reply(ctx context.Context, prompt string, messages []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
	return f(ctx, prompt, messages, exchanges)
}

type countingCalendar struct {
	ports.Calendar
	calls int
	err   error
}

func (c *countingCalendar) Busy(context.Context, string, domain.Settings, domain.Slot) ([]domain.Slot, error) {
	c.calls++
	return nil, c.err
}

func newChatService(t *testing.T) (*Service, *chatRepository, *countingCalendar) {
	t.Helper()
	r := &chatRepository{
		settings:     domain.Settings{Enabled: true, Timezone: "Asia/Bangkok", CalendarID: "primary", DurationMinutes: 30, StartHour: 9, EndHour: 17, Weekdays: []int{1, 2, 3, 4, 5}, DailyLimit: 200},
		conversation: domain.Conversation{ID: "11111111-1111-4111-8111-111111111111"},
	}
	calendar := &countingCalendar{}
	s := &Service{Repo: r, Calendar: calendar, EncryptionKey: []byte(strings.Repeat("k", 32)), Now: func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }}
	var err error
	r.token, err = s.seal("refresh")
	if err != nil {
		t.Fatal(err)
	}
	return s, r, calendar
}

func chatForTest(t *testing.T, s *Service, r *chatRepository) domain.Message {
	t.Helper()
	conversation, err := s.Chat(context.Background(), r.conversation.ID, strings.Repeat("a", 43), "Can we discuss the packages next Monday afternoon?")
	if err != nil {
		t.Fatal(err)
	}
	return conversation.Messages[len(conversation.Messages)-1]
}

func TestTimePreferencesReplaceEarlierOptionsAndRepeatedToolsAreCached(t *testing.T) {
	s, r, calendar := newChatService(t)
	s.LLM = replyFunc(func(_ context.Context, _ string, _ []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
		args := `{"date":"2026-10-26"}`
		if len(exchanges) > 0 {
			args = `{"date":"2026-10-26","not_before":"14:00","before":"15:00"}`
		}
		return ports.Reply{Calls: []ports.ToolCall{{Name: "check_calendar_slots", Args: json.RawMessage(args)}}}, nil
	})
	reply := chatForTest(t, s, r)
	if len(reply.Slots) != 2 || calendar.calls != 2 {
		t.Fatalf("expected two refined options and cached repeated checks: %+v calls=%d", reply, calendar.calls)
	}
	for _, slot := range reply.Slots {
		local := slot.Start.In(mustLocation("Asia/Bangkok"))
		if local.Hour() != 14 {
			t.Fatalf("offered time outside requested window: %v", slot)
		}
	}
}

func TestUsefulAvailabilitySurvivesModelFailure(t *testing.T) {
	s, r, _ := newChatService(t)
	s.LLM = replyFunc(func(_ context.Context, _ string, _ []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
		if len(exchanges) > 0 {
			return ports.Reply{}, errors.New("model timed out")
		}
		return ports.Reply{Calls: []ports.ToolCall{{Name: "check_calendar_slots", Args: json.RawMessage(`{"date":"2026-10-26","not_before":"16:00"}`)}}}, nil
	})
	reply := chatForTest(t, s, r)
	if len(reply.Slots) != 2 || !strings.Contains(reply.Content, "Choose a time below") {
		t.Fatalf("usable availability discarded: %+v", reply)
	}
}

func TestAvailabilityRecoveryDistinguishesFailuresFromNoMatchingTimes(t *testing.T) {
	for _, scenario := range []struct {
		name, args, status, want, code string
		disconnected, providerFailure  bool
	}{
		{name: "closed day", args: `{"date":"2026-10-25"}`, want: "no available times"},
		{name: "outside hours", args: `{"date":"2026-10-26","not_before":"18:00"}`, want: "no available times"},
		{name: "invalid window", args: `{"date":"2026-10-26","not_before":"25:00"}`, want: "HH:MM", code: "VALIDATION_ERROR"},
		{name: "past date", args: `{"date":"2026-10-19"}`, want: "next 60 days", code: "VALIDATION_ERROR"},
		{name: "disconnected", args: `{"date":"2026-10-26"}`, disconnected: true, want: "couldn't check the calendar", code: "CALENDAR_UNAVAILABLE"},
		{name: "provider failure", args: `{"date":"2026-10-26"}`, providerFailure: true, want: "couldn't check the calendar", code: "CALENDAR_UNAVAILABLE"},
		{name: "pending", args: `{"date":"2026-10-26"}`, status: "PENDING", want: "Retry booking confirmation", code: "ALREADY_BOOKED"},
		{name: "confirmed", args: `{"date":"2026-10-26"}`, status: "CONFIRMED", want: "change or cancel", code: "ALREADY_BOOKED"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			s, r, calendar := newChatService(t)
			if scenario.disconnected {
				r.token = ""
			}
			if scenario.providerFailure {
				calendar.err = errors.New("provider unavailable: private detail")
			}
			if scenario.status != "" {
				r.conversation.Bookings = []domain.Booking{{Status: scenario.status, Timezone: "Asia/Bangkok"}}
			}
			s.LLM = replyFunc(func(_ context.Context, _ string, _ []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
				if len(exchanges) > 0 {
					if scenario.code != "" && exchanges[0].Results[0].(map[string]string)["code"] != scenario.code {
						t.Error("incorrect recovery code")
					}
					return ports.Reply{}, errors.New("model unavailable")
				}
				return ports.Reply{Calls: []ports.ToolCall{{Name: "check_calendar_slots", Args: json.RawMessage(scenario.args)}}}, nil
			})
			reply := chatForTest(t, s, r)
			if len(reply.Slots) != 0 || !strings.Contains(reply.Content, scenario.want) || strings.Contains(reply.Content, "private detail") {
				t.Fatalf("wrong recovery: %+v", reply)
			}
			if scenario.status != "" && calendar.calls != 0 {
				t.Fatal("active booking should not offer another appointment")
			}
		})
	}
}

func TestConversationContextIncludesOfferExpiryScheduleAndBookingTimezone(t *testing.T) {
	s, r, _ := newChatService(t)
	r.conversation.Messages = []domain.Message{{Role: "assistant", CreatedAt: s.now().Add(-16 * time.Minute), Slots: []domain.Slot{{Start: s.now().Add(48 * time.Hour), End: s.now().Add(48*time.Hour + 30*time.Minute)}}}}
	r.conversation.Bookings = []domain.Booking{{ID: "reference", Status: "PENDING", Timezone: "Asia/Bangkok", Start: s.now().Add(24 * time.Hour), End: s.now().Add(24*time.Hour + 30*time.Minute)}}
	s.LLM = replyFunc(func(_ context.Context, prompt string, _ []domain.Message, _ []ports.Exchange) (ports.Reply, error) {
		for _, want := range []string{`"expired":true`, `"stage":"PENDING"`, `"duration_minutes":30`, `"calendar_connected_locally":true`, "2026-10-21T07:00:00+07:00", "reference=reference"} {
			if !strings.Contains(prompt, want) {
				t.Errorf("missing trusted context: %s", want)
			}
		}
		if strings.Contains(prompt, r.token) {
			t.Error("encrypted credential exposed to model")
		}
		return ports.Reply{Text: "Your booking is still awaiting confirmation."}, nil
	})
	chatForTest(t, s, r)
}

type chatRepository struct {
	ports.Repository
	settings     domain.Settings
	conversation domain.Conversation
	token        string
}

func (r *chatRepository) Settings(context.Context) (domain.Settings, error)           { return r.settings, nil }
func (r *chatRepository) Authorize(context.Context, string, string) error             { return nil }
func (r *chatRepository) WithLock(_ context.Context, _ string, fn func() error) error { return fn() }
func (r *chatRepository) Conversation(context.Context, string) (domain.Conversation, error) {
	return r.conversation, nil
}
func (r *chatRepository) ConsumeUsage(context.Context, int) error { return nil }
func (r *chatRepository) Append(_ context.Context, _ string, message domain.Message) error {
	r.conversation.Messages = append(r.conversation.Messages, message)
	return nil
}
func (r *chatRepository) Token(context.Context) (string, error) { return r.token, nil }
func (r *chatRepository) Reserved(context.Context, string, domain.Slot) ([]domain.Slot, error) {
	return nil, nil
}

type freeCalendar struct{ ports.Calendar }

func (freeCalendar) Busy(context.Context, string, domain.Settings, domain.Slot) ([]domain.Slot, error) {
	return nil, nil
}

type repeatedAvailability struct{ t *testing.T }

func (l repeatedAvailability) Reply(_ context.Context, prompt string, _ []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
	// The server clock is UTC; calendar date reasoning must use business time.
	if !strings.Contains(prompt, "2026-10-20T07:00:00+07:00") {
		l.t.Error("model did not receive current business-local time")
	}
	if len(exchanges) > 0 {
		result := exchanges[0].Results[0].(map[string]any)
		if !strings.Contains(result["display"].(string), "Do not list or repeat") {
			l.t.Error("availability tool did not describe the selectable UI")
		}
	}
	return ports.Reply{Calls: []ports.ToolCall{{Name: "check_calendar_slots", Args: json.RawMessage(`{"date":"2026-10-26"}`)}}}, nil
}

func TestChatKeepsOfferedSlotsWhenModelExhaustsToolRounds(t *testing.T) {
	r := &chatRepository{
		settings:     domain.Settings{Enabled: true, Timezone: "Asia/Bangkok", CalendarID: "primary", DurationMinutes: 30, StartHour: 9, EndHour: 10, Weekdays: []int{1}, DailyLimit: 200},
		conversation: domain.Conversation{ID: "11111111-1111-4111-8111-111111111111"},
	}
	s := &Service{Repo: r, LLM: repeatedAvailability{t}, Calendar: freeCalendar{}, EncryptionKey: []byte(strings.Repeat("k", 32)), Now: func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }}
	var err error
	r.token, err = s.seal("refresh")
	if err != nil {
		t.Fatal(err)
	}
	conversation, err := s.Chat(context.Background(), r.conversation.ID, strings.Repeat("a", 43), "October 26, please")
	if err != nil {
		t.Fatal(err)
	}
	reply := conversation.Messages[len(conversation.Messages)-1]
	if len(reply.Slots) == 0 || strings.Contains(reply.Content, "choose a date") || !strings.Contains(reply.Content, "Choose a time below") {
		t.Fatalf("offered slots lost or contradictory scheduling instruction: %+v", reply)
	}
}

func TestEmptyAvailabilityDoesNotClaimThereAreAppointments(t *testing.T) {
	r := &chatRepository{
		settings:     domain.Settings{Enabled: true, Timezone: "Asia/Bangkok", DurationMinutes: 30, StartHour: 9, EndHour: 10, Weekdays: []int{1}},
		conversation: domain.Conversation{ID: "11111111-1111-4111-8111-111111111111"},
	}
	s := &Service{Repo: r, Now: func() time.Time { return time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC) }}
	slots, err := s.Slots(context.Background(), r.conversation.ID, strings.Repeat("a", 43), "2026-10-25")
	if err != nil {
		t.Fatal(err)
	}
	if len(slots) != 0 || !strings.Contains(r.conversation.Messages[0].Content, "no available times") {
		t.Fatalf("empty Sunday availability misrepresented: %+v", r.conversation.Messages)
	}
}
