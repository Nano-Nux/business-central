package domain

import (
	"testing"
	"time"
)

func TestBookingPolicyAndTimezone(t *testing.T) {
	s := Settings{Greeting: "Hello", Timezone: "Asia/Bangkok", CalendarID: "primary", DurationMinutes: 30, StartHour: 9, EndHour: 17, Weekdays: []int{1, 2, 3, 4, 5}, DailyLimit: 200}
	if e := s.Validate(); e != nil {
		t.Fatal(e)
	}
	now := time.Date(2026, 10, 20, 1, 0, 0, 0, time.UTC) // Tuesday, 08:00 Bangkok.
	slots, e := Slots(s, "2026-10-20", now)
	if e != nil {
		t.Fatal(e)
	}
	if len(slots) != 15 || !slots[0].Start.Equal(time.Date(2026, 10, 20, 2, 30, 0, 0, time.UTC)) {
		t.Fatalf("lead time or timezone incorrect: %+v", slots)
	}
	if slots, e = Slots(s, "2026-10-24", now); e != nil || len(slots) != 0 {
		t.Fatalf("weekend offered: %v %v", slots, e)
	}
	for _, day := range []string{"2026-10-19", "2026-12-20", "tomorrow"} {
		if _, e = Slots(s, day, now); e == nil {
			t.Errorf("accepted %q", day)
		}
	}
	s.Weekdays = []int{1, 1}
	if s.Validate() == nil {
		t.Fatal("duplicate weekday accepted")
	}
	s.Weekdays = []int{1}
	s.Timezone = "Wrong/Zone"
	if s.Validate() == nil {
		t.Fatal("bad timezone accepted")
	}
}
func TestDSTAndTouchingSlots(t *testing.T) {
	s := Settings{Timezone: "America/New_York", DurationMinutes: 30, StartHour: 9, EndHour: 10, Weekdays: []int{1}}
	slots, e := Slots(s, "2026-11-02", time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC))
	if e != nil || len(slots) != 2 {
		t.Fatalf("%v %v", slots, e)
	}
	if slots[0].Start.Hour() != 14 {
		t.Fatal("did not apply daylight saving transition")
	}
	if Overlaps(slots[0], slots[1]) {
		t.Fatal("adjacent appointments overlap")
	}
}
func TestBookingRequiresConfirmation(t *testing.T) {
	r := BookRequest{Name: "Visitor", Email: "visitor@example.com", Start: time.Now()}
	if r.Validate() == nil {
		t.Fatal("confirmation bypassed")
	}
	r.Confirmed = true
	if e := r.Validate(); e != nil {
		t.Fatal(e)
	}
	r.Email = "Someone <visitor@example.com>"
	if r.Validate() == nil {
		t.Fatal("display address accepted")
	}
}
