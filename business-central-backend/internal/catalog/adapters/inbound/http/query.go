package http

import (
	"strconv"
	"strings"

	"business-central-backend/internal/app"
	"github.com/gofiber/fiber/v3"
)

func catalogPtr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func catalogBool(value bool) string { return strconv.FormatBool(value) }

func listQuery(c fiber.Ctx) app.ListQuery {
	return app.NewListQuery(c.Query("query"), c.Query("filter"), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
}

func catalogListPage[T any](c fiber.Ctx, items []T, q app.ListQuery, matches func(T, app.ListQuery) bool) error {
	return c.JSON(app.Paginate(items, q, matches))
}

func catalogMatches(q app.ListQuery, fields map[string]string) bool {
	if q.Search != "" {
		found := false
		for _, value := range fields {
			if strings.Contains(strings.ToLower(value), strings.ToLower(q.Search)) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	for key, expected := range q.Filters {
		if value, ok := fields[key]; ok && !strings.EqualFold(value, expected) {
			return false
		}
	}
	return true
}
