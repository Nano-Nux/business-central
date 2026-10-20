package http

import (
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	receptionisthttp "business-central-backend/internal/receptionist/adapters/inbound/http"
	"business-central-backend/internal/receptionist/application"
	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

type receptionistStatusRepo struct{ ports.Repository }

func (receptionistStatusRepo) Settings(context.Context) (domain.Settings, error) {
	return domain.Settings{Enabled: true, Greeting: "Welcome", Knowledge: "Admin-only editable content", Timezone: "Asia/Bangkok"}, nil
}
func (receptionistStatusRepo) Token(context.Context) (string, error) {
	return "encrypted-provider-secret", nil
}

type receptionistAuth struct{ authinbound.Authentication }

func (receptionistAuth) ParseAccessToken(token string) (*authdto.Claims, *app.Error) {
	if token != "admin" && token != "merchant" {
		return nil, app.NewError("UNAUTHENTICATED", "Invalid JWT", 401)
	}
	return &authdto.Claims{PlatformAdmin: token == "admin", MerchantID: "merchant"}, nil
}
func (receptionistAuth) ValidateSession(context.Context, *authdto.Claims) error { return nil }

func TestReceptionistRoutesUseDistinctVisitorAndAdminAccess(t *testing.T) {
	h := &receptionisthttp.Handler{Service: &application.Service{Repo: receptionistStatusRepo{}}}
	a := New(nil, Dependencies{Authentication: receptionistAuth{}, Receptionist: h}).App()
	for _, tc := range []struct {
		path, token string
		status      int
	}{
		{"/api/v1/public/receptionist/status", "", 200},
		{"/api/v1/public/receptionist/conversations/not-a-uuid", "", 404},
		{"/api/v1/admin/receptionist/settings", "", 401},
		{"/api/v1/admin/receptionist/settings", "visitor-capability", 401},
		{"/api/v1/admin/receptionist/settings", "merchant", 403},
		{"/api/v1/admin/receptionist/settings", "admin", 200},
	} {
		req := httptest.NewRequest("GET", tc.path, nil)
		if tc.token != "" {
			req.Header.Set("Authorization", "Bearer "+tc.token)
		}
		req.Header.Set("X-Merchant-ID", "11111111-1111-4111-8111-111111111111")
		res, e := a.Test(req)
		if e != nil {
			t.Fatal(e)
		}
		body, e := io.ReadAll(res.Body)
		res.Body.Close()
		if e != nil {
			t.Fatal(e)
		}
		if res.StatusCode != tc.status {
			t.Fatalf("%s %s got %d: %s", tc.path, tc.token, res.StatusCode, body)
		}
		if strings.Contains(string(body), "encrypted-provider-secret") {
			t.Fatal("provider secret exposed")
		}
		if strings.HasPrefix(tc.path, "/api/v1/public/") && strings.Contains(string(body), "Admin-only editable content") {
			t.Fatal("public status exposed knowledge settings")
		}
	}
}
