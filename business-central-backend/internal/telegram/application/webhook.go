package application

import (
	"context"
	"net"
	"net/url"
	"regexp"
	"strings"

	"business-central-backend/internal/app"
	tdto "business-central-backend/internal/telegram/application/dto"
)

var webhookSecretPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{32,256}$`)

func validWebhookURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/api/v1/webhooks/telegram" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || !strings.Contains(host, ".") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil && (!ip.IsGlobalUnicast() || ip.IsPrivate()) {
		return false
	}
	switch u.Port() {
	case "", "443", "80", "88", "8443":
		return true
	default:
		return false
	}
}

func (s *Service) WebhookStatus(ctx context.Context) (tdto.WebhookStatus, error) {
	status := tdto.WebhookStatus{BotUsername: s.botName, TokenConfigured: s.provider != nil && s.provider.Configured(), SecretConfigured: webhookSecretPattern.MatchString(s.webhookSecret)}
	suggestion := strings.TrimRight(s.publicBaseURL, "/") + "/api/v1/webhooks/telegram"
	if validWebhookURL(suggestion) {
		status.SuggestedURL = suggestion
	}
	if !status.TokenConfigured {
		return status, nil
	}
	info, err := s.provider.GetWebhookInfo(ctx)
	if err != nil {
		return status, app.NewError("TELEGRAM_API_ERROR", "Could not read Telegram webhook status. Check the backend bot token and connection to Telegram.", 502)
	}
	// Telegram delivery errors may include request details; never expose the shared secret.
	if s.webhookSecret != "" {
		info.LastErrorMessage = strings.ReplaceAll(info.LastErrorMessage, s.webhookSecret, "[redacted]")
	}
	status.WebhookInfo = info
	return status, nil
}

func (s *Service) RegisterWebhook(ctx context.Context, rawURL string) (tdto.WebhookStatus, error) {
	rawURL = strings.TrimSpace(rawURL)
	if !validWebhookURL(rawURL) {
		return tdto.WebhookStatus{}, app.NewError("VALIDATION_ERROR", "Use a public HTTPS URL ending in /api/v1/webhooks/telegram, with no query or fragment, on port 443, 80, 88, or 8443.", 400)
	}
	if s.provider == nil || !s.provider.Configured() || !webhookSecretPattern.MatchString(s.webhookSecret) {
		return tdto.WebhookStatus{}, app.NewError("TELEGRAM_NOT_CONFIGURED", "Configure TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET on the backend. The secret must contain 32–256 letters, numbers, underscores, or hyphens.", 400)
	}
	if err := s.provider.SetWebhook(ctx, rawURL, s.webhookSecret); err != nil {
		return tdto.WebhookStatus{}, app.NewError("TELEGRAM_API_ERROR", "Telegram could not register the webhook. Check the public HTTPS address, certificate, and backend bot token, then refresh status before retrying.", 502)
	}
	status, err := s.WebhookStatus(ctx)
	if err != nil {
		return status, app.NewError("TELEGRAM_API_ERROR", "Telegram accepted the registration, but status could not be read. Refresh status to verify it.", 502)
	}
	return status, nil
}
