package http

import (
	"business-central-backend/internal/app"
	posdto "business-central-backend/internal/pos/application/dto"
	"github.com/gofiber/fiber/v3"
)

func (h *Handler) updateDeliveryPayment(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request posdto.DeliveryPaymentRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.Validation("Request body must be valid JSON.", nil)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	result, err := h.POS.UpdateDeliveryPayment(ctx, claims(c), c.Params("orderId"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Order")
	}
	return c.JSON(map[string]any{"data": result, "meta": map[string]any{}})
}
