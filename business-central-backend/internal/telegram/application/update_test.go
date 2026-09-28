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
	seen                                bool
	connectCalls, completeCalls         int
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
	return tdto.Group{}, r.lookupErr
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
	return outbound.SentMessage{}, p.sendErr
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
