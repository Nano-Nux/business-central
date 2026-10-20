package domain

import (
	"net/mail"
	"strings"
	"time"

	"business-central-backend/internal/app"
)

type Settings struct {
	Enabled         bool   `json:"enabled"`
	Greeting        string `json:"greeting"`
	Knowledge       string `json:"knowledge"`
	Timezone        string `json:"timezone"`
	CalendarID      string `json:"calendar_id"`
	DurationMinutes int    `json:"duration_minutes"`
	StartHour       int    `json:"start_hour"`
	EndHour         int    `json:"end_hour"`
	Weekdays        []int  `json:"weekdays"`
	DailyLimit      int    `json:"daily_limit"`
}

func (s Settings) Validate() error {
	_, err := time.LoadLocation(s.Timezone)
	if err != nil || s.DurationMinutes < 15 || s.DurationMinutes > 120 || s.StartHour < 0 || s.EndHour > 24 || s.StartHour >= s.EndHour || (s.EndHour-s.StartHour)*60 < s.DurationMinutes || s.DailyLimit < 1 || s.DailyLimit > 10000 || len(s.Greeting) < 1 || len(s.Greeting) > 500 || len(s.Knowledge) > 24000 || len(s.CalendarID) < 1 || len(s.CalendarID) > 254 || len(s.Weekdays) == 0 || len(s.Weekdays) > 7 {
		return app.NewError("VALIDATION_ERROR", "Check the timezone, knowledge, calendar, daily limit and scheduling settings.", 400)
	}
	seen := map[int]bool{}
	for _, d := range s.Weekdays {
		if d < 0 || d > 6 || seen[d] {
			return app.NewError("VALIDATION_ERROR", "Weekdays must be unique numbers from 0 (Sunday) to 6 (Saturday).", 400)
		}
		seen[d] = true
	}
	return nil
}

type Conversation struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Company   string    `json:"company"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Messages  []Message `json:"messages,omitempty"`
	Bookings  []Booking `json:"bookings,omitempty"`
}
type Slot struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}
type Message struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Slots     []Slot    `json:"slots,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
type Booking struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Name           string    `json:"name"`
	Email          string    `json:"email"`
	Company        string    `json:"company"`
	Notes          string    `json:"notes"`
	Start          time.Time `json:"start"`
	End            time.Time `json:"end"`
	Timezone       string    `json:"timezone"`
	CalendarID     string    `json:"calendar_id"`
	Status         string    `json:"status"`
	EventID        string    `json:"event_id"`
	EventURL       string    `json:"event_url"`
	LastError      string    `json:"last_error"`
	CreatedAt      time.Time `json:"created_at"`
}
type BookRequest struct {
	RequestID string    `json:"request_id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Company   string    `json:"company"`
	Notes     string    `json:"notes"`
	Start     time.Time `json:"start"`
	Confirmed bool      `json:"confirmed"`
}

func (r *BookRequest) Validate() error {
	r.Name = strings.TrimSpace(r.Name)
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.Company = strings.TrimSpace(r.Company)
	r.Notes = strings.TrimSpace(r.Notes)
	em, err := mail.ParseAddress(r.Email)
	if !r.Confirmed || r.Name == "" || len(r.Name) > 120 || len(r.Email) > 254 || err != nil || em.Address != r.Email || len(r.Company) > 160 || len(r.Notes) > 2000 || r.Start.IsZero() {
		return app.NewError("VALIDATION_ERROR", "Confirm the appointment and provide a valid name, email and start time.", 400)
	}
	return nil
}

// Slots applies booking policy before a provider is contacted. Google free/busy
// alone does not enforce business hours or prevent concurrent bookings.
func Slots(s Settings, day string, now time.Time) ([]Slot, error) {
	loc, err := time.LoadLocation(s.Timezone)
	if err != nil {
		return nil, err
	}
	d, err := time.ParseInLocation("2006-01-02", day, loc)
	localNow := now.In(loc)
	today := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	if err != nil || d.Before(today) || d.After(today.AddDate(0, 0, 60)) {
		return nil, app.NewError("VALIDATION_ERROR", "Choose a date within the next 60 days.", 400)
	}
	allowed := false
	for _, w := range s.Weekdays {
		if int(d.Weekday()) == w {
			allowed = true
		}
	}
	slots := []Slot{}
	if !allowed {
		return slots, nil
	}
	start := time.Date(d.Year(), d.Month(), d.Day(), s.StartHour, 0, 0, 0, loc)
	end := time.Date(d.Year(), d.Month(), d.Day(), s.EndHour, 0, 0, 0, loc)
	duration := time.Duration(s.DurationMinutes) * time.Minute
	for at := start; !at.Add(duration).After(end); at = at.Add(duration) {
		if at.After(now.Add(time.Hour)) {
			slots = append(slots, Slot{at.UTC(), at.Add(duration).UTC()})
		}
	}
	return slots, nil
}
func Overlaps(a, b Slot) bool { return a.Start.Before(b.End) && b.Start.Before(a.End) }
