package media

import (
	"bytes"
	"context"
	"fmt"
	stdimage "image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/url"
	"strings"

	"business-central-backend/internal/app"
	_ "golang.org/x/image/webp"
)

const (
	MaxUploadBytes    = 500 << 10
	MaxImageDimension = 240
)

type URLRequest struct {
	ImageURL   string `json:"image_url"`
	SourceType string `json:"source_type,omitempty"`
}

type Image struct {
	ImageURL   string `json:"image_url"`
	SourceType string `json:"source_type"`
}

type Upload struct {
	FileName    string
	ContentType string
	Size        int64
	Content     io.Reader
	AltText     *string
	Position    *int
}

type Storage interface {
	Store(context.Context, string, Upload) (string, error)
}

type Service struct{ storage Storage }

func NewService(storage Storage) *Service { return &Service{storage: storage} }

func (s *Service) Resolve(request URLRequest) (Image, error) {
	return NormalizeURL(request, false)
}

func (s *Service) Upload(ctx context.Context, merchantID string, upload Upload) (Image, error) {
	if s.storage == nil {
		return Image{}, app.NewError("STORAGE_UNAVAILABLE", "Direct image upload is not configured.", 503)
	}
	if err := ValidateUpload(&upload); err != nil {
		return Image{}, err
	}
	imageURL, err := s.storage.Store(ctx, merchantID, upload)
	if err != nil {
		return Image{}, fmt.Errorf("store image: %w", err)
	}
	return Image{ImageURL: imageURL, SourceType: "UPLOAD"}, nil
}

func ValidateUpload(upload *Upload) error {
	if upload == nil {
		return app.Validation("An image file is required.", nil)
	}
	if upload.Content == nil || upload.Size <= 0 {
		return app.Validation("An image file is required.", nil)
	}
	if upload.Size > MaxUploadBytes {
		return app.Validation("Image files must be 500 KB or smaller.", nil)
	}
	contentType := strings.ToLower(strings.TrimSpace(upload.ContentType))
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" && contentType != "image/gif" {
		return app.Validation("Image file type must be JPEG, PNG, WebP, or GIF.", nil)
	}
	contents, err := io.ReadAll(io.LimitReader(upload.Content, MaxUploadBytes+1))
	if err != nil {
		return app.Validation("The uploaded image could not be read.", nil)
	}
	if len(contents) > MaxUploadBytes {
		return app.Validation("Image files must be 500 KB or smaller.", nil)
	}
	configuration, format, err := stdimage.DecodeConfig(bytes.NewReader(contents))
	if err != nil {
		return app.Validation("The uploaded file must contain a valid image.", nil)
	}
	expectedFormat := map[string]string{
		"image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
	}[contentType]
	if format != expectedFormat {
		return app.Validation("The image content does not match its declared file type.", nil)
	}
	if configuration.Width > MaxImageDimension || configuration.Height > MaxImageDimension {
		return app.Validation("Image dimensions must fit within 240 by 240 pixels.", nil)
	}
	upload.Content = bytes.NewReader(contents)
	upload.Size = int64(len(contents))
	return nil
}

func NormalizeURL(request URLRequest, allowUpload bool) (Image, error) {
	request.ImageURL = strings.TrimSpace(request.ImageURL)
	request.SourceType = strings.ToUpper(strings.TrimSpace(request.SourceType))
	if request.SourceType == "" {
		request.SourceType = "URL"
	}
	validSource := request.SourceType == "URL" || request.SourceType == "GOOGLE_DRIVE" || (allowUpload && request.SourceType == "UPLOAD")
	if !validSource {
		return Image{}, app.Validation("source_type must be URL or GOOGLE_DRIVE for URL submissions.", nil)
	}
	parsed, err := url.ParseRequestURI(request.ImageURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return Image{}, app.Validation("Image URL must be a valid HTTP or HTTPS URL.", nil)
	}
	if request.SourceType == "GOOGLE_DRIVE" {
		fileID := googleDriveFileID(parsed)
		if fileID == "" {
			return Image{}, app.Validation("Google Drive image URL must contain a file ID.", nil)
		}
		request.ImageURL = "https://drive.google.com/uc?export=view&id=" + url.QueryEscape(fileID)
	}
	return Image{ImageURL: request.ImageURL, SourceType: request.SourceType}, nil
}

func googleDriveFileID(parsed *url.URL) string {
	if !strings.EqualFold(parsed.Hostname(), "drive.google.com") {
		return ""
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	for index := 0; index+1 < len(parts); index++ {
		if parts[index] == "d" {
			return strings.TrimSpace(parts[index+1])
		}
	}
	return strings.TrimSpace(parsed.Query().Get("id"))
}
