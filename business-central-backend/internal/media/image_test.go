package media

import (
	"bytes"
	stdimage "image"
	"image/color"
	"image/png"
	"io"
	"strings"
	"testing"
)

func TestNormalizeURLConvertsGoogleDriveSharingURL(t *testing.T) {
	image, err := NormalizeURL(URLRequest{
		ImageURL:   "https://drive.google.com/file/d/abc-123/view?usp=sharing",
		SourceType: "GOOGLE_DRIVE",
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if image.ImageURL != "https://drive.google.com/uc?export=view&id=abc-123" {
		t.Fatalf("unexpected image URL: %s", image.ImageURL)
	}
}

func TestNormalizeURLRetainsOrdinaryURL(t *testing.T) {
	const imageURL = "https://images.example.test/photo.png"
	image, err := NormalizeURL(URLRequest{ImageURL: imageURL}, false)
	if err != nil {
		t.Fatal(err)
	}
	if image.ImageURL != imageURL || image.SourceType != "URL" {
		t.Fatalf("unexpected image: %#v", image)
	}
}

func TestValidateUploadRejectsUnsupportedContentType(t *testing.T) {
	upload := Upload{
		FileName: "payload.svg", ContentType: "image/svg+xml", Size: 4,
		Content: strings.NewReader("test"),
	}
	err := ValidateUpload(&upload)
	if err == nil {
		t.Fatal("expected unsupported image type to be rejected")
	}
}

func TestValidateUploadRejectsImageLargerThan500KB(t *testing.T) {
	upload := Upload{
		FileName: "large.jpg", ContentType: "image/jpeg", Size: MaxUploadBytes + 1,
		Content: strings.NewReader("not-read"),
	}
	if err := ValidateUpload(&upload); err == nil {
		t.Fatal("expected oversized image to be rejected")
	}
}

func TestValidateUploadRejectsDimensionOver240Pixels(t *testing.T) {
	contents := pngImage(t, 241, 100)
	upload := Upload{
		FileName: "wide.png", ContentType: "image/png", Size: int64(len(contents)),
		Content: bytes.NewReader(contents),
	}
	if err := ValidateUpload(&upload); err == nil {
		t.Fatal("expected oversized image dimensions to be rejected")
	}
}

func TestValidateUploadAcceptsImageWithin240Pixels(t *testing.T) {
	contents := pngImage(t, 240, 120)
	upload := Upload{
		FileName: "valid.png", ContentType: "image/png", Size: int64(len(contents)),
		Content: bytes.NewReader(contents),
	}
	if err := ValidateUpload(&upload); err != nil {
		t.Fatal(err)
	}
	stored, err := io.ReadAll(upload.Content)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(stored, contents) {
		t.Fatal("validated upload content was not reset for storage")
	}
}

func pngImage(t *testing.T, width, height int) []byte {
	t.Helper()
	canvas := stdimage.NewRGBA(stdimage.Rect(0, 0, width, height))
	canvas.Set(0, 0, color.White)
	var contents bytes.Buffer
	if err := png.Encode(&contents, canvas); err != nil {
		t.Fatal(err)
	}
	return contents.Bytes()
}
