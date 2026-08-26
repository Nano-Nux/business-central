package http

import (
	"context"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	"business-central-backend/internal/media"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	Media         *media.Service
	Authorization authinbound.Authentication
}

func NewHandler(service *media.Service, authorization authinbound.Authentication) *Handler {
	return &Handler{Media: service, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(router fiber.Router) {
	router.Post("/media/images/resolve", h.resolve)
	router.Post("/media/images/upload", h.upload)
}

func (h *Handler) requireWrite(c fiber.Ctx) error {
	allowed, err := h.Authorization.HasPermission(c.Context(), claims(c), "tenant.write")
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}

func (h *Handler) resolve(c fiber.Ctx) error {
	if err := h.requireWrite(c); err != nil {
		return err
	}
	if h.Media == nil {
		return app.NewError("STORAGE_UNAVAILABLE", "Image media service is not configured.", 503)
	}
	var request media.URLRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.Validation("Request body must be valid JSON.", nil)
	}
	image, err := h.Media.Resolve(request)
	if err != nil {
		return err
	}
	return c.JSON(map[string]any{"data": image, "meta": map[string]any{}})
}

func (h *Handler) upload(c fiber.Ctx) error {
	if err := h.requireWrite(c); err != nil {
		return err
	}
	if h.Media == nil {
		return app.NewError("STORAGE_UNAVAILABLE", "Image media service is not configured.", 503)
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return app.Validation("A multipart image file field named file is required.", nil)
	}
	file, err := fileHeader.Open()
	if err != nil {
		return app.Validation("The uploaded image could not be read.", nil)
	}
	defer file.Close()
	ctx, cancel := context.WithTimeout(c.Context(), 15*time.Second)
	defer cancel()
	image, err := h.Media.Upload(ctx, claims(c).MerchantID, media.Upload{
		FileName: fileHeader.Filename, ContentType: fileHeader.Header.Get("Content-Type"),
		Size: fileHeader.Size, Content: file,
	})
	if err != nil {
		if apiErr, ok := err.(*app.Error); ok {
			return apiErr
		}
		return app.Internal(err)
	}
	return c.Status(201).JSON(map[string]any{"data": image, "meta": map[string]any{}})
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}
