package http

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	inbound "business-central-backend/internal/telegram/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type merchantOnlyService struct {
	inbound.Telegram
	calls int
}

func (s *merchantOnlyService) CreatePairingCode(context.Context, *authdto.Claims, string) (tdto.PairingCode, error) {
	s.calls++
	return tdto.PairingCode{}, nil
}
func (s *merchantOnlyService) RotatePairingCode(context.Context, *authdto.Claims, string, bool) (tdto.PairingCode, error) {
	s.calls++
	return tdto.PairingCode{}, nil
}
func (s *merchantOnlyService) ConfirmTelegramOrder(context.Context, *authdto.Claims, string, bool) (tdto.Order, error) {
	s.calls++
	return tdto.Order{}, nil
}
func (s *merchantOnlyService) CancelTelegramOrder(context.Context, *authdto.Claims, string, bool) (tdto.Order, error) {
	s.calls++
	return tdto.Order{}, nil
}

func TestTelegramConnectionAndOrderActionsRequireMerchantRole(t *testing.T) {
	for _, route := range []struct {
		name, path     string
		merchantStatus int
	}{
		{"create_pairing", "/api/v1/telegram/shops/shop/pairing-codes", 201},
		{"rotate_pairing", "/api/v1/telegram/groups/group/rotate-pairing-code", 200},
		{"confirm", "/api/v1/telegram/orders/order/confirm", 200},
		{"cancel", "/api/v1/telegram/orders/order/cancel", 200},
	} {
		for _, role := range []struct {
			name, permission string
			write, merchant  bool
			status           int
		}{
			{"merchant", "tenant.write", true, true, route.merchantStatus},
			{"staff_with_write", "tenant.write", true, false, 403},
			{"staff_read_only", "tenant.read", false, false, 403},
		} {
			t.Run(route.name+"_"+role.name, func(t *testing.T) {
				server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
					var apiErr *app.Error
					if errors.As(err, &apiErr) {
						return c.SendStatus(apiErr.Status)
					}
					return c.SendStatus(500)
				}})
				server.Use(func(c fiber.Ctx) error {
					c.Locals("claims", &authdto.Claims{})
					return c.Next()
				})
				service := &merchantOnlyService{}
				NewHandler(service, autoConfirmAuthorization{allowed: role.write, merchant: role.merchant}).RegisterRoutes(server.Group("/api/v1"))
				response, err := server.Test(httptest.NewRequest("POST", route.path, nil))
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				if response.StatusCode != role.status {
					t.Fatalf("status %d, want %d", response.StatusCode, role.status)
				}
				wantCalls := 0
				if role.merchant {
					wantCalls = 1
				}
				if service.calls != wantCalls {
					t.Fatalf("service called %d times, want %d", service.calls, wantCalls)
				}
			})
		}
	}
}
