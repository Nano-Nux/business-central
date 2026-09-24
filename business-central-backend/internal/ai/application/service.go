package application

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/ai/domain"
	"business-central-backend/internal/ai/ports/inbound"
	"business-central-backend/internal/ai/ports/outbound"
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
)

type PermissionChecker interface {
	HasPermission(ctx context.Context, claims *authdto.Claims, permission string) (bool, error)
	HasAnyRole(ctx context.Context, claims *authdto.Claims, roleCodes ...string) (bool, error)
}

type Service struct {
	repo outbound.Repository
	llm  outbound.LLMClient
	auth PermissionChecker
}

func NewService(repo outbound.Repository, llm outbound.LLMClient, auth PermissionChecker) inbound.AIService {
	return &Service{
		repo: repo,
		llm:  llm,
		auth: auth,
	}
}

func (s *Service) checkAccess(ctx context.Context, claims *authdto.Claims) error {
	if claims == nil || claims.MerchantID == "" || claims.MembershipID == "" {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}

	// 1. Check if AI Assistant is enabled by platform admin for this merchant
	enabled, err := s.repo.IsAIAssistantEnabled(ctx, claims.MerchantID)
	if err != nil {
		return fmt.Errorf("check merchant ai enablement: %w", err)
	}
	if !enabled {
		return app.NewError("AI_ASSISTANT_DISABLED", "Nanonux AI Assistant is not enabled for this merchant. Please contact your platform administrator.", 403)
	}

	// 2. Check user permissions: merchant/owner always has access; staff needs ai.chat permission
	allowed, err := s.auth.HasPermission(ctx, claims, "ai.chat")
	if err != nil {
		return fmt.Errorf("check user ai permission: %w", err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to access Nanonux AI Assistant. Please ask your merchant administrator to grant AI Assistant permission.", 403)
	}

	return nil
}

func (s *Service) SendMessage(ctx context.Context, claims *authdto.Claims, req domain.ChatRequest) (domain.ChatResponse, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return domain.ChatResponse{}, err
	}

	usageCount, usageLimit, err := s.repo.GetAIUsage(ctx, claims.MerchantID)
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("check ai usage: %w", err)
	}
	if usageCount >= usageLimit {
		return domain.ChatResponse{}, app.NewError("AI_USAGE_LIMIT_EXCEEDED", fmt.Sprintf("Nanonux AI Assistant usage limit reached (%d/%d). Please contact your platform administrator to increase your limit.", usageCount, usageLimit), 403)
	}

	userPrompt := strings.TrimSpace(req.Message)

	// If voice audio is provided instead of text, transcribe it first
	if userPrompt == "" && req.AudioBase64 != "" {
		audioBytes, err := base64.StdEncoding.DecodeString(req.AudioBase64)
		if err != nil {
			return domain.ChatResponse{}, app.NewError("VALIDATION_ERROR", "Invalid base64 audio payload.", 400)
		}
		transcribed, err := s.llm.TranscribeAudio(ctx, audioBytes, req.AudioMimeType)
		if err != nil {
			return domain.ChatResponse{}, fmt.Errorf("audio transcription failed: %w", err)
		}
		userPrompt = strings.TrimSpace(transcribed)
	}

	if userPrompt == "" {
		return domain.ChatResponse{}, app.NewError("VALIDATION_ERROR", "Message or audio input is required.", 400)
	}

	// Determine or create conversation
	var conversation domain.Conversation

	if req.ConversationID != "" {
		conversation, err = s.repo.GetConversation(ctx, claims.MerchantID, claims.MembershipID, req.ConversationID)
		if err != nil {
			return domain.ChatResponse{}, app.NewError("NOT_FOUND", "Conversation not found or not accessible.", 404)
		}
		// If the conversation does not have a shop_id set yet, but the current request provides one,
		// bind the conversation to this shop.
		if (conversation.ShopID == nil || *conversation.ShopID == "") && req.ShopID != nil && *req.ShopID != "" {
			if updateErr := s.repo.UpdateConversationShop(ctx, claims.MerchantID, claims.MembershipID, conversation.ID, *req.ShopID); updateErr == nil {
				conversation.ShopID = req.ShopID
			}
		}
	} else {
		title := userPrompt
		if len([]rune(title)) > 40 {
			title = string([]rune(title)[:40]) + "..."
		}
		conversation, err = s.repo.CreateConversation(ctx, claims.MerchantID, claims.MembershipID, req.ShopID, title)
		if err != nil {
			return domain.ChatResponse{}, fmt.Errorf("create conversation: %w", err)
		}
	}

	// Fetch shop context if conversation has shop_id
	var shopScopeDirective string
	var shopFilterExample string
	var invFilterExample string
	if conversation.ShopID != nil && *conversation.ShopID != "" {
		sName, sCode, sErr := s.repo.GetShopContext(ctx, claims.MerchantID, *conversation.ShopID)
		if sErr == nil && sName != "" {
			conversation.ShopName = &sName
			shopScopeDirective = fmt.Sprintf(`

CURRENT SHOP SCOPE:
- Active Shop Name: %s
- Active Shop Code: %s
- Active Shop ID: %s

CRITICAL SHOP-SCOPING RULE:
This conversation is strictly scoped to shop "%s" (shop_id = '%s').
Whenever the user asks any business questions about sales, revenue, profit, orders, transactions, stock, or inventory WITHOUT explicitly naming another shop:
1. ALWAYS AUTOMATICALLY FILTER BY THIS SHOP:
   - For orders queries: include shop location filter "AND l.shop_id = '%s'" (via JOIN locations l ON l.merchant_id = o.merchant_id AND l.id = o.fulfillment_location_id).
   - For inventory queries: include shop location filter "AND l.shop_id = '%s'" (via JOIN locations l ON l.merchant_id = ib.merchant_id AND l.id = ib.location_id).
2. DO NOT aggregate numbers across all shops unless the user explicitly asks for "across all shops" or "all stores combined".
3. When answering, specifically clarify that the numbers represent %s.`,
				sName, sCode, *conversation.ShopID,
				sName, *conversation.ShopID,
				*conversation.ShopID,
				*conversation.ShopID,
				sName,
			)
			shopFilterExample = fmt.Sprintf("\n       AND l.shop_id = '%s'", *conversation.ShopID)
			invFilterExample = fmt.Sprintf("\n       AND l.shop_id = '%s'", *conversation.ShopID)
		}
	}

	// Load recent messages for conversation context
	historyMsgs, err := s.repo.ListMessages(ctx, claims.MerchantID, claims.MembershipID, conversation.ID)
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("load history: %w", err)
	}

	history := make([]outbound.ConversationMessage, 0, len(historyMsgs))
	// Keep up to last 8 messages
	startIdx := 0
	if len(historyMsgs) > 8 {
		startIdx = len(historyMsgs) - 8
	}
	for _, m := range historyMsgs[startIdx:] {
		role := "user"
		if m.SenderType == domain.SenderAssistant {
			role = "model"
		}
		history = append(history, outbound.ConversationMessage{
			Role:    role,
			Content: m.Content,
		})
	}

	// Check user role: Owner/Merchant vs Staff
	isOwnerOrMerchant, err := s.auth.HasAnyRole(ctx, claims, "owner", "merchant")
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("check user role: %w", err)
	}
	isStaff := !isOwnerOrMerchant && !claims.PlatformAdmin

	// Fetch merchant context (currency, name)
	currency, merchantName, _ := s.repo.GetMerchantContext(ctx, claims.MerchantID)

	var roleDirective string
	var schemaGuidelines string

	if isStaff {
		roleDirective = `
USER ROLE: STORE STAFF (NOT MERCHANT OWNER)
CRITICAL CONFIDENTIALITY POLICY FOR STAFF:
The user interacting with you is a store staff member.
Staff members are strictly FORBIDDEN from viewing, calculating, estimating, or discussing:
1. Business profit, gross profit, net profit, profit margins, markups, or daily profit.
2. Original purchase prices, cost prices, supplier wholesale prices, or COGS (cost of goods sold).

IF THE USER ASKS ABOUT PROFIT, MARGINS, OR ORIGINAL/COST PRICE:
- YOU MUST NOT CALL ANY SQL TOOL.
- Politely refuse:
  "<p>I apologize, but business profit, profit margins, and original purchase prices are confidential store metrics strictly restricted to merchant owners and managers.</p>"

ALLOWED TOPICS FOR STAFF:
- Selling prices (customer retail price from product_prices)
- Stock availability and inventory levels (quantities on hand/reserved)
- Product catalog details (names, SKUs, barcodes, categories)
- Sales order details (order numbers, quantities, status)`

		schemaGuidelines = fmt.Sprintf(`
DATABASE SCHEMA AND QUERY GUIDELINES:
1. Products & Variants & Selling Prices (NO ORIGINAL/COST PRICE):
   - products (id, merchant_id, name, code, barcode, description, is_active)
   - product_variants (id, product_id, merchant_id, name, sku, barcode, is_active)
   - product_prices (merchant_id, price_list_id, variant_id, amount, valid_from, valid_until)
   - price_lists (id, merchant_id, code, currency_code, is_default)
   - To find customer selling price:
     SELECT p.name AS product, pv.name AS variant, pv.sku, pp.amount AS selling_price, pl.currency_code
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id AND pv.merchant_id = p.merchant_id
     LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.merchant_id = p.merchant_id
     LEFT JOIN price_lists pl ON pl.id = pp.price_list_id AND pl.merchant_id = p.merchant_id AND pl.is_default
     WHERE p.merchant_id = '%s' AND (lower(p.name) LIKE lower('%%%%<search>%%%%') OR lower(pv.name) LIKE lower('%%%%<search>%%%%') OR pv.barcode = '<search>')

2. Orders & Sales (NO PROFIT OR COST DATA):
   - orders (id, merchant_id, fulfillment_location_id, order_number, channel, status, currency_code, grand_total, created_at)
   - order_lines (id, merchant_id, order_id, variant_id, description, quantity, unit_price, line_total)
   - locations (id, merchant_id, shop_id, name, code, location_type, is_active)
   - To view recent orders:
     SELECT o.order_number, o.status, o.grand_total, o.created_at
     FROM orders o
     LEFT JOIN locations l ON l.merchant_id = o.merchant_id AND l.id = o.fulfillment_location_id
     WHERE o.merchant_id = '%s'%s
       AND o.status NOT IN ('DRAFT', 'CANCELLED')
       AND o.created_at >= CURRENT_DATE

3. Inventory:
   - inventory_balances (id, merchant_id, location_id, variant_id, quantity_on_hand, quantity_reserved, updated_at)
   - To check stock (available = quantity_on_hand - quantity_reserved):
     SELECT p.name AS product, pv.name AS variant, pv.sku, ib.quantity_on_hand, (ib.quantity_on_hand - ib.quantity_reserved) AS available
     FROM inventory_balances ib
     LEFT JOIN locations l ON l.merchant_id = ib.merchant_id AND l.id = ib.location_id
     JOIN product_variants pv ON pv.id = ib.variant_id AND pv.merchant_id = ib.merchant_id
     JOIN products p ON p.id = pv.product_id AND p.merchant_id = ib.merchant_id
     WHERE ib.merchant_id = '%s'%s

4. Shops:
   - shops (id, merchant_id, name, code, is_active)
`, claims.MerchantID, claims.MerchantID, shopFilterExample, claims.MerchantID, invFilterExample)
	} else {
		roleDirective = `
USER ROLE: MERCHANT OWNER / MANAGER
The user is a store owner or manager with full administrative and financial access, including business profits and original purchase costs.`

		schemaGuidelines = fmt.Sprintf(`
DATABASE SCHEMA AND QUERY GUIDELINES:
1. Products & Variants & Prices:
   - products (id, merchant_id, name, code, barcode, description, is_active)
   - product_variants (id, product_id, merchant_id, name, sku, barcode, original_price, is_active)
     * original_price is the cost/purchase price of the item.
   - product_prices (merchant_id, price_list_id, variant_id, amount, valid_from, valid_until)
   - price_lists (id, merchant_id, code, currency_code, is_default)
   - To find selling price:
     SELECT p.name AS product, pv.name AS variant, pv.sku, pp.amount AS price, pl.currency_code
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id AND pv.merchant_id = p.merchant_id
     LEFT JOIN product_prices pp ON pp.variant_id = pv.id AND pp.merchant_id = p.merchant_id
     LEFT JOIN price_lists pl ON pl.id = pp.price_list_id AND pl.merchant_id = p.merchant_id AND pl.is_default
     WHERE p.merchant_id = '%s' AND (lower(p.name) LIKE lower('%%%%<search>%%%%') OR lower(pv.name) LIKE lower('%%%%<search>%%%%') OR pv.barcode = '<search>')

2. Orders, Sales & Profit:
   - orders (id, merchant_id, fulfillment_location_id, order_number, channel, status, currency_code, subtotal, discount_total, tax_total, shipping_total, grand_total, created_at)
     * grand_total is the final order amount. Valid completed orders have status NOT IN ('DRAFT', 'CANCELLED').
   - order_lines (id, merchant_id, order_id, variant_id, description, quantity, unit_price, discount_amount, tax_amount, line_total)
     * line_total = quantity * unit_price - discount_amount + tax_amount. Cost per item is product_variants.original_price.
   - locations (id, merchant_id, shop_id, name, code, location_type, is_active)
     * To link orders or inventory to a shop, JOIN locations l ON l.merchant_id = o.merchant_id AND l.id = o.fulfillment_location_id (and check l.shop_id).
   - payments (id, merchant_id, order_id, amount, currency_code, status, created_at)
   - To calculate today's profit:
     SELECT
       count(DISTINCT o.id) AS total_orders,
       COALESCE(sum(o.grand_total), 0) AS total_revenue,
       COALESCE(sum(ol_costs.cost), 0) AS total_cost,
       COALESCE(sum(o.grand_total), 0) - COALESCE(sum(ol_costs.cost), 0) AS gross_profit
     FROM orders o
     LEFT JOIN locations l ON l.merchant_id = o.merchant_id AND l.id = o.fulfillment_location_id
     LEFT JOIN (
       SELECT ol.order_id, sum(ol.quantity * COALESCE(pv.original_price, 0)) AS cost
       FROM order_lines ol
       JOIN product_variants pv ON pv.id = ol.variant_id AND pv.merchant_id = ol.merchant_id
       WHERE ol.merchant_id = '%s'
       GROUP BY ol.order_id
     ) ol_costs ON ol_costs.order_id = o.id
     WHERE o.merchant_id = '%s'%s
       AND o.status NOT IN ('DRAFT', 'CANCELLED')
       AND o.created_at >= CURRENT_DATE

3. Inventory:
   - inventory_balances (id, merchant_id, location_id, variant_id, quantity_on_hand, quantity_reserved, updated_at)
   - To check stock (available = quantity_on_hand - quantity_reserved):
     SELECT p.name AS product, pv.name AS variant, pv.sku, ib.quantity_on_hand, (ib.quantity_on_hand - ib.quantity_reserved) AS available
     FROM inventory_balances ib
     LEFT JOIN locations l ON l.merchant_id = ib.merchant_id AND l.id = ib.location_id
     JOIN product_variants pv ON pv.id = ib.variant_id AND pv.merchant_id = ib.merchant_id
     JOIN products p ON p.id = pv.product_id AND p.merchant_id = ib.merchant_id
     WHERE ib.merchant_id = '%s'%s

4. Shops:
   - shops (id, merchant_id, name, code, is_active)
`, claims.MerchantID, claims.MerchantID, claims.MerchantID, shopFilterExample, claims.MerchantID, invFilterExample)
	}

	systemPrompt := fmt.Sprintf(`You are Nanonux AI, an intelligent business analysis assistant for Business Central.
Merchant Name: %s
Merchant ID: %s
Default Currency: %s
Current Date & Time: %s%s
%s
%s
CRITICAL RULES:
- ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or any modifying statements.
- Always include "WHERE merchant_id = '%s'" in queries to enforce tenant isolation.
- Keep queries fast and clean.`,
		merchantName, claims.MerchantID, currency, time.Now().UTC().Format(time.RFC3339),
		shopScopeDirective,
		roleDirective,
		schemaGuidelines,
		claims.MerchantID,
	)

	// Step 1: Query generation & tool calling
	directText, toolCall, err := s.llm.GenerateQueryToolCall(ctx, systemPrompt, history, userPrompt)
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("ai query analysis: %w", err)
	}

	var responseHTML string
	var executedSQL string
	var queryDataJSON json.RawMessage

	if toolCall != nil && toolCall.SQLQuery != "" {
		executedSQL = toolCall.SQLQuery
		// Execute safe read-only query passing isStaff flag
		queryResults, queryErr := s.repo.ExecuteReadOnlyQuery(ctx, claims.MerchantID, claims.IdentityID, executedSQL, isStaff)
		if queryErr != nil {
			if strings.Contains(queryErr.Error(), "restricted to merchant owners") {
				responseHTML = "<div class=\"ai-restriction-box\"><p>I apologize, but business profit, profit margins, and original purchase prices are confidential store metrics strictly restricted to merchant owners and managers.</p></div>"
			} else {
				responseHTML = "<div class=\"ai-error\"><p>I encountered an error while retrieving data. Please try rephrasing your question or specifying more details.</p></div>"
			}
		} else {
			// Step 2: Humanize and format as HTML
			humanized, hErr := s.llm.HumanizeAndFormatHTML(ctx, userPrompt, queryResults, executedSQL)
			if hErr != nil && humanized == "" {
				responseHTML = fmt.Sprintf("<p>Retrieved %d records from the database.</p>", len(queryResults))
			} else {
				responseHTML = humanized
			}

			// Save safe query metadata (row count only - raw SQL queries are hidden to protect database schema)
			if !isStaff {
				metaMap := map[string]any{
					"row_count": len(queryResults),
				}
				queryDataJSON, _ = json.Marshal(metaMap)
			}
		}
	} else {
		// Direct conversational response
		if directText == "" {
			directText = "I'm Nanonux AI. How can I assist you with your business today?"
		}
		// Convert newlines to paragraphs/breaks
		paragraphs := strings.Split(directText, "\n\n")
		var sb strings.Builder
		for _, p := range paragraphs {
			p = strings.TrimSpace(p)
			if p != "" {
				sb.WriteString("<p>" + strings.ReplaceAll(p, "\n", "<br/>") + "</p>")
			}
		}
		responseHTML = sb.String()
	}

	// Persist User Message
	userMsg := domain.Message{
		ConversationID: conversation.ID,
		MerchantID:     claims.MerchantID,
		MembershipID:   claims.MembershipID,
		SenderType:     domain.SenderUser,
		Content:        userPrompt,
	}
	savedUserMsg, err := s.repo.SaveMessage(ctx, userMsg)
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("save user message: %w", err)
	}

	var clientData json.RawMessage = queryDataJSON
	if isStaff {
		clientData = nil
	}

	// Persist Assistant Message
	aiMsg := domain.Message{
		ConversationID: conversation.ID,
		MerchantID:     claims.MerchantID,
		MembershipID:   claims.MembershipID,
		SenderType:     domain.SenderAssistant,
		Content:        responseHTML,
		RawQueryData:   clientData,
	}
	savedAIMsg, err := s.repo.SaveMessage(ctx, aiMsg)
	if err != nil {
		return domain.ChatResponse{}, fmt.Errorf("save ai message: %w", err)
	}

	newCount, incErr := s.repo.IncrementAIUsage(ctx, claims.MerchantID)
	if incErr == nil {
		usageCount = newCount
	} else {
		usageCount++
	}

	return domain.ChatResponse{
		ConversationID: conversation.ID,
		ShopID:         conversation.ShopID,
		ShopName:       conversation.ShopName,
		UserMessage:    savedUserMsg,
		AIMessage:      savedAIMsg,
		ExecutedSQL:    "", // Raw SQL is strictly hidden to protect database schema and prevent security exposure
		AIUsageCount:   usageCount,
		AIUsageLimit:   usageLimit,
	}, nil
}

func (s *Service) ListConversations(ctx context.Context, claims *authdto.Claims, shopID *string, limit int) ([]domain.Conversation, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return nil, err
	}
	return s.repo.ListConversations(ctx, claims.MerchantID, claims.MembershipID, shopID, limit)
}

func (s *Service) GetConversation(ctx context.Context, claims *authdto.Claims, conversationID string) (domain.Conversation, []domain.Message, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return domain.Conversation{}, nil, err
	}
	conv, err := s.repo.GetConversation(ctx, claims.MerchantID, claims.MembershipID, conversationID)
	if err != nil {
		return domain.Conversation{}, nil, app.NewError("NOT_FOUND", "Conversation not found.", 404)
	}
	msgs, err := s.repo.ListMessages(ctx, claims.MerchantID, claims.MembershipID, conversationID)
	if err != nil {
		return domain.Conversation{}, nil, err
	}

	// Confidentiality: Strip raw query data for staff callers
	isOwnerOrMerchant, oErr := s.auth.HasAnyRole(ctx, claims, "owner", "merchant")
	if oErr == nil && !isOwnerOrMerchant && !claims.PlatformAdmin {
		for i := range msgs {
			msgs[i].RawQueryData = nil
		}
	}

	return conv, msgs, nil
}

func (s *Service) CreateConversation(ctx context.Context, claims *authdto.Claims, title string, shopID *string) (domain.Conversation, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return domain.Conversation{}, err
	}
	return s.repo.CreateConversation(ctx, claims.MerchantID, claims.MembershipID, shopID, title)
}

func (s *Service) DeleteConversation(ctx context.Context, claims *authdto.Claims, conversationID string) error {
	if err := s.checkAccess(ctx, claims); err != nil {
		return err
	}
	return s.repo.DeleteConversation(ctx, claims.MerchantID, claims.MembershipID, conversationID)
}

func (s *Service) Transcribe(ctx context.Context, claims *authdto.Claims, audioBytes []byte, mimeType string) (string, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return "", err
	}
	return s.llm.TranscribeAudio(ctx, audioBytes, mimeType)
}

func (s *Service) checkPlatformAdmin(claims *authdto.Claims) error {
	if claims == nil || claims.IdentityID == "" {
		return app.NewError("UNAUTHORIZED", "Authentication is required.", 401)
	}
	if !claims.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Platform administrator privileges are required.", 403)
	}
	return nil
}

func (s *Service) GetAdminAIStats(ctx context.Context, claims *authdto.Claims) (domain.AIAdminStats, error) {
	if err := s.checkPlatformAdmin(claims); err != nil {
		return domain.AIAdminStats{}, err
	}
	return s.repo.GetAdminAIStats(ctx)
}

func (s *Service) PurgeAllAIChats(ctx context.Context, claims *authdto.Claims) (domain.PurgeAIResult, error) {
	if err := s.checkPlatformAdmin(claims); err != nil {
		return domain.PurgeAIResult{}, err
	}
	return s.repo.PurgeAllAIChats(ctx, claims.IdentityID)
}

func (s *Service) ListAIDeletionLogs(ctx context.Context, claims *authdto.Claims, limit int) ([]domain.AIDeletionLog, error) {
	if err := s.checkPlatformAdmin(claims); err != nil {
		return nil, err
	}
	return s.repo.ListAIDeletionLogs(ctx, limit)
}

func (s *Service) GetAIUsage(ctx context.Context, claims *authdto.Claims) (domain.AIUsage, error) {
	if err := s.checkAccess(ctx, claims); err != nil {
		return domain.AIUsage{}, err
	}
	count, limit, err := s.repo.GetAIUsage(ctx, claims.MerchantID)
	if err != nil {
		return domain.AIUsage{}, fmt.Errorf("get ai usage: %w", err)
	}
	remaining := limit - count
	if remaining < 0 {
		remaining = 0
	}
	return domain.AIUsage{
		UsageCount:     count,
		UsageLimit:     limit,
		Remaining:      remaining,
		IsLimitReached: count >= limit,
	}, nil
}

