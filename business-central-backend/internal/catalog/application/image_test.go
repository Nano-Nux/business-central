package application

import (
	"testing"

	catalogdto "business-central-backend/internal/catalog/application/dto"
)

func TestNormalizeGoogleDriveImageURL(t *testing.T) {
	request, err := normalizeImageRequest(catalogdto.ImageRequest{
		ImageURL:   "https://drive.google.com/file/d/abc_123/view?usp=sharing",
		SourceType: "google_drive",
	})
	if err != nil {
		t.Fatal(err)
	}
	if request.ImageURL != "https://drive.google.com/uc?export=view&id=abc_123" {
		t.Fatalf("unexpected normalized URL: %s", request.ImageURL)
	}
	if request.SourceType != "GOOGLE_DRIVE" {
		t.Fatalf("unexpected source type: %s", request.SourceType)
	}
}

func TestNormalizeImageURLRejectsNonHTTPURL(t *testing.T) {
	_, err := normalizeImageRequest(catalogdto.ImageRequest{ImageURL: "javascript:alert(1)"})
	if err == nil {
		t.Fatal("expected a validation error")
	}
}
