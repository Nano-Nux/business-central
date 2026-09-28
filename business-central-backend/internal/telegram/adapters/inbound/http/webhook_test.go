package http

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/ports/inbound"
	"context"
	"errors"
	"github.com/gofiber/fiber/v3"
	"net/http/httptest"
	"strings"
	"testing"
)

type webhookService struct {
	inbound.Telegram
	calls int
	url   string
}

func (s *webhookService) WebhookStatus(context.Context) (tdto.WebhookStatus, error) {
	s.calls++
	return tdto.WebhookStatus{}, nil
}
func (s *webhookService) RegisterWebhook(_ context.Context, url string) (tdto.WebhookStatus, error) {
	s.calls++
	s.url = url
	return tdto.WebhookStatus{WebhookInfo: tdto.WebhookInfo{URL: url}}, nil
}

func TestWebhookEndpointsRequirePlatformAdministrator(t *testing.T) {
	for _, isAdmin := range []bool{false, true} {
		for _, method := range []string{"GET", "POST"} {
			service := &webhookService{}
			server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
				var e *app.Error
				if errors.As(err, &e) {
					return c.SendStatus(e.Status)
				}
				return c.SendStatus(500)
			}})
			server.Use(func(c fiber.Ctx) error { c.Locals("claims", &authdto.Claims{PlatformAdmin: isAdmin}); return c.Next() })
			NewHandler(service, nil).RegisterRoutes(server.Group("/api/v1"))
			req := httptest.NewRequest(method, "/api/v1/admin/telegram/webhook", strings.NewReader(`{"url":"https://backend.example.com/api/v1/webhooks/telegram"}`))
			req.Header.Set("Content-Type", "application/json")
			response, err := server.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if !isAdmin && (response.StatusCode != 403 || service.calls != 0) {
				t.Fatal("non-admin reached webhook management")
			}
			if isAdmin && (response.StatusCode != 200 || service.calls != 1) {
				t.Fatalf("admin denied: %s %d", method, response.StatusCode)
			}
			if isAdmin && method == "POST" && service.url != "https://backend.example.com/api/v1/webhooks/telegram" {
				t.Fatal("URL was not forwarded")
			}
		}
	}
}
