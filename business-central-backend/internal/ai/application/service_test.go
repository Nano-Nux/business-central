package application

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"business-central-backend/internal/ai/domain"
	"business-central-backend/internal/ai/ports/outbound"
	authdto "business-central-backend/internal/auth/application/dto"
)

// Mock repository
type mockRepo struct {
	aiEnabled     bool
	conversations map[string]domain.Conversation
	messages      map[string][]domain.Message
	queryResult   []map[string]any
	queryErr      error
	shopName      string
	shopCode      string
	deletionLogs  []domain.AIDeletionLog
	lastIsStaff   bool
	usageLimit    int
	usageCount    int
}

func (m *mockRepo) GetAIUsage(ctx context.Context, merchantID string) (int, int, error) {
	limit := m.usageLimit
	if limit == 0 {
		limit = 50
	}
	return m.usageCount, limit, nil
}

func (m *mockRepo) IncrementAIUsage(ctx context.Context, merchantID string) (int, error) {
	m.usageCount++
	return m.usageCount, nil
}

func (m *mockRepo) GetAdminAIStats(ctx context.Context) (domain.AIAdminStats, error) {
	msgCount := 0
	for _, msgs := range m.messages {
		msgCount += len(msgs)
	}
	var lastLog *domain.AIDeletionLog
	if len(m.deletionLogs) > 0 {
		l := m.deletionLogs[len(m.deletionLogs)-1]
		lastLog = &l
	}
	return domain.AIAdminStats{
		TotalMessages:        msgCount,
		TotalConversations:   len(m.conversations),
		TotalMerchantsWithAI: 1,
		LastDeletion:         lastLog,
	}, nil
}

func (m *mockRepo) PurgeAllAIChats(ctx context.Context, adminIdentityID string) (domain.PurgeAIResult, error) {
	msgCount := 0
	for _, msgs := range m.messages {
		msgCount += len(msgs)
	}
	convCount := len(m.conversations)

	// Purge
	m.messages = make(map[string][]domain.Message)
	m.conversations = make(map[string]domain.Conversation)

	now := time.Now().UTC()
	log := domain.AIDeletionLog{
		ID:                  "log-1",
		DeletedByIdentityID: &adminIdentityID,
		DeletedByEmail:      "admin@test.com",
		DeletedByName:       "Platform Admin",
		DeletedAt:           now,
		MessagesCount:       msgCount,
		ConversationsCount:  convCount,
		CreatedAt:           now,
	}
	m.deletionLogs = append(m.deletionLogs, log)

	return domain.PurgeAIResult{
		DeletedMessages:      msgCount,
		DeletedConversations: convCount,
		Log:                  log,
	}, nil
}

func (m *mockRepo) ListAIDeletionLogs(ctx context.Context, limit int) ([]domain.AIDeletionLog, error) {
	return m.deletionLogs, nil
}

func (m *mockRepo) CreateConversation(ctx context.Context, merchantID, membershipID string, shopID *string, title string) (domain.Conversation, error) {
	var sName *string
	if shopID != nil && m.shopName != "" {
		name := m.shopName
		sName = &name
	}
	c := domain.Conversation{
		ID:           "c-1",
		MerchantID:   merchantID,
		MembershipID: membershipID,
		ShopID:       shopID,
		ShopName:     sName,
		Title:        title,
	}
	m.conversations[c.ID] = c
	return c, nil
}

func (m *mockRepo) GetConversation(ctx context.Context, merchantID, membershipID, id string) (domain.Conversation, error) {
	c, ok := m.conversations[id]
	if !ok || c.MerchantID != merchantID || c.MembershipID != membershipID {
		return domain.Conversation{}, errors.New("not found")
	}
	return c, nil
}

func (m *mockRepo) ListConversations(ctx context.Context, merchantID, membershipID string, shopID *string, limit int) ([]domain.Conversation, error) {
	list := make([]domain.Conversation, 0)
	for _, c := range m.conversations {
		if c.MerchantID == merchantID && c.MembershipID == membershipID {
			if shopID != nil && *shopID != "" {
				if c.ShopID == nil || *c.ShopID != *shopID {
					continue
				}
			}
			list = append(list, c)
		}
	}
	return list, nil
}

func (m *mockRepo) UpdateConversationTitle(ctx context.Context, merchantID, membershipID, id, title string) error {
	c, ok := m.conversations[id]
	if !ok || c.MerchantID != merchantID || c.MembershipID != membershipID {
		return errors.New("not found")
	}
	c.Title = title
	m.conversations[id] = c
	return nil
}

func (m *mockRepo) UpdateConversationShop(ctx context.Context, merchantID, membershipID, id, shopID string) error {
	c, ok := m.conversations[id]
	if !ok || c.MerchantID != merchantID || c.MembershipID != membershipID {
		return errors.New("not found")
	}
	c.ShopID = &shopID
	m.conversations[id] = c
	return nil
}

func (m *mockRepo) DeleteConversation(ctx context.Context, merchantID, membershipID, id string) error {
	c, ok := m.conversations[id]
	if !ok || c.MerchantID != merchantID || c.MembershipID != membershipID {
		return errors.New("not found")
	}
	delete(m.conversations, id)
	return nil
}

func (m *mockRepo) SaveMessage(ctx context.Context, msg domain.Message) (domain.Message, error) {
	msg.ID = "m-" + string(msg.SenderType)
	m.messages[msg.ConversationID] = append(m.messages[msg.ConversationID], msg)
	return msg, nil
}

func (m *mockRepo) ListMessages(ctx context.Context, merchantID, membershipID, conversationID string) ([]domain.Message, error) {
	return m.messages[conversationID], nil
}

func (m *mockRepo) ExecuteReadOnlyQuery(ctx context.Context, merchantID, userID, sqlQuery string, isStaff bool) ([]map[string]any, error) {
	m.lastIsStaff = isStaff
	if m.queryErr != nil {
		return nil, m.queryErr
	}
	return m.queryResult, nil
}

func (m *mockRepo) IsAIAssistantEnabled(ctx context.Context, merchantID string) (bool, error) {
	return m.aiEnabled, nil
}

func (m *mockRepo) GetMerchantContext(ctx context.Context, merchantID string) (string, string, error) {
	return "THB", "Test Merchant", nil
}

func (m *mockRepo) GetShopContext(ctx context.Context, merchantID, shopID string) (string, string, error) {
	name := m.shopName
	if name == "" {
		name = "Test Shop"
	}
	code := m.shopCode
	if code == "" {
		code = "TS-01"
	}
	return name, code, nil
}

// Mock auth
type mockAuth struct {
	allowed bool
	isOwner bool
}

func (a *mockAuth) HasPermission(ctx context.Context, claims *authdto.Claims, permission string) (bool, error) {
	return a.allowed, nil
}

func (a *mockAuth) HasAnyRole(ctx context.Context, claims *authdto.Claims, roleCodes ...string) (bool, error) {
	return a.isOwner, nil
}

// Mock LLM Client
type mockLLM struct {
	toolCall             *outbound.ToolCallResult
	directResponse       string
	htmlOutput           string
	capturedSystemPrompt string
}

func (l *mockLLM) GenerateQueryToolCall(ctx context.Context, systemPrompt string, history []outbound.ConversationMessage, userPrompt string) (string, *outbound.ToolCallResult, error) {
	l.capturedSystemPrompt = systemPrompt
	return l.directResponse, l.toolCall, nil
}

func (l *mockLLM) HumanizeAndFormatHTML(ctx context.Context, userPrompt string, queryData []map[string]any, executedSQL string) (string, error) {
	return l.htmlOutput, nil
}

func (l *mockLLM) TranscribeAudio(ctx context.Context, audioBytes []byte, mimeType string) (string, error) {
	return "what is the sell price of red hair clip", nil
}

func TestSendMessage_DisabledForMerchant(t *testing.T) {
	repo := &mockRepo{aiEnabled: false, conversations: make(map[string]domain.Conversation), messages: make(map[string][]domain.Message)}
	auth := &mockAuth{allowed: true}
	llm := &mockLLM{}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-1"}
	_, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{Message: "hello"})
	if err == nil {
		t.Fatal("expected error when AI assistant is disabled for merchant, got nil")
	}
	if !strings.Contains(err.Error(), "not enabled for this merchant") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestSendMessage_ForbiddenForStaff(t *testing.T) {
	repo := &mockRepo{aiEnabled: true, conversations: make(map[string]domain.Conversation), messages: make(map[string][]domain.Message)}
	auth := &mockAuth{allowed: false}
	llm := &mockLLM{}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-staff"}
	_, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{Message: "hello"})
	if err == nil {
		t.Fatal("expected error when staff lacks ai.chat permission, got nil")
	}
	if !strings.Contains(err.Error(), "do not have permission") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestSendMessage_SuccessfulToolCallingAndHTMLResponse(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		queryResult: []map[string]any{
			{"product": "Red Hair Clip", "price": 45.00, "currency_code": "THB"},
		},
	}
	auth := &mockAuth{allowed: true, isOwner: true}
	llm := &mockLLM{
		toolCall: &outbound.ToolCallResult{
			ToolName: "run_read_only_sql",
			SQLQuery: "SELECT p.name AS product, pp.amount AS price FROM products p JOIN product_prices pp ON pp.product_id = p.id WHERE p.merchant_id = 'm-1'",
		},
		htmlOutput: "<p>The selling price of the <strong>Red Hair Clip</strong> is <strong>45.00 THB</strong>.</p>",
	}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-1"}
	resp, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{Message: "what is the sell price of red hair clip"})
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}

	if resp.ConversationID == "" {
		t.Errorf("expected non-empty ConversationID")
	}
	if resp.UserMessage.Content != "what is the sell price of red hair clip" {
		t.Errorf("unexpected user message: %s", resp.UserMessage.Content)
	}
	if !strings.Contains(resp.AIMessage.Content, "45.00 THB") {
		t.Errorf("expected AI message to contain price, got: %s", resp.AIMessage.Content)
	}
	if resp.ExecutedSQL != "" {
		t.Errorf("expected ExecutedSQL to be hidden from client response, got %s", resp.ExecutedSQL)
	}
	if strings.Contains(string(resp.AIMessage.RawQueryData), "executed_sql") {
		t.Errorf("expected raw_query_data to not contain executed_sql, got: %s", string(resp.AIMessage.RawQueryData))
	}
}

func TestSendMessage_UserScoping(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
	}
	auth := &mockAuth{allowed: true}
	llm := &mockLLM{directResponse: "Hello Owner!"}
	svc := NewService(repo, llm, auth)

	// Owner creates conversation
	ownerClaims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-owner"}
	ownerResp, err := svc.SendMessage(context.Background(), ownerClaims, domain.ChatRequest{Message: "hi from owner"})
	if err != nil {
		t.Fatalf("owner message failed: %v", err)
	}

	// Staff tries to access owner's conversation
	staffClaims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-staff"}
	_, _, err = svc.GetConversation(context.Background(), staffClaims, ownerResp.ConversationID)
	if err == nil {
		t.Fatal("expected staff to be denied access to owner conversation, got nil error")
	}

	// Staff lists conversations -> should be empty
	staffList, err := svc.ListConversations(context.Background(), staffClaims, nil, 50)
	if err != nil {
		t.Fatalf("staff list failed: %v", err)
	}
	if len(staffList) != 0 {
		t.Errorf("expected 0 conversations for staff, got %d", len(staffList))
	}
}

func TestSendMessage_ShopScoping(t *testing.T) {
	shopID := "shop-101"
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		shopName:      "Downtown Branch",
		shopCode:      "DT-01",
	}
	auth := &mockAuth{allowed: true, isOwner: true}
	llm := &mockLLM{directResponse: "Downtown Branch profit today is 2500 THB"}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-1"}
	resp, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{
		ShopID:  &shopID,
		Message: "what is today's profit",
	})
	if err != nil {
		t.Fatalf("SendMessage failed: %v", err)
	}

	if resp.ShopID == nil || *resp.ShopID != "shop-101" {
		t.Errorf("expected ShopID to be shop-101, got %v", resp.ShopID)
	}
	if resp.ShopName == nil || *resp.ShopName != "Downtown Branch" {
		t.Errorf("expected ShopName to be Downtown Branch, got %v", resp.ShopName)
	}

	// Verify shop scope prompt injection
	if !strings.Contains(llm.capturedSystemPrompt, "Active Shop Name: Downtown Branch") {
		t.Errorf("expected system prompt to contain Downtown Branch, got: %s", llm.capturedSystemPrompt)
	}
	if !strings.Contains(llm.capturedSystemPrompt, "shop_id = 'shop-101'") {
		t.Errorf("expected system prompt to enforce shop_id = 'shop-101'")
	}
	if !strings.Contains(llm.capturedSystemPrompt, "AND l.shop_id = 'shop-101'") {
		t.Errorf("expected system prompt to include AND l.shop_id = 'shop-101'")
	}

	// Verify ListConversations by shopID
	shopList, err := svc.ListConversations(context.Background(), claims, &shopID, 10)
	if err != nil {
		t.Fatalf("ListConversations failed: %v", err)
	}
	if len(shopList) != 1 {
		t.Errorf("expected 1 conversation for shop-101, got %d", len(shopList))
	}

	// Verify ListConversations for different shop returns 0
	otherShopID := "shop-999"
	otherList, err := svc.ListConversations(context.Background(), claims, &otherShopID, 10)
	if err != nil {
		t.Fatalf("ListConversations for other shop failed: %v", err)
	}
	if len(otherList) != 0 {
		t.Errorf("expected 0 conversations for shop-999, got %d", len(otherList))
	}
}

func TestGetAdminAIStats_PlatformAdminRequired(t *testing.T) {
	repo := &mockRepo{
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
	}
	svc := NewService(repo, &mockLLM{}, &mockAuth{allowed: true})

	// Non-platform admin
	regularClaims := &authdto.Claims{IdentityID: "id-1", PlatformAdmin: false}
	_, err := svc.GetAdminAIStats(context.Background(), regularClaims)
	if err == nil {
		t.Fatal("expected error for non-platform admin, got nil")
	}

	// Platform admin
	adminClaims := &authdto.Claims{IdentityID: "admin-1", PlatformAdmin: true}
	stats, err := svc.GetAdminAIStats(context.Background(), adminClaims)
	if err != nil {
		t.Fatalf("unexpected error for platform admin: %v", err)
	}
	if stats.TotalMessages != 0 || stats.TotalConversations != 0 {
		t.Errorf("expected 0 messages and conversations, got %d, %d", stats.TotalMessages, stats.TotalConversations)
	}
}

func TestPurgeAllAIChats_PlatformAdminRequired(t *testing.T) {
	repo := &mockRepo{
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
	}
	svc := NewService(repo, &mockLLM{}, &mockAuth{allowed: true})

	regularClaims := &authdto.Claims{IdentityID: "id-1", PlatformAdmin: false}
	_, err := svc.PurgeAllAIChats(context.Background(), regularClaims)
	if err == nil {
		t.Fatal("expected error for non-platform admin, got nil")
	}
}

func TestPurgeAllAIChats_Success(t *testing.T) {
	repo := &mockRepo{
		conversations: map[string]domain.Conversation{
			"c-1": {ID: "c-1", Title: "Conv 1"},
			"c-2": {ID: "c-2", Title: "Conv 2"},
		},
		messages: map[string][]domain.Message{
			"c-1": {{ID: "m-1", Content: "Hello"}, {ID: "m-2", Content: "Hi"}},
			"c-2": {{ID: "m-3", Content: "Profit today?"}},
		},
	}
	svc := NewService(repo, &mockLLM{}, &mockAuth{allowed: true})
	adminClaims := &authdto.Claims{IdentityID: "admin-1", PlatformAdmin: true}

	// Check stats before purge
	statsBefore, err := svc.GetAdminAIStats(context.Background(), adminClaims)
	if err != nil {
		t.Fatalf("GetAdminAIStats failed: %v", err)
	}
	if statsBefore.TotalConversations != 2 || statsBefore.TotalMessages != 3 {
		t.Errorf("expected 2 convs and 3 msgs, got %d, %d", statsBefore.TotalConversations, statsBefore.TotalMessages)
	}

	// Purge
	result, err := svc.PurgeAllAIChats(context.Background(), adminClaims)
	if err != nil {
		t.Fatalf("PurgeAllAIChats failed: %v", err)
	}
	if result.DeletedConversations != 2 || result.DeletedMessages != 3 {
		t.Errorf("expected 2 deleted convs and 3 deleted msgs, got %d, %d", result.DeletedConversations, result.DeletedMessages)
	}
	if result.Log.DeletedAt.IsZero() {
		t.Error("expected non-zero DeletedAt timestamp")
	}

	// Verify stats after purge
	statsAfter, err := svc.GetAdminAIStats(context.Background(), adminClaims)
	if err != nil {
		t.Fatalf("GetAdminAIStats after purge failed: %v", err)
	}
	if statsAfter.TotalConversations != 0 || statsAfter.TotalMessages != 0 {
		t.Errorf("expected 0 convs and 0 msgs after purge, got %d, %d", statsAfter.TotalConversations, statsAfter.TotalMessages)
	}
	if statsAfter.LastDeletion == nil || statsAfter.LastDeletion.DeletedAt.IsZero() {
		t.Error("expected LastDeletion to be recorded")
	}

	// Verify ListAIDeletionLogs
	logs, err := svc.ListAIDeletionLogs(context.Background(), adminClaims, 10)
	if err != nil {
		t.Fatalf("ListAIDeletionLogs failed: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("expected 1 deletion log, got %d", len(logs))
	}
	if logs[0].MessagesCount != 3 || logs[0].ConversationsCount != 2 {
		t.Errorf("expected log to have 3 msgs and 2 convs, got %d, %d", logs[0].MessagesCount, logs[0].ConversationsCount)
	}
}

func TestSendMessage_StaffConfidentiality_DirectivesAndSuppression(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		queryResult: []map[string]any{
			{"product": "Coffee Mug", "selling_price": 120.00},
		},
	}
	// isOwner = false -> Staff member
	auth := &mockAuth{allowed: true, isOwner: false}
	llm := &mockLLM{
		toolCall: &outbound.ToolCallResult{
			ToolName: "run_read_only_sql",
			SQLQuery: "SELECT p.name AS product, pp.amount AS selling_price FROM products p JOIN product_variants pv ON pv.product_id = p.id JOIN product_prices pp ON pp.variant_id = pv.id WHERE p.merchant_id = 'm-staff-1'",
		},
		htmlOutput: "<p>The selling price of Coffee Mug is 120.00 THB.</p>",
	}
	svc := NewService(repo, llm, auth)

	staffClaims := &authdto.Claims{
		MerchantID:    "m-staff-1",
		MembershipID:  "mem-staff-1",
		PlatformAdmin: false,
	}

	resp, err := svc.SendMessage(context.Background(), staffClaims, domain.ChatRequest{
		Message: "what is the selling price of coffee mug",
	})
	if err != nil {
		t.Fatalf("unexpected error for staff query: %v", err)
	}

	// 1. Verify system prompt received by LLM contains strict confidentiality rules for staff
	if !strings.Contains(llm.capturedSystemPrompt, "USER ROLE: STORE STAFF (NOT MERCHANT OWNER)") {
		t.Errorf("expected system prompt to specify store staff role, got: %s", llm.capturedSystemPrompt)
	}
	if !strings.Contains(llm.capturedSystemPrompt, "CRITICAL CONFIDENTIALITY POLICY FOR STAFF") {
		t.Errorf("expected staff confidentiality policy in prompt")
	}
	if !strings.Contains(llm.capturedSystemPrompt, "Business profit, gross profit, net profit, profit margins") {
		t.Errorf("expected forbidden profit directive in prompt")
	}
	if !strings.Contains(llm.capturedSystemPrompt, "Original purchase prices, cost prices, supplier wholesale prices") {
		t.Errorf("expected forbidden cost price directive in prompt")
	}

	// 2. Verify system prompt strictly omits original_price and profit calculation guidelines
	if strings.Contains(llm.capturedSystemPrompt, "original_price") {
		t.Errorf("staff system prompt must NOT contain original_price")
	}
	if strings.Contains(llm.capturedSystemPrompt, "gross_profit") {
		t.Errorf("staff system prompt must NOT contain gross_profit")
	}
	if strings.Contains(llm.capturedSystemPrompt, "To calculate today's profit") {
		t.Errorf("staff system prompt must NOT contain profit calculation instructions")
	}

	// 3. Verify repo received isStaff = true
	if !repo.lastIsStaff {
		t.Errorf("expected repo.ExecuteReadOnlyQuery to be called with isStaff = true")
	}

	// 4. Verify SQL query is suppressed for staff (audit privacy)
	if resp.ExecutedSQL != "" {
		t.Errorf("expected ExecutedSQL to be empty for staff, got: %s", resp.ExecutedSQL)
	}
}

func TestSendMessage_StaffConfidentiality_QueryBlockedNotice(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		queryErr:      errors.New("access to confidential business metric 'profit' (profit and original cost price) is restricted to merchant owners"),
	}
	// Staff member
	auth := &mockAuth{allowed: true, isOwner: false}
	llm := &mockLLM{
		toolCall: &outbound.ToolCallResult{
			ToolName: "run_read_only_sql",
			SQLQuery: "SELECT sum(o.grand_total) AS gross_profit FROM orders o WHERE o.merchant_id = 'm-staff-1'",
		},
	}
	svc := NewService(repo, llm, auth)

	staffClaims := &authdto.Claims{
		MerchantID:    "m-staff-1",
		MembershipID:  "mem-staff-1",
		PlatformAdmin: false,
	}

	resp, err := svc.SendMessage(context.Background(), staffClaims, domain.ChatRequest{
		Message: "show me the profit for today",
	})
	if err != nil {
		t.Fatalf("expected graceful handling without internal error, got: %v", err)
	}

	// Verify friendly HTML restriction notice
	if !strings.Contains(resp.AIMessage.Content, "ai-restriction-box") {
		t.Errorf("expected ai-restriction-box in response, got: %s", resp.AIMessage.Content)
	}
	if !strings.Contains(resp.AIMessage.Content, "strictly restricted to merchant owners") {
		t.Errorf("expected restriction text in response, got: %s", resp.AIMessage.Content)
	}
}

func TestSendMessage_MerchantOwner_ProfitAccess(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		queryResult: []map[string]any{
			{"total_revenue": 50000.00, "total_cost": 30000.00, "gross_profit": 20000.00},
		},
	}
	// Owner / merchant
	auth := &mockAuth{allowed: true, isOwner: true}
	sqlStr := "SELECT COALESCE(sum(o.grand_total), 0) - COALESCE(sum(ol_costs.cost), 0) AS gross_profit FROM orders o WHERE o.merchant_id = 'm-owner-1'"
	llm := &mockLLM{
		toolCall: &outbound.ToolCallResult{
			ToolName: "run_read_only_sql",
			SQLQuery: sqlStr,
		},
		htmlOutput: "<p>Today's gross profit is <strong>20,000.00 THB</strong>.</p>",
	}
	svc := NewService(repo, llm, auth)

	ownerClaims := &authdto.Claims{
		MerchantID:    "m-owner-1",
		MembershipID:  "mem-owner-1",
		PlatformAdmin: false,
	}

	resp, err := svc.SendMessage(context.Background(), ownerClaims, domain.ChatRequest{
		Message: "what is my profit today",
	})
	if err != nil {
		t.Fatalf("unexpected error for owner: %v", err)
	}

	// 1. Verify system prompt specifies Merchant Owner role
	if !strings.Contains(llm.capturedSystemPrompt, "USER ROLE: MERCHANT OWNER / MANAGER") {
		t.Errorf("expected merchant owner role directive in prompt")
	}
	if !strings.Contains(llm.capturedSystemPrompt, "original_price") {
		t.Errorf("expected original_price to be documented in merchant owner schema")
	}
	if !strings.Contains(llm.capturedSystemPrompt, "To calculate today's profit") {
		t.Errorf("expected profit calculation example in merchant owner schema")
	}

	// 2. Verify repo received isStaff = false
	if repo.lastIsStaff {
		t.Errorf("expected repo.ExecuteReadOnlyQuery to be called with isStaff = false for owner")
	}

	// 3. Verify ExecutedSQL is hidden from client response for security
	if resp.ExecutedSQL != "" {
		t.Errorf("expected ExecutedSQL to be hidden from client response, got: %s", resp.ExecutedSQL)
	}
	if strings.Contains(string(resp.AIMessage.RawQueryData), "executed_sql") {
		t.Errorf("expected raw_query_data to not contain executed_sql, got: %s", string(resp.AIMessage.RawQueryData))
	}
}

func TestSendMessage_UsageLimitReached(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		usageLimit:    50,
		usageCount:    50,
	}
	auth := &mockAuth{allowed: true, isOwner: true}
	llm := &mockLLM{directResponse: "hello"}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-owner"}
	_, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{Message: "hello"})
	if err == nil {
		t.Fatal("expected error when AI usage limit is reached, got nil")
	}
	if !strings.Contains(err.Error(), "usage limit reached") {
		t.Errorf("expected usage limit message, got: %v", err)
	}
}

func TestSendMessage_IncrementsUsageCount(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:     true,
		conversations: make(map[string]domain.Conversation),
		messages:      make(map[string][]domain.Message),
		usageLimit:    50,
		usageCount:    5,
	}
	auth := &mockAuth{allowed: true, isOwner: true}
	llm := &mockLLM{directResponse: "hello response"}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-owner"}
	resp, err := svc.SendMessage(context.Background(), claims, domain.ChatRequest{Message: "test prompt"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.AIUsageCount != 6 {
		t.Errorf("expected AIUsageCount = 6, got %d", resp.AIUsageCount)
	}
	if resp.AIUsageLimit != 50 {
		t.Errorf("expected AIUsageLimit = 50, got %d", resp.AIUsageLimit)
	}
	if repo.usageCount != 6 {
		t.Errorf("expected repo.usageCount = 6, got %d", repo.usageCount)
	}
}

func TestGetAIUsage(t *testing.T) {
	repo := &mockRepo{
		aiEnabled:  true,
		usageLimit: 100,
		usageCount: 42,
	}
	auth := &mockAuth{allowed: true, isOwner: true}
	llm := &mockLLM{}
	svc := NewService(repo, llm, auth)

	claims := &authdto.Claims{MerchantID: "m-1", MembershipID: "mem-owner"}
	usage, err := svc.GetAIUsage(context.Background(), claims)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if usage.UsageCount != 42 {
		t.Errorf("expected UsageCount 42, got %d", usage.UsageCount)
	}
	if usage.UsageLimit != 100 {
		t.Errorf("expected UsageLimit 100, got %d", usage.UsageLimit)
	}
	if usage.Remaining != 58 {
		t.Errorf("expected Remaining 58, got %d", usage.Remaining)
	}
	if usage.IsLimitReached {
		t.Errorf("expected IsLimitReached to be false")
	}

	// Limit reached scenario
	repo.usageCount = 100
	usage2, err := svc.GetAIUsage(context.Background(), claims)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !usage2.IsLimitReached {
		t.Errorf("expected IsLimitReached to be true")
	}
	if usage2.Remaining != 0 {
		t.Errorf("expected Remaining 0, got %d", usage2.Remaining)
	}
}


