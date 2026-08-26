package http

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/reports/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"strings"
)

type Handler struct{ inbound.Reports }

func NewHandler(useCases inbound.Reports) *Handler { return &Handler{Reports: useCases} }

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/reports/sales-summary", h.salesSummary)
	r.Get("/reports/profit-summary", h.profitSummary)
	r.Get("/reports/sales-by-day", h.salesByDay)
	r.Get("/reports/top-products", h.topProducts)
}

func query(c fiber.Ctx) app.ListQuery {
	filters := c.Query("filter")
	for _, name := range []string{"from", "to", "channel", "status", "shop_id"} {
		if value := c.Query(name); value != "" {
			if filters != "" {
				filters += ","
			}
			filters += name + ":" + value
		}
	}
	return app.NewListQuery(c.Query("query"), strings.Trim(filters, ","), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
}

func (h *Handler) salesSummary(c fiber.Ctx) error {
	result, err := h.Reports.SalesSummary(c.Context(), claims(c), query(c))
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(map[string]any{"data": result, "meta": map[string]any{}})
}

func (h *Handler) profitSummary(c fiber.Ctx) error { return h.salesSummary(c) }

func (h *Handler) salesByDay(c fiber.Ctx) error {
	items, total, err := h.Reports.SalesByDay(c.Context(), claims(c), query(c))
	if err != nil {
		return app.Internal(err)
	}
	q := query(c)
	return c.JSON(app.PageResult[any]{Data: toAny(items), Meta: app.PageMeta{PageIndex: q.PageIndex, PageSize: q.PageSize, Total: total, TotalPages: (total + q.PageSize - 1) / q.PageSize}})
}

func (h *Handler) topProducts(c fiber.Ctx) error {
	items, total, err := h.Reports.TopProducts(c.Context(), claims(c), query(c))
	if err != nil {
		return app.Internal(err)
	}
	q := query(c)
	return c.JSON(app.PageResult[any]{Data: toAny(items), Meta: app.PageMeta{PageIndex: q.PageIndex, PageSize: q.PageSize, Total: total, TotalPages: (total + q.PageSize - 1) / q.PageSize}})
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}
func toAny[T any](items []T) []any {
	result := make([]any, len(items))
	for i, item := range items {
		result[i] = item
	}
	return result
}
