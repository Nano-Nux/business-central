package application

import (
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/ports/outbound"
	"context"
	"errors"
	"strings"
	"testing"
)

type webhookProvider struct {
	outbound.Provider
	configured            bool
	info                  tdto.WebhookInfo
	registeredURL, secret string
	failure               error
}

func (p *webhookProvider) Configured() bool { return p.configured }
func (p *webhookProvider) GetWebhookInfo(context.Context) (tdto.WebhookInfo, error) {
	return p.info, p.failure
}
func (p *webhookProvider) SetWebhook(_ context.Context, url, secret string) error {
	p.registeredURL, p.secret = url, secret
	p.info.URL = url
	return p.failure
}

func TestWebhookRegistrationAndStatus(t *testing.T) {
	secret := strings.Repeat("a", 32)
	provider := &webhookProvider{configured: true, info: tdto.WebhookInfo{PendingUpdateCount: 2, LastErrorMessage: "error " + secret}}
	service := NewService(nil, provider, secret, "NanonuxBusinessCentralBot", "https://backend.example.com")
	status, err := service.RegisterWebhook(context.Background(), " https://backend.example.com/api/v1/webhooks/telegram ")
	if err != nil {
		t.Fatal(err)
	}
	if provider.secret != secret || provider.registeredURL != status.URL || status.PendingUpdateCount != 2 || !status.TokenConfigured || !status.SecretConfigured || status.SuggestedURL != status.URL || strings.Contains(status.LastErrorMessage, secret) {
		t.Fatalf("incorrect registration status: %+v", status)
	}
}

func TestWebhookRejectsInvalidURLAndMissingConfiguration(t *testing.T) {
	for _, url := range []string{"", "http://backend.example.com/api/v1/webhooks/telegram", "https://localhost/api/v1/webhooks/telegram", "https://127.0.0.1/api/v1/webhooks/telegram", "https://192.168.1.3/api/v1/webhooks/telegram", "https://backend.example.com/other", "https://backend.example.com:3000/api/v1/webhooks/telegram", "https://user:password@backend.example.com/api/v1/webhooks/telegram", "https://backend.example.com/api/v1/webhooks/telegram?secret=x"} {
		provider := &webhookProvider{configured: true}
		_, err := NewService(nil, provider, strings.Repeat("a", 32), "").RegisterWebhook(context.Background(), url)
		if err == nil || provider.registeredURL != "" {
			t.Fatalf("accepted invalid URL %q", url)
		}
	}
	for _, setup := range []struct {
		configured bool
		secret     string
	}{{false, strings.Repeat("a", 32)}, {true, ""}, {true, strings.Repeat("!", 32)}} {
		provider := &webhookProvider{configured: setup.configured}
		_, err := NewService(nil, provider, setup.secret, "").RegisterWebhook(context.Background(), "https://backend.example.com/api/v1/webhooks/telegram")
		if err == nil || provider.registeredURL != "" {
			t.Fatal("registered without valid server configuration")
		}
	}
	status, err := NewService(nil, nil, "", "", "http://localhost:8080").WebhookStatus(context.Background())
	if err != nil || status.TokenConfigured || status.SuggestedURL != "" {
		t.Fatalf("invalid unconfigured status: %+v %v", status, err)
	}
}

func TestWebhookProviderFailuresDoNotExposeCredentials(t *testing.T) {
	secret := strings.Repeat("a", 32)
	provider := &webhookProvider{configured: true, failure: errors.New("secret=" + secret + " token=private-bot-token")}
	service := NewService(nil, provider, secret, "")
	_, err := service.RegisterWebhook(context.Background(), "https://backend.example.com/api/v1/webhooks/telegram")
	if err == nil || strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "private-bot-token") {
		t.Fatalf("unsafe error: %v", err)
	}
	_, err = service.WebhookStatus(context.Background())
	if err == nil || strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "private-bot-token") {
		t.Fatalf("unsafe status error: %v", err)
	}
}
