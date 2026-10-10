package http

import (
	"business-central-backend/internal/app"
	posdto "business-central-backend/internal/pos/application/dto"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) updateTransaction(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.TransactionEditRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.Validation("Request body must be valid JSON.", nil)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	result, err := h.POS.UpdateTransaction(ctx, claims(c), c.Params("orderId"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Order")
	}
	return c.JSON(map[string]any{"data": result, "meta": map[string]any{}})
}
func (h *Handler) deleteTransaction(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.TransactionDeleteRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.Validation("Request body must be valid JSON.", nil)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.POS.DeleteTransaction(ctx, claims(c), c.Params("orderId"), r); err != nil {
		return noResourceOrDatabase(err, "Order")
	}
	return c.JSON(map[string]any{"data": map[string]bool{"deleted": true}, "meta": map[string]any{}})
}
