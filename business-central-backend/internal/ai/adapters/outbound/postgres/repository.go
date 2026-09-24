package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/ai/domain"
	"business-central-backend/internal/ai/ports/outbound"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) outbound.Repository {
	return &Repository{pool: pool}
}

func (r *Repository) CreateConversation(ctx context.Context, merchantID, membershipID string, shopID *string, title string) (domain.Conversation, error) {
	if strings.TrimSpace(title) == "" {
		title = "New Conversation"
	}
	var c domain.Conversation
	err := r.pool.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO ai_conversations (merchant_id, membership_id, shop_id, title)
			VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
			RETURNING id, merchant_id, membership_id, shop_id, title, created_at, updated_at
		)
		SELECT i.id, i.merchant_id, i.membership_id, i.shop_id, s.name, i.title, i.created_at, i.updated_at
		FROM inserted i
		LEFT JOIN shops s ON s.id = i.shop_id AND s.merchant_id = i.merchant_id
	`, merchantID, membershipID, shopID, title).Scan(&c.ID, &c.MerchantID, &c.MembershipID, &c.ShopID, &c.ShopName, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (r *Repository) GetConversation(ctx context.Context, merchantID, membershipID, id string) (domain.Conversation, error) {
	var c domain.Conversation
	err := r.pool.QueryRow(ctx, `
		SELECT c.id, c.merchant_id, c.membership_id, c.shop_id, s.name, c.title, c.created_at, c.updated_at
		FROM ai_conversations c
		LEFT JOIN shops s ON s.id = c.shop_id AND s.merchant_id = c.merchant_id
		WHERE c.id = $1::uuid AND c.merchant_id = $2::uuid AND c.membership_id = $3::uuid
	`, id, merchantID, membershipID).Scan(&c.ID, &c.MerchantID, &c.MembershipID, &c.ShopID, &c.ShopName, &c.Title, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (r *Repository) ListConversations(ctx context.Context, merchantID, membershipID string, shopID *string, limit int) ([]domain.Conversation, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := `
		SELECT c.id, c.merchant_id, c.membership_id, c.shop_id, s.name, c.title, c.created_at, c.updated_at
		FROM ai_conversations c
		LEFT JOIN shops s ON s.id = c.shop_id AND s.merchant_id = c.merchant_id
		WHERE c.merchant_id = $1::uuid AND c.membership_id = $2::uuid
	`
	args := []any{merchantID, membershipID}
	if shopID != nil && *shopID != "" {
		query += fmt.Sprintf(" AND c.shop_id = $%d::uuid", len(args)+1)
		args = append(args, *shopID)
	}
	query += fmt.Sprintf(" ORDER BY c.updated_at DESC LIMIT $%d", len(args)+1)
	args = append(args, limit)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := make([]domain.Conversation, 0)
	for rows.Next() {
		var c domain.Conversation
		if err := rows.Scan(&c.ID, &c.MerchantID, &c.MembershipID, &c.ShopID, &c.ShopName, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		conversations = append(conversations, c)
	}
	return conversations, rows.Err()
}

func (r *Repository) UpdateConversationTitle(ctx context.Context, merchantID, membershipID, id, title string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE ai_conversations
		SET title = $4, updated_at = now()
		WHERE id = $1::uuid AND merchant_id = $2::uuid AND membership_id = $3::uuid
	`, id, merchantID, membershipID, title)
	return err
}

func (r *Repository) UpdateConversationShop(ctx context.Context, merchantID, membershipID, id, shopID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE ai_conversations
		SET shop_id = $4::uuid, updated_at = now()
		WHERE id = $1::uuid AND merchant_id = $2::uuid AND membership_id = $3::uuid
	`, id, merchantID, membershipID, shopID)
	return err
}

func (r *Repository) DeleteConversation(ctx context.Context, merchantID, membershipID, id string) error {
	cmdTag, err := r.pool.Exec(ctx, `
		DELETE FROM ai_conversations
		WHERE id = $1::uuid AND merchant_id = $2::uuid AND membership_id = $3::uuid
	`, id, merchantID, membershipID)
	if err != nil {
		return err
	}
	if cmdTag.RowsAffected() == 0 {
		return errors.New("conversation not found or not owned by user")
	}
	return nil
}

func (r *Repository) SaveMessage(ctx context.Context, msg domain.Message) (domain.Message, error) {
	var saved domain.Message
	err := r.pool.QueryRow(ctx, `
		INSERT INTO ai_messages (conversation_id, merchant_id, membership_id, sender_type, content, raw_query_data)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
		RETURNING id, conversation_id, merchant_id, membership_id, sender_type, content, raw_query_data, created_at
	`, msg.ConversationID, msg.MerchantID, msg.MembershipID, msg.SenderType, msg.Content, msg.RawQueryData).
		Scan(&saved.ID, &saved.ConversationID, &saved.MerchantID, &saved.MembershipID, &saved.SenderType, &saved.Content, &saved.RawQueryData, &saved.CreatedAt)
	if err != nil {
		return domain.Message{}, err
	}

	// Touch the conversation updated_at
	_, _ = r.pool.Exec(ctx, `UPDATE ai_conversations SET updated_at = now() WHERE id = $1::uuid`, msg.ConversationID)

	return saved, nil
}

func (r *Repository) ListMessages(ctx context.Context, merchantID, membershipID, conversationID string) ([]domain.Message, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, conversation_id, merchant_id, membership_id, sender_type, content, raw_query_data, created_at
		FROM ai_messages
		WHERE conversation_id = $1::uuid AND merchant_id = $2::uuid AND membership_id = $3::uuid
		ORDER BY created_at ASC
	`, conversationID, merchantID, membershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := make([]domain.Message, 0)
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.MerchantID, &m.MembershipID, &m.SenderType, &m.Content, &m.RawQueryData, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func (r *Repository) ExecuteReadOnlyQuery(ctx context.Context, merchantID, userID, sqlQuery string, isStaff bool) ([]map[string]any, error) {
	sanitizedSQL, err := ValidateReadOnlyQuery(sqlQuery, merchantID, isStaff)
	if err != nil {
		return nil, fmt.Errorf("invalid read-only query: %w", err)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, fmt.Errorf("begin read-only transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Set tenant context and 5-second statement timeout
	_, err = tx.Exec(ctx, "SELECT set_config('app.merchant_id', $1, true), set_config('app.user_id', $2, true), set_config('statement_timeout', '5000', true)", merchantID, userID)
	if err != nil {
		return nil, fmt.Errorf("configure tenant context: %w", err)
	}

	// Limit to max 100 rows to ensure safe memory and payload sizes
	wrappedQuery := fmt.Sprintf("WITH _query_result AS (%s) SELECT * FROM _query_result LIMIT 100", sanitizedSQL)

	rows, err := tx.Query(ctx, wrappedQuery)
	if err != nil {
		return nil, fmt.Errorf("execute query: %w", err)
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	results := make([]map[string]any, 0)

	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, fmt.Errorf("scan row values: %w", err)
		}
		rowMap := make(map[string]any, len(fields))
		for i, field := range fields {
			val := values[i]
			// Format byte slices as string if encountered
			if b, ok := val.([]byte); ok {
				val = string(b)
			}
			rowMap[field.Name] = val
		}
		results = append(results, rowMap)
	}

	return results, rows.Err()
}

func (r *Repository) IsAIAssistantEnabled(ctx context.Context, merchantID string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(ai_assistant_enabled, false) FROM merchants WHERE id = $1::uuid`, merchantID).Scan(&enabled)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return enabled, err
}

func (r *Repository) GetAIUsage(ctx context.Context, merchantID string) (int, int, error) {
	var usageCount, usageLimit int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(ai_usage_count, 0), COALESCE(ai_usage_limit, 50)
		FROM merchants
		WHERE id = $1::uuid
	`, merchantID).Scan(&usageCount, &usageLimit)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 50, nil
	}
	return usageCount, usageLimit, err
}

func (r *Repository) IncrementAIUsage(ctx context.Context, merchantID string) (int, error) {
	var newCount int
	err := r.pool.QueryRow(ctx, `
		UPDATE merchants
		SET ai_usage_count = COALESCE(ai_usage_count, 0) + 1, updated_at = now()
		WHERE id = $1::uuid
		RETURNING ai_usage_count
	`, merchantID).Scan(&newCount)
	return newCount, err
}

func (r *Repository) GetMerchantContext(ctx context.Context, merchantID string) (currency string, merchantName string, err error) {
	err = r.pool.QueryRow(ctx, `SELECT COALESCE(default_currency_code, 'USD'), COALESCE(name, 'Store') FROM merchants WHERE id = $1::uuid`, merchantID).Scan(&currency, &merchantName)
	return currency, merchantName, err
}

func (r *Repository) GetShopContext(ctx context.Context, merchantID, shopID string) (shopName string, shopCode string, err error) {
	err = r.pool.QueryRow(ctx, `SELECT COALESCE(name, 'Shop'), COALESCE(code, '') FROM shops WHERE id = $1::uuid AND merchant_id = $2::uuid`, shopID, merchantID).Scan(&shopName, &shopCode)
	return shopName, shopCode, err
}

func (r *Repository) GetAdminAIStats(ctx context.Context) (domain.AIAdminStats, error) {
	var stats domain.AIAdminStats

	// Count messages
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM ai_messages`).Scan(&stats.TotalMessages)
	if err != nil {
		return stats, fmt.Errorf("count ai_messages: %w", err)
	}

	// Count conversations
	err = r.pool.QueryRow(ctx, `SELECT count(*) FROM ai_conversations`).Scan(&stats.TotalConversations)
	if err != nil {
		return stats, fmt.Errorf("count ai_conversations: %w", err)
	}

	// Count merchants with AI assistant enabled
	err = r.pool.QueryRow(ctx, `SELECT count(*) FROM merchants WHERE COALESCE(ai_assistant_enabled, false) = true`).Scan(&stats.TotalMerchantsWithAI)
	if err != nil {
		return stats, fmt.Errorf("count merchants with ai: %w", err)
	}

	// Last deletion log
	var lastLog domain.AIDeletionLog
	var delByIdentityID *string
	row := r.pool.QueryRow(ctx, `
		SELECT id, deleted_by_identity_id::text, deleted_by_email, deleted_by_name, deleted_at, messages_count, conversations_count, created_at
		FROM ai_chat_deletion_logs
		ORDER BY deleted_at DESC
		LIMIT 1
	`)
	if err := row.Scan(&lastLog.ID, &delByIdentityID, &lastLog.DeletedByEmail, &lastLog.DeletedByName, &lastLog.DeletedAt, &lastLog.MessagesCount, &lastLog.ConversationsCount, &lastLog.CreatedAt); err == nil {
		lastLog.DeletedByIdentityID = delByIdentityID
		stats.LastDeletion = &lastLog
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return stats, fmt.Errorf("fetch last deletion log: %w", err)
	}

	return stats, nil
}

func (r *Repository) PurgeAllAIChats(ctx context.Context, adminIdentityID string) (domain.PurgeAIResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("begin purge transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Fetch admin details
	var adminEmail, adminName string
	err = tx.QueryRow(ctx, `SELECT email FROM user_identities WHERE id = $1::uuid`, adminIdentityID).Scan(&adminEmail)
	if err != nil {
		adminEmail = "platform-admin"
		adminName = "Platform Administrator"
	} else {
		adminName = adminEmail
	}

	// Count messages and conversations to purge
	var msgCount, convCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM ai_messages`).Scan(&msgCount); err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("count messages before purge: %w", err)
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM ai_conversations`).Scan(&convCount); err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("count conversations before purge: %w", err)
	}

	// Purge messages and conversations
	if _, err := tx.Exec(ctx, `DELETE FROM ai_messages`); err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("delete ai_messages: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM ai_conversations`); err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("delete ai_conversations: %w", err)
	}

	// Record in audit log in UTC
	nowUTC := time.Now().UTC()
	var logID string
	err = tx.QueryRow(ctx, `
		INSERT INTO ai_chat_deletion_logs (
			deleted_by_identity_id, deleted_by_email, deleted_by_name, deleted_at, messages_count, conversations_count, created_at
		) VALUES ($1::uuid, $2, $3, $4, $5, $6, $4)
		RETURNING id
	`, adminIdentityID, adminEmail, adminName, nowUTC, msgCount, convCount).Scan(&logID)
	if err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("insert deletion log: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return domain.PurgeAIResult{}, fmt.Errorf("commit purge transaction: %w", err)
	}

	deletionLog := domain.AIDeletionLog{
		ID:                  logID,
		DeletedByIdentityID: &adminIdentityID,
		DeletedByEmail:      adminEmail,
		DeletedByName:       adminName,
		DeletedAt:           nowUTC,
		MessagesCount:       msgCount,
		ConversationsCount:  convCount,
		CreatedAt:           nowUTC,
	}

	return domain.PurgeAIResult{
		DeletedMessages:      msgCount,
		DeletedConversations: convCount,
		Log:                  deletionLog,
	}, nil
}

func (r *Repository) ListAIDeletionLogs(ctx context.Context, limit int) ([]domain.AIDeletionLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, deleted_by_identity_id::text, deleted_by_email, deleted_by_name, deleted_at, messages_count, conversations_count, created_at
		FROM ai_chat_deletion_logs
		ORDER BY deleted_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list deletion logs: %w", err)
	}
	defer rows.Close()

	logs := make([]domain.AIDeletionLog, 0)
	for rows.Next() {
		var l domain.AIDeletionLog
		var delByIdentityID *string
		if err := rows.Scan(&l.ID, &delByIdentityID, &l.DeletedByEmail, &l.DeletedByName, &l.DeletedAt, &l.MessagesCount, &l.ConversationsCount, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan deletion log: %w", err)
		}
		l.DeletedByIdentityID = delByIdentityID
		logs = append(logs, l)
	}

	return logs, rows.Err()
}

