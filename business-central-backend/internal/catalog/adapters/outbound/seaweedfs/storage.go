package seaweedfs

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"business-central-backend/internal/media"
	"github.com/google/uuid"
)

type Storage struct {
	filerURL  string
	publicURL string
	client    *http.Client
}

var _ media.Storage = (*Storage)(nil)

func New(filerURL, publicURL string) *Storage {
	return &Storage{
		filerURL:  strings.TrimRight(filerURL, "/"),
		publicURL: strings.TrimRight(publicURL, "/"),
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *Storage) Store(ctx context.Context, merchantID string, upload media.Upload) (string, error) {
	extension := extensionForContentType(upload.ContentType)
	objectPath := "/media/" + url.PathEscape(merchantID) + "/" + uuid.NewString() + extension

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filepath.Base(upload.FileName))
	if err != nil {
		return "", err
	}
	if _, err = io.Copy(part, upload.Content); err != nil {
		return "", err
	}
	if err = writer.Close(); err != nil {
		return "", err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.filerURL+objectPath, &body)
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := s.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", fmt.Errorf("SeaweedFS filer returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	return s.publicURL + objectPath, nil
}

func extensionForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ""
	}
}
