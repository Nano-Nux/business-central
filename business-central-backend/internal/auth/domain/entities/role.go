package entities

import (
	"errors"
	"strings"
	"unicode"
)

// ValidateRole protects the stable role code used by authorization rules and
// the human-readable role name shown to administrators.
func ValidateRole(code, name string) error {
	code = strings.TrimSpace(code)
	name = strings.TrimSpace(name)
	if code == "" || len(code) > 100 || name == "" || len(name) > 255 {
		return errors.New("role code and name are required")
	}
	for index, character := range code {
		if unicode.IsLower(character) || unicode.IsDigit(character) || (index > 0 && strings.ContainsRune("._-", character)) {
			continue
		}
		return errors.New("role code must use lowercase letters, numbers, dots, underscores, or hyphens")
	}
	return nil
}
