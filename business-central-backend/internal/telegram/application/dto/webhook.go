package dto

type WebhookInfo struct {
	URL                string   `json:"url"`
	PendingUpdateCount int      `json:"pending_update_count"`
	LastErrorDate      int64    `json:"last_error_date,omitempty"`
	LastErrorMessage   string   `json:"last_error_message,omitempty"`
	AllowedUpdates     []string `json:"allowed_updates,omitempty"`
}

type WebhookStatus struct {
	WebhookInfo
	BotUsername      string `json:"bot_username"`
	TokenConfigured  bool   `json:"token_configured"`
	SecretConfigured bool   `json:"secret_configured"`
	SuggestedURL     string `json:"suggested_url"`
}
