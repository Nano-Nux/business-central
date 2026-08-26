package http

import (
	"context"
	"errors"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	"business-central-backend/internal/synchronization/application/dto"
	syncinbound "business-central-backend/internal/synchronization/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	syncinbound.Synchronization
	Authorization authinbound.Authentication
}

func NewHandler(useCases syncinbound.Synchronization, authorization authinbound.Authentication) *Handler {
	return &Handler{Synchronization: useCases, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Post("/sync/handshake", h.handshake)
	r.Post("/sync/push", h.push)
	r.Post("/sync/pull", h.pull)
	r.Post("/sync/conflicts/:operationId/resolve", h.resolveConflict)
}

func (h *Handler) resolveConflict(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request dto.ResolveConflictRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()
	value, err := h.Synchronization.ResolveConflict(ctx, claims(c), c.Params("operationId"), request)
	if err != nil {
		return synchronizationError(err)
	}
	return c.Status(200).JSON(map[string]any{"data": value, "meta": map[string]any{}})
}

func (h *Handler) handshake(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	var request dto.RegisterDeviceRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := context.WithTimeout(c.Context(), 15*time.Second)
	defer cancel()
	value, err := h.Synchronization.RegisterDevice(ctx, claims(c), request)
	if err != nil {
		return synchronizationError(err)
	}
	return c.Status(200).JSON(map[string]any{"data": value, "meta": map[string]any{}})
}

func (h *Handler) push(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request dto.PushRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()
	value, err := h.Synchronization.Push(ctx, claims(c), request)
	if err != nil {
		return synchronizationError(err)
	}
	return c.Status(200).JSON(map[string]any{"data": value, "meta": map[string]any{}})
}

func (h *Handler) pull(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	var request dto.PullRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()
	value, err := h.Synchronization.Pull(ctx, claims(c), request)
	if err != nil {
		return synchronizationError(err)
	}
	return c.Status(200).JSON(map[string]any{"data": value, "meta": map[string]any{}})
}

func (h *Handler) requirePermission(c fiber.Ctx, permission string) error {
	allowed, err := h.Authorization.HasPermission(c.Context(), claims(c), permission)
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to synchronize this merchant.", 403)
	}
	return nil
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}

func synchronizationError(err error) error {
	var apiErr *app.Error
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return app.Internal(err)
}
