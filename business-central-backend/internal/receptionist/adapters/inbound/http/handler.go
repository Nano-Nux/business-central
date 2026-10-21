package http

import (
	"context"
	"crypto/subtle"
	"net/url"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/receptionist/application"
	"business-central-backend/internal/receptionist/domain"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/google/uuid"
)

type Handler struct {
	Service               *application.Service
	AdminURL, CallbackURL string
}

func (h *Handler) RegisterPublicRoutes(r fiber.Router) {
	r.Get("/public/receptionist/google/callback", h.callback)
	r.Get("/public/receptionist/google/start", limiter.New(limiter.Config{Max: 10, Expiration: time.Minute}), h.oauthStart)
	limited := r.Group("/public/receptionist", limiter.New(limiter.Config{Max: 30, Expiration: time.Minute}), func(c fiber.Ctx) error {
		c.Set("Cache-Control", "no-store")
		if len(c.Body()) > 8192 {
			return app.NewError("PAYLOAD_TOO_LARGE", "The request is too large.", 413)
		}
		return c.Next()
	})
	limited.Get("/status", h.status)
	limited.Post("/conversations", limiter.New(limiter.Config{Max: 5, Expiration: time.Minute}), h.start)
	limited.Get("/conversations/:id", h.conversation)
	limited.Post("/conversations/:id/messages", h.chat)
	limited.Post("/conversations/:id/slots", h.slots)
	limited.Post("/conversations/:id/bookings", h.book)
}
func (h *Handler) RegisterAdminRoutes(r fiber.Router) {
	a := r.Group("/admin/receptionist", func(c fiber.Ctx) error {
		cl, _ := c.Locals("claims").(*authdto.Claims)
		if cl == nil || !cl.PlatformAdmin {
			return app.NewError("FORBIDDEN", "Platform administrator access is required.", 403)
		}
		c.Set("Cache-Control", "no-store")
		return c.Next()
	})
	a.Get("/settings", h.settings)
	a.Put("/settings", h.saveSettings)
	a.Post("/google/connect", h.connect)
	a.Delete("/google/connection", h.disconnect)
	a.Get("/conversations", h.listConversations)
	a.Get("/conversations/:id", h.adminConversation)
	a.Get("/bookings", h.listBookings)
	a.Get("/bookings/:id", h.adminBooking)
}
func result(c fiber.Ctx, data any, err error) error {
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"data": data})
}
func deadline(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 90*time.Second)
}
func bearer(c fiber.Ctx) string {
	parts := strings.Fields(c.Get("Authorization"))
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return parts[1]
	}
	return ""
}
func validID(c fiber.Ctx) error {
	if _, err := uuid.Parse(c.Params("id")); err != nil {
		return app.NewError("NOT_FOUND", "Record not found.", 404)
	}
	return nil
}
func (h *Handler) status(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	s, e := h.Service.Settings(ctx)
	if e != nil {
		return e
	}
	return result(c, fiber.Map{"enabled": s.Enabled, "greeting": s.Greeting, "timezone": s.Timezone, "calendar_connected": s.CalendarConnected}, nil)
}
func (h *Handler) start(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	conversation, token, e := h.Service.Start(ctx)
	return result(c, fiber.Map{"conversation": conversation, "token": token}, e)
}
func (h *Handler) conversation(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.Get(ctx, c.Params("id"), bearer(c))
	return result(c, v, e)
}
func (h *Handler) chat(c fiber.Ctx) error {
	var req struct {
		Message string `json:"message"`
	}
	if e := c.Bind().JSON(&req); e != nil {
		return app.NewError("VALIDATION_ERROR", "Invalid message request.", 400)
	}
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.Chat(ctx, c.Params("id"), bearer(c), req.Message)
	return result(c, v, e)
}
func (h *Handler) slots(c fiber.Ctx) error {
	var req struct {
		Date string `json:"date"`
	}
	if e := c.Bind().JSON(&req); e != nil {
		return app.NewError("VALIDATION_ERROR", "Invalid date request.", 400)
	}
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.Slots(ctx, c.Params("id"), bearer(c), req.Date)
	return result(c, v, e)
}
func (h *Handler) book(c fiber.Ctx) error {
	var req domain.BookRequest
	if e := c.Bind().JSON(&req); e != nil {
		return app.NewError("VALIDATION_ERROR", "Invalid booking request.", 400)
	}
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.Book(ctx, c.Params("id"), bearer(c), req)
	return result(c, v, e)
}
func (h *Handler) settings(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.Settings(ctx)
	return result(c, v, e)
}
func (h *Handler) saveSettings(c fiber.Ctx) error {
	if len(c.Body()) > 32000 {
		return app.NewError("PAYLOAD_TOO_LARGE", "Settings are too large.", 413)
	}
	var s domain.Settings
	if e := c.Bind().JSON(&s); e != nil {
		return app.NewError("VALIDATION_ERROR", "Invalid settings request.", 400)
	}
	ctx, cancel := deadline(c)
	defer cancel()
	if e := h.Service.SaveSettings(ctx, s); e != nil {
		return e
	}
	return h.settings(c)
}
func page(c fiber.Ctx) (limit, offset int) {
	limit, _ = strconv.Atoi(c.Query("limit"))
	offset, _ = strconv.Atoi(c.Query("offset"))
	if limit < 1 || limit > 100 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}
	return
}
func (h *Handler) listConversations(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	limit, offset := page(c)
	v, total, e := h.Service.ListConversations(ctx, limit, offset)
	if e != nil {
		return e
	}
	return c.JSON(fiber.Map{"data": v, "meta": fiber.Map{"total": total, "limit": limit, "offset": offset}})
}
func (h *Handler) adminConversation(c fiber.Ctx) error {
	if e := validID(c); e != nil {
		return e
	}
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.ConversationDetail(ctx, c.Params("id"))
	return result(c, v, e)
}
func (h *Handler) listBookings(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	limit, offset := page(c)
	status := c.Query("status")
	if status != "" && status != "PENDING" && status != "CONFIRMED" && status != "FAILED" {
		return app.NewError("VALIDATION_ERROR", "Unknown booking status.", 400)
	}
	v, total, e := h.Service.ListBookings(ctx, limit, offset, status)
	if e != nil {
		return e
	}
	return c.JSON(fiber.Map{"data": v, "meta": fiber.Map{"total": total, "limit": limit, "offset": offset}})
}
func (h *Handler) adminBooking(c fiber.Ctx) error {
	if e := validID(c); e != nil {
		return e
	}
	ctx, cancel := deadline(c)
	defer cancel()
	v, e := h.Service.BookingDetail(ctx, c.Params("id"))
	return result(c, v, e)
}
func (h *Handler) connect(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	_, state, e := h.Service.BeginOAuth(ctx)
	if e != nil {
		return e
	}
	base := strings.TrimSuffix(h.CallbackURL, "/callback")
	return result(c, fiber.Map{"url": base + "/start?state=" + url.QueryEscape(state)}, nil)
}
func (h *Handler) oauthStart(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	c.Set("Referrer-Policy", "no-referrer")
	ctx, cancel := deadline(c)
	defer cancel()
	state := c.Query("state")
	link, e := h.Service.OAuthURL(ctx, state)
	if e != nil {
		return e
	}
	c.Cookie(&fiber.Cookie{Name: "bc_receptionist_oauth", Value: state, HTTPOnly: true, Secure: strings.HasPrefix(h.CallbackURL, "https://"), SameSite: "Lax", Path: "/api/v1/public/receptionist/google/callback", MaxAge: 600})
	return c.Redirect().To(link)
}
func (h *Handler) disconnect(c fiber.Ctx) error {
	ctx, cancel := deadline(c)
	defer cancel()
	return result(c, fiber.Map{"connected": false}, h.Service.Disconnect(ctx))
}
func (h *Handler) callback(c fiber.Ctx) error {
	c.Set("Cache-Control", "no-store")
	c.Set("Referrer-Policy", "no-referrer")
	state := c.Query("state")
	cookie := c.Cookies("bc_receptionist_oauth")
	// Google redirects back to this origin, so a host-only Lax cookie can bind
	// the callback to the administrator who started the connection.
	if len(state) != 43 || subtle.ConstantTimeCompare([]byte(state), []byte(cookie)) != 1 {
		return app.NewError("INVALID_STATE", "Start the Google connection again from Admin.", 400)
	}
	c.Cookie(&fiber.Cookie{Name: "bc_receptionist_oauth", Value: "", HTTPOnly: true, Secure: strings.HasPrefix(h.CallbackURL, "https://"), SameSite: "Lax", Path: "/api/v1/public/receptionist/google/callback", MaxAge: -1})
	ctx, cancel := deadline(c)
	defer cancel()
	e := h.Service.CompleteOAuth(ctx, state, c.Query("code"))
	if e != nil {
		return e
	}
	u, e := url.Parse(h.AdminURL)
	if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return c.SendString("Google Calendar connected. Return to Admin and refresh Receptionist settings.")
	}
	q := u.Query()
	q.Set("calendar", "connected")
	u.RawQuery = q.Encode()
	return c.Redirect().To(u.String())
}
