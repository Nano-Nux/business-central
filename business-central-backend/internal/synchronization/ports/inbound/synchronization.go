package inbound

import (
	"context"

	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/synchronization/application/dto"
)

type Synchronization interface {
	RegisterDevice(context.Context, *authdto.Claims, dto.RegisterDeviceRequest) (dto.Handshake, error)
	Push(context.Context, *authdto.Claims, dto.PushRequest) (dto.PushResponse, error)
	ResolveConflict(context.Context, *authdto.Claims, string, dto.ResolveConflictRequest) (dto.ConflictResolution, error)
	Pull(context.Context, *authdto.Claims, dto.PullRequest) (dto.PullResponse, error)
}
