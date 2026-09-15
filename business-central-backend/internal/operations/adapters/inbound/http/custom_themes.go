package http

import (
	"business-central-backend/internal/app"
	operationsdto "business-central-backend/internal/operations/application/dto"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) listCustomThemes(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListCustomThemes(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(map[string]any{"data": items, "meta": map[string]any{}})
}

func (h *Handler) getCustomTheme(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Operations.GetCustomTheme(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResourceOrDatabase(err, "Custom theme")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) createCustomTheme(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	var request operationsdto.CustomThemeRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Operations.CreateCustomTheme(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) updateCustomTheme(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	var request operationsdto.CustomThemeRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Operations.UpdateCustomTheme(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Custom theme")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) deleteCustomTheme(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Operations.DeleteCustomTheme(ctx, claims(c), c.Params("id")); err != nil {
		return noResourceOrDatabase(err, "Custom theme")
	}
	return c.Status(204).Send(nil)
}
