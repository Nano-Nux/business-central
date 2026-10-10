package http

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	posdto "business-central-backend/internal/pos/application/dto"
	posinbound "business-central-backend/internal/pos/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type deliveryAuth struct {
	authinbound.Authentication
	owner, write bool
}

func (a deliveryAuth) HasAnyRole(context.Context, *authdto.Claims, ...string) (bool, error) {
	return a.owner, nil
}
func (a deliveryAuth) HasPermission(context.Context, *authdto.Claims, string) (bool, error) {
	return a.write, nil
}

type deliveryUseCases struct {
	posinbound.POS
	called *bool
}

func (s deliveryUseCases) UpdateDeliveryPayment(_ context.Context, _ *authdto.Claims, _ string, r posdto.DeliveryPaymentRequest) (posdto.DeliveryPaymentResult, error) {
	*s.called = true
	return posdto.DeliveryPaymentResult{DeliveryPaymentStatus: r.DeliveryPaymentStatus}, nil
}

func TestDeliveryPaymentRequiresOwnerAndWritePermission(t *testing.T) {
	for _, tt := range []struct {
		owner, write bool
		status       int
	}{{false, true, 403}, {true, false, 403}, {true, true, 200}} {
		t.Run(strings.Join([]string{map[bool]string{true: "owner", false: "staff"}[tt.owner], map[bool]string{true: "write", false: "read"}[tt.write]}, "-"), func(t *testing.T) {
			called := false
			server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
				if e, ok := err.(*app.Error); ok {
					return c.Status(e.Status).JSON(map[string]any{"error": e.Message})
				}
				return c.SendStatus(500)
			}})
			handler := NewHandler(deliveryUseCases{called: &called}, deliveryAuth{owner: tt.owner, write: tt.write})
			server.Use(func(c fiber.Ctx) error { c.Locals("claims", &authdto.Claims{}); return c.Next() })
			handler.RegisterRoutes(server)
			request := httptest.NewRequest("PATCH", "/pos/orders/order/delivery-payment", strings.NewReader(`{"delivery_payment_status":"COMPLETE","expected_status":"UN_PAID","idempotency_key":"collect"}`))
			request.Header.Set("Content-Type", "application/json")
			response, err := server.Test(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if response.StatusCode != tt.status || called != (tt.status == 200) {
				t.Fatalf("status=%d called=%v", response.StatusCode, called)
			}
		})
	}
}
