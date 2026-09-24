package domain

import (
	"encoding/json"
	"time"
)

type SenderType string

const (
	SenderUser      SenderType = "USER"
	SenderAssistant SenderType = "ASSISTANT"
	SenderSystem    SenderType = "SYSTEM"
)

type Conversation struct {
	ID           string    `json:"id"`
	MerchantID   string    `json:"merchant_id"`
	MembershipID string    `json:"membership_id"`
	ShopID       *string   `json:"shop_id,omitempty"`
	ShopName     *string   `json:"shop_name,omitempty"`
	Title        string    `json:"title"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Message struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversation_id"`
	MerchantID     string          `json:"merchant_id"`
	MembershipID   string          `json:"membership_id"`
	SenderType     SenderType      `json:"sender_type"`
	Content        string          `json:"content"`
	RawQueryData   json.RawMessage `json:"raw_query_data,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

type ChatRequest struct {
	ConversationID string  `json:"conversation_id,omitempty"`
	ShopID         *string `json:"shop_id,omitempty"`
	Message        string  `json:"message"`
	AudioBase64    string  `json:"audio_base64,omitempty"`
	AudioMimeType  string  `json:"audio_mime_type,omitempty"`
}

type AIUsage struct {
	UsageCount     int  `json:"usage_count"`
	UsageLimit     int  `json:"usage_limit"`
	Remaining      int  `json:"remaining"`
	IsLimitReached bool `json:"is_limit_reached"`
}

type ChatResponse struct {
	ConversationID string  `json:"conversation_id"`
	ShopID         *string `json:"shop_id,omitempty"`
	ShopName       *string `json:"shop_name,omitempty"`
	UserMessage    Message `json:"user_message"`
	AIMessage      Message `json:"ai_message"`
	ExecutedSQL    string  `json:"executed_sql,omitempty"`
	AIUsageCount   int     `json:"ai_usage_count"`
	AIUsageLimit   int     `json:"ai_usage_limit"`
}

type AIDeletionLog struct {
	ID                  string    `json:"id"`
	DeletedByIdentityID *string   `json:"deleted_by_identity_id,omitempty"`
	DeletedByEmail      string    `json:"deleted_by_email"`
	DeletedByName       string    `json:"deleted_by_name"`
	DeletedAt           time.Time `json:"deleted_at"`
	MessagesCount       int       `json:"messages_count"`
	ConversationsCount  int       `json:"conversations_count"`
	CreatedAt           time.Time `json:"created_at"`
}

type AIAdminStats struct {
	TotalMessages        int            `json:"total_messages"`
	TotalConversations   int            `json:"total_conversations"`
	TotalMerchantsWithAI int            `json:"total_merchants_with_ai"`
	LastDeletion         *AIDeletionLog `json:"last_deletion,omitempty"`
}

type PurgeAIResult struct {
	DeletedMessages      int           `json:"deleted_messages"`
	DeletedConversations int           `json:"deleted_conversations"`
	Log                  AIDeletionLog `json:"log"`
}


