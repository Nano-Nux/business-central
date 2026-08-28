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
	filerURL      string
	authorization string
	client        *http.Client
}

var _ media.Storage = (*Storage)(nil)

func New(filerURL string, authorization ...string) *Storage {
	var authHeader string
	if len(authorization) > 0 {
		authHeader = strings.TrimSpace(authorization[0])
	}
	return &Storage{
		filerURL:      strings.TrimRight(filerURL, "/"),
		authorization: authHeader,
		client:        &http.Client{Timeout: 30 * time.Second},
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
	if s.authorization != "" {
		request.Header.Set("Authorization", s.authorization)
	}
	response, err := s.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", fmt.Errorf("SeaweedFS filer returned %s: %s", response.Status, strings.TrimSpace(string(message)))
	}
	// Persist only the object path. The browser-facing file-server base URL is
	// deployment configuration and must not become part of database records.
	return objectPath, nil
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
