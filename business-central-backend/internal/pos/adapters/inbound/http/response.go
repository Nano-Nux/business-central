package http

type Response[T any] struct {
	Data T   `json:"data"`
	Meta any `json:"meta,omitempty"`
}
