package valueobjects

import "strings"

type Slug string

func NewSlug(value string) Slug { return Slug(strings.ToLower(strings.TrimSpace(value))) }
func (s Slug) String() string   { return string(s) }
