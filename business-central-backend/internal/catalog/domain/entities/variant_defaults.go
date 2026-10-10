package entities

import "strings"

// VariantDefaults resolves optional creation input into required stored fields.
func VariantDefaults(id, sku, unit, label, defaultUnit, defaultLabel string) (string, string, string, error) {
	sku, unit, label = strings.TrimSpace(sku), strings.TrimSpace(unit), strings.TrimSpace(label)
	if sku == "" {
		sku = "OPT-" + strings.ReplaceAll(id, "-", "")
	}
	if unit == "" {
		unit = defaultUnit
	}
	if label == "" {
		label = defaultLabel
	}
	if label == "" {
		label = "EA"
	}
	if !Required(unit) {
		return "", "", "", ErrRequired
	}
	return sku, unit, label, nil
}
