package outbound

import "context"

type actorContextKey struct{}

// WithActor carries authenticated identity to repository metadata transactions.
// It is never populated from model output or tool arguments.
func WithActor(ctx context.Context, identityID string) context.Context {
	return context.WithValue(ctx, actorContextKey{}, identityID)
}
func ActorIdentity(ctx context.Context) string {
	id, _ := ctx.Value(actorContextKey{}).(string)
	return id
}
