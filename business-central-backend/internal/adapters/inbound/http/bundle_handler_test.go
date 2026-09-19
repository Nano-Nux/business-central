package http_test

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	adapterhttp "business-central-backend/internal/adapters/inbound/http"
	"github.com/gofiber/fiber/v3"
)

func TestBundleHandler_VersionAndDownload(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "bundle_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	handler := adapterhttp.NewBundleHandler(tempDir)
	app := fiber.New()
	v1 := app.Group("/api/v1")
	handler.RegisterRoutes(v1)

	// 1. Initial version check when no bundle exists
	req := httptest.NewRequest("GET", "/api/v1/portal-bundle/version", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var res map[string]any
	body, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &res)
	data, ok := res["data"].(map[string]any)
	if !ok || data["available"] != false {
		t.Fatalf("expected available=false, got %v", res)
	}

	// 2. Put a bundle file in place
	bundlePath := filepath.Join(tempDir, "portal_bundle.zip")
	dummyContent := []byte("PK\x03\x04mock zip content")
	if err := os.WriteFile(bundlePath, dummyContent, 0644); err != nil {
		t.Fatal(err)
	}

	// 3. Version check after bundle exists
	req = httptest.NewRequest("GET", "/api/v1/portal-bundle/version", nil)
	resp, err = app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &res)
	data = res["data"].(map[string]any)
	if data["available"] != true {
		t.Fatalf("expected available=true, got %v", res)
	}
	if data["sha256"] == "" {
		t.Error("expected non-empty sha256 checksum")
	}

	// 4. Download bundle
	req = httptest.NewRequest("GET", "/api/v1/portal-bundle/download", nil)
	resp, err = app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	content, _ := io.ReadAll(resp.Body)
	if string(content) != string(dummyContent) {
		t.Errorf("expected %q, got %q", string(dummyContent), string(content))
	}
}
