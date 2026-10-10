package http

import (
	"business-central-backend/internal/app"
	operationsdto "business-central-backend/internal/operations/application/dto"
	"github.com/gofiber/fiber/v3"
	"strconv"
)

func (h *Handler) listStockConversionRules(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	rules, err := h.Operations.ListStockConversionRules(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": rules, "meta": map[string]any{}})
}

func (h *Handler) saveStockConversionRule(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request operationsdto.StockConversionRuleRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	rule, err := h.Operations.SaveStockConversionRule(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": rule, "meta": map[string]any{}})
}

func (h *Handler) listStockConversions(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListStockConversions(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": items, "meta": map[string]any{}})
}

func (h *Handler) previewStockConversion(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	quantity, err := strconv.Atoi(c.Query("quantity"))
	if err != nil {
		return app.NewError("VALIDATION_ERROR", "quantity must be a whole number.", 400)
	}
	request := operationsdto.StockConversionRequest{RuleID: c.Query("rule_id"), LocationID: c.Query("location_id"), Quantity: quantity}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	preview, err := h.Operations.PreviewStockConversion(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": preview, "meta": map[string]any{}})
}

func (h *Handler) applyStockConversion(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request operationsdto.StockConversionRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	item, err := h.Operations.ApplyStockConversion(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
