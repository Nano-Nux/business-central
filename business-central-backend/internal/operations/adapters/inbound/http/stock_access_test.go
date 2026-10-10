package http

import (
	"business-central-backend/internal/app"
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	operationsdto "business-central-backend/internal/operations/application/dto"
	operationsinbound "business-central-backend/internal/operations/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type stockAuthorization struct {
	authinbound.Authentication
	role string
}

func (a stockAuthorization) HasPermission(context.Context, *authdto.Claims, string) (bool, error) {
	return true, nil
}
func (a stockAuthorization) HasAnyRole(_ context.Context, _ *authdto.Claims, codes ...string) (bool, error) {
	for _, code := range codes {
		if a.role == code {
			return true, nil
		}
	}
	return false, nil
}

type stockUseCases struct {
	operationsinbound.Operations
	calls int
}

func (s *stockUseCases) StockIn(context.Context, *authdto.Claims, operationsdto.StockInRequest) (operationsdto.Movement, error) {
	s.calls++
	return operationsdto.Movement{MovementType: "RECEIPT"}, nil
}
func (s *stockUseCases) ReduceStock(context.Context, *authdto.Claims, operationsdto.StockReductionRequest) (operationsdto.Movement, error) {
	s.calls++
	return operationsdto.Movement{MovementType: "ADJUSTMENT"}, nil
}

func TestStockWritesRequireMerchantRoleEvenWithWritePermission(t *testing.T) {
	for _, role := range []string{"staff", "manager", "custom", "merchant", "owner"} {
		for _, path := range []string{"/inventory/stock-in", "/inventory/stock-reductions"} {
			t.Run(role+path, func(t *testing.T) {
				server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
					var apiErr *app.Error
					if errors.As(err, &apiErr) {
						return c.SendStatus(apiErr.Status)
					}
					return c.SendStatus(500)
				}})
				uses := &stockUseCases{}
				server.Use(func(c fiber.Ctx) error { c.Locals("claims", &authdto.Claims{}); return c.Next() })
				NewHandler(uses, stockAuthorization{role: role}).RegisterRoutes(server)
				req := httptest.NewRequest("POST", path, strings.NewReader(`{"quantity":"1"}`))
				req.Header.Set("Content-Type", "application/json")
				response, err := server.Test(req)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				if role == "merchant" || role == "owner" {
					if response.StatusCode != 201 || uses.calls != 1 {
						t.Fatalf("merchant write rejected: %d calls=%d", response.StatusCode, uses.calls)
					}
				} else {
					if response.StatusCode != 403 || uses.calls != 0 {
						t.Fatalf("role %s could modify stock: status=%d calls=%d", role, response.StatusCode, uses.calls)
					}
				}
			})
		}
	}
}
