package application

import (
	"context"
	"regexp"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/synchronization/application/dto"
	"business-central-backend/internal/synchronization/ports/inbound"
	"business-central-backend/internal/synchronization/ports/outbound"
	"github.com/google/uuid"
)

const defaultScope = "merchant"

var payloadHashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Service struct{ repository outbound.Repository }

func NewService(repository outbound.Repository) *Service { return &Service{repository: repository} }

var _ inbound.Synchronization = (*Service)(nil)

func (s *Service) RegisterDevice(ctx context.Context, claims *authdto.Claims, request dto.RegisterDeviceRequest) (dto.Handshake, error) {
	if claims == nil || strings.TrimSpace(claims.MerchantID) == "" {
		return dto.Handshake{}, app.NewError("UNAUTHENTICATED", "A merchant session is required.", 401)
	}
	if _, err := uuid.Parse(claims.MerchantID); err != nil {
		return dto.Handshake{}, app.NewError("INVALID_MERCHANT", "The merchant context is invalid.", 400)
	}
	request.DeviceIdentifier = strings.TrimSpace(request.DeviceIdentifier)
	request.DeviceName = strings.TrimSpace(request.DeviceName)
	request.ClientSessionKey = strings.TrimSpace(request.ClientSessionKey)
	request.Scope = strings.TrimSpace(request.Scope)
	if request.Scope == "" {
		request.Scope = defaultScope
	}
	if request.DeviceIdentifier == "" || request.ClientSessionKey == "" {
		return dto.Handshake{}, app.Validation("Device identifier and client session key are required.", nil)
	}
	if len(request.DeviceIdentifier) > 255 || len(request.ClientSessionKey) > 255 || len(request.Scope) > 100 {
		return dto.Handshake{}, app.Validation("The synchronization identifiers are too long.", nil)
	}
	return s.repository.RegisterDevice(ctx, claims, request)
}

func (s *Service) Push(ctx context.Context, claims *authdto.Claims, request dto.PushRequest) (dto.PushResponse, error) {
	if claims == nil || strings.TrimSpace(claims.MerchantID) == "" {
		return dto.PushResponse{}, app.NewError("UNAUTHENTICATED", "A merchant session is required.", 401)
	}
	if _, err := uuid.Parse(strings.TrimSpace(request.SessionID)); err != nil {
		return dto.PushResponse{}, app.Validation("A valid synchronization session is required.", nil)
	}
	if len(request.Operations) == 0 {
		return dto.PushResponse{Results: []dto.OperationResult{}}, nil
	}
	if len(request.Operations) > 100 {
		return dto.PushResponse{}, app.Validation("A synchronization batch may contain at most 100 operations.", nil)
	}
	for index := range request.Operations {
		op := &request.Operations[index]
		op.ClientOperationID = strings.TrimSpace(op.ClientOperationID)
		op.EntityType = strings.ToUpper(strings.TrimSpace(op.EntityType))
		op.EntityID = strings.TrimSpace(op.EntityID)
		op.OperationType = strings.ToUpper(strings.TrimSpace(op.OperationType))
		op.PayloadHash = strings.ToLower(strings.TrimSpace(op.PayloadHash))
		op.DependencyOperationID = strings.TrimSpace(op.DependencyOperationID)
		if op.Payload == nil || len(op.Payload) == 0 {
			op.Payload = []byte(`{}`)
		}
		if op.ClientOperationID == "" || len(op.ClientOperationID) > 255 {
			return dto.PushResponse{}, app.Validation("Each operation needs a client operation identifier.", map[string]any{"index": index})
		}
		if _, err := uuid.Parse(op.EntityID); err != nil {
			return dto.PushResponse{}, app.Validation("Each operation needs a valid entity identifier.", map[string]any{"index": index})
		}
		if op.OperationType != "CREATE" && op.OperationType != "UPDATE" && op.OperationType != "DELETE" {
			return dto.PushResponse{}, app.Validation("Operation type must be CREATE, UPDATE, or DELETE.", map[string]any{"index": index})
		}
		if len(op.EntityType) == 0 || len(op.EntityType) > 100 {
			return dto.PushResponse{}, app.Validation("Each operation needs a valid entity type.", map[string]any{"index": index})
		}
		if op.PayloadHash != "" && !payloadHashPattern.MatchString(op.PayloadHash) {
			return dto.PushResponse{}, app.Validation("Payload hash must be a lowercase SHA-256 value.", map[string]any{"index": index})
		}
		if len(op.DependencyOperationID) > 255 {
			return dto.PushResponse{}, app.Validation("The dependency operation identifier is too long.", map[string]any{"index": index})
		}
		if op.DependencyOperationID == op.ClientOperationID {
			return dto.PushResponse{}, app.Validation("An operation cannot depend on itself.", map[string]any{"index": index})
		}
	}
	return s.repository.Push(ctx, claims, request)
}

func (s *Service) ResolveConflict(ctx context.Context, claims *authdto.Claims, operationID string, request dto.ResolveConflictRequest) (dto.ConflictResolution, error) {
	if claims == nil || strings.TrimSpace(claims.MerchantID) == "" {
		return dto.ConflictResolution{}, app.NewError("UNAUTHENTICATED", "A merchant session is required.", 401)
	}
	operationID = strings.TrimSpace(operationID)
	if _, err := uuid.Parse(operationID); err != nil {
		return dto.ConflictResolution{}, app.Validation("A valid server operation identifier is required.", nil)
	}
	request.Strategy = strings.ToUpper(strings.TrimSpace(request.Strategy))
	if request.Strategy != "KEEP_SERVER" && request.Strategy != "APPLY_CLIENT" {
		return dto.ConflictResolution{}, app.Validation("Conflict strategy must be KEEP_SERVER or APPLY_CLIENT.", nil)
	}
	return s.repository.ResolveConflict(ctx, claims, operationID, request)
}

func (s *Service) Pull(ctx context.Context, claims *authdto.Claims, request dto.PullRequest) (dto.PullResponse, error) {
	if claims == nil || strings.TrimSpace(claims.MerchantID) == "" {
		return dto.PullResponse{}, app.NewError("UNAUTHENTICATED", "A merchant session is required.", 401)
	}
	if _, err := uuid.Parse(strings.TrimSpace(request.SessionID)); err != nil {
		return dto.PullResponse{}, app.Validation("A valid synchronization session is required.", nil)
	}
	if request.AfterSequence < 0 {
		return dto.PullResponse{}, app.Validation("The synchronization checkpoint cannot be negative.", nil)
	}
	if request.Limit == 0 {
		request.Limit = 100
	}
	if request.Limit < 1 || request.Limit > 500 {
		return dto.PullResponse{}, app.Validation("Synchronization pull limit must be between 1 and 500.", nil)
	}
	request.Scope = strings.TrimSpace(request.Scope)
	if request.Scope == "" {
		request.Scope = defaultScope
	}
	return s.repository.Pull(ctx, claims, request)
}
