package application

import "testing"

func TestValidateWebhookSecret(t *testing.T) {
	service := NewService(nil, nil, "01234567890123456789012345678901", "")
	if !service.ValidateWebhookSecret("01234567890123456789012345678901") {
		t.Fatal("valid secret rejected")
	}
	if service.ValidateWebhookSecret("01234567890123456789012345678902") {
		t.Fatal("invalid secret accepted")
	}
	if service.ValidateWebhookSecret("") {
		t.Fatal("empty secret accepted")
	}
}

func TestEmptyWebhookSecretDisablesEndpoint(t *testing.T) {
	if NewService(nil, nil, "", "").ValidateWebhookSecret("") {
		t.Fatal("unconfigured webhook must reject requests")
	}
}
