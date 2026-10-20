package google

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

func TestFreeBusyErrorsAreNotAvailability(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			w.Write([]byte(`{"access_token":"test"}`))
			return
		}
		w.Write([]byte(`{"calendars":{"primary":{"errors":[{"reason":"notFound"}]}}}`))
	}))
	defer server.Close()
	c := &Client{HTTP: server.Client(), TokenURL: server.URL + "/token", CalendarURL: server.URL}
	if _, e := c.Busy(context.Background(), "refresh", domain.Settings{CalendarID: "primary"}, domain.Slot{}); e == nil {
		t.Fatal("calendar error treated as free")
	}
}
func TestIdempotentEventAndGuestNotification(t *testing.T) {
	start := time.Now().UTC().Truncate(time.Second)
	b := domain.Booking{ID: "booking-ref", EventID: "event123", CalendarID: "primary", Name: "Visitor", Email: "visitor@example.com", Start: start, End: start.Add(30 * time.Minute), Timezone: "Asia/Bangkok"}
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			w.Write([]byte(`{"access_token":"test"}`))
			return
		}
		requests++
		if r.Header.Get("Authorization") != "Bearer test" {
			t.Error("missing bearer")
		}
		if r.Method == "POST" {
			if r.URL.Query().Get("sendUpdates") != "all" {
				t.Error("missing guest notification")
			}
			var payload map[string]any
			if e := json.NewDecoder(r.Body).Decode(&payload); e != nil {
				t.Error(e)
			}
			if payload["id"] != "event123" {
				t.Error("unstable event ID")
			}
			w.WriteHeader(409)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"id": b.EventID, "status": "confirmed", "htmlLink": "https://calendar.google.com/event?eid=test", "start": map[string]any{"dateTime": b.Start}, "end": map[string]any{"dateTime": b.End}, "extendedProperties": map[string]any{"private": map[string]string{"nanonux_booking_id": b.ID}}})
	}))
	defer server.Close()
	c := &Client{HTTP: server.Client(), TokenURL: server.URL + "/token", CalendarURL: server.URL}
	link, e := c.Create(context.Background(), "refresh", b)
	if e != nil || !strings.HasPrefix(link, "https://calendar.google.com/") || requests != 2 {
		t.Fatalf("%q %v requests=%d", link, e, requests)
	}
	if _, e = verifyEvent([]byte(`{"id":"event123","extendedProperties":{"private":{"nanonux_booking_id":"other"}}}`), b); e == nil {
		t.Fatal("foreign event accepted")
	}
}
func TestPKCEAndOfflineConsent(t *testing.T) {
	c := &Client{ClientID: "id", ClientSecret: "secret", RedirectURL: "https://api.example.com/callback"}
	link := c.URL("state", "verifier")
	if !strings.Contains(link, "code_challenge_method=S256") || !strings.Contains(link, "access_type=offline") || strings.Contains(link, "client_secret") {
		t.Fatal("invalid OAuth URL")
	}
}

func TestDefinitiveCreationRejection(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/token" {
			w.Write([]byte(`{"access_token":"test"}`))
			return
		}
		w.WriteHeader(400)
	}))
	defer server.Close()
	c := &Client{HTTP: server.Client(), TokenURL: server.URL + "/token", CalendarURL: server.URL}
	_, e := c.Create(context.Background(), "refresh", domain.Booking{CalendarID: "primary"})
	if !errors.Is(e, ports.ErrCalendarRejected) {
		t.Fatalf("definitive rejection not classified: %v", e)
	}
}
