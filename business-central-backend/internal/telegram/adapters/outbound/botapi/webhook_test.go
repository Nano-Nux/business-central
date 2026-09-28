package botapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

type webhookTransport func(*http.Request) (*http.Response, error)

func (f webhookTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSetWebhookSendsServerSecretAndPreservesPendingUpdates(t *testing.T) {
	client := New("test-token")
	client.http = &http.Client{Transport: webhookTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/bottest-token/setWebhook" || r.Method != "POST" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["url"] != "https://backend.example.com/api/v1/webhooks/telegram" || payload["secret_token"] != "server-secret" || !reflect.DeepEqual(payload["allowed_updates"], []any{"message", "callback_query", "my_chat_member"}) {
			t.Fatalf("incorrect payload: %+v", payload)
		}
		if _, exists := payload["drop_pending_updates"]; exists {
			t.Fatal("must preserve pending updates")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"ok":true,"result":true}`)), Header: make(http.Header)}, nil
	})}
	if err := client.SetWebhook(context.Background(), "https://backend.example.com/api/v1/webhooks/telegram", "server-secret"); err != nil {
		t.Fatal(err)
	}
}

func TestGetWebhookInfoAndRejectedRegistration(t *testing.T) {
	client := New("test-token")
	client.http = &http.Client{Transport: webhookTransport(func(r *http.Request) (*http.Response, error) {
		body := `{"ok":true,"result":{"url":"https://backend.example.com/api/v1/webhooks/telegram","pending_update_count":3,"last_error_date":123,"last_error_message":"Bad Gateway test-token"}}`
		if strings.HasSuffix(r.URL.Path, "/setWebhook") {
			body = `{"ok":true,"result":false}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	info, err := client.GetWebhookInfo(context.Background())
	if err != nil || info.PendingUpdateCount != 3 || info.LastErrorDate != 123 || info.LastErrorMessage != "Bad Gateway [redacted]" {
		t.Fatalf("incorrect webhook info: %+v %v", info, err)
	}
	if client.SetWebhook(context.Background(), "https://backend.example.com/api/v1/webhooks/telegram", "secret") == nil {
		t.Fatal("accepted false result")
	}
}
