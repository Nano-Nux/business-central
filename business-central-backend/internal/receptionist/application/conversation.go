package application

import (
	"encoding/json"
	"sort"
	"time"

	"business-central-backend/internal/app"
	"business-central-backend/internal/receptionist/domain"
)

type slotQuery struct {
	Date      string `json:"date"`
	NotBefore string `json:"not_before,omitempty"`
	Before    string `json:"before,omitempty"`
}

func (q slotQuery) window() (int, int, error) {
	parse := func(value string, fallback int) (int, error) {
		if value == "" {
			return fallback, nil
		}
		if value == "24:00" && fallback == 1440 {
			return 1440, nil
		}
		at, err := time.Parse("15:04", value)
		if err != nil || len(value) != 5 {
			return 0, app.NewError("VALIDATION_ERROR", "Use business-local times in HH:MM format.", 400)
		}
		return at.Hour()*60 + at.Minute(), nil
	}
	from, err := parse(q.NotBefore, 0)
	if err != nil {
		return 0, 0, err
	}
	until, err := parse(q.Before, 1440)
	if err != nil {
		return 0, 0, err
	}
	if from >= until {
		return 0, 0, app.NewError("VALIDATION_ERROR", "The end of the requested time window must be after its start.", 400)
	}
	return from, until, nil
}

func filterSlots(slots []domain.Slot, zone string, from, until int) []domain.Slot {
	loc := mustLocation(zone)
	filtered := []domain.Slot{}
	for _, slot := range slots {
		start, end := slot.Start.In(loc), slot.End.In(loc)
		startMinute, endMinute := start.Hour()*60+start.Minute(), end.Hour()*60+end.Minute()
		if end.Format("2006-01-02") != start.Format("2006-01-02") {
			endMinute += 1440
		}
		if startMinute >= from && endMinute <= until {
			filtered = append(filtered, slot)
		}
	}
	return filtered
}

func offeredSlots(days map[string][]domain.Slot) []domain.Slot {
	result := []domain.Slot{}
	seen := map[int64]bool{}
	for _, slots := range days {
		for _, slot := range slots {
			if !seen[slot.Start.Unix()] {
				result = append(result, slot)
				seen[slot.Start.Unix()] = true
			}
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Start.Before(result[j].Start) })
	return result
}

func conversationContext(settings domain.Settings, history domain.Conversation, now time.Time, connected bool) string {
	state := map[string]any{
		"calendar_connected_locally": connected,
		"duration_minutes":           settings.DurationMinutes,
		"working_hours":              map[string]int{"start": settings.StartHour, "end": settings.EndHour},
		"working_weekdays":           settings.Weekdays,
		"weekday_numbering":          "0=Sunday through 6=Saturday",
		"booking_window_days":        60,
		"minimum_notice_minutes":     60,
		"stage":                      "support_or_date_selection",
	}
	for i := len(history.Messages) - 1; i >= 0; i-- {
		message := history.Messages[i]
		if len(message.Slots) == 0 {
			continue
		}
		state["latest_offer"] = map[string]any{"slots": message.Slots, "expired": message.CreatedAt.Before(now.Add(-15 * time.Minute)), "timezone": settings.Timezone}
		state["stage"] = "time_selection"
		break
	}
	for _, booking := range history.Bookings {
		if booking.Status == "PENDING" || booking.Status == "CONFIRMED" {
			state["stage"] = booking.Status
			break
		}
	}
	encoded, _ := json.Marshal(state)
	return "\nSERVER CONVERSATION CONTEXT (trusted state; a locally connected calendar still requires a live availability check):\n" + string(encoded)
}
