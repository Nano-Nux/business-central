package http

import (
	"context"
	"errors"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	"business-central-backend/internal/services/application/dto"
	"business-central-backend/internal/services/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	inbound.Services
	Authorization authinbound.Authentication
}

func NewHandler(useCases inbound.Services, authorization authinbound.Authentication) *Handler {
	return &Handler{Services: useCases, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/services/categories", h.listServiceCategories)
	r.Post("/services/categories", h.createServiceCategory)
	r.Patch("/services/categories/:id", h.updateServiceCategory)
	r.Delete("/services/categories/:id", h.deleteServiceCategory)
	r.Get("/services/catalog", h.listServiceCatalog)
	r.Post("/services/catalog", h.createServiceCatalog)
	r.Patch("/services/catalog/:id", h.updateServiceCatalog)
	r.Delete("/services/catalog/:id", h.deleteServiceCatalog)
	r.Get("/services/prices", h.listServicePrices)
	r.Post("/services/prices", h.upsertServicePrice)
	r.Delete("/services/prices", h.deleteServicePrice)
	r.Get("/services/orders", h.listServiceOrders)
	r.Post("/services/orders", h.createServiceOrder)
	r.Get("/services/orders/:id", h.getServiceOrder)
	r.Patch("/services/orders/:id", h.updateServiceOrder)
	r.Delete("/services/orders/:id", h.deleteServiceOrder)
	r.Get("/services/orders/:orderId/items", h.listItems)
	r.Post("/services/orders/:orderId/items", h.createItem)
	r.Patch("/services/items/:id", h.updateItem)
	r.Delete("/services/items/:id", h.deleteItem)
	r.Get("/services/orders/:orderId/appointments", h.listAppointments)
	r.Post("/services/orders/:orderId/appointments", h.createAppointment)
	r.Patch("/services/appointments/:id", h.updateAppointment)
	r.Delete("/services/appointments/:id", h.deleteAppointment)
	r.Get("/services/orders/:orderId/notes", h.listNotes)
	r.Post("/services/orders/:orderId/notes", h.createNote)
	r.Delete("/services/notes/:id", h.deleteNote)
	r.Get("/services/orders/:orderId/billings", h.listBillings)
	r.Post("/services/orders/:orderId/billings", h.createBilling)
	r.Patch("/services/billings/:id", h.updateBilling)
	r.Delete("/services/billings/:id", h.deleteBilling)
	r.Get("/services/forms/definitions", h.listCustomFieldDefinitions)
	r.Post("/services/forms/definitions", h.createCustomFieldDefinition)
	r.Patch("/services/forms/definitions/:id", h.updateCustomFieldDefinition)
	r.Delete("/services/forms/definitions/:id", h.deleteCustomFieldDefinition)
	r.Get("/services/forms/values/:entityType/:entityId", h.listCustomFieldValues)
	r.Post("/services/forms/values/:entityType/:entityId", h.upsertCustomFieldValue)
	r.Delete("/services/forms/values/:id", h.deleteCustomFieldValue)
	r.Get("/repairs/devices", h.listDevices)
	r.Post("/repairs/devices", h.createDevice)
	r.Patch("/repairs/devices/:id", h.updateDevice)
	r.Delete("/repairs/devices/:id", h.deleteDevice)
	r.Get("/repairs/presets", h.listRepairPresets)
	r.Post("/repairs/presets", h.createRepairPreset)
	r.Patch("/repairs/presets/:id", h.updateRepairPreset)
	r.Delete("/repairs/presets/:id", h.deleteRepairPreset)
	r.Get("/repairs/orders", h.listRepairOrders)
	r.Get("/repairs/orders/:id", h.getRepairOrder)
	r.Get("/repairs/orders/:orderId/work-items", h.listRepairWorkItems)
	r.Patch("/repairs/work-items/:id", h.updateRepairWorkItem)
	r.Post("/repairs/tickets", h.createRepairTicket)
	r.Post("/repairs/orders", h.createRepairOrder)
	r.Patch("/repairs/orders/:id", h.updateRepairOrder)
	r.Patch("/repairs/orders/:id/details", h.updateRepairTicketDetails)
	r.Patch("/repairs/orders/:id/billing", h.updateRepairTicketBilling)
	r.Delete("/repairs/orders/:id", h.deleteRepairOrder)
	r.Get("/repairs/orders/:orderId/payments", h.listRepairPayments)
	r.Post("/repairs/orders/:orderId/payments", h.createRepairPayment)
	r.Get("/repairs/orders/:orderId/refunds", h.listRepairRefunds)
	r.Post("/repairs/orders/:orderId/refunds", h.createRepairRefund)
	r.Get("/repairs/orders/:orderId/images", h.listRepairImages)
	r.Post("/repairs/orders/:orderId/images", h.createRepairImage)
	r.Delete("/repairs/images/:id", h.deleteRepairImage)
	r.Get("/repairs/orders/:orderId/diagnostics", h.listDiagnostics)
	r.Post("/repairs/orders/:orderId/diagnostics", h.createDiagnostic)
	r.Patch("/repairs/diagnostics/:id", h.updateDiagnostic)
	r.Delete("/repairs/diagnostics/:id", h.deleteDiagnostic)
	r.Get("/repairs/orders/:orderId/parts", h.listParts)
	r.Post("/repairs/orders/:orderId/parts", h.createPart)
	r.Patch("/repairs/parts/:id", h.updatePart)
	r.Delete("/repairs/parts/:id", h.deletePart)
	r.Get("/repairs/orders/:orderId/approvals", h.listApprovals)
	r.Post("/repairs/orders/:orderId/approvals", h.createApproval)
	r.Patch("/repairs/approvals/:id", h.updateApproval)
	r.Delete("/repairs/approvals/:id", h.deleteApproval)
	r.Get("/repairs/orders/:orderId/warranties", h.listWarranties)
	r.Post("/repairs/orders/:orderId/warranties", h.createWarranty)
	r.Patch("/repairs/warranties/:id", h.updateWarranty)
	r.Delete("/repairs/warranties/:id", h.deleteWarranty)
}

func query(c fiber.Ctx) app.ListQuery {
	return app.NewListQuery(c.Query("query"), c.Query("filter"), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
}
func claims(c fiber.Ctx) *authdto.Claims { v, _ := c.Locals("claims").(*authdto.Claims); return v }
func (h *Handler) permission(c fiber.Ctx, p string) error {
	ok, err := h.Authorization.HasPermission(c.Context(), claims(c), p)
	if err != nil {
		return app.Internal(err)
	}
	if !ok {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}
func (h *Handler) merchant(c fiber.Ctx) error {
	ok, err := h.Authorization.HasAnyRole(c.Context(), claims(c), "owner", "merchant")
	if err != nil {
		return app.Internal(err)
	}
	if !ok {
		return app.NewError("FORBIDDEN", "Merchant owner access is required.", 403)
	}
	return nil
}
func contextFor(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 15*time.Second)
}
func decode[T any](c fiber.Ctx) (T, error) {
	var v T
	if err := c.Bind().JSON(&v); err != nil {
		return v, app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	return v, nil
}
func page[T any](c fiber.Ctx, items []T, total int, q app.ListQuery) error {
	pages := 0
	if total > 0 {
		pages = (total + q.PageSize - 1) / q.PageSize
	}
	return c.JSON(app.PageResult[T]{Data: items, Meta: app.PageMeta{PageIndex: q.PageIndex, PageSize: q.PageSize, Total: total, TotalPages: pages}})
}
func apiError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", "Resource not found.", 404)
	}
	if v, ok := err.(*app.Error); ok {
		return v
	}
	return app.Internal(err)
}
func (h *Handler) mutate(c fiber.Ctx, body any, fn func(context.Context) (any, error), status int) error {
	return h.mutateWithin(c, body, fn, status, 15*time.Second)
}
func (h *Handler) mutateWithin(c fiber.Ctx, body any, fn func(context.Context) (any, error), status int, timeout time.Duration) error {
	if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(body); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := context.WithTimeout(c.Context(), timeout)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	v, err := fn(ctx)
	if err != nil {
		return apiError(err)
	}
	return c.Status(status).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) remove(c fiber.Ctx, fn func(context.Context) error) error {
	if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	if err := fn(ctx); err != nil {
		return apiError(err)
	}
	return c.SendStatus(204)
}

func (h *Handler) listServiceCategories(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListServiceCategories(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createServiceCategory(c fiber.Ctx) error {
	var x dto.ServiceCategoryRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.CreateServiceCategory(ctx, claims(c), x) }, 201)
}
func (h *Handler) updateServiceCategory(c fiber.Ctx) error {
	var x dto.ServiceCategoryRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateServiceCategory(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteServiceCategory(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteServiceCategory(ctx, claims(c), c.Params("id"))
	})
}

func (h *Handler) listServiceCatalog(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListServiceCatalog(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createServiceCatalog(c fiber.Ctx) error {
	var x dto.ServiceDefinitionRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.CreateServiceCatalog(ctx, claims(c), x) }, 201)
}
func (h *Handler) updateServiceCatalog(c fiber.Ctx) error {
	var x dto.ServiceDefinitionRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateServiceCatalog(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteServiceCatalog(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteServiceCatalog(ctx, claims(c), c.Params("id"))
	})
}
func (h *Handler) listServicePrices(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListServicePrices(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) upsertServicePrice(c fiber.Ctx) error {
	var x dto.ServicePriceRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.UpsertServicePrice(ctx, claims(c), x) }, 201)
}
func (h *Handler) deleteServicePrice(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteServicePrice(ctx, claims(c), c.Query("service_id"), c.Query("valid_from"))
	})
}

func (h *Handler) listServiceOrders(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListServiceOrders(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) getServiceOrder(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, e := h.Services.GetServiceOrder(ctx, claims(c), c.Params("id"))
	if e != nil {
		return apiError(e)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) createServiceOrder(c fiber.Ctx) error {
	var x dto.ServiceOrderRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.CreateServiceOrder(ctx, claims(c), x) }, 201)
}
func (h *Handler) updateServiceOrder(c fiber.Ctx) error {
	var x dto.ServiceOrderRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateServiceOrder(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteServiceOrder(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteServiceOrder(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listItems(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListServiceOrderItems(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createItem(c fiber.Ctx) error {
	var x dto.ServiceOrderItemRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.ServiceOrderID = c.Params("orderId")
		return h.Services.CreateServiceOrderItem(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateItem(c fiber.Ctx) error {
	var x dto.ServiceOrderItemRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateServiceOrderItem(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteItem(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteServiceOrderItem(ctx, claims(c), c.Params("id"))
	})
}

func (h *Handler) listAppointments(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListAppointments(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createAppointment(c fiber.Ctx) error {
	var x dto.ServiceAppointmentRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.ServiceOrderID = c.Params("orderId")
		return h.Services.CreateAppointment(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateAppointment(c fiber.Ctx) error {
	var x dto.ServiceAppointmentRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateAppointment(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteAppointment(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteAppointment(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listNotes(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListNotes(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createNote(c fiber.Ctx) error {
	var x dto.ServiceNoteRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.ServiceOrderID = c.Params("orderId")
		if x.AuthorMembershipID == nil {
			x.AuthorMembershipID = &claims(c).MembershipID
		}
		return h.Services.CreateNote(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) deleteNote(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteNote(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listBillings(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListBillings(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createBilling(c fiber.Ctx) error {
	var x dto.ServiceBillingRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.ServiceOrderID = c.Params("orderId")
		return h.Services.CreateBilling(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateBilling(c fiber.Ctx) error {
	var x dto.ServiceBillingRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateBilling(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteBilling(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteBilling(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listDevices(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairDevices(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createDevice(c fiber.Ctx) error {
	var x dto.RepairDeviceRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.CreateRepairDevice(ctx, claims(c), x) }, 201)
}
func (h *Handler) updateDevice(c fiber.Ctx) error {
	var x dto.RepairDeviceRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateRepairDevice(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteDevice(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteRepairDevice(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listRepairPresets(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, err := h.Services.ListRepairPresets(ctx, claims(c), c.Query("shop_id"), c.Query("preset_type"), query(c))
	if err != nil {
		return apiError(err)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createRepairPreset(c fiber.Ctx) error {
	if err := h.merchant(c); err != nil {
		return err
	}
	var x dto.RepairPresetRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateRepairPreset(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateRepairPreset(c fiber.Ctx) error {
	if err := h.merchant(c); err != nil {
		return err
	}
	var x dto.RepairPresetRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateRepairPreset(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteRepairPreset(c fiber.Ctx) error {
	if err := h.merchant(c); err != nil {
		return err
	}
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteRepairPreset(ctx, claims(c), c.Params("id"))
	})
}

func (h *Handler) listRepairOrders(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairOrders(ctx, claims(c), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) getRepairOrder(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, err := h.Services.GetRepairOrder(ctx, claims(c), c.Params("id"))
	if err != nil {
		return apiError(err)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) listRepairWorkItems(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, err := h.Services.ListRepairWorkItems(ctx, claims(c), c.Params("orderId"), query(c))
	if err != nil {
		return apiError(err)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) listCustomFieldDefinitions(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, err := h.Services.ListCustomFieldDefinitions(ctx, claims(c), query(c))
	if err != nil {
		return apiError(err)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createCustomFieldDefinition(c fiber.Ctx) error {
	var x dto.CustomFieldDefinitionRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateCustomFieldDefinition(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateCustomFieldDefinition(c fiber.Ctx) error {
	var x dto.CustomFieldDefinitionRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateCustomFieldDefinition(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteCustomFieldDefinition(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteCustomFieldDefinition(ctx, claims(c), c.Params("id"))
	})
}
func (h *Handler) listCustomFieldValues(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, err := h.Services.ListCustomFieldValues(ctx, claims(c), c.Params("entityType"), c.Params("entityId"), query(c))
	if err != nil {
		return apiError(err)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) upsertCustomFieldValue(c fiber.Ctx) error {
	var x dto.CustomFieldValueRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpsertCustomFieldValue(ctx, claims(c), c.Params("entityType"), c.Params("entityId"), x)
	}, 200)
}
func (h *Handler) deleteCustomFieldValue(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error {
		return h.Services.DeleteCustomFieldValue(ctx, claims(c), c.Params("id"))
	})
}
func (h *Handler) createRepairOrder(c fiber.Ctx) error {
	var x dto.RepairOrderRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) { return h.Services.CreateRepairOrder(ctx, claims(c), x) }, 201)
}
func (h *Handler) updateRepairWorkItem(c fiber.Ctx) error {
	var x dto.RepairWorkItemUpdateRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateRepairWorkItem(ctx, claims(c), c.Params("id"), x)
	}, 200)
}

func (h *Handler) createRepairTicket(c fiber.Ctx) error {
	var x dto.CreateRepairTicketRequest
	return h.mutateWithin(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateRepairTicket(ctx, claims(c), x)
	}, 201, 60*time.Second)
}
func (h *Handler) updateRepairOrder(c fiber.Ctx) error {
	var x dto.RepairOrderRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateRepairOrder(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) updateRepairTicketDetails(c fiber.Ctx) error {
	if err := h.merchant(c); err != nil {
		return err
	}
	var x dto.RepairTicketDetailsRequest
	if err := c.Bind().JSON(&x); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	v, err := h.Services.UpdateRepairTicketDetails(ctx, claims(c), c.Params("id"), x)
	if err != nil {
		return apiError(err)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) updateRepairTicketBilling(c fiber.Ctx) error {
	if err := h.merchant(c); err != nil {
		return err
	}
	var x dto.RepairTicketBillingRequest
	if err := c.Bind().JSON(&x); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	v, err := h.Services.UpdateRepairTicketBilling(ctx, claims(c), c.Params("id"), x)
	if err != nil {
		return apiError(err)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) deleteRepairOrder(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteRepairOrder(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listRepairPayments(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairPayments(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createRepairPayment(c fiber.Ctx) error {
	var x dto.RepairPaymentRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateRepairPayment(ctx, claims(c), c.Params("orderId"), x)
	}, 201)
}
func (h *Handler) listRepairRefunds(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairRefunds(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createRepairRefund(c fiber.Ctx) error {
	var x dto.RepairRefundRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateRepairRefund(ctx, claims(c), c.Params("orderId"), x)
	}, 201)
}
func (h *Handler) listRepairImages(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairImages(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createRepairImage(c fiber.Ctx) error {
	var x dto.RepairImageRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.CreateRepairImage(ctx, claims(c), c.Params("orderId"), x)
	}, 201)
}
func (h *Handler) deleteRepairImage(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteRepairImage(ctx, claims(c), c.Params("id")) })
}

func (h *Handler) listDiagnostics(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListDiagnostics(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createDiagnostic(c fiber.Ctx) error {
	var x dto.RepairDiagnosticRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.RepairOrderID = c.Params("orderId")
		return h.Services.CreateDiagnostic(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateDiagnostic(c fiber.Ctx) error {
	var x dto.RepairDiagnosticRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateDiagnostic(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteDiagnostic(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteDiagnostic(ctx, claims(c), c.Params("id")) })
}
func (h *Handler) listParts(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListRepairParts(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createPart(c fiber.Ctx) error {
	var x dto.RepairPartRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.RepairOrderID = c.Params("orderId")
		return h.Services.CreateRepairPart(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updatePart(c fiber.Ctx) error {
	var x dto.RepairPartRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateRepairPart(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deletePart(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteRepairPart(ctx, claims(c), c.Params("id")) })
}
func (h *Handler) listApprovals(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListApprovals(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createApproval(c fiber.Ctx) error {
	var x dto.RepairApprovalRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.RepairOrderID = c.Params("orderId")
		return h.Services.CreateApproval(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateApproval(c fiber.Ctx) error {
	var x dto.RepairApprovalRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateApproval(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteApproval(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteApproval(ctx, claims(c), c.Params("id")) })
}
func (h *Handler) listWarranties(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextFor(c)
	defer cancel()
	v, n, e := h.Services.ListWarranties(ctx, claims(c), c.Params("orderId"), query(c))
	if e != nil {
		return apiError(e)
	}
	return page(c, v, n, query(c))
}
func (h *Handler) createWarranty(c fiber.Ctx) error {
	var x dto.RepairWarrantyRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		x.RepairOrderID = c.Params("orderId")
		return h.Services.CreateWarranty(ctx, claims(c), x)
	}, 201)
}
func (h *Handler) updateWarranty(c fiber.Ctx) error {
	var x dto.RepairWarrantyRequest
	return h.mutate(c, &x, func(ctx context.Context) (any, error) {
		return h.Services.UpdateWarranty(ctx, claims(c), c.Params("id"), x)
	}, 200)
}
func (h *Handler) deleteWarranty(c fiber.Ctx) error {
	return h.remove(c, func(ctx context.Context) error { return h.Services.DeleteWarranty(ctx, claims(c), c.Params("id")) })
}
