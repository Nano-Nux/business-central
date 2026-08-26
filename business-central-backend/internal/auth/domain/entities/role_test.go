package entities

import "testing"

func TestValidateRole(t *testing.T) {
	for _, test := range []struct {
		code  string
		name  string
		valid bool
	}{
		{code: "shop-manager", name: "Shop Manager", valid: true},
		{code: "inventory.read", name: "Inventory Reader", valid: true},
		{code: "", name: "Missing Code", valid: false},
		{code: "Shop Manager", name: "Invalid Code", valid: false},
		{code: "staff", name: "", valid: false},
	} {
		if valid := ValidateRole(test.code, test.name) == nil; valid != test.valid {
			t.Fatalf("ValidateRole(%q, %q) valid = %v, want %v", test.code, test.name, valid, test.valid)
		}
	}
}
