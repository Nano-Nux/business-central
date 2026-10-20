package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/app"
	"business-central-backend/internal/receptionist/adapters/outbound/postgres"
	"business-central-backend/internal/receptionist/application"
	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fakeCalendar struct {
	events       map[string]domain.Booking
	created      int
	loseResponse bool
	reject       bool
	busy         []domain.Slot
}

func (c *fakeCalendar) Busy(context.Context, string, domain.Settings, domain.Slot) ([]domain.Slot, error) {
	return c.busy, nil
}
func (c *fakeCalendar) Find(_ context.Context, _ string, b domain.Booking) (string, bool, error) {
	_, ok := c.events[b.ID]
	return "https://calendar.google.com/event?test=1", ok, nil
}
func (c *fakeCalendar) Create(_ context.Context, _ string, b domain.Booking) (string, error) {
	if c.reject {
		c.reject = false
		return "", ports.ErrCalendarRejected
	}
	c.created++
	c.events[b.ID] = b
	if c.loseResponse {
		c.loseResponse = false
		return "", errors.New("connection lost after Google commit")
	}
	return "https://calendar.google.com/event?test=1", nil
}

type fakeLLM struct {
	rounds  int
	date    string
	unknown bool
}

func (l *fakeLLM) Reply(_ context.Context, _ string, _ []domain.Message, exchanges []ports.Exchange) (ports.Reply, error) {
	l.rounds++
	if len(exchanges) == 0 {
		name := "check_calendar_slots"
		if l.unknown {
			name = "read_shop_data"
		}
		return ports.Reply{State: json.RawMessage(`{"role":"model","parts":[]}`), Calls: []ports.ToolCall{{Name: name, Args: json.RawMessage(`{"date":"` + l.date + `"}`)}}}, nil
	}
	return ports.Reply{Text: "Please select a time and confirm your details."}, nil
}

type fakeOAuth struct{ verifier string }

func (o *fakeOAuth) Configured() bool { return true }
func (o *fakeOAuth) URL(state, verifier string) string {
	o.verifier = verifier
	return "https://accounts.google.com/test?state=" + state
}
func (o *fakeOAuth) Exchange(_ context.Context, code, verifier string) (string, error) {
	if code != "test-code" || verifier != o.verifier {
		return "", errors.New("PKCE mismatch")
	}
	return "private-refresh-token", nil
}
func apiCode(t *testing.T, e error, want string) {
	t.Helper()
	var a *app.Error
	if !errors.As(e, &a) || a.Code != want {
		t.Fatalf("want %s, got %v", want, e)
	}
}

func TestConfiguredDatabaseReceptionistLifecycle(t *testing.T) {
	dsn := os.Getenv("RECEPTIONIST_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set RECEPTIONIST_TEST_DATABASE_URL to an isolated PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	owner, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer owner.Close()
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")
	schema := "receptionist_test_" + suffix
	role := "receptionist_role_" + suffix
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	quotedRole := pgx.Identifier{role}.Sanitize()
	if _, e = owner.Exec(ctx, "CREATE SCHEMA "+quotedSchema); e != nil {
		t.Fatal(e)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		if _, err := owner.Exec(cleanup, "DROP SCHEMA "+quotedSchema+" CASCADE"); err != nil {
			t.Error(err)
		}
		if _, err := owner.Exec(cleanup, "DROP ROLE IF EXISTS "+quotedRole); err != nil {
			t.Error(err)
		}
	}()
	config, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	setup, e := pgxpool.NewWithConfig(ctx, config.Copy())
	if e != nil {
		t.Fatal(e)
	}
	sql, e := os.ReadFile(filepath.Join("..", "..", "..", "..", "database", "0056_public_receptionist.sql"))
	if e != nil {
		setup.Close()
		t.Fatal(e)
	}
	if _, e = setup.Exec(ctx, string(sql)); e != nil {
		setup.Close()
		t.Fatal(e)
	}
	// Applying again is safe for fresh-schema bootstrap followed by migrations.
	if _, e = setup.Exec(ctx, string(sql)); e != nil {
		setup.Close()
		t.Fatal(e)
	}
	if _, e = setup.Exec(ctx, "CREATE ROLE "+quotedRole+" NOLOGIN; GRANT USAGE ON SCHEMA "+quotedSchema+" TO "+quotedRole+"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "+quotedSchema+" TO "+quotedRole); e != nil {
		setup.Close()
		t.Fatal(e)
	}
	setup.Close()
	config.AfterConnect = func(ctx context.Context, c *pgx.Conn) error { _, e := c.Exec(ctx, "SET ROLE "+quotedRole); return e }
	pool, e := pgxpool.NewWithConfig(ctx, config)
	if e != nil {
		t.Fatal(e)
	}
	defer pool.Close()
	var visible int
	if e = pool.QueryRow(ctx, `SELECT count(*) FROM receptionist_settings`).Scan(&visible); e != nil || visible != 0 {
		t.Fatalf("RLS leakage: %d %v", visible, e)
	}
	r := &postgres.Repository{Pool: pool}
	settings, e := r.Settings(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if settings.Enabled {
		t.Fatal("enabled by default")
	}
	settings.Enabled = true
	settings.Weekdays = []int{0, 1, 2, 3, 4, 5, 6}
	if e = r.SaveSettings(ctx, settings); e != nil {
		t.Fatal(e)
	}
	now := time.Now().UTC()
	day := now.AddDate(0, 0, 1).In(time.FixedZone("Bangkok", 7*3600)).Format("2006-01-02")
	cal := &fakeCalendar{events: map[string]domain.Booking{}}
	llm := &fakeLLM{date: day}
	oauth := &fakeOAuth{}
	s := &application.Service{Repo: r, Calendar: cal, LLM: llm, OAuth: oauth, EncryptionKey: []byte(strings.Repeat("x", 32)), Now: func() time.Time { return now }}
	_, state, e := s.BeginOAuth(ctx)
	if e != nil {
		t.Fatal(e)
	}
	encrypted, e := r.State(ctx, application.Hash(state))
	if e != nil || strings.Contains(encrypted, oauth.verifier) {
		t.Fatalf("verifier not protected: %v", e)
	}
	if e = s.CompleteOAuth(ctx, state, "test-code"); e != nil {
		t.Fatal(e)
	}
	apiCode(t, s.CompleteOAuth(ctx, state, "test-code"), "INVALID_STATE")
	encrypted, e = r.Token(ctx)
	if e != nil || strings.Contains(encrypted, "private-refresh-token") {
		t.Fatalf("refresh token not protected: %v", e)
	}
	c, token, e := s.Start(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if len(c.Messages) != 1 || c.Messages[0].Role != "assistant" {
		t.Fatal("missing greeting")
	}
	_, otherToken, e := s.Start(ctx)
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.Get(ctx, c.ID, otherToken)
	apiCode(t, e, "NOT_FOUND")
	c, e = s.Chat(ctx, c.ID, token, "I would like a demo tomorrow.")
	if e != nil {
		t.Fatal(e)
	}
	if llm.rounds != 2 || len(c.Messages) != 3 || len(c.Messages[2].Slots) == 0 {
		t.Fatalf("tool flow incomplete: %+v", c)
	}
	slot := c.Messages[2].Slots[0]
	req := domain.BookRequest{RequestID: uuid.NewString(), Name: "Visitor", Email: "visitor@example.com", Company: "Test store", Notes: "POS demo", Start: slot.Start}
	_, e = s.Book(ctx, c.ID, token, req)
	apiCode(t, e, "VALIDATION_ERROR")
	if cal.created != 0 {
		t.Fatal("created before confirmation")
	}
	req.Confirmed = true
	cal.loseResponse = true
	_, e = s.Book(ctx, c.ID, token, req)
	apiCode(t, e, "BOOKING_PENDING")
	bookings, total, e := r.ListBookings(ctx, 25, 0, "PENDING")
	if e != nil || total != 1 || len(bookings) != 1 {
		t.Fatalf("lost pending state: %v %d", e, total)
	}
	// Pending local reservations must disappear from offered availability even
	// before Google's free/busy index reflects the newly inserted event.
	free, e := s.Slots(ctx, c.ID, token, day)
	if e != nil {
		t.Fatal(e)
	}
	for _, f := range free {
		if f.Start.Equal(slot.Start) {
			t.Fatal("pending reservation offered again")
		}
	}
	b, e := s.Book(ctx, c.ID, token, req)
	if e != nil || b.Status != "CONFIRMED" || cal.created != 1 {
		t.Fatalf("retry duplicated or failed: %+v %v creates=%d", b, e, cal.created)
	}
	_, e = s.Book(ctx, c.ID, token, req)
	if e != nil || cal.created != 1 {
		t.Fatal("confirmed retry not idempotent")
	}
	req.Email = "different@example.com"
	_, e = s.Book(ctx, c.ID, token, req)
	apiCode(t, e, "IDEMPOTENCY_CONFLICT")
	stored, e := r.Conversation(ctx, c.ID)
	if e != nil || stored.Email != "visitor@example.com" || len(stored.Bookings) != 1 || stored.Bookings[0].Status != "CONFIRMED" {
		t.Fatalf("missing admin details: %+v %v", stored, e)
	}
	list, total, e := r.ListConversations(ctx, 1, 0)
	if e != nil || total != 2 || len(list) != 1 {
		t.Fatalf("pagination failed: %d %v", total, e)
	}
	bookings, total, e = r.ListBookings(ctx, 1, 0, "CONFIRMED")
	if e != nil || total != 1 || len(bookings) != 1 {
		t.Fatal("confirmed booking list missing")
	}
	detail, e := r.Booking(ctx, b.ID)
	if e != nil || detail.Notes != "POS demo" {
		t.Fatal("booking detail missing")
	}
	apiCode(t, r.ConsumeUsage(ctx, 1), "DAILY_LIMIT")
	if e = r.WithLock(ctx, "same", func() error {
		return r.WithLock(ctx, "same", func() error { t.Error("overlapping lock entered"); return nil })
	}); e == nil {
		t.Fatal("concurrent lock accepted")
	}
	llm.unknown = true
	c2, t2, e := s.Start(ctx)
	if e != nil {
		t.Fatal(e)
	}
	c2, e = s.Chat(ctx, c2.ID, t2, "Read merchant data")
	if e != nil {
		t.Fatal(e)
	}
	if len(c2.Messages[len(c2.Messages)-1].Slots) != 0 {
		t.Fatal("unknown tool ran")
	}
	failedConversation, failedToken, e := s.Start(ctx)
	if e != nil {
		t.Fatal(e)
	}
	available, e := s.Slots(ctx, failedConversation.ID, failedToken, day)
	if e != nil || len(available) == 0 {
		t.Fatalf("missing failure-test slots: %v", e)
	}
	failedRequest := domain.BookRequest{RequestID: uuid.NewString(), Name: "Another visitor", Email: "other@example.com", Start: available[0].Start, Confirmed: true}
	cal.reject = true
	_, e = s.Book(ctx, failedConversation.ID, failedToken, failedRequest)
	apiCode(t, e, "BOOKING_FAILED")
	failed, e := r.Booking(ctx, failedRequest.RequestID)
	if e != nil || failed.Status != "FAILED" {
		t.Fatalf("definitive rejection remained reserved: %+v %v", failed, e)
	}
	available, e = s.Slots(ctx, failedConversation.ID, failedToken, day)
	if e != nil {
		t.Fatal(e)
	}
	released := false
	for _, slot := range available {
		if slot.Start.Equal(failedRequest.Start) {
			released = true
		}
	}
	if !released {
		t.Fatal("failed booking held its slot")
	}
	_, e = owner.Exec(ctx, "UPDATE "+quotedSchema+".receptionist_messages SET created_at=now()-interval '16 minutes' WHERE conversation_id=$1", failedConversation.ID)
	if e != nil {
		t.Fatal(e)
	}
	failedRequest.RequestID = uuid.NewString()
	_, e = s.Book(ctx, failedConversation.ID, failedToken, failedRequest)
	apiCode(t, e, "SLOT_EXPIRED")
	// Expiry is enforced by the public session capability, not by an admin query.
	_, e = owner.Exec(ctx, "UPDATE "+quotedSchema+".receptionist_conversations SET expires_at=now()-interval '1 second' WHERE id=$1", c.ID)
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.Get(ctx, c.ID, token)
	apiCode(t, e, "NOT_FOUND")
}
