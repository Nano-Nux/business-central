package http

import (
	"net/http/httptest"
	"testing"

	authdto "business-central-backend/internal/auth/application/dto"
	"github.com/gofiber/fiber/v3"
)

func TestAdminAccessFailsBeforeReadingRepository(t *testing.T) {
	for _, claims := range []*authdto.Claims{nil, {MerchantID: "merchant", MembershipID: "staff"}} {
		for _, route := range []struct{ method, path string }{{"GET", "/admin/receptionist/settings"}, {"PUT", "/admin/receptionist/settings"}, {"GET", "/admin/receptionist/conversations"}, {"GET", "/admin/receptionist/conversations/00000000-0000-0000-0000-000000000000"}, {"GET", "/admin/receptionist/bookings"}, {"GET", "/admin/receptionist/bookings/00000000-0000-0000-0000-000000000000"}, {"POST", "/admin/receptionist/google/connect"}, {"DELETE", "/admin/receptionist/google/connection"}} {
			a := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, e error) error { return c.SendStatus(403) }})
			r := a.Group("", func(c fiber.Ctx) error {
				if claims != nil {
					c.Locals("claims", claims)
				}
				return c.Next()
			})
			h := &Handler{}
			h.RegisterAdminRoutes(r)
			res, e := a.Test(httptest.NewRequest(route.method, route.path, nil))
			if e != nil {
				t.Fatal(e)
			}
			res.Body.Close()
			if res.StatusCode != 403 {
				t.Fatalf("%s %s: %d", route.method, route.path, res.StatusCode)
			}
		}
	}
}
func TestOAuthCallbackRequiresBrowserState(t *testing.T) {
	a := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, e error) error { return c.SendStatus(400) }})
	h := &Handler{}
	h.RegisterPublicRoutes(a)
	res, e := a.Test(httptest.NewRequest("GET", "/public/receptionist/google/callback?state=forged&code=secret", nil))
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 400 {
		t.Fatal(res.StatusCode)
	}
}
