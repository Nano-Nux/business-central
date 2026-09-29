package outbound

import (
	"context"
	"time"

	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/domain"
)

type ConnectionInput struct {
	CodeHash                            string
	ChatID                              int64
	Title, Type, Username               string
	CreatorUserID                       int64
	CreatorDisplayName, CreatorUsername string
	BotStatus                           string
	BotIsAdmin                          bool
	BotPermissions                      map[string]any
	MemberCount                         *int
}

type DraftInput struct {
	ConnectionID                        string
	ChatID, MessageID, UserID, UpdateID int64
	OriginalCommand, CustomerName       string
	Items                               []domain.TakeOrderItem
	ExpiresAt                           time.Time
	ConfirmTokenHash, CancelTokenHash   string
}

type DraftResult struct {
	Order             tdto.Order
	ConfirmCallbackID string
	CancelCallbackID  string
}

type CallbackResolution struct {
	MerchantID, ConnectionID, OrderID, Action, CurrentStatus string
	ChatID, BotResponseMessageID                             int64
}
type OutboxDelivery struct {
	ReplyToMessageID             int64
	EventID, OrderNumber, Status string
	ChatID, MessageID            int64
	Order                        tdto.Order
}

type Repository interface {
	CreatePairingCode(context.Context, *authdto.Claims, string, string, time.Time) (tdto.PairingCode, error)
	ListGroups(context.Context, *authdto.Claims, string, bool) ([]tdto.Group, error)
	GetGroup(context.Context, *authdto.Claims, string, bool) (tdto.Group, error)
	SetAutoConfirm(context.Context, *authdto.Claims, string, bool, bool) (tdto.Group, error)
	UpdateGroupStatus(context.Context, *authdto.Claims, string, string, bool) (tdto.Group, error)
	DisconnectGroup(context.Context, *authdto.Claims, string, bool) error
	ListUsers(context.Context, *authdto.Claims, string, bool) ([]tdto.GroupUser, error)
	RevokeSeller(context.Context, *authdto.Claims, string, int64, bool) error
	ListOrders(context.Context, *authdto.Claims, string, bool) ([]tdto.Order, error)
	BeginUpdate(context.Context, int64, string) (bool, error)
	CompleteUpdate(context.Context, int64, error) error
	ExpireDrafts(context.Context) error
	ConnectGroup(context.Context, ConnectionInput) (tdto.Group, error)
	FindConnectionByChat(context.Context, int64) (tdto.Group, error)
	ObserveUser(context.Context, string, tdto.User, string) (bool, error)
	CreateDraft(context.Context, DraftInput) (DraftResult, error)
	StoreBotResponse(context.Context, string, int64) error
	ResolveCallback(context.Context, string, int64, int64) (CallbackResolution, error)
	FindOrderForCancellation(context.Context, int64, string, int64, bool) (string, error)
	TransitionOrder(context.Context, *authdto.Claims, string, string, string, int64, bool) (tdto.Order, error)
	UpdateConnectionHealth(context.Context, int64, string, bool, map[string]any, string) error
	RefreshConnection(context.Context, *authdto.Claims, string, bool, string, string, bool, map[string]any, *int, error) (tdto.Group, error)
	ClaimOutboxDeliveries(context.Context, int) ([]OutboxDelivery, error)
	FinishOutboxDelivery(context.Context, string, error) error
	ListAudit(context.Context, *authdto.Claims, string) ([]tdto.AuditEvent, error)
	RetrySynchronization(context.Context, *authdto.Claims, string) error
}

type SentMessage struct {
	MessageID int64 `json:"message_id"`
}
type ChatInfo struct {
	ID                    int64
	Type, Title, Username string
}
type MemberInfo struct {
	Status      string
	IsAdmin     bool
	Permissions map[string]any
}
type AdministratorInfo struct {
	User tdto.User
	Role string
}

type Provider interface {
	Configured() bool
	GetWebhookInfo(context.Context) (tdto.WebhookInfo, error)
	SetWebhook(context.Context, string, string) error
	SendReply(context.Context, int64, int64, string, string, string) (SentMessage, error)
	EditOrderMessage(context.Context, int64, int64, string) error
	AnswerCallback(context.Context, string, string, bool) error
	GetChat(context.Context, int64) (ChatInfo, error)
	GetChatMember(context.Context, int64, int64) (MemberInfo, error)
	GetBotMember(context.Context, int64) (MemberInfo, error)
	GetMemberCount(context.Context, int64) (int, error)
	GetAdministrators(context.Context, int64) ([]AdministratorInfo, error)
}
