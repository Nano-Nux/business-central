package botapi

import (
	tdto "business-central-backend/internal/telegram/application/dto"
	"context"
	"errors"
	"strings"
)

func (c *Client) Configured() bool { return c.token != "" }

func (c *Client) GetWebhookInfo(ctx context.Context) (tdto.WebhookInfo, error) {
	var info tdto.WebhookInfo
	err := c.call(ctx, "getWebhookInfo", map[string]any{}, &info)
	if c.token != "" {
		info.LastErrorMessage = strings.ReplaceAll(info.LastErrorMessage, c.token, "[redacted]")
	}
	return info, err
}

func (c *Client) SetWebhook(ctx context.Context, url, secret string) error {
	var accepted bool
	err := c.call(ctx, "setWebhook", map[string]any{"url": url, "secret_token": secret, "allowed_updates": []string{"message", "callback_query", "my_chat_member"}}, &accepted)
	if err != nil {
		return err
	}
	if !accepted {
		return errors.New("Telegram did not accept webhook registration")
	}
	return nil
}
