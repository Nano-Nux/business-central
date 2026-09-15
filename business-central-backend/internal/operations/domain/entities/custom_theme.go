package entities

import (
	"errors"
	"regexp"
	"strings"
)

var (
	ErrInvalidCustomThemeName   = errors.New("custom theme name must be between 1 and 100 characters")
	ErrInvalidCustomThemeMode   = errors.New("custom theme mode must be 'light' or 'dark'")
	ErrInvalidCustomThemeColors = errors.New("custom theme must specify 5 valid hex colors")
)

var hexColorRegex = regexp.MustCompile(`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

func IsValidHexColor(hex string) bool {
	return hexColorRegex.MatchString(strings.TrimSpace(hex))
}

func NormalizeHexColor(hex string) string {
	hex = strings.TrimSpace(hex)
	if !strings.HasPrefix(hex, "#") {
		hex = "#" + hex
	}
	hex = strings.ToLower(hex)
	if len(hex) == 4 { // #rgb -> #rrggbb
		return string([]byte{'#', hex[1], hex[1], hex[2], hex[2], hex[3], hex[3]})
	}
	return hex
}

func ValidateCustomTheme(name, mode string, colors []string) error {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 100 {
		return ErrInvalidCustomThemeName
	}
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != "light" && mode != "dark" {
		return ErrInvalidCustomThemeMode
	}
	if len(colors) != 5 {
		return ErrInvalidCustomThemeColors
	}
	for _, c := range colors {
		if !IsValidHexColor(c) {
			return ErrInvalidCustomThemeColors
		}
	}
	return nil
}
