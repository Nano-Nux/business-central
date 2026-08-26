package http

const (
	HandshakeRoute       = "/sync/handshake"
	PushRoute            = "/sync/push"
	PullRoute            = "/sync/pull"
	ResolveConflictRoute = "/sync/conflicts/:operationId/resolve"
)
