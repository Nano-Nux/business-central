package http

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/gofiber/fiber/v3"
)

type BundleHandler struct {
	bundlesDir string
}

func NewBundleHandler(bundlesDir string) *BundleHandler {
	if bundlesDir == "" {
		bundlesDir = "./data/bundles"
	}
	_ = os.MkdirAll(bundlesDir, 0755)
	return &BundleHandler{bundlesDir: bundlesDir}
}

func (b *BundleHandler) RegisterRoutes(r fiber.Router) {
	r.Get("/portal-bundle/version", b.getVersion)
	r.Get("/portal-bundle/download", b.downloadBundle)
}

func (b *BundleHandler) getVersion(c fiber.Ctx) error {
	bundlePath := filepath.Join(b.bundlesDir, "portal_bundle.zip")
	info, err := os.Stat(bundlePath)
	if err != nil {
		return c.JSON(map[string]any{
			"data": map[string]any{
				"version":      "1.0.0",
				"available":    false,
				"sha256":       "",
				"size_bytes":   0,
				"download_url": "",
				"released_at":  time.Now().UTC(),
			},
		})
	}

	checksum, _ := computeFileSHA256(bundlePath)
	version := fmt.Sprintf("1.0.%d", info.ModTime().Unix())
	return c.JSON(map[string]any{
		"data": map[string]any{
			"version":      version,
			"available":    true,
			"sha256":       checksum,
			"size_bytes":   info.Size(),
			"download_url": "/api/v1/portal-bundle/download",
			"released_at":  info.ModTime().UTC(),
		},
	})
}

func (b *BundleHandler) downloadBundle(c fiber.Ctx) error {
	bundlePath := filepath.Join(b.bundlesDir, "portal_bundle.zip")
	if _, err := os.Stat(bundlePath); err != nil {
		return c.Status(404).JSON(map[string]any{
			"error": map[string]any{"code": "NOT_FOUND", "message": "Portal bundle file not found."},
		})
	}
	c.Set("Content-Type", "application/zip")
	c.Set("Content-Disposition", `attachment; filename="portal_bundle.zip"`)
	return c.SendFile(bundlePath)
}

func computeFileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
