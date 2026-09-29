package http

import (
	"context"
	"strconv"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	tapp "business-central-backend/internal/telegram/application"
	tdto "business-central-backend/internal/telegram/application/dto"
	tinbound "business-central-backend/internal/telegram/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	Telegram      tinbound.Telegram
	Authorization authinbound.Authentication
}

func NewHandler(t tinbound.Telegram, a authinbound.Authentication) *Handler {
	return &Handler{Telegram: t, Authorization: a}
}
func (h *Handler) RegisterPublicRoutes(r fiber.Router) { r.Post("/webhooks/telegram", h.webhook) }
func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/admin/telegram/webhook", h.webhookStatus)
	r.Post("/admin/telegram/webhook", h.registerWebhook)
	r.Get("/telegram/bot", h.botInfo)
	r.Get("/telegram/groups", h.listGroups)
	r.Get("/telegram/shops/:shopId/groups", h.listShopGroups)
	r.Post("/telegram/shops/:shopId/pairing-codes", h.createPairing)
	r.Get("/telegram/groups/:id", h.getGroup)
	r.Post("/telegram/groups/:id/refresh", h.refresh)
	r.Patch("/telegram/groups/:id/status", h.status)
	r.Patch("/telegram/groups/:id/auto-confirm", h.autoConfirm)
	r.Post("/telegram/groups/:id/rotate-pairing-code", h.rotate)
	r.Delete("/telegram/groups/:id", h.disconnect)
	r.Get("/telegram/groups/:id/users", h.users)
	r.Post("/telegram/groups/:id/users/:telegramUserId/revoke", h.revoke)
	r.Get("/telegram/orders", h.orders)
	r.Post("/telegram/orders/:orderId/confirm", h.confirm)
	r.Post("/telegram/orders/:orderId/cancel", h.cancel)
	r.Get("/admin/telegram/groups", h.adminGroups)
	r.Get("/admin/telegram/groups/:id", h.adminGroup)
	r.Post("/admin/telegram/groups/:id/refresh", h.adminRefresh)
	r.Post("/admin/telegram/groups/:id/refresh-members", h.adminRefresh)
	r.Patch("/admin/telegram/groups/:id/status", h.adminStatus)
	r.Patch("/admin/telegram/groups/:id/auto-confirm", h.adminAutoConfirm)
	r.Post("/admin/telegram/groups/:id/rotate-pairing-code", h.adminRotate)
	r.Delete("/admin/telegram/groups/:id", h.adminDisconnect)
	r.Get("/admin/telegram/groups/:id/users", h.adminUsers)
	r.Post("/admin/telegram/groups/:id/users/:telegramUserId/revoke", h.adminRevoke)
	r.Get("/admin/telegram/orders", h.adminOrders)
	r.Get("/admin/telegram/groups/:id/orders", h.adminGroupOrders)
	r.Get("/admin/telegram/groups/:id/audit", h.adminAudit)
	r.Post("/admin/telegram/groups/:id/retry-sync", h.adminRetrySync)
	r.Post("/admin/telegram/orders/:orderId/confirm", h.adminConfirm)
	r.Post("/admin/telegram/orders/:orderId/cancel", h.adminCancel)
}
func claims(c fiber.Ctx) *authdto.Claims { v, _ := c.Locals("claims").(*authdto.Claims); return v }
func timeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 15*time.Second)
}
func envelope(c fiber.Ctx, data any) error {
	return c.JSON(map[string]any{"data": data, "meta": map[string]any{}})
}
func (h *Handler) permission(c fiber.Ctx, code string) error {
	ok, err := h.Authorization.HasPermission(c.Context(), claims(c), code)
	if err != nil {
		return app.Internal(err)
	}
	if !ok {
		return app.NewError("FORBIDDEN", "You do not have permission to manage Telegram automation.", 403)
	}
	return nil
}
func admin(c fiber.Ctx) error {
	if claims(c) == nil || !claims(c).PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
	}
	return nil
}
func (h *Handler) webhook(c fiber.Ctx) error {
	if !h.Telegram.ValidateWebhookSecret(c.Get("X-Telegram-Bot-Api-Secret-Token")) {
		return app.NewError("INVALID_WEBHOOK_SECRET", "Invalid Telegram webhook secret.", 401)
	}
	var u tdto.TelegramUpdate
	if err := c.Bind().JSON(&u); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be a valid Telegram update.", 400)
	}
	ctx, cancel := timeout(c)
	defer cancel()
	if err := h.Telegram.HandleUpdate(ctx, u); err != nil {
		return err
	}
	return c.SendStatus(200)
}
func (h *Handler) listGroups(c fiber.Ctx) error { return h.groups(c, false, c.Query("shop_id")) }
func (h *Handler) botInfo(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	return envelope(c, h.Telegram.BotInfo())
}
func (h *Handler) listShopGroups(c fiber.Ctx) error { return h.groups(c, false, c.Params("shopId")) }
func (h *Handler) adminGroups(c fiber.Ctx) error    { return h.groups(c, true, c.Query("shop_id")) }
func (h *Handler) groups(c fiber.Ctx, a bool, shop string) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.ListGroups(ctx, claims(c), shop, a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) createPairing(c fiber.Ctx) error {
	if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.CreatePairingCode(ctx, claims(c), c.Params("shopId"))
	if err != nil {
		return err
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}
func (h *Handler) detail(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.GetGroup(ctx, claims(c), c.Params("id"), a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) getGroup(c fiber.Ctx) error   { return h.detail(c, false) }
func (h *Handler) adminGroup(c fiber.Ctx) error { return h.detail(c, true) }
func (h *Handler) doRefresh(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.RefreshGroup(ctx, claims(c), c.Params("id"), a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) refresh(c fiber.Ctx) error      { return h.doRefresh(c, false) }
func (h *Handler) adminRefresh(c fiber.Ctx) error { return h.doRefresh(c, true) }
func (h *Handler) doStatus(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	var q tdto.StatusRequest
	if err := c.Bind().JSON(&q); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.SetGroupStatus(ctx, claims(c), c.Params("id"), q.Status, a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) status(c fiber.Ctx) error      { return h.doStatus(c, false) }
func (h *Handler) adminStatus(c fiber.Ctx) error { return h.doStatus(c, true) }
func (h *Handler) doRotate(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.RotatePairingCode(ctx, claims(c), c.Params("id"), a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) rotate(c fiber.Ctx) error      { return h.doRotate(c, false) }
func (h *Handler) adminRotate(c fiber.Ctx) error { return h.doRotate(c, true) }
func (h *Handler) doDisconnect(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	if err := h.Telegram.DisconnectGroup(ctx, claims(c), c.Params("id"), a); err != nil {
		return err
	}
	return c.SendStatus(204)
}
func (h *Handler) disconnect(c fiber.Ctx) error      { return h.doDisconnect(c, false) }
func (h *Handler) adminDisconnect(c fiber.Ctx) error { return h.doDisconnect(c, true) }
func (h *Handler) doUsers(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.ListUsers(ctx, claims(c), c.Params("id"), a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) users(c fiber.Ctx) error      { return h.doUsers(c, false) }
func (h *Handler) adminUsers(c fiber.Ctx) error { return h.doUsers(c, true) }
func (h *Handler) doRevoke(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	id, err := strconv.ParseInt(c.Params("telegramUserId"), 10, 64)
	if err != nil {
		return app.NewError("VALIDATION_ERROR", "Telegram user ID is invalid.", 400)
	}
	ctx, x := timeout(c)
	defer x()
	if err = h.Telegram.RevokeSeller(ctx, claims(c), c.Params("id"), id, a); err != nil {
		return err
	}
	return c.SendStatus(204)
}
func (h *Handler) revoke(c fiber.Ctx) error      { return h.doRevoke(c, false) }
func (h *Handler) adminRevoke(c fiber.Ctx) error { return h.doRevoke(c, true) }
func (h *Handler) doOrders(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.ListOrders(ctx, claims(c), c.Query("connection_id"), a)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) orders(c fiber.Ctx) error      { return h.doOrders(c, false) }
func (h *Handler) adminOrders(c fiber.Ctx) error { return h.doOrders(c, true) }
func (h *Handler) adminGroupOrders(c fiber.Ctx) error {
	if err := admin(c); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.ListOrders(ctx, claims(c), c.Params("id"), true)
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) adminAudit(c fiber.Ctx) error {
	if err := admin(c); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	v, err := h.Telegram.ListAudit(ctx, claims(c), c.Params("id"))
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) adminRetrySync(c fiber.Ctx) error {
	if err := admin(c); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	if err := h.Telegram.RetrySynchronization(ctx, claims(c), c.Params("id")); err != nil {
		return err
	}
	return c.SendStatus(204)
}
func (h *Handler) transition(c fiber.Ctx, a bool, confirm bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, x := timeout(c)
	defer x()
	var v tdto.Order
	var err error
	if confirm {
		v, err = h.Telegram.ConfirmTelegramOrder(ctx, claims(c), c.Params("orderId"), a)
	} else {
		v, err = h.Telegram.CancelTelegramOrder(ctx, claims(c), c.Params("orderId"), a)
	}
	if err != nil {
		return err
	}
	return envelope(c, v)
}
func (h *Handler) confirm(c fiber.Ctx) error      { return h.transition(c, false, true) }
func (h *Handler) cancel(c fiber.Ctx) error       { return h.transition(c, false, false) }
func (h *Handler) adminConfirm(c fiber.Ctx) error { return h.transition(c, true, true) }
func (h *Handler) adminCancel(c fiber.Ctx) error  { return h.transition(c, true, false) }

var _ = tapp.ParseTelegramUserID

func (h *Handler) doAutoConfirm(c fiber.Ctx, a bool) error {
	if a {
		if err := admin(c); err != nil {
			return err
		}
	} else if err := h.permission(c, "tenant.write"); err != nil {
		return err
	}
	var q tdto.AutoConfirmRequest
	if err := c.Bind().JSON(&q); err != nil || q.AutoConfirmOrders == nil {
		return app.NewError("VALIDATION_ERROR", "auto_confirm_orders must be a boolean.", 400)
	}
	ctx, cancel := timeout(c)
	defer cancel()
	g, err := h.Telegram.SetAutoConfirm(ctx, claims(c), c.Params("id"), *q.AutoConfirmOrders, a)
	if err != nil {
		return err
	}
	return envelope(c, g)
}
func (h *Handler) autoConfirm(c fiber.Ctx) error      { return h.doAutoConfirm(c, false) }
func (h *Handler) adminAutoConfirm(c fiber.Ctx) error { return h.doAutoConfirm(c, true) }
