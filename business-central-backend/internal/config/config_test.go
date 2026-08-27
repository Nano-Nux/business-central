package config

import "testing"

func TestSeaweedFSPublicURLDevelopmentDefault(t *testing.T) {
	t.Setenv("SEAWEEDFS_PUBLIC_URL", "")
	value, err := seaweedFSPublicURL("development")
	if err != nil {
		t.Fatal(err)
	}
	if value != "http://localhost:8888" {
		t.Fatalf("unexpected development URL: %s", value)
	}
}

func TestSeaweedFSPublicURLProductionRequiresPublicHTTPS(t *testing.T) {
	for _, value := range []string{"", "http://images.example.com", "https://localhost:8888", "https://10.0.0.8"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("SEAWEEDFS_PUBLIC_URL", value)
			if _, err := seaweedFSPublicURL("production"); err == nil {
				t.Fatalf("expected %q to be rejected", value)
			}
		})
	}
}

func TestSeaweedFSPublicURLProductionAcceptsPublicHTTPS(t *testing.T) {
	t.Setenv("SEAWEEDFS_PUBLIC_URL", "https://images.example.com/")
	value, err := seaweedFSPublicURL("production")
	if err != nil {
		t.Fatal(err)
	}
	if value != "https://images.example.com" {
		t.Fatalf("unexpected production URL: %s", value)
	}
}
