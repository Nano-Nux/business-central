package http

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	tdto "business-central-backend/internal/telegram/application/dto"
	inbound "business-central-backend/internal/telegram/ports/inbound"
	"context"
	"errors"
	"github.com/gofiber/fiber/v3"
	"net/http/httptest"
	"strings"
	"testing"
)

type autoConfirmAuthorization struct {
	authinbound.Authentication
	allowed bool
}

func (a autoConfirmAuthorization) HasPermission(_ context.Context, _ *authdto.Claims, code string) (bool, error) {
	return a.allowed && code == "tenant.write", nil
}

type autoConfirmService struct {
	inbound.Telegram
	calls   int
	enabled bool
}

func (s *autoConfirmService) SetAutoConfirm(_ context.Context, _ *authdto.Claims, _ string, enabled, admin bool) (tdto.Group, error) {
	s.calls++
	s.enabled = enabled
	return tdto.Group{AutoConfirmOrders: enabled}, nil
}
func TestAutomaticConfirmationSettingRequiresWritePermissionAndBoolean(t *testing.T) {
	for _, tc := range []struct {
		name, body     string
		allowed, admin bool
		want           int
	}{
		{"enable", `{"auto_confirm_orders":true}`, true, false, 200},
		{"disable", `{"auto_confirm_orders":false}`, true, false, 200},
		{"read_only", `{"auto_confirm_orders":true}`, false, false, 403},
		{"missing", `{}`, true, false, 400},
		{"null", `{"auto_confirm_orders":null}`, true, false, 400},
		{"string", `{"auto_confirm_orders":"true"}`, true, false, 400},
		{"admin_enable", `{"auto_confirm_orders":true}`, false, true, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
				var e *app.Error
				if errors.As(err, &e) {
					return c.SendStatus(e.Status)
				}
				return c.SendStatus(500)
			}})
			server.Use(func(c fiber.Ctx) error { c.Locals("claims", &authdto.Claims{PlatformAdmin: tc.admin}); return c.Next() })
			service := &autoConfirmService{}
			NewHandler(service, autoConfirmAuthorization{allowed: tc.allowed}).RegisterRoutes(server.Group("/api/v1"))
			path := "/api/v1/telegram/groups/group/auto-confirm"
			if tc.admin {
				path = "/api/v1/admin/telegram/groups/group/auto-confirm"
			}
			req := httptest.NewRequest("PATCH", path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			response, err := server.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if response.StatusCode != tc.want {
				t.Fatalf("got %d want %d", response.StatusCode, tc.want)
			}
			if tc.want != 200 && service.calls != 0 {
				t.Fatal("unauthorized or invalid setting saved")
			}
		})
	}
}
