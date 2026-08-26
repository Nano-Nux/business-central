package http

import (
	"context"
	"errors"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/auth/ports/inbound"
	posdto "business-central-backend/internal/pos/application/dto"
	posinbound "business-central-backend/internal/pos/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	posinbound.POS
	Authorization inbound.Authentication
}

func NewHandler(useCases posinbound.POS, authorization inbound.Authentication) *Handler {
	return &Handler{POS: useCases, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/pos/catalog", h.listCatalog)
	r.Get("/pos/barcode-lookup", h.lookupBarcode)
	r.Post("/pos/quote", h.quoteSale)
	r.Post("/pos/orders", h.createSale)
	r.Post("/pos/orders/:orderId/refunds", h.createRefund)
	r.Get("/invoices", h.listInvoices)
	r.Get("/customers", h.listCustomers)
	r.Get("/customers/:id", h.getCustomer)
	r.Patch("/customers/:id", h.updateCustomer)
	r.Get("/shops", h.listShops)
	r.Get("/inventory/locations", h.listLocations)
	r.Post("/shops", h.createShop)
	r.Get("/shops/:id", h.getShop)
	r.Patch("/shops/:id", h.updateShop)
	r.Delete("/shops/:id", h.deleteShop)
	r.Get("/shops/:shopId/deliveries", h.listDeliveries)
	r.Get("/deliveries/:id", h.getDelivery)
	r.Post("/deliveries", h.createDelivery)
	r.Patch("/deliveries/:id", h.updateDelivery)
	r.Delete("/deliveries/:id", h.deleteDelivery)
	r.Get("/pos/shops/:shopId/terminals", h.listTerminals)
	r.Post("/pos/terminals", h.createTerminal)
	r.Get("/pos/terminals/:id", h.getTerminal)
	r.Patch("/pos/terminals/:id", h.updateTerminal)
	r.Delete("/pos/terminals/:id", h.deleteTerminal)
	r.Get("/pos/shops/:shopId/sessions", h.listSessions)
	r.Post("/pos/sessions", h.createSession)
	r.Get("/pos/sessions/:id", h.getSession)
	r.Patch("/pos/sessions/:id", h.updateSession)
	r.Delete("/pos/sessions/:id", h.deleteSession)
}

func (h *Handler) listDeliveries(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.ListDeliveries(ctx, claims(c), c.Params("shopId"))
	if err != nil {
		return databaseError(err)
	}
	return posListPage(c, items, listQuery(c), func(item posdto.Delivery, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.Name, "contact_info": item.ContactInfo})
	})
}
func (h *Handler) getDelivery(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.POS.GetDelivery(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResourceOrDatabase(err, "Delivery")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) createDelivery(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request posdto.DeliveryRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.POS.CreateDelivery(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) updateDelivery(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	var request posdto.DeliveryRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.POS.UpdateDelivery(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Delivery")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) listCustomers(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.ListCustomers(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return posListPage(c, items, listQuery(c), func(item posdto.Customer, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.DisplayName, "phone": posPtr(item.Phone), "email": posPtr(item.Email), "number": item.CustomerNumber})
	})
}

func (h *Handler) getCustomer(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.POS.GetCustomer(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResourceOrDatabase(err, "Customer")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) updateCustomer(c fiber.Ctx) error {
	if err := h.requireMerchant(c); err != nil {
		return err
	}
	var request posdto.CustomerRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.POS.UpdateCustomer(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Customer")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) deleteDelivery(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.POS.DeleteDelivery(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Delivery")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) quoteSale(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request posdto.CreateSaleRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	quote, err := h.POS.QuoteSale(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(200).JSON(map[string]any{"data": quote, "meta": map[string]any{}})
}

func (h *Handler) listInvoices(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.ListInvoices(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return posListPage(c, items, listQuery(c), func(item posdto.Invoice, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"number": item.Number, "customer": item.Customer, "status": item.Status})
	})
}

func (h *Handler) listLocations(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.ListLocations(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return posListPage(c, items, listQuery(c), func(item posdto.Location, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.Name, "code": item.Code, "location_type": item.LocationType, "shop_id": posPtr(item.ShopID)})
	})
}

func (h *Handler) listCatalog(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.ListCatalog(ctx, claims(c), c.Query("shop_id"))
	if err != nil {
		return databaseError(err)
	}
	return posListPage(c, items, listQuery(c), func(item posdto.CatalogItem, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.Name, "product_name": item.ProductName, "sku": item.SKU, "barcode": posPtr(item.Barcode)})
	})
}

func (h *Handler) lookupBarcode(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.POS.LookupBarcode(ctx, claims(c), c.Query("barcode"), c.Query("shop_id"))
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": items, "meta": map[string]any{"total": len(items)}})
}

func (h *Handler) createSale(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request posdto.CreateSaleRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	if request.IdempotencyKey == "" {
		request.IdempotencyKey = c.Get("Idempotency-Key")
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	order, err := h.POS.CreateSale(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": order, "meta": map[string]any{}})
}

func (h *Handler) createRefund(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var request posdto.CreateRefundRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	if request.IdempotencyKey == "" {
		request.IdempotencyKey = c.Get("Idempotency-Key")
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	refund, err := h.POS.CreateRefund(ctx, claims(c), c.Params("orderId"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Order")
	}
	return c.Status(201).JSON(map[string]any{"data": refund, "meta": map[string]any{}})
}

func (h *Handler) listShops(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.ListShops(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return posListPage(c, v, listQuery(c), func(item posdto.Shop, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.Name, "code": item.Code, "timezone": posPtr(item.Timezone), "is_active": posBool(item.IsActive)})
	})
}

func (h *Handler) createShop(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	var r posdto.ShopRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.CreateShop(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getShop(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.GetShop(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Shop")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateShop(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	var r posdto.ShopRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.UpdateShop(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Shop")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteShop(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.POS.DeleteShop(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Shop")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listTerminals(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.ListTerminals(ctx, claims(c), c.Params("shopId"))
	if err != nil {
		return app.Internal(err)
	}
	return posListPage(c, v, listQuery(c), func(item posdto.Terminal, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"name": item.Name, "shop_id": item.ShopID, "device_identifier": posPtr(item.DeviceIdentifier), "is_active": posBool(item.IsActive)})
	})
}

func (h *Handler) createTerminal(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.TerminalRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.CreateTerminal(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getTerminal(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.GetTerminal(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "POS terminal")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateTerminal(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.TerminalRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.UpdateTerminal(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "POS terminal")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteTerminal(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.POS.DeleteTerminal(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "POS terminal")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listSessions(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.ListSessions(ctx, claims(c), c.Params("shopId"))
	if err != nil {
		return app.Internal(err)
	}
	return posListPage(c, v, listQuery(c), func(item posdto.Session, q app.ListQuery) bool {
		return posMatches(q, map[string]string{"shop_id": item.ShopID, "terminal_id": posPtr(item.TerminalID), "membership_id": item.MembershipID, "status": item.Status})
	})
}

func (h *Handler) createSession(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.SessionRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	if r.MembershipID == "" {
		r.MembershipID = claims(c).MembershipID
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.CreateSession(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getSession(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.GetSession(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "POS session")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateSession(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r posdto.SessionRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.POS.UpdateSession(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "POS session")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteSession(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.POS.DeleteSession(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "POS session")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) requirePermission(c fiber.Ctx, permission string) error {
	allowed, err := h.Authorization.HasPermission(c.Context(), claims(c), permission)
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}

func (h *Handler) requireMerchant(c fiber.Ctx) error {
	allowed, err := h.Authorization.HasAnyRole(c.Context(), claims(c), "owner", "merchant")
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "Merchant owner access is required.", 403)
	}
	return nil
}

func contextWithTimeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 15*time.Second)
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}

func noRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	return databaseError(err)
}

func databaseError(err error) error {
	if apiErr, ok := err.(*app.Error); ok {
		return apiErr
	}
	if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
		return app.NewError("CONFLICT", "The requested resource conflicts with an existing record.", 409)
	}
	if strings.Contains(err.Error(), "no rows") {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	return &app.Error{Code: "INTERNAL_ERROR", Message: err.Error(), Status: 500, Internal: err}
}

func noResource(err error, resource string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", resource+" not found.", 404)
	}
	return databaseError(err)
}

func noResourceOrDatabase(err error, resource string) error { return noResource(err, resource) }
