package outbound

import (
	"business-central-backend/internal/ai/domain"
	"context"
)

type Repository interface {
	CreateConversation(ctx context.Context, merchantID, membershipID string, shopID *string, title string) (domain.Conversation, error)
	GetConversation(ctx context.Context, merchantID, membershipID, id string) (domain.Conversation, error)
	ListConversations(ctx context.Context, merchantID, membershipID string, shopID *string, limit int) ([]domain.Conversation, error)
	UpdateConversationTitle(ctx context.Context, merchantID, membershipID, id, title string) error
	DeleteConversation(ctx context.Context, merchantID, membershipID, id string) error

	SaveMessage(ctx context.Context, msg domain.Message) (domain.Message, error)
	ListMessages(ctx context.Context, merchantID, membershipID, conversationID string) ([]domain.Message, error)

	ExecuteReadOnlyQuery(ctx context.Context, merchantID, membershipID, shopID, userID string, query domain.ReadQuery, isStaff bool) ([]map[string]any, error)
	ReadCatalog(isStaff bool) []domain.ReadDataset
	AuthorizeShop(ctx context.Context, merchantID, membershipID, shopID string) error
	IsAIAssistantEnabled(ctx context.Context, merchantID string) (bool, error)
	GetMerchantContext(ctx context.Context, merchantID string) (currency string, merchantName string, err error)
	GetShopContext(ctx context.Context, merchantID, shopID string) (shopName string, shopCode string, err error)

	GetAdminAIStats(ctx context.Context) (domain.AIAdminStats, error)
	PurgeAllAIChats(ctx context.Context, adminIdentityID string) (domain.PurgeAIResult, error)
	ListAIDeletionLogs(ctx context.Context, limit int) ([]domain.AIDeletionLog, error)

	GetAIUsage(ctx context.Context, merchantID string) (usageCount int, usageLimit int, err error)
	IncrementAIUsage(ctx context.Context, merchantID string) (newCount int, err error)
}
