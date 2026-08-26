package http

import (
	"business-central-backend/internal/app"
	"github.com/gofiber/fiber/v3"
	"strconv"
	"strings"
)

func operationsPtr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func operationsBool(value bool) string { return strconv.FormatBool(value) }

func listQuery(c fiber.Ctx) app.ListQuery {
	return app.NewListQuery(c.Query("query"), c.Query("filter"), app.ParsePageIndex(c.Query("page_index"), c.Query("page")), app.ParsePageSize(c.Query("page_size")))
}
func operationsListPage[T any](c fiber.Ctx, items []T, q app.ListQuery, matches func(T, app.ListQuery) bool) error {
	return c.JSON(app.Paginate(items, q, matches))
}
func operationsMatches(q app.ListQuery, fields map[string]string) bool {
	if q.Search != "" {
		found := false
		for _, v := range fields {
			if strings.Contains(strings.ToLower(v), strings.ToLower(q.Search)) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	for k, v := range q.Filters {
		if actual, ok := fields[k]; ok && !strings.EqualFold(actual, v) {
			return false
		}
	}
	return true
}
