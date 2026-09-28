package http

import (
	"context"
	"errors"
	"io"
	"net/http/httptest"
	"testing"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	telegramapp "business-central-backend/internal/telegram/application"
	"github.com/gofiber/fiber/v3"
)

type botInfoAuthorization struct {
	authinbound.Authentication
	allowed bool
}

func (a botInfoAuthorization) HasPermission(_ context.Context, _ *authdto.Claims, permission string) (bool, error) {
	return a.allowed && permission == "tenant.read", nil
}

func TestBotInfoExposesOnlyConfiguredNameAndRequiresPermission(t *testing.T) {
	for _, allowed := range []bool{true, false} {
		t.Run(map[bool]string{true: "allowed", false: "denied"}[allowed], func(t *testing.T) {
			server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
				var applicationError *app.Error
				if errors.As(err, &applicationError) {
					return c.SendStatus(applicationError.Status)
				}
				return c.SendStatus(500)
			}})
			service := telegramapp.NewService(nil, nil, "secret-must-not-be-returned", "NanonuxBusinessCentralBot")
			NewHandler(service, botInfoAuthorization{allowed: allowed}).RegisterRoutes(server.Group("/api/v1"))
			response, err := server.Test(httptest.NewRequest("GET", "/api/v1/telegram/bot", nil))
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			if !allowed {
				if response.StatusCode != 403 {
					t.Fatalf("expected permission denial, got %d", response.StatusCode)
				}
				return
			}
			if response.StatusCode != 200 || string(body) != `{"data":{"username":"NanonuxBusinessCentralBot"},"meta":{}}` {
				t.Fatalf("unexpected public metadata response: %d %s", response.StatusCode, body)
			}
		})
	}
}
