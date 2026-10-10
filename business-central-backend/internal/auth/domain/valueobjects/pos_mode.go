package valueobjects

import "strings"

const DefaultPOSMode = "NANO"

// NormalizePOSMode applies the new-merchant default and validates persisted modes.
func NormalizePOSMode(value string) (string, bool) {
	mode := strings.ToUpper(strings.TrimSpace(value))
	if mode == "" {
		mode = DefaultPOSMode
	}
	switch mode {
	case "NANO", "MINI", "SIMPLE", "COMPLEX":
		return mode, true
	default:
		return "", false
	}
}
