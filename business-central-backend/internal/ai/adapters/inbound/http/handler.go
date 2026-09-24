package http

import (
	"context"
	"encoding/base64"
	"io"
	"strconv"
	"time"

	"business-central-backend/internal/ai/domain"
	aiinbound "business-central-backend/internal/ai/ports/inbound"
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	authinbound "business-central-backend/internal/auth/ports/inbound"
	"github.com/gofiber/fiber/v3"
)

type Handler struct {
	AI            aiinbound.AIService
	Authorization authinbound.Authentication
}

func NewHandler(ai aiinbound.AIService, auth authinbound.Authentication) *Handler {
	return &Handler{
		AI:            ai,
		Authorization: auth,
	}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Post("/ai/chat", h.chat)
	r.Get("/ai/conversations", h.listConversations)
	r.Post("/ai/conversations", h.createConversation)
	r.Get("/ai/conversations/:id/messages", h.getConversationMessages)
	r.Delete("/ai/conversations/:id", h.deleteConversation)
	r.Post("/ai/transcribe", h.transcribe)
	r.Get("/ai/usage", h.getUsage)

	// Platform Admin AI maintenance routes
	r.Get("/admin/ai/stats", h.getAdminAIStats)
	r.Post("/admin/ai/purge", h.purgeAIMessages)
	r.Get("/admin/ai/deletion-logs", h.listAIDeletionLogs)
}

func (h *Handler) getUsage(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	usage, err := h.AI.GetAIUsage(ctx, cl)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": usage,
		"meta": map[string]any{},
	})
}

func (h *Handler) chat(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	var req domain.ChatRequest
	if err := c.Bind().JSON(&req); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	if req.ShopID == nil && c.Query("shop_id") != "" {
		sid := c.Query("shop_id")
		req.ShopID = &sid
	}

	ctx, cancel := context.WithTimeout(c.Context(), 90*time.Second)
	defer cancel()

	resp, err := h.AI.SendMessage(ctx, cl, req)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": resp,
		"meta": map[string]any{},
	})
}

func (h *Handler) listConversations(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	var shopID *string
	if s := c.Query("shop_id"); s != "" {
		shopID = &s
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	conversations, err := h.AI.ListConversations(ctx, cl, shopID, limit)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": conversations,
		"meta": map[string]any{
			"total": len(conversations),
		},
	})
}

func (h *Handler) createConversation(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	var body struct {
		Title  string  `json:"title"`
		ShopID *string `json:"shop_id"`
	}
	_ = c.Bind().JSON(&body)
	if body.ShopID == nil && c.Query("shop_id") != "" {
		sid := c.Query("shop_id")
		body.ShopID = &sid
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	conv, err := h.AI.CreateConversation(ctx, cl, body.Title, body.ShopID)
	if err != nil {
		return err
	}

	return c.Status(201).JSON(map[string]any{
		"data": conv,
		"meta": map[string]any{},
	})
}

func (h *Handler) getConversationMessages(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	id := c.Params("id")
	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	conv, messages, err := h.AI.GetConversation(ctx, cl, id)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": map[string]any{
			"conversation": conv,
			"messages":     messages,
		},
		"meta": map[string]any{
			"total_messages": len(messages),
		},
	})
}

func (h *Handler) deleteConversation(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	id := c.Params("id")
	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	if err := h.AI.DeleteConversation(ctx, cl, id); err != nil {
		return err
	}

	return c.SendStatus(204)
}

func (h *Handler) transcribe(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	var audioBytes []byte
	var mimeType string

	// Check if uploaded as multipart file
	fileHeader, err := c.FormFile("audio")
	if err == nil && fileHeader != nil {
		mimeType = fileHeader.Header.Get("Content-Type")
		file, err := fileHeader.Open()
		if err != nil {
			return app.NewError("VALIDATION_ERROR", "Failed to open uploaded audio file.", 400)
		}
		defer file.Close()
		audioBytes, err = io.ReadAll(file)
		if err != nil {
			return app.NewError("VALIDATION_ERROR", "Failed to read uploaded audio file.", 400)
		}
	} else {
		// Fallback to JSON payload
		var req struct {
			AudioBase64 string `json:"audio_base64"`
			MimeType    string `json:"mime_type"`
		}
		if err := c.Bind().JSON(&req); err != nil || req.AudioBase64 == "" {
			return app.NewError("VALIDATION_ERROR", "Audio file or base64 audio is required.", 400)
		}
		decoded, err := base64.StdEncoding.DecodeString(req.AudioBase64)
		if err != nil {
			return app.NewError("VALIDATION_ERROR", "Invalid base64 audio.", 400)
		}
		audioBytes = decoded
		mimeType = req.MimeType
	}

	if mimeType == "" {
		mimeType = "audio/webm"
	}

	ctx, cancel := context.WithTimeout(c.Context(), 45*time.Second)
	defer cancel()

	transcribed, err := h.AI.Transcribe(ctx, cl, audioBytes, mimeType)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": map[string]string{
			"text": transcribed,
		},
		"meta": map[string]any{},
	})
}

func (h *Handler) getAdminAIStats(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	stats, err := h.AI.GetAdminAIStats(ctx, cl)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": stats,
		"meta": map[string]any{},
	})
}

func (h *Handler) purgeAIMessages(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}
	ctx, cancel := context.WithTimeout(c.Context(), 60*time.Second)
	defer cancel()

	res, err := h.AI.PurgeAllAIChats(ctx, cl)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": res,
		"meta": map[string]any{},
	})
}

func (h *Handler) listAIDeletionLogs(c fiber.Ctx) error {
	cl := claims(c)
	if cl == nil {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}
	limit := 50
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	ctx, cancel := contextWithTimeout(c)
	defer cancel()

	logs, err := h.AI.ListAIDeletionLogs(ctx, cl, limit)
	if err != nil {
		return err
	}

	return c.JSON(map[string]any{
		"data": logs,
		"meta": map[string]any{
			"total": len(logs),
		},
	})
}

func contextWithTimeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 30*time.Second)
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}
