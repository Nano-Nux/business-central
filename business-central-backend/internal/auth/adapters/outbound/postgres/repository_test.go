package postgres

import (
	"testing"
)

func TestNormalizePricingModel(t *testing.T) {
	tests := []struct {
		input       string
		expected    string
		expectError bool
	}{
		{input: "", expected: "starter", expectError: false},
		{input: "   ", expected: "starter", expectError: false},
		{input: "starter", expected: "starter", expectError: false},
		{input: "Starter", expected: "starter", expectError: false},
		{input: "STARTER", expected: "starter", expectError: false},
		{input: "  Starter  ", expected: "starter", expectError: false},
		{input: "growth", expected: "growth", expectError: false},
		{input: "Growth", expected: "growth", expectError: false},
		{input: "GROWTH", expected: "growth", expectError: false},
		{input: "professional", expected: "professional", expectError: false},
		{input: "Professional", expected: "professional", expectError: false},
		{input: "PROFESSIONAL", expected: "professional", expectError: false},
		{input: "enterprise", expected: "enterprise", expectError: false},
		{input: "Enterprise", expected: "enterprise", expectError: false},
		{input: "ENTERPRISE", expected: "enterprise", expectError: false},
		{input: "invalid", expected: "", expectError: true},
		{input: "basic", expected: "", expectError: true},
		{input: "premium", expected: "", expectError: true},
		{input: "pro", expected: "", expectError: true},
	}

	for _, tt := range tests {
		result, err := normalizePricingModel(tt.input)
		if tt.expectError {
			if err == nil {
				t.Errorf("normalizePricingModel(%q) expected error, got nil (result: %q)", tt.input, result)
			}
		} else {
			if err != nil {
				t.Errorf("normalizePricingModel(%q) unexpected error: %v", tt.input, err)
			}
			if result != tt.expected {
				t.Errorf("normalizePricingModel(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
		}
	}
}
