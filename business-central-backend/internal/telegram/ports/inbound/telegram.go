package inbound

import (
	"context"

	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
)

type Telegram interface {
	WebhookStatus(context.Context) (tdto.WebhookStatus, error)
	RegisterWebhook(context.Context, string) (tdto.WebhookStatus, error)
	BotInfo() tdto.BotInfo
	ValidateWebhookSecret(string) bool
	HandleUpdate(context.Context, tdto.TelegramUpdate) error
	CreatePairingCode(context.Context, *authdto.Claims, string) (tdto.PairingCode, error)
	RotatePairingCode(context.Context, *authdto.Claims, string, bool) (tdto.PairingCode, error)
	ListGroups(context.Context, *authdto.Claims, string, bool) ([]tdto.Group, error)
	GetGroup(context.Context, *authdto.Claims, string, bool) (tdto.Group, error)
	RefreshGroup(context.Context, *authdto.Claims, string, bool) (tdto.Group, error)
	SetGroupStatus(context.Context, *authdto.Claims, string, string, bool) (tdto.Group, error)
	DisconnectGroup(context.Context, *authdto.Claims, string, bool) error
	ListUsers(context.Context, *authdto.Claims, string, bool) ([]tdto.GroupUser, error)
	RevokeSeller(context.Context, *authdto.Claims, string, int64, bool) error
	ListOrders(context.Context, *authdto.Claims, string, bool) ([]tdto.Order, error)
	ConfirmTelegramOrder(context.Context, *authdto.Claims, string, bool) (tdto.Order, error)
	CancelTelegramOrder(context.Context, *authdto.Claims, string, bool) (tdto.Order, error)
	ListAudit(context.Context, *authdto.Claims, string) ([]tdto.AuditEvent, error)
	RetrySynchronization(context.Context, *authdto.Claims, string) error
}
