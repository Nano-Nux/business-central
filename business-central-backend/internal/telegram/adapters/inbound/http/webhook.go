package http

import (
	"business-central-backend/internal/app"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) webhookStatus(c fiber.Ctx) error {
	if err := admin(c); err != nil {
		return err
	}
	ctx, cancel := timeout(c)
	defer cancel()
	status, err := h.Telegram.WebhookStatus(ctx)
	if err != nil {
		return err
	}
	return envelope(c, status)
}

func (h *Handler) registerWebhook(c fiber.Ctx) error {
	if err := admin(c); err != nil {
		return err
	}
	var input struct {
		URL string `json:"url"`
	}
	if err := c.Bind().JSON(&input); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must contain a webhook URL.", 400)
	}
	ctx, cancel := timeout(c)
	defer cancel()
	status, err := h.Telegram.RegisterWebhook(ctx, input.URL)
	if err != nil {
		return err
	}
	return envelope(c, status)
}
