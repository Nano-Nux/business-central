package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	"business-central-backend/internal/backup/domain"
	backupinbound "business-central-backend/internal/backup/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	Backup        backupinbound.BackupService
	Authorization authinbound.Authentication
}

func NewHandler(backupService backupinbound.BackupService, auth authinbound.Authentication) *Handler {
	return &Handler{
		Backup:        backupService,
		Authorization: auth,
	}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Post("/merchants/:id/backups", h.uploadBackup)
	r.Get("/merchants/:id/backups", h.listBackups)
	r.Get("/merchants/:id/backups/latest", h.getLatestBackup)
	r.Get("/merchants/:id/backups/:backupId/download", h.downloadBackup)
}

func (h *Handler) requireTenantAccess(c fiber.Ctx, targetMerchantID string, permission string) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHENTICATED", "Authentication is required.", 401)
	}
	if cl.PlatformAdmin {
		return nil
	}
	if !strings.EqualFold(cl.MerchantID, targetMerchantID) {
		return app.NewError("FORBIDDEN", "You do not have access to this merchant's data.", 403)
	}
	if permission != "" {
		allowed, err := h.Authorization.HasPermission(c.Context(), cl, permission)
		if err != nil {
			return app.Internal(err)
		}
		if !allowed {
			return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
		}
	}
	return nil
}

func (h *Handler) uploadBackup(c fiber.Ctx) error {
	merchantID := c.Params("id")
	if err := h.requireTenantAccess(c, merchantID, "tenant.write"); err != nil {
		return err
	}

	deviceID := c.FormValue("device_id")
	if deviceID == "" {
		deviceID = c.Get("X-Device-ID")
	}
	checksum := c.FormValue("sha256")
	if checksum == "" {
		checksum = c.Get("X-Backup-Checksum")
	}

	var reader io.Reader
	var size int64

	fileHeader, err := c.FormFile("backup")
	if err == nil && fileHeader != nil {
		size = fileHeader.Size
		file, openErr := fileHeader.Open()
		if openErr != nil {
			return app.NewError("INVALID_FILE", "Could not open uploaded backup file.", 400)
		}
		defer file.Close()
		reader = file
	} else {
		// Attempt reading raw body
		body := c.Body()
		if len(body) == 0 {
			return app.NewError("VALIDATION_ERROR", "A backup file or non-empty body is required.", 400)
		}
		size = int64(len(body))
		reader = strings.NewReader(string(body))
	}

	if deviceID == "" {
		return app.NewError("VALIDATION_ERROR", "device_id is required.", 400)
	}
	if checksum == "" {
		return app.NewError("VALIDATION_ERROR", "sha256 checksum is required.", 400)
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	backup, uploadErr := h.Backup.UploadBackup(ctx, merchantID, deviceID, checksum, size, reader)
	if uploadErr != nil {
		if errors.Is(uploadErr, domain.ErrFileTooLarge) {
			return app.NewError("PAYLOAD_TOO_LARGE", uploadErr.Error(), 413)
		}
		if errors.Is(uploadErr, domain.ErrInvalidChecksum) || errors.Is(uploadErr, domain.ErrEmptyBackupFile) {
			return app.NewError("VALIDATION_ERROR", uploadErr.Error(), 400)
		}
		if strings.Contains(uploadErr.Error(), "checksum mismatch") {
			return app.NewError("CHECKSUM_MISMATCH", uploadErr.Error(), 400)
		}
		return app.Internal(uploadErr)
	}

	return c.Status(201).JSON(map[string]any{"data": backup})
}

func (h *Handler) listBackups(c fiber.Ctx) error {
	merchantID := c.Params("id")
	if err := h.requireTenantAccess(c, merchantID, "tenant.read"); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	backups, err := h.Backup.ListBackups(ctx, merchantID)
	if err != nil {
		return app.Internal(err)
	}

	return c.JSON(map[string]any{"data": backups})
}

func (h *Handler) getLatestBackup(c fiber.Ctx) error {
	merchantID := c.Params("id")
	if err := h.requireTenantAccess(c, merchantID, "tenant.read"); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	backup, file, err := h.Backup.GetLatestBackup(ctx, merchantID)
	if err != nil {
		if errors.Is(err, domain.ErrBackupNotFound) {
			return app.NewError("NOT_FOUND", "No backup found for this merchant.", 404)
		}
		return app.Internal(err)
	}
	defer file.Close()

	c.Set("Content-Type", "application/octet-stream")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="backup_%s.zip"`, backup.ID))
	c.Set("X-Backup-ID", backup.ID)
	c.Set("X-Backup-Checksum", backup.SHA256Checksum)
	c.Set("X-Device-ID", backup.DeviceID)

	return c.SendStream(file)
}

func (h *Handler) downloadBackup(c fiber.Ctx) error {
	merchantID := c.Params("id")
	backupID := c.Params("backupId")
	if err := h.requireTenantAccess(c, merchantID, "tenant.read"); err != nil {
		return err
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	backup, file, err := h.Backup.GetBackupFile(ctx, merchantID, backupID)
	if err != nil {
		if errors.Is(err, domain.ErrBackupNotFound) {
			return app.NewError("NOT_FOUND", "Backup record not found.", 404)
		}
		return app.Internal(err)
	}
	defer file.Close()

	c.Set("Content-Type", "application/octet-stream")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="backup_%s.zip"`, backup.ID))
	c.Set("X-Backup-ID", backup.ID)
	c.Set("X-Backup-Checksum", backup.SHA256Checksum)
	c.Set("X-Device-ID", backup.DeviceID)

	return c.SendStream(file)
}

func contextWithTimeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 60*time.Second)
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}
