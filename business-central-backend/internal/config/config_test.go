package config

import "testing"

func TestProductionConfigurationDoesNotRequirePublicStorageURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:password@127.0.0.1:5432/business_central")
	t.Setenv("JWT_SECRET", "01234567890123456789012345678901")
	t.Setenv("APP_ENV", "production")
	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Environment != "production" {
		t.Fatalf("unexpected environment: %s", loaded.Environment)
	}
}
