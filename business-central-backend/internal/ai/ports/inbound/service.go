package inbound

import (
	"business-central-backend/internal/ai/domain"
	authdto "business-central-backend/internal/auth/application/dto"
	"context"
)

type AIService interface {
	SendMessage(ctx context.Context, claims *authdto.Claims, req domain.ChatRequest) (domain.ChatResponse, error)
	ListConversations(ctx context.Context, claims *authdto.Claims, shopID *string, limit int) ([]domain.Conversation, error)
	GetConversation(ctx context.Context, claims *authdto.Claims, conversationID string, shopID *string) (domain.Conversation, []domain.Message, error)
	CreateConversation(ctx context.Context, claims *authdto.Claims, title string, shopID *string) (domain.Conversation, error)
	DeleteConversation(ctx context.Context, claims *authdto.Claims, conversationID string, shopID *string) error
	Transcribe(ctx context.Context, claims *authdto.Claims, audioBytes []byte, mimeType string, shopID *string) (string, error)

	GetAdminAIStats(ctx context.Context, claims *authdto.Claims) (domain.AIAdminStats, error)
	PurgeAllAIChats(ctx context.Context, claims *authdto.Claims) (domain.PurgeAIResult, error)
	ListAIDeletionLogs(ctx context.Context, claims *authdto.Claims, limit int) ([]domain.AIDeletionLog, error)
	GetAIUsage(ctx context.Context, claims *authdto.Claims) (domain.AIUsage, error)
}
