package entities

import "testing"

func TestNormalizeEmail(t *testing.T) {
	email, err := NormalizeEmail(" User@Example.COM ")
	if err != nil || email != "user@example.com" {
		t.Fatalf("email = %q, err = %v", email, err)
	}
}

func TestValidateLoginRequiresCredentials(t *testing.T) {
	if err := ValidateLogin("", "password"); err == nil {
		t.Fatal("expected login validation error")
	}
}
