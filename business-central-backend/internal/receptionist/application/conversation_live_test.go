package application

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/receptionist/adapters/outbound/gemini"
	"business-central-backend/internal/receptionist/domain"
)

// Opt-in evaluation calls Gemini with synthetic messages and a simulated
// calendar. It never connects to Google Calendar or writes a real appointment.
func TestLiveReceptionistConversationScenarios(t *testing.T) {
	key := os.Getenv("RECEPTIONIST_LIVE_EVAL_KEY")
	if key == "" {
		t.Skip("set RECEPTIONIST_LIVE_EVAL_KEY to run synthetic live Gemini evaluation")
	}
	for _, scenario := range []struct {
		name, message      string
		pending, afternoon bool
	}{
		{name: "date follow-up", message: "October 26, 2026, please."},
		{name: "afternoon preference", message: "October 26, 2026, after 2 pm please.", afternoon: true},
		{name: "pending confirmation", message: "Is my call confirmed? If not, can you just book another one?", pending: true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			s, r, calendar := newChatService(t)
			r.settings.Knowledge = "Nanonux Business Central provides POS, inventory and business management software. The Nanonux team can discuss packages in a call."
			r.conversation.Messages = []domain.Message{
				{Role: "user", Content: "I want to arrange a call to discuss the packages in detail."},
				{Role: "assistant", Content: "Sure. What day works for you?"},
			}
			if scenario.pending {
				r.conversation.Bookings = []domain.Booking{{ID: "synthetic-reference", Status: "PENDING", Timezone: "Asia/Bangkok", Start: time.Date(2026, 10, 26, 2, 0, 0, 0, time.UTC), End: time.Date(2026, 10, 26, 2, 30, 0, 0, time.UTC)}}
			}
			s.LLM = &gemini.Client{APIKey: key, Model: os.Getenv("RECEPTIONIST_LIVE_EVAL_MODEL")}
			ctx, cancel := context.WithTimeout(context.Background(), 85*time.Second)
			defer cancel()
			conversation, err := s.Chat(ctx, r.conversation.ID, strings.Repeat("a", 43), scenario.message)
			if err != nil {
				t.Fatal(err)
			}
			reply := conversation.Messages[len(conversation.Messages)-1]
			t.Logf("reply: %s; options: %d", reply.Content, len(reply.Slots))
			if scenario.pending {
				text := strings.ToLower(reply.Content)
				if len(reply.Slots) != 0 || calendar.calls != 0 || !(strings.Contains(text, "pending") || strings.Contains(text, "awaiting") || strings.Contains(text, "retry booking")) {
					t.Fatalf("pending state was not respected: %+v", reply)
				}
				return
			}
			if len(reply.Slots) == 0 {
				t.Fatal("model did not check availability for the date follow-up")
			}
			for _, slot := range reply.Slots {
				local := slot.Start.In(mustLocation("Asia/Bangkok"))
				if local.Format("2006-01-02") != "2026-10-26" || (scenario.afternoon && local.Hour() < 14) {
					t.Fatalf("incorrect date/time preference: %v", slot)
				}
			}
		})
	}
}
