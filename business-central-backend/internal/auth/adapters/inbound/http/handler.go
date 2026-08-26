package http

import (
	"context"
	"errors"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/auth/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct{ inbound.Authentication }

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func NewHandler(useCases inbound.Authentication) *Handler {
	return &Handler{Authentication: useCases}
}

func (h *Handler) RegisterPublicRoutes(r fiber.Router) {
	r.Post(LoginRoute, h.login)
	r.Post(RefreshRoute, h.refresh)
	r.Get("/currencies", h.listCurrencies)
	r.Get("/business-types", h.listBusinessTypes)
}

func (h *Handler) RegisterProtectedRoutes(r fiber.Router) {
	r.Get("/auth/me", h.me)
	r.Get("/merchant", h.getMerchant)
	r.Patch("/merchant", h.updateCurrentMerchant)
	r.Post("/auth/logout", h.logout)
	r.Get("/admin/currencies", h.listAdminCurrencies)
	r.Get("/admin/business-types", h.listAdminBusinessTypes)
	r.Get("/admin/business-types/:id", h.getBusinessType)
	r.Post("/admin/business-types", h.createBusinessType)
	r.Patch("/admin/business-types/:id", h.updateBusinessType)
	r.Delete("/admin/business-types/:id", h.deleteBusinessType)
	r.Get("/admin/currencies/:code", h.getCurrency)
	r.Post("/admin/currencies", h.createCurrency)
	r.Patch("/admin/currencies/:code", h.updateCurrency)
	r.Delete("/admin/currencies/:code", h.deleteCurrency)
	r.Post("/admin/merchants", h.createMerchantAccount)
	r.Post("/admin/merchant-users", h.createMerchantUser)
	r.Get("/admin/merchants", h.listMerchants)
	r.Patch("/admin/merchants/:id", h.updateMerchant)
	r.Get("/admin/permissions", h.listPermissions)
	r.Get("/admin/merchants/:id/roles", h.listRoles)
	r.Get("/roles", h.listTenantRoles)
	r.Post("/admin/merchants/:id/roles", h.createRole)
	r.Get("/admin/merchants/:id/roles/:roleId", h.getRole)
	r.Patch("/admin/merchants/:id/roles/:roleId", h.updateRole)
	r.Delete("/admin/merchants/:id/roles/:roleId", h.deleteRole)
	r.Get("/users", h.listUsers)
	r.Post("/users", h.createUser)
	r.Get("/users/:id", h.getUser)
	r.Patch("/users/:id", h.updateUser)
	r.Delete("/users/:id", h.deleteUser)
}

func (h *Handler) getMerchant(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	merchant, err := h.Authentication.GetMerchant(ctx, claims(c))
	if err != nil {
		return noResource(err, "Merchant")
	}
	return c.JSON(map[string]any{"data": merchant, "meta": map[string]any{}})
}

func (h *Handler) updateCurrentMerchant(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	var request authdto.UpdateMerchantRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	request.IsActive = nil
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	merchant, err := h.Authentication.UpdateMerchant(ctx, claims(c), claims(c).MerchantID, request)
	if err != nil {
		return noResource(err, "Merchant")
	}
	return c.JSON(map[string]any{"data": merchant, "meta": map[string]any{}})
}

func (h *Handler) listTenantRoles(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	roles, err := h.Authentication.ListRoles(ctx, claims(c), claims(c).MerchantID)
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": roles, "meta": map[string]any{}})
}

func (h *Handler) listCurrencies(c fiber.Ctx) error {
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	currencies, err := h.Authentication.ListCurrencies(ctx)
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(map[string]any{"data": currencies, "meta": map[string]any{}})
}

func (h *Handler) listBusinessTypes(c fiber.Ctx) error {
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Authentication.ListBusinessTypes(ctx)
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(map[string]any{"data": items, "meta": map[string]any{}})
}
func (h *Handler) listAdminBusinessTypes(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	return h.listBusinessTypes(c)
}
func (h *Handler) getBusinessType(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Authentication.GetBusinessType(ctx, c.Params("id"))
	if err != nil {
		return noResource(err, "Business type")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) createBusinessType(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var r authdto.CreateBusinessTypeRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Authentication.CreateBusinessType(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) updateBusinessType(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var r authdto.UpdateBusinessTypeRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Authentication.UpdateBusinessType(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Business type")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) deleteBusinessType(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Authentication.DeleteBusinessType(ctx, claims(c), c.Params("id")); err != nil {
		return noResourceOrDatabase(err, "Business type")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listAdminCurrencies(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	return h.listCurrencies(c)
}

func (h *Handler) getCurrency(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	currency, err := h.Authentication.GetCurrency(ctx, c.Params("code"))
	if err != nil {
		return noResource(err, "Currency")
	}
	return c.JSON(map[string]any{"data": currency, "meta": map[string]any{}})
}

func (h *Handler) createCurrency(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.CreateCurrencyRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	currency, err := h.Authentication.CreateCurrency(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": currency, "meta": map[string]any{}})
}

func (h *Handler) updateCurrency(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.UpdateCurrencyRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	currency, err := h.Authentication.UpdateCurrency(ctx, claims(c), c.Params("code"), request)
	if err != nil {
		return noResource(err, "Currency")
	}
	return c.JSON(map[string]any{"data": currency, "meta": map[string]any{}})
}

func (h *Handler) deleteCurrency(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Authentication.DeleteCurrency(ctx, claims(c), c.Params("code")); err != nil {
		return databaseError(err)
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) login(c fiber.Ctx) error {
	var request authdto.LoginRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	session, authErr := h.Authentication.Login(ctx, request)
	if authErr != nil {
		return authErr
	}
	return c.Status(200).JSON(map[string]any{"data": session, "meta": map[string]any{}})
}

func (h *Handler) refresh(c fiber.Ctx) error {
	var request refreshRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	session, authErr := h.Authentication.Refresh(ctx, request.RefreshToken)
	if authErr != nil {
		return authErr
	}
	return c.JSON(map[string]any{"data": session, "meta": map[string]any{}})
}

func (h *Handler) me(c fiber.Ctx) error {
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	user, err := h.Authentication.GetUser(ctx, claims(c), claims(c).MembershipID)
	if err != nil {
		return noRows(err)
	}
	return c.JSON(map[string]any{"data": user, "meta": map[string]any{}})
}

func (h *Handler) logout(c fiber.Ctx) error {
	token := strings.TrimSpace(strings.TrimPrefix(c.Get("Authorization"), "Bearer"))
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if authErr := h.Authentication.Logout(ctx, claims(c).IdentityID, token); authErr != nil {
		return authErr
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) createMerchantAccount(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.CreateMerchantAccountRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	account, err := h.Authentication.CreateMerchantAccount(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": account, "meta": map[string]any{}})
}

func (h *Handler) createMerchantUser(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.CreateMerchantUserRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	account, err := h.Authentication.CreateMerchantUser(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": account, "meta": map[string]any{}})
}

func (h *Handler) listMerchants(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	listQuery := app.NewListQuery(c.Query("query"), c.Query("filter"), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	merchants, total, err := h.Authentication.ListMerchants(ctx, claims(c), listQuery)
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(app.PageResult[authdto.Merchant]{Data: merchants, Meta: app.PageMeta{PageIndex: listQuery.PageIndex, PageSize: listQuery.PageSize, Total: total, TotalPages: (total + listQuery.PageSize - 1) / listQuery.PageSize}})
}

func (h *Handler) updateMerchant(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.UpdateMerchantRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	merchant, err := h.Authentication.UpdateMerchant(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResource(err, "Merchant")
	}
	return c.JSON(map[string]any{"data": merchant, "meta": map[string]any{}})
}

func (h *Handler) listRoles(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	roles, err := h.Authentication.ListRoles(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Merchant roles")
	}
	return c.JSON(map[string]any{"data": roles, "meta": map[string]any{}})
}

func (h *Handler) listPermissions(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	permissions, err := h.Authentication.ListPermissions(ctx, claims(c))
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": permissions, "meta": map[string]any{}})
}

func (h *Handler) getRole(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	role, err := h.Authentication.GetRole(ctx, claims(c), c.Params("id"), c.Params("roleId"))
	if err != nil {
		return noResource(err, "Role")
	}
	return c.JSON(map[string]any{"data": role, "meta": map[string]any{}})
}

func (h *Handler) createRole(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.CreateRoleRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	role, err := h.Authentication.CreateRole(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": role, "meta": map[string]any{}})
}

func (h *Handler) updateRole(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	var request authdto.UpdateRoleRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	role, err := h.Authentication.UpdateRole(ctx, claims(c), c.Params("id"), c.Params("roleId"), request)
	if err != nil {
		return noResource(err, "Role")
	}
	return c.JSON(map[string]any{"data": role, "meta": map[string]any{}})
}

func (h *Handler) deleteRole(c fiber.Ctx) error {
	if err := h.requirePlatformAdmin(c); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Authentication.DeleteRole(ctx, claims(c), c.Params("id"), c.Params("roleId")); err != nil {
		return noResource(err, "Role")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listUsers(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	listQuery := app.NewListQuery(c.Query("query"), c.Query("filter"), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	users, total, err := h.Authentication.ListUsers(ctx, claims(c), listQuery)
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(app.PageResult[authdto.User]{Data: users, Meta: app.PageMeta{PageIndex: listQuery.PageIndex, PageSize: listQuery.PageSize, Total: total, TotalPages: (total + listQuery.PageSize - 1) / listQuery.PageSize}})
}

func (h *Handler) createUser(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	var request authdto.CreateUserRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	user, err := h.Authentication.CreateUser(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": user, "meta": map[string]any{}})
}

func (h *Handler) getUser(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	user, err := h.Authentication.GetUser(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noRows(err)
	}
	return c.JSON(map[string]any{"data": user, "meta": map[string]any{}})
}

func (h *Handler) updateUser(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	var request authdto.UpdateUserRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	user, err := h.Authentication.UpdateUser(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": user, "meta": map[string]any{}})
}

func (h *Handler) deleteUser(c fiber.Ctx) error {
	if err := h.requirePermission(c, "membership.manage"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if authErr := h.Authentication.DeleteUser(ctx, claims(c), c.Params("id")); authErr != nil {
		return authErr
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) requirePermission(c fiber.Ctx, permission string) error {
	allowed, err := h.Authentication.HasPermission(c.Context(), claims(c), permission)
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}

func (h *Handler) requirePlatformAdmin(c fiber.Ctx) error {
	if c := claims(c); c == nil || !c.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
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
