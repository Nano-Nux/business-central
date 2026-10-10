package http

import (
	"github.com/gofiber/fiber/v3"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProviderEndpointsShareRateLimit(t *testing.T) {
	server := fiber.New(fiber.Config{ErrorHandler: func(c fiber.Ctx, err error) error {
		if strings.Contains(err.Error(), "Too many AI requests") {
			return c.Status(429).SendString("AI_RATE_LIMITED")
		}
		return c.Status(401).SendString("UNAUTHORIZED")
	}})
	// Unauthenticated requests are rejected before touching the nil service.
	h := NewHandler(nil, nil)
	h.RegisterRoutes(server.Group("/api/v1"))
	for i := 0; i < 11; i++ {
		path := "/api/v1/ai/chat"
		if i%2 == 1 {
			path = "/api/v1/ai/transcribe"
		}
		req := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		res, err := server.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if i < 10 && res.StatusCode != 401 {
			t.Fatalf("unexpected initial response: %d", res.StatusCode)
		}
		if i == 10 && (res.StatusCode != 429 || !strings.Contains(string(body), "AI_RATE_LIMITED")) {
			t.Fatalf("shared endpoint limit did not apply: %d %s", res.StatusCode, body)
		}
	}
}
