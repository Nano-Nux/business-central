package application

import (
	"context"
	"errors"
	"strings"
	"testing"

	"business-central-backend/internal/app"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/ports/outbound"
)

type updateRepository struct {
	outbound.Repository
	connectErr, lookupErr, completedErr error
	draftErr                            error
	draftInput                          outbound.DraftInput
	draftResult                         outbound.DraftResult
	seen                                bool
	storedMessageID                     int64
	connectCalls, completeCalls         int
	draftCalls                          int
}

func (r *updateRepository) ExpireDrafts(context.Context) error { return nil }
func (r *updateRepository) BeginUpdate(context.Context, int64, string) (bool, error) {
	fresh := !r.seen
	r.seen = true
	return fresh, nil
}
func (r *updateRepository) CompleteUpdate(_ context.Context, _ int64, err error) error {
	r.completedErr = err
	r.completeCalls++
	return nil
}
func (r *updateRepository) ConnectGroup(context.Context, outbound.ConnectionInput) (tdto.Group, error) {
	r.connectCalls++
	return tdto.Group{ShopName: "Test shop"}, r.connectErr
}
func (r *updateRepository) FindConnectionByChat(context.Context, int64) (tdto.Group, error) {
	return tdto.Group{ID: "connection", ConnectionStatus: "ACTIVE"}, r.lookupErr
}

func (r *updateRepository) ObserveUser(context.Context, string, tdto.User, string) (bool, error) {
	return true, nil
}
func (r *updateRepository) CreateDraft(_ context.Context, in outbound.DraftInput) (outbound.DraftResult, error) {
	r.draftCalls++
	r.draftInput = in
	return r.draftResult, r.draftErr
}

func (r *updateRepository) StoreBotResponse(_ context.Context, _ string, id int64) error {
	r.storedMessageID = id
	return nil
}

type updateProvider struct {
	outbound.Provider
	replies []string
	sendErr error
}

func (p *updateProvider) GetChatMember(context.Context, int64, int64) (outbound.MemberInfo, error) {
	return outbound.MemberInfo{IsAdmin: true}, nil
}
func (p *updateProvider) GetBotMember(context.Context, int64) (outbound.MemberInfo, error) {
	return outbound.MemberInfo{IsAdmin: true, Permissions: map[string]any{"can_manage_chat": true}}, nil
}
func (p *updateProvider) GetMemberCount(context.Context, int64) (int, error) { return 2, nil }
func (p *updateProvider) SendReply(_ context.Context, _, _ int64, text, _, _ string) (outbound.SentMessage, error) {
	p.replies = append(p.replies, text)
	return outbound.SentMessage{MessageID: 123}, p.sendErr
}

func TestPairingUpdateDistinguishesBusinessAndServerErrors(t *testing.T) {
	for _, tc := range []struct {
		name        string
		err         error
		wantReply   string
		wantFailure bool
	}{
		{"success", nil, "Connected to Test shop", false},
		{"invalid", app.NewError("INVALID_PAIRING_CODE", "The pairing code is invalid, expired, or already used.", 400), "The pairing code is invalid", false},
		{"connected", app.NewError("GROUP_ALREADY_CONNECTED", "This Telegram group is already connected to a shop.", 409), "This Telegram group is already connected", false},
		{"database", app.Internal(errors.New("private SQL details")), "server error", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &updateRepository{connectErr: tc.err}
			provider := &updateProvider{}
			s := NewService(repo, provider, "secret", "bot")
			update := tdto.TelegramUpdate{UpdateID: 123, Message: &tdto.Message{MessageID: 1, From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/connect@bot test-code"}}
			err := s.HandleUpdate(context.Background(), update)
			if (err != nil) != tc.wantFailure || (repo.completedErr != nil) != tc.wantFailure {
				t.Fatalf("incorrect webhook result: %v, recorded: %v", err, repo.completedErr)
			}
			if len(provider.replies) != 1 || !strings.Contains(provider.replies[0], tc.wantReply) || strings.Contains(provider.replies[0], "private SQL") {
				t.Fatalf("incorrect reply: %v", provider.replies)
			}
			if err := s.HandleUpdate(context.Background(), update); err != nil || repo.connectCalls != 1 || repo.completeCalls != 1 || len(provider.replies) != 1 {
				t.Fatal("redelivery reprocessed the command")
			}
		})
	}
}

func TestUnconnectedGroupOrderIsAcknowledgedWithSetupInstructions(t *testing.T) {
	repo := &updateRepository{lookupErr: app.NewError("NOT_FOUND", "Telegram group was not found.", 404)}
	provider := &updateProvider{}
	s := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 124, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder quantity=1 SKU"}}
	if err := s.HandleUpdate(context.Background(), update); err != nil || repo.completedErr != nil {
		t.Fatalf("unconnected group returned webhook error: %v", err)
	}
	if len(provider.replies) != 1 || !strings.Contains(provider.replies[0], "/connect <pairing-code>") {
		t.Fatalf("missing setup instructions: %v", provider.replies)
	}
}

func TestPairingReplyFailureRemainsWebhookFailure(t *testing.T) {
	repo := &updateRepository{connectErr: app.NewError("INVALID_PAIRING_CODE", "Invalid code.", 400)}
	provider := &updateProvider{sendErr: errors.New("Telegram unavailable")}
	s := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 125, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/connect code"}}
	if err := s.HandleUpdate(context.Background(), update); !errors.Is(err, provider.sendErr) || !errors.Is(repo.completedErr, provider.sendErr) {
		t.Fatalf("reply failure was acknowledged: %v", err)
	}
}

func TestTakeOrderDoesNotReportDatabaseFailuresAsMissingProducts(t *testing.T) {
	for _, tc := range []struct {
		name        string
		err         error
		want        string
		wantFailure bool
	}{
		{"missing", app.NewError("PRODUCT_NOT_FOUND", "The product was not found.", 404), "The product was not found", false},
		{"database", app.Internal(errors.New("cannot insert multiple commands into a prepared statement")), "server error", true},
		{"location", app.NewError("NO_LOCATION", "The shop has no active inventory location.", 409), "no active inventory location", false},
		{"stock", app.NewError("NO_STOCK", "There is no more stock for this product.", 409), "no more stock", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &updateRepository{draftErr: tc.err}
			provider := &updateProvider{}
			s := NewService(repo, provider, "secret", "bot")
			update := tdto.TelegramUpdate{UpdateID: 126, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder wo phone quantity=1"}}
			err := s.HandleUpdate(context.Background(), update)
			if (err != nil) != tc.wantFailure {
				t.Fatalf("incorrect webhook result: %v", err)
			}
			if len(repo.draftInput.Items) != 1 || repo.draftInput.Items[0].ProductName != "wo phone" || repo.draftInput.Items[0].Quantity != 1 {
				t.Fatalf("incorrect command: %+v", repo.draftInput)
			}
			if len(provider.replies) != 1 || !strings.Contains(provider.replies[0], tc.want) || strings.Contains(provider.replies[0], "prepared statement") {
				t.Fatalf("incorrect reply: %v", provider.replies)
			}
		})
	}
}

func TestMultiProductCustomerOrderReply(t *testing.T) {
	order := tdto.Order{OrderNumber: "TG-123", Status: "DRAFT", PaymentStatus: "Pending", CustomerName: testName("Ma Hnin"), CurrencyCode: "USD", GrandTotal: "2800000.00", Items: []tdto.OrderItem{{Description: "wo phone", Quantity: "1", UnitPrice: "800000.00", LineTotal: "800000.00"}, {Description: "travel-mate-p214", Quantity: "2", UnitPrice: "1000000.00", LineTotal: "2000000.00"}}}
	repo := &updateRepository{draftResult: outbound.DraftResult{Order: order}}
	provider := &updateProvider{}
	service := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 127, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder\ncustomer=Ma Hnin\nwo phone qty=1\ntravel-mate-p214 quantity=2"}}
	if err := service.HandleUpdate(context.Background(), update); err != nil {
		t.Fatal(err)
	}
	if repo.draftInput.CustomerName != "Ma Hnin" || len(repo.draftInput.Items) != 2 || len(provider.replies) != 1 {
		t.Fatalf("incorrect draft request: %+v replies %v", repo.draftInput, provider.replies)
	}
	for _, text := range []string{"Payment: Pending", "Customer: Ma Hnin", "wo phone", "travel-mate-p214", "Total: 2800000.00 USD"} {
		if !strings.Contains(provider.replies[0], text) {
			t.Fatalf("reply missing %s: %s", text, provider.replies[0])
		}
	}
	order.Status = "CONFIRMED"
	order.PaymentStatus = "Paid"
	if text := orderMessage(order); !strings.Contains(text, "Customer: Ma Hnin") || !strings.Contains(text, "travel-mate-p214") || strings.Contains(text, "Awaiting administrator") {
		t.Fatalf("final edit lost order: %s", text)
	}
}

func TestTwentyItemMessageFitsTelegramLimit(t *testing.T) {
	order := tdto.Order{OrderNumber: "TG-20260929-0001", Status: "CONFIRMED", PaymentStatus: "Paid", CustomerName: testName(strings.Repeat("က", 255)), CurrencyCode: "MMK", GrandTotal: "9999999999999.99"}
	for i := 0; i < 20; i++ {
		order.Items = append(order.Items, tdto.OrderItem{Description: strings.Repeat("က", 255), Quantity: "99999999999999.999999", UnitPrice: "9999999999999.99", LineTotal: "9999999999999.99"})
	}
	if text := orderMessage(order); len([]rune(text)) > 4096 {
		t.Fatalf("order message exceeds Telegram limit: %d", len([]rune(text)))
	}
}

func testName(value string) *string { return &value }

func TestAutomaticOrderReturnsWithoutManualButtons(t *testing.T) {
	repo := &updateRepository{draftResult: outbound.DraftResult{Order: tdto.Order{Status: "CONFIRMED", PaymentStatus: "Paid", AutoConfirmed: true}}}
	provider := &updateProvider{}
	service := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 999, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder wo phone quantity=1"}}
	if err := service.HandleUpdate(context.Background(), update); err != nil {
		t.Fatal(err)
	}
	if len(provider.replies) != 0 || repo.draftCalls != 1 {
		t.Fatalf("automatic receipt bypassed durable delivery: %+v", provider.replies)
	}
	if text := orderMessage(repo.draftResult.Order); !strings.Contains(text, "Automatically confirmed") || !strings.Contains(text, "Payment: Paid") || strings.Contains(text, "Awaiting administrator") {
		t.Fatal(text)
	}
}

func TestFailedAutomaticOrderIsNotRetried(t *testing.T) {
	repo := &updateRepository{draftErr: app.NewError("INSUFFICIENT_STOCK", "Only 1 is available.", 409)}
	provider := &updateProvider{}
	service := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 1000, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder wo phone quantity=2"}}
	if err := service.HandleUpdate(context.Background(), update); err != nil {
		t.Fatal(err)
	}
	if err := service.HandleUpdate(context.Background(), update); err != nil {
		t.Fatal(err)
	}
	if repo.draftCalls != 1 || len(provider.replies) != 1 || !strings.Contains(provider.replies[0], "Only 1 is available.") {
		t.Fatalf("failed order retried or error missing: %d %v", repo.draftCalls, provider.replies)
	}
}

func TestAutomaticReceiptDeliveryDoesNotRetryTheOrder(t *testing.T) {
	repo := &updateRepository{}
	provider := &updateProvider{sendErr: errors.New("provider unavailable")}
	service := NewService(repo, provider, "secret", "bot")
	delivery := outbound.OutboxDelivery{Order: tdto.Order{ID: "order", OrderNumber: "TG-1", Status: "CONFIRMED", PaymentStatus: "Paid", AutoConfirmed: true}}
	if err := service.deliverOrderNotification(context.Background(), delivery); err == nil {
		t.Fatal("provider error hidden")
	}
	if repo.draftCalls != 0 || repo.storedMessageID != 0 {
		t.Fatal("notification failure recreated order or recorded missing reply")
	}
	provider.sendErr = nil
	if err := service.deliverOrderNotification(context.Background(), delivery); err != nil {
		t.Fatal(err)
	}
	if repo.draftCalls != 0 || repo.storedMessageID != 123 || !strings.Contains(provider.replies[1], "Payment: Paid") {
		t.Fatal("receipt delivery repeated commerce or lost payment status")
	}
}

func TestServerFailedOrderReturnsErrorWithoutRetry(t *testing.T) {
	repo := &updateRepository{draftErr: app.Internal(errors.New("database unavailable"))}
	provider := &updateProvider{}
	service := NewService(repo, provider, "secret", "bot")
	update := tdto.TelegramUpdate{UpdateID: 1001, Message: &tdto.Message{From: &tdto.User{ID: 42}, Chat: tdto.Chat{ID: -100, Type: "supergroup"}, Text: "/takeorder wo phone quantity=1"}}
	if err := service.HandleUpdate(context.Background(), update); err == nil {
		t.Fatal("server error hidden")
	}
	if err := service.HandleUpdate(context.Background(), update); err != nil {
		t.Fatal(err)
	}
	if repo.draftCalls != 1 || len(provider.replies) != 1 || !strings.Contains(provider.replies[0], "No order was created.") {
		t.Fatal("failed order retried or error missing")
	}
}
