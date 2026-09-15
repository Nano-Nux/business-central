package entities

import (
	"testing"
)

func TestValidateCustomTheme(t *testing.T) {
	validColors := []string{"#2563eb", "#1d4ed8", "#3b82f6", "#e2e8f0", "#ffffff"}

	tests := []struct {
		name    string
		tName   string
		mode    string
		colors  []string
		wantErr bool
	}{
		{
			name:    "valid light theme with 5 colors",
			tName:   "Acme Brand Theme",
			mode:    "light",
			colors:  validColors,
			wantErr: false,
		},
		{
			name:    "valid dark theme with 5 colors",
			tName:   "Midnight Dark Custom",
			mode:    "dark",
			colors:  []string{"#10b981", "#059669", "#047857", "#064e3b", "#090d16"},
			wantErr: false,
		},
		{
			name:    "empty theme name",
			tName:   "   ",
			mode:    "light",
			colors:  validColors,
			wantErr: true,
		},
		{
			name:    "invalid mode",
			tName:   "Some Theme",
			mode:    "sepia",
			colors:  validColors,
			wantErr: true,
		},
		{
			name:    "fewer than 5 colors",
			tName:   "Incomplete Theme",
			mode:    "light",
			colors:  []string{"#2563eb", "#1d4ed8", "#3b82f6", "#e2e8f0"},
			wantErr: true,
		},
		{
			name:    "more than 5 colors",
			tName:   "Overloaded Theme",
			mode:    "light",
			colors:  []string{"#2563eb", "#1d4ed8", "#3b82f6", "#e2e8f0", "#ffffff", "#000000"},
			wantErr: true,
		},
		{
			name:    "invalid hex code",
			tName:   "Bad Color Theme",
			mode:    "light",
			colors:  []string{"#2563eb", "not-a-hex", "#3b82f6", "#e2e8f0", "#ffffff"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCustomTheme(tt.tName, tt.mode, tt.colors)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateCustomTheme() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeHexColor(t *testing.T) {
	if got := NormalizeHexColor("#fff"); got != "#ffffff" {
		t.Errorf("NormalizeHexColor(#fff) = %s, want #ffffff", got)
	}
	if got := NormalizeHexColor("2563EB"); got != "#2563eb" {
		t.Errorf("NormalizeHexColor(2563EB) = %s, want #2563eb", got)
	}
}
