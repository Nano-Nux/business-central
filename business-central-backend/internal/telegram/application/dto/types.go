package dto

import "time"

type BotInfo struct {
	Username string `json:"username"`
}

type PairingCode struct {
	ID        string    `json:"id"`
	ShopID    string    `json:"shop_id"`
	Code      string    `json:"code,omitempty"`
	Status    string    `json:"status"`
	ExpiresAt time.Time `json:"expires_at"`
}

type Group struct {
	ID                      string         `json:"id"`
	MerchantID              string         `json:"merchant_id"`
	MerchantName            string         `json:"merchant_name,omitempty"`
	ShopID                  string         `json:"shop_id"`
	ShopName                string         `json:"shop_name,omitempty"`
	TelegramChatID          int64          `json:"telegram_chat_id"`
	GroupTitle              string         `json:"group_title"`
	GroupType               string         `json:"group_type"`
	GroupUsername           *string        `json:"group_username,omitempty"`
	CreatorTelegramUserID   *int64         `json:"creator_telegram_user_id,omitempty"`
	CreatorDisplayName      *string        `json:"creator_display_name_snapshot,omitempty"`
	CreatorUsername         *string        `json:"creator_username_snapshot,omitempty"`
	ConnectedBy             *string        `json:"connected_by,omitempty"`
	ConnectionStatus        string         `json:"connection_status"`
	BotMembershipStatus     string         `json:"bot_membership_status"`
	BotAdminStatus          bool           `json:"bot_admin_status"`
	BotPermissions          map[string]any `json:"bot_permission_snapshot"`
	MemberCount             *int           `json:"member_count,omitempty"`
	FirstSeenAt             time.Time      `json:"first_seen_at"`
	ConnectedAt             *time.Time     `json:"connected_at,omitempty"`
	LastSeenAt              time.Time      `json:"last_seen_at"`
	LastWebhookAt           *time.Time     `json:"last_webhook_at,omitempty"`
	LastRefreshedAt         *time.Time     `json:"last_refreshed_at,omitempty"`
	LastSuccessfulAPICallAt *time.Time     `json:"last_successful_api_call_at,omitempty"`
	LastError               *string        `json:"last_error,omitempty"`
	DisconnectedAt          *time.Time     `json:"disconnected_at,omitempty"`
}

type GroupUser struct {
	TelegramUserID  int64     `json:"telegram_user_id"`
	DisplayName     *string   `json:"display_name_snapshot,omitempty"`
	Username        *string   `json:"username_snapshot,omitempty"`
	TelegramRole    string    `json:"telegram_role"`
	CanCreateOrders bool      `json:"can_create_orders"`
	FirstSeenAt     time.Time `json:"first_seen_at"`
	LastSeenAt      time.Time `json:"last_seen_at"`
}

type Order struct {
	ID                   string    `json:"id"`
	MerchantID           string    `json:"merchant_id"`
	ShopID               string    `json:"shop_id"`
	ConnectionID         string    `json:"telegram_group_connection_id"`
	GroupTitle           string    `json:"group_title"`
	OrderNumber          string    `json:"order_number"`
	Status               string    `json:"status"`
	CurrencyCode         string    `json:"currency_code"`
	GrandTotal           string    `json:"grand_total"`
	Description          string    `json:"description"`
	Quantity             string    `json:"quantity"`
	UnitPrice            string    `json:"unit_price"`
	TelegramUserID       int64     `json:"telegram_user_id"`
	CreatedAt            time.Time `json:"created_at"`
	ExpiresAt            time.Time `json:"expires_at"`
	LastError            *string   `json:"last_error,omitempty"`
	TelegramChatID       int64     `json:"-"`
	BotResponseMessageID int64     `json:"-"`
}

type StatusRequest struct {
	Status string `json:"status"`
}
type AuditEvent struct {
	ID                string         `json:"id"`
	Action            string         `json:"action"`
	EntityType        string         `json:"entity_type"`
	EntityID          *string        `json:"entity_id,omitempty"`
	ActorMembershipID *string        `json:"actor_membership_id,omitempty"`
	AfterData         map[string]any `json:"after_data,omitempty"`
	OccurredAt        time.Time      `json:"occurred_at"`
}

type TelegramUpdate struct {
	UpdateID      int64              `json:"update_id"`
	Message       *Message           `json:"message,omitempty"`
	CallbackQuery *CallbackQuery     `json:"callback_query,omitempty"`
	MyChatMember  *ChatMemberUpdated `json:"my_chat_member,omitempty"`
}
type User struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
}

func (u User) DisplayName() string {
	if u.LastName == "" {
		return u.FirstName
	}
	return u.FirstName + " " + u.LastName
}

type Chat struct {
	ID       int64  `json:"id"`
	Type     string `json:"type"`
	Title    string `json:"title"`
	Username string `json:"username"`
}
type Message struct {
	MessageID      int64  `json:"message_id"`
	From           *User  `json:"from,omitempty"`
	Chat           Chat   `json:"chat"`
	Date           int64  `json:"date"`
	Text           string `json:"text"`
	NewChatMembers []User `json:"new_chat_members,omitempty"`
	LeftChatMember *User  `json:"left_chat_member,omitempty"`
}
type CallbackQuery struct {
	ID      string   `json:"id"`
	From    User     `json:"from"`
	Message *Message `json:"message,omitempty"`
	Data    string   `json:"data"`
}
type ChatMember struct {
	User               User   `json:"user"`
	Status             string `json:"status"`
	CanManageChat      bool   `json:"can_manage_chat"`
	CanDeleteMessages  bool   `json:"can_delete_messages"`
	CanRestrictMembers bool   `json:"can_restrict_members"`
	CanInviteUsers     bool   `json:"can_invite_users"`
	CanPinMessages     bool   `json:"can_pin_messages"`
}
type ChatMemberUpdated struct {
	Chat          Chat       `json:"chat"`
	From          User       `json:"from"`
	OldChatMember ChatMember `json:"old_chat_member"`
	NewChatMember ChatMember `json:"new_chat_member"`
}
