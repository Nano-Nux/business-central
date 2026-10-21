package gemini

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

func TestFunctionStateAndCallIDRoundTrip(t *testing.T) {
	const content = `{"role":"model","parts":[{"functionCall":{"id":"call-1","name":"check_calendar_slots","args":{"date":"2026-10-21"}},"thoughtSignature":"opaque-signature"}]}`
	var count int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		if r.Header.Get("x-goog-api-key") != "key" || r.URL.RawQuery != "" {
			t.Error("key must be in header")
		}
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		for _, parameter := range []string{`"not_before"`, `"before"`} {
			if !strings.Contains(string(body["tools"]), parameter) {
				t.Errorf("time preference parameter missing from provider schema: %s", parameter)
			}
		}
		if count == 1 {
			w.Write([]byte(`{"candidates":[{"finishReason":"STOP","content":` + content + `}]}`))
			return
		}
		if !strings.Contains(string(body["contents"]), "opaque-signature") || !strings.Contains(string(body["contents"]), `"id":"call-1"`) {
			t.Error("lost opaque call state")
		}
		w.Write([]byte(`{"candidates":[{"finishReason":"STOP","content":{"role":"model","parts":[{"text":"Pick a time."}]}}]}`))
	}))
	defer srv.Close()
	c := &Client{APIKey: "key", BaseURL: srv.URL, HTTP: srv.Client()}
	history := []domain.Message{{Role: "user", Content: "Tomorrow?"}}
	reply, e := c.Reply(context.Background(), "rules", history, nil)
	if e != nil || len(reply.Calls) != 1 {
		t.Fatalf("%v %v", reply, e)
	}
	reply, e = c.Reply(context.Background(), "rules", history, []ports.Exchange{{State: reply.State, Calls: reply.Calls, Results: []any{map[string]any{"slots": []any{}}}}})
	if e != nil || reply.Text != "Pick a time." {
		t.Fatalf("%v %v", reply, e)
	}
}
