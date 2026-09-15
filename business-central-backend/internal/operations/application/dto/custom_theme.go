package dto

import "time"

type CustomTheme struct {
	ID             string    `json:"id"`
	MerchantID     string    `json:"merchant_id"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Badge          string    `json:"badge"`
	PrimaryColor   string    `json:"primary_color"`
	SecondaryColor string    `json:"secondary_color"`
	AccentColor    string    `json:"accent_color"`
	BorderColor    string    `json:"border_color"`
	CanvasColor    string    `json:"canvas_color"`
	Colors         []string  `json:"colors"`
	Mode           string    `json:"mode"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type CustomThemeRequest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	Badge          string   `json:"badge,omitempty"`
	PrimaryColor   string   `json:"primary_color,omitempty"`
	SecondaryColor string   `json:"secondary_color,omitempty"`
	AccentColor    string   `json:"accent_color,omitempty"`
	BorderColor    string   `json:"border_color,omitempty"`
	CanvasColor    string   `json:"canvas_color,omitempty"`
	Colors         []string `json:"colors,omitempty"`
	Mode           string   `json:"mode,omitempty"`
	IsActive       *bool    `json:"is_active,omitempty"`
}
