package application

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/domain"
	"business-central-backend/internal/telegram/ports/outbound"
)

const (
	pairingTTL     = 15 * time.Minute
	draftTTL       = 30 * time.Minute
	takeOrderUsage = "/takeorder [product name] quantity=<positive number> [SKU]. Product name or SKU (or both) is required. Put the name before quantity and the SKU after it. Example: /takeorder quantity=2 WC-002"
)

type Service struct {
	repo          outbound.Repository
	provider      outbound.Provider
	webhookSecret string
	botName       string
	publicBaseURL string
}

func (s *Service) RunOutbox(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.repo.ExpireDrafts(ctx)
			items, err := s.repo.ClaimOutboxDeliveries(ctx, 25)
			if err != nil {
				continue
			}
			for _, item := range items {
				var deliveryErr error
				if item.MessageID == 0 {
					deliveryErr = errors.New("Telegram response message has not been recorded")
				} else {
					deliveryErr = s.provider.EditOrderMessage(ctx, item.ChatID, item.MessageID, fmt.Sprintf("Order %s\n\nOrder No: %s\nStatus: %s", strings.ToLower(item.Status), item.OrderNumber, item.Status))
				}
				_ = s.repo.FinishOutboxDelivery(ctx, item.EventID, deliveryErr)
			}
		}
	}
}

func NewService(repo outbound.Repository, provider outbound.Provider, webhookSecret, botName string, publicBaseURL ...string) *Service {
	s := &Service{repo: repo, provider: provider, webhookSecret: webhookSecret, botName: botName}
	if len(publicBaseURL) > 0 {
		s.publicBaseURL = publicBaseURL[0]
	}
	return s
}

func (s *Service) BotInfo() tdto.BotInfo {
	return tdto.BotInfo{Username: s.botName}
}

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func randomToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func (s *Service) ValidateWebhookSecret(value string) bool {
	if s.webhookSecret == "" || len(value) != len(s.webhookSecret) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(value), []byte(s.webhookSecret)) == 1
}

func (s *Service) CreatePairingCode(ctx context.Context, claims *authdto.Claims, shopID string) (tdto.PairingCode, error) {
	code, err := randomToken(9)
	if err != nil {
		return tdto.PairingCode{}, app.Internal(err)
	}
	result, err := s.repo.CreatePairingCode(ctx, claims, shopID, hash(code), time.Now().UTC().Add(pairingTTL))
	if err != nil {
		return result, err
	}
	result.Code = code
	return result, nil
}
func (s *Service) RotatePairingCode(ctx context.Context, claims *authdto.Claims, groupID string, admin bool) (tdto.PairingCode, error) {
	g, err := s.repo.GetGroup(ctx, claims, groupID, admin)
	if err != nil {
		return tdto.PairingCode{}, err
	}
	return s.CreatePairingCode(ctx, claims, g.ShopID)
}
func (s *Service) ListGroups(ctx context.Context, c *authdto.Claims, shopID string, a bool) ([]tdto.Group, error) {
	return s.repo.ListGroups(ctx, c, shopID, a)
}
func (s *Service) GetGroup(ctx context.Context, c *authdto.Claims, id string, a bool) (tdto.Group, error) {
	return s.repo.GetGroup(ctx, c, id, a)
}
func (s *Service) SetGroupStatus(ctx context.Context, c *authdto.Claims, id, status string, a bool) (tdto.Group, error) {
	status = strings.ToUpper(strings.TrimSpace(status))
	if status != "ACTIVE" && status != "PAUSED" {
		return tdto.Group{}, app.NewError("VALIDATION_ERROR", "Status must be ACTIVE or PAUSED.", 400)
	}
	return s.repo.UpdateGroupStatus(ctx, c, id, status, a)
}
func (s *Service) DisconnectGroup(ctx context.Context, c *authdto.Claims, id string, a bool) error {
	return s.repo.DisconnectGroup(ctx, c, id, a)
}
func (s *Service) ListUsers(ctx context.Context, c *authdto.Claims, id string, a bool) ([]tdto.GroupUser, error) {
	return s.repo.ListUsers(ctx, c, id, a)
}
func (s *Service) RevokeSeller(ctx context.Context, c *authdto.Claims, id string, userID int64, a bool) error {
	return s.repo.RevokeSeller(ctx, c, id, userID, a)
}
func (s *Service) ListOrders(ctx context.Context, c *authdto.Claims, connectionID string, a bool) ([]tdto.Order, error) {
	return s.repo.ListOrders(ctx, c, connectionID, a)
}

func (s *Service) RefreshGroup(ctx context.Context, c *authdto.Claims, id string, a bool) (tdto.Group, error) {
	g, err := s.repo.GetGroup(ctx, c, id, a)
	if err != nil {
		return g, err
	}
	chat, chatErr := s.provider.GetChat(ctx, g.TelegramChatID)
	bot, botErr := s.provider.GetBotMember(ctx, g.TelegramChatID)
	var count *int
	if n, e := s.provider.GetMemberCount(ctx, g.TelegramChatID); e == nil {
		count = &n
	}
	if admins, e := s.provider.GetAdministrators(ctx, g.TelegramChatID); e == nil {
		for _, administrator := range admins {
			_, _ = s.repo.ObserveUser(ctx, g.ID, administrator.User, administrator.Role)
		}
	}
	refreshErr := chatErr
	if refreshErr == nil {
		refreshErr = botErr
	}
	if chatErr != nil {
		return s.repo.RefreshConnection(ctx, c, id, a, g.GroupTitle, g.BotMembershipStatus, g.BotAdminStatus, g.BotPermissions, count, refreshErr)
	}
	return s.repo.RefreshConnection(ctx, c, id, a, chat.Title, bot.Status, bot.IsAdmin, bot.Permissions, count, refreshErr)
}

func (s *Service) HandleUpdate(ctx context.Context, update tdto.TelegramUpdate) (processingErr error) {
	if err := s.repo.ExpireDrafts(ctx); err != nil {
		return err
	}
	kind := "message"
	if update.CallbackQuery != nil {
		kind = "callback_query"
	}
	if update.MyChatMember != nil {
		kind = "my_chat_member"
	}
	fresh, err := s.repo.BeginUpdate(ctx, update.UpdateID, kind)
	if err != nil {
		return err
	}
	if !fresh {
		return nil
	}
	defer func() {
		// Business rejections are handled updates. Returning a non-2xx response
		// makes Telegram redeliver commands that cannot succeed on retry.
		var apiErr *app.Error
		if errors.As(processingErr, &apiErr) && apiErr.Status >= 400 && apiErr.Status < 500 {
			processingErr = nil
		}
		_ = s.repo.CompleteUpdate(context.Background(), update.UpdateID, processingErr)
	}()
	if update.CallbackQuery != nil {
		return s.handleCallback(ctx, *update.CallbackQuery)
	}
	if update.MyChatMember != nil {
		return s.handleMembership(ctx, *update.MyChatMember)
	}
	if update.Message == nil {
		return nil
	}
	return s.handleMessage(ctx, update.UpdateID, *update.Message)
}

func (s *Service) handleMembership(ctx context.Context, u tdto.ChatMemberUpdated) error {
	status := strings.ToUpper(u.NewChatMember.Status)
	admin := u.NewChatMember.Status == "administrator" || u.NewChatMember.Status == "creator"
	permissions := map[string]any{"can_manage_chat": u.NewChatMember.CanManageChat, "can_delete_messages": u.NewChatMember.CanDeleteMessages, "can_restrict_members": u.NewChatMember.CanRestrictMembers, "can_invite_users": u.NewChatMember.CanInviteUsers, "can_pin_messages": u.NewChatMember.CanPinMessages}
	return s.repo.UpdateConnectionHealth(ctx, u.Chat.ID, status, admin, permissions, "")
}

func commandName(text string) string {
	f := strings.Fields(text)
	if len(f) == 0 {
		return ""
	}
	return strings.ToLower(strings.SplitN(f[0], "@", 2)[0])
}
func (s *Service) handleMessage(ctx context.Context, updateID int64, m tdto.Message) error {
	if m.From == nil || m.From.IsBot {
		return nil
	}
	switch commandName(m.Text) {
	case "/connect":
		return s.connect(ctx, m)
	case "/help":
		_, err := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Commands:\n/connect <pairing-code>\n"+takeOrderUsage+"\n/cancelorder <order number>", "", "")
		return err
	case "/takeorder":
		return s.takeOrder(ctx, updateID, m)
	case "/cancelorder":
		return s.cancelByCommand(ctx, m)
	default:
		return nil
	}
}

func (s *Service) connect(ctx context.Context, m tdto.Message) error {
	parts := strings.Fields(m.Text)
	if len(parts) != 2 {
		_, err := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Use /connect <pairing-code>.", "", "")
		return err
	}
	if m.Chat.Type != "group" && m.Chat.Type != "supergroup" {
		_, err := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Telegram connections are supported only in groups and supergroups.", "", "")
		return err
	}
	member, err := s.provider.GetChatMember(ctx, m.Chat.ID, m.From.ID)
	if err != nil {
		return err
	}
	if !member.IsAdmin {
		_, err = s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Only a Telegram group creator or administrator can connect this group.", "", "")
		return err
	}
	bot, err := s.provider.GetBotMember(ctx, m.Chat.ID)
	if err != nil {
		return err
	}
	canManage, _ := bot.Permissions["can_manage_chat"].(bool)
	if !bot.IsAdmin || !canManage {
		_, err = s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Grant the bot administrator permissions, then send the connect command again.", "", "")
		return err
	}
	count, err := s.provider.GetMemberCount(ctx, m.Chat.ID)
	var countPtr *int
	if err == nil {
		countPtr = &count
	}
	g, err := s.repo.ConnectGroup(ctx, outbound.ConnectionInput{CodeHash: hash(parts[1]), ChatID: m.Chat.ID, Title: m.Chat.Title, Type: m.Chat.Type, Username: m.Chat.Username, CreatorUserID: m.From.ID, CreatorDisplayName: m.From.DisplayName(), CreatorUsername: m.From.Username, BotStatus: bot.Status, BotIsAdmin: bot.IsAdmin, BotPermissions: bot.Permissions, MemberCount: countPtr})
	if err != nil {
		message := "The group could not be connected because of a server error. Please try again later."
		var apiErr *app.Error
		if errors.As(err, &apiErr) {
			switch apiErr.Code {
			case "INVALID_PAIRING_CODE", "GROUP_ALREADY_CONNECTED":
				message = apiErr.Message
			}
		}
		if _, sendErr := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, message, "", ""); sendErr != nil {
			return sendErr
		}
		return err
	}
	_, err = s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, fmt.Sprintf("Connected to %s. Sellers can now use %s", g.ShopName, takeOrderUsage), "", "")
	return err
}

func (s *Service) takeOrder(ctx context.Context, updateID int64, m tdto.Message) error {
	connection, err := s.repo.FindConnectionByChat(ctx, m.Chat.ID)
	if err != nil {
		var apiErr *app.Error
		if errors.As(err, &apiErr) && apiErr.Code == "NOT_FOUND" {
			_, sendErr := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "This group is not connected to an enabled shop. Ask a group administrator to connect it using /connect <pairing-code>.", "", "")
			return sendErr
		}
		return err
	}
	if connection.ConnectionStatus != "ACTIVE" {
		_, e := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "This Telegram group connection is not active.", "", "")
		return e
	}
	allowed, err := s.repo.ObserveUser(ctx, connection.ID, *m.From, "MEMBER")
	if err != nil {
		return err
	}
	if !allowed {
		_, e := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "You are not authorized to create orders in this group.", "", "")
		return e
	}
	parsed, err := domain.ParseTakeOrder(m.Text)
	if err != nil {
		_, e := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Use "+takeOrderUsage, "", "")
		return e
	}
	confirmRaw, _ := randomToken(18)
	cancelRaw, _ := randomToken(18)
	result, err := s.repo.CreateDraft(ctx, outbound.DraftInput{ConnectionID: connection.ID, ChatID: m.Chat.ID, MessageID: m.MessageID, UserID: m.From.ID, UpdateID: updateID, ProductName: domain.NormalizeName(parsed.ProductName), SKU: parsed.SKU, OriginalCommand: m.Text, Quantity: parsed.Quantity, ExpiresAt: time.Now().UTC().Add(draftTTL), ConfirmTokenHash: hash(confirmRaw), CancelTokenHash: hash(cancelRaw)})
	if err != nil {
		message := "The product was not found.\nPlease check the product name or SKU (both must match when supplied), send the order again, and remove the previous incorrect message."
		var apiErr *app.Error
		if errors.As(err, &apiErr) {
			switch apiErr.Code {
			case "AMBIGUOUS_PRODUCT":
				message = "Multiple products were found.\nPlease add the SKU to distinguish between them, send a new order, and remove the previous message."
			case "NO_STOCK":
				message = "There is no more stock for this product."
			case "INSUFFICIENT_STOCK":
				message = apiErr.Message
			}
		}
		_, sendErr := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, message, "", "")
		if sendErr != nil {
			return sendErr
		}
		return err
	}
	text := fmt.Sprintf("Order pending confirmation\n\nProduct: %s\nQuantity: %s\nPrice: %s %s\nOrder No: %s\nStatus: Draft", result.Order.Description, result.Order.Quantity, result.Order.UnitPrice, result.Order.CurrencyCode, result.Order.OrderNumber)
	sent, err := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, text, "tg:"+confirmRaw, "tg:"+cancelRaw)
	if err != nil {
		return err
	}
	return s.repo.StoreBotResponse(ctx, result.Order.ID, sent.MessageID)
}

func (s *Service) cancelByCommand(ctx context.Context, m tdto.Message) error {
	parts := strings.Fields(m.Text)
	if len(parts) != 2 {
		_, e := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Use /cancelorder <order number>.", "", "")
		return e
	}
	member, err := s.provider.GetChatMember(ctx, m.Chat.ID, m.From.ID)
	if err != nil {
		return err
	}
	orderID, err := s.repo.FindOrderForCancellation(ctx, m.Chat.ID, parts[1], m.From.ID, member.IsAdmin)
	if err != nil {
		_, sendErr := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "The draft order was not found or you are not allowed to cancel it.", "", "")
		if sendErr != nil {
			return sendErr
		}
		return err
	}
	order, err := s.repo.TransitionOrder(ctx, nil, orderID, "CANCEL", "TELEGRAM_COMMAND", m.From.ID, true)
	if err != nil {
		_, sendErr := s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "This order has already been confirmed or cancelled.", "", "")
		if sendErr != nil {
			return sendErr
		}
		return err
	}
	_, err = s.provider.SendReply(ctx, m.Chat.ID, m.MessageID, "Order "+order.OrderNumber+" cancelled.", "", "")
	if order.BotResponseMessageID != 0 {
		_ = s.provider.EditOrderMessage(ctx, order.TelegramChatID, order.BotResponseMessageID, fmt.Sprintf("Order cancelled\n\nOrder No: %s\nStatus: CANCELLED", order.OrderNumber))
	}
	return err
}

func (s *Service) handleCallback(ctx context.Context, q tdto.CallbackQuery) error {
	if q.Message == nil || !strings.HasPrefix(q.Data, "tg:") {
		return s.provider.AnswerCallback(ctx, q.ID, "Invalid or expired order action.", true)
	}
	r, err := s.repo.ResolveCallback(ctx, hash(strings.TrimPrefix(q.Data, "tg:")), q.Message.Chat.ID, q.From.ID)
	if err != nil {
		return s.provider.AnswerCallback(ctx, q.ID, "Invalid or expired order action.", true)
	}
	member, err := s.provider.GetChatMember(ctx, r.ChatID, q.From.ID)
	if err != nil {
		return err
	}
	if !member.IsAdmin {
		return s.provider.AnswerCallback(ctx, q.ID, "Only Telegram group administrators can confirm or cancel orders.", true)
	}
	order, err := s.repo.TransitionOrder(ctx, nil, r.OrderID, r.Action, "TELEGRAM", q.From.ID, true)
	if err != nil {
		_ = s.provider.AnswerCallback(ctx, q.ID, "This order has already been confirmed or cancelled by another administrator.", true)
		return err
	}
	_ = s.provider.AnswerCallback(ctx, q.ID, "Order "+strings.ToLower(order.Status)+".", false)
	return s.provider.EditOrderMessage(ctx, r.ChatID, r.BotResponseMessageID, fmt.Sprintf("Order %s\n\nOrder No: %s\nStatus: %s", strings.ToLower(order.Status), order.OrderNumber, order.Status))
}

func (s *Service) ConfirmTelegramOrder(ctx context.Context, c *authdto.Claims, id string, a bool) (tdto.Order, error) {
	return s.transitionWebsite(ctx, c, id, "CONFIRM", a)
}
func (s *Service) CancelTelegramOrder(ctx context.Context, c *authdto.Claims, id string, a bool) (tdto.Order, error) {
	return s.transitionWebsite(ctx, c, id, "CANCEL", a)
}
func (s *Service) transitionWebsite(ctx context.Context, c *authdto.Claims, id, action string, a bool) (tdto.Order, error) {
	o, err := s.repo.TransitionOrder(ctx, c, id, action, "WEBSITE", 0, a)
	if err != nil {
		return o, err
	}
	// The canonical transition is committed first. Delivery is retried through
	// the outbox when this best-effort immediate edit fails.
	if o.BotResponseMessageID != 0 {
		_ = s.provider.EditOrderMessage(ctx, o.TelegramChatID, o.BotResponseMessageID, fmt.Sprintf("Order %s\n\nOrder No: %s\nStatus: %s", strings.ToLower(o.Status), o.OrderNumber, o.Status))
	}
	return o, nil
}
func (s *Service) ListAudit(ctx context.Context, c *authdto.Claims, id string) ([]tdto.AuditEvent, error) {
	return s.repo.ListAudit(ctx, c, id)
}
func (s *Service) RetrySynchronization(ctx context.Context, c *authdto.Claims, id string) error {
	return s.repo.RetrySynchronization(ctx, c, id)
}

func ParseTelegramUserID(value string) (int64, error) { return strconv.ParseInt(value, 10, 64) }
