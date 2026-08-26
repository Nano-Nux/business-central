package app

import (
	"strconv"
	"strings"
)

// ListQuery is the shared transport-independent contract for collection reads.
// PageIndex is zero-based. The legacy page parameter is accepted at the HTTP
// edge and normalized into this type.
type ListQuery struct {
	Search    string
	Filters   map[string]string
	PageIndex int
	PageSize  int
}

type PageMeta struct {
	PageIndex  int `json:"page_index"`
	PageSize   int `json:"page_size"`
	Total      int `json:"total"`
	TotalPages int `json:"total_pages"`
}

type PageResult[T any] struct {
	Data []T      `json:"data"`
	Meta PageMeta `json:"meta"`
}

func NewListQuery(search, rawFilter string, pageIndex, pageSize int) ListQuery {
	if pageIndex < 0 {
		pageIndex = 0
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 10
	}
	return ListQuery{
		Search:    strings.TrimSpace(search),
		Filters:   parseFilters(rawFilter),
		PageIndex: pageIndex,
		PageSize:  pageSize,
	}
}

func (q ListQuery) Filter(name string) string {
	return strings.TrimSpace(q.Filters[strings.ToLower(name)])
}

func Paginate[T any](items []T, q ListQuery, matches func(T, ListQuery) bool) PageResult[T] {
	filtered := make([]T, 0, len(items))
	for _, item := range items {
		if matches == nil || matches(item, q) {
			filtered = append(filtered, item)
		}
	}
	start := q.PageIndex * q.PageSize
	if start > len(filtered) {
		start = len(filtered)
	}
	end := start + q.PageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	totalPages := 0
	if len(filtered) > 0 {
		totalPages = (len(filtered) + q.PageSize - 1) / q.PageSize
	}
	return PageResult[T]{
		Data: filtered[start:end],
		Meta: PageMeta{PageIndex: q.PageIndex, PageSize: q.PageSize, Total: len(filtered), TotalPages: totalPages},
	}
}

func ParsePageIndex(value string, legacyPage string) int {
	if strings.TrimSpace(value) != "" {
		parsed, _ := strconv.Atoi(value)
		if parsed >= 0 {
			return parsed
		}
	}
	parsed, _ := strconv.Atoi(legacyPage)
	if parsed > 0 {
		return parsed - 1
	}
	return 0
}

func ParsePageSize(value string) int {
	parsed, _ := strconv.Atoi(value)
	if parsed < 1 || parsed > 100 {
		return 10
	}
	return parsed
}

func parseFilters(raw string) map[string]string {
	filters := map[string]string{}
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' }) {
		pair := strings.SplitN(part, "=", 2)
		if len(pair) != 2 {
			pair = strings.SplitN(part, ":", 2)
		}
		if len(pair) == 2 && strings.TrimSpace(pair[0]) != "" {
			filters[strings.ToLower(strings.TrimSpace(pair[0]))] = strings.TrimSpace(pair[1])
		}
	}
	return filters
}
