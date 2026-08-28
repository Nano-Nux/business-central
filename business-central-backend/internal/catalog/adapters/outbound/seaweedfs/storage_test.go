package seaweedfs

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"business-central-backend/internal/media"
)

func TestStoreUploadsToTenantMediaPath(t *testing.T) {
	var uploaded string
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", request.Method)
		}
		if !strings.HasPrefix(request.URL.Path, "/media/merchant-1/") || !strings.HasSuffix(request.URL.Path, ".png") {
			t.Fatalf("unexpected path: %s", request.URL.Path)
		}
		if got := request.Header.Get("Authorization"); got != "Bearer filer-test-token" {
			t.Fatalf("authorization header = %q", got)
		}
		file, _, err := request.FormFile("file")
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		contents, _ := io.ReadAll(file)
		uploaded = string(contents)
		response.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	storage := New(server.URL, "Bearer filer-test-token")
	imageURL, err := storage.Store(context.Background(), "merchant-1", media.Upload{
		FileName: "item.png", ContentType: "image/png", Content: strings.NewReader("image-data"), Size: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if uploaded != "image-data" {
		t.Fatalf("unexpected uploaded data: %s", uploaded)
	}
	if !strings.HasPrefix(imageURL, "/media/merchant-1/") || !strings.HasSuffix(imageURL, ".png") {
		t.Fatalf("unexpected stored path: %s", imageURL)
	}
}
