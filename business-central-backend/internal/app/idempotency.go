package app

import "context"

type idempotencyKeyContext struct{}

// WithIdempotencyKey carries the HTTP Idempotency-Key header through the
// application boundary without changing every inbound port signature.
func WithIdempotencyKey(ctx context.Context, key string) context.Context {
	return context.WithValue(ctx, idempotencyKeyContext{}, key)
}

func IdempotencyKey(ctx context.Context) string {
	key, _ := ctx.Value(idempotencyKeyContext{}).(string)
	return key
}
