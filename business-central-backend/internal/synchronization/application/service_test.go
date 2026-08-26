package application

import (
	"context"
	"testing"

	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/synchronization/application/dto"
)

type fakeRepository struct {
	handshake dto.Handshake
	push      dto.PushResponse
	pull      dto.PullResponse
}

func (f *fakeRepository) RegisterDevice(context.Context, *authdto.Claims, dto.RegisterDeviceRequest) (dto.Handshake, error) {
	return f.handshake, nil
}
func (f *fakeRepository) Push(context.Context, *authdto.Claims, dto.PushRequest) (dto.PushResponse, error) {
	return f.push, nil
}
func (f *fakeRepository) Pull(context.Context, *authdto.Claims, dto.PullRequest) (dto.PullResponse, error) {
	return f.pull, nil
}
func (f *fakeRepository) ResolveConflict(context.Context, *authdto.Claims, string, dto.ResolveConflictRequest) (dto.ConflictResolution, error) {
	return dto.ConflictResolution{}, nil
}

func TestRegisterDeviceAppliesProtocolDefaults(t *testing.T) {
	repository := &fakeRepository{}
	service := NewService(repository)
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	got, err := service.RegisterDevice(context.Background(), claims, dto.RegisterDeviceRequest{
		DeviceIdentifier: " device-1 ",
		ClientSessionKey: " session-1 ",
	})
	if err != nil {
		t.Fatalf("RegisterDevice() error = %v", err)
	}
	if got.ProtocolVersion != "" {
		t.Fatalf("fake response should be returned unchanged")
	}
}

func TestPushRejectsInvalidBatchBeforeRepository(t *testing.T) {
	service := NewService(&fakeRepository{})
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	_, err := service.Push(context.Background(), claims, dto.PushRequest{SessionID: "bad"})
	if err == nil {
		t.Fatal("Push() expected validation error")
	}
}

func TestPushRejectsInvalidPayloadHash(t *testing.T) {
	service := NewService(&fakeRepository{})
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	_, err := service.Push(context.Background(), claims, dto.PushRequest{
		SessionID: "00000000-0000-0000-0000-000000000002",
		Operations: []dto.Operation{{
			ClientOperationID: "operation-1",
			EntityType:        "SHOP_SETTINGS",
			EntityID:          "00000000-0000-0000-0000-000000000003",
			OperationType:     "UPDATE",
			PayloadHash:       "not-a-sha256",
			Payload:           []byte(`{}`),
		}},
	})
	if err == nil {
		t.Fatal("Push() expected payload hash validation error")
	}
}

func TestPushRejectsSelfDependency(t *testing.T) {
	service := NewService(&fakeRepository{})
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	_, err := service.Push(context.Background(), claims, dto.PushRequest{
		SessionID: "00000000-0000-0000-0000-000000000002",
		Operations: []dto.Operation{{
			ClientOperationID:     "operation-1",
			DependencyOperationID: "operation-1",
			EntityType:            "SHOP_SETTINGS",
			EntityID:              "00000000-0000-0000-0000-000000000003",
			OperationType:         "UPDATE",
			Payload:               []byte(`{}`),
		}},
	})
	if err == nil {
		t.Fatal("Push() expected self-dependency validation error")
	}
}

func TestPullAppliesDefaultLimit(t *testing.T) {
	service := NewService(&fakeRepository{})
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	_, err := service.Pull(context.Background(), claims, dto.PullRequest{
		SessionID:     "00000000-0000-0000-0000-000000000002",
		AfterSequence: 0,
	})
	if err != nil {
		t.Fatalf("Pull() error = %v", err)
	}
}

func TestResolveConflictRejectsUnknownStrategy(t *testing.T) {
	service := NewService(&fakeRepository{})
	claims := &authdto.Claims{MerchantID: "00000000-0000-0000-0000-000000000001"}
	_, err := service.ResolveConflict(context.Background(), claims, "00000000-0000-0000-0000-000000000002", dto.ResolveConflictRequest{Strategy: "merge"})
	if err == nil {
		t.Fatal("ResolveConflict() expected strategy validation error")
	}
}
