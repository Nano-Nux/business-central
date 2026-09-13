package application

import (
	"context"
	"testing"

	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	"github.com/google/uuid"
)

type mockCustomThemeRepo struct {
	themes []operationsdto.CustomTheme
}

func (m *mockCustomThemeRepo) ListCustomThemes(ctx context.Context, c *authdto.Claims) ([]operationsdto.CustomTheme, error) {
	return m.themes, nil
}

func (m *mockCustomThemeRepo) GetCustomTheme(ctx context.Context, c *authdto.Claims, id string) (operationsdto.CustomTheme, error) {
	for _, t := range m.themes {
		if t.ID == id {
			return t, nil
		}
	}
	return operationsdto.CustomTheme{}, nil
}

func (m *mockCustomThemeRepo) CreateCustomTheme(ctx context.Context, c *authdto.Claims, r operationsdto.CustomThemeRequest) (operationsdto.CustomTheme, error) {
	created := operationsdto.CustomTheme{
		ID:             uuid.NewString(),
		MerchantID:     c.MerchantID,
		Name:           r.Name,
		Description:    r.Description,
		Badge:          r.Badge,
		PrimaryColor:   r.PrimaryColor,
		SecondaryColor: r.SecondaryColor,
		AccentColor:    r.AccentColor,
		BorderColor:    r.BorderColor,
		CanvasColor:    r.CanvasColor,
		Colors:         r.Colors,
		Mode:           r.Mode,
		IsActive:       true,
	}
	m.themes = append(m.themes, created)
	return created, nil
}

func (m *mockCustomThemeRepo) UpdateCustomTheme(ctx context.Context, c *authdto.Claims, id string, r operationsdto.CustomThemeRequest) (operationsdto.CustomTheme, error) {
	for i, t := range m.themes {
		if t.ID == id {
			m.themes[i].Name = r.Name
			m.themes[i].Colors = r.Colors
			return m.themes[i], nil
		}
	}
	return operationsdto.CustomTheme{}, nil
}

func (m *mockCustomThemeRepo) DeleteCustomTheme(ctx context.Context, c *authdto.Claims, id string) error {
	newThemes := []operationsdto.CustomTheme{}
	for _, t := range m.themes {
		if t.ID != id {
			newThemes = append(newThemes, t)
		}
	}
	m.themes = newThemes
	return nil
}

func TestCustomThemeServiceValidation(t *testing.T) {
	repo := &mockCustomThemeRepo{}
	// Note: in Go, service struct embeds Repository interface.
	// For testing extractAndValidateColors:
	validReq := operationsdto.CustomThemeRequest{
		Name: "Acme Test Theme",
		Colors: []string{
			"#2563eb",
			"#1d4ed8",
			"#3b82f6",
			"#cbd5e1",
			"#f8fafc",
		},
		Mode: "light",
	}

	err := extractAndValidateColors(&validReq)
	if err != nil {
		t.Fatalf("unexpected validation error on valid 5-color theme: %v", err)
	}
	if validReq.PrimaryColor != "#2563eb" {
		t.Errorf("expected PrimaryColor to be #2563eb, got %s", validReq.PrimaryColor)
	}
	if validReq.CanvasColor != "#f8fafc" {
		t.Errorf("expected CanvasColor to be #f8fafc, got %s", validReq.CanvasColor)
	}

	// 4 colors -> should fail
	invalidReq := operationsdto.CustomThemeRequest{
		Name:   "Incomplete 4-color Theme",
		Colors: []string{"#2563eb", "#1d4ed8", "#3b82f6", "#cbd5e1"},
		Mode:   "light",
	}
	err = extractAndValidateColors(&invalidReq)
	if err == nil {
		t.Fatal("expected error on 4-color theme, got nil")
	}

	_ = repo
}
