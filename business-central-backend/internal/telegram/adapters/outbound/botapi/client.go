package botapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/ports/outbound"
)

type Client struct {
	token string
	http  *http.Client
	mu    sync.Mutex
	botID int64
}

func New(token string) *Client {
	return &Client{token: token, http: &http.Client{Timeout: 8 * time.Second}}
}

type envelope struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

func (c *Client) call(ctx context.Context, method string, payload any, target any) error {
	if c.token == "" {
		return errors.New("Telegram bot token is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.telegram.org/bot"+c.token+"/"+method, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("Telegram %s request failed: %s", method, strings.ReplaceAll(err.Error(), c.token, "[redacted]"))
	}
	defer resp.Body.Close()
	var env envelope
	if err = json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return err
	}
	if !env.OK {
		return fmt.Errorf("Telegram %s failed: %s", method, strings.ReplaceAll(env.Description, c.token, "[redacted]"))
	}
	if target != nil {
		return json.Unmarshal(env.Result, target)
	}
	return nil
}
func (c *Client) SendReply(ctx context.Context, chatID, messageID int64, text, confirm, cancel string) (outbound.SentMessage, error) {
	p := map[string]any{"chat_id": chatID, "text": text, "reply_parameters": map[string]any{"message_id": messageID, "allow_sending_without_reply": true}}
	if confirm != "" && cancel != "" {
		p["reply_markup"] = map[string]any{"inline_keyboard": [][]map[string]string{{{"text": "Confirm", "callback_data": confirm}, {"text": "Cancel", "callback_data": cancel}}}}
	}
	var result outbound.SentMessage
	err := c.call(ctx, "sendMessage", p, &result)
	return result, err
}
func (c *Client) EditOrderMessage(ctx context.Context, chatID, messageID int64, text string) error {
	return c.call(ctx, "editMessageText", map[string]any{"chat_id": chatID, "message_id": messageID, "text": text, "reply_markup": map[string]any{"inline_keyboard": [][]any{}}}, nil)
}
func (c *Client) AnswerCallback(ctx context.Context, id, text string, alert bool) error {
	return c.call(ctx, "answerCallbackQuery", map[string]any{"callback_query_id": id, "text": text, "show_alert": alert}, nil)
}
func (c *Client) GetChat(ctx context.Context, chatID int64) (outbound.ChatInfo, error) {
	var x struct {
		ID                    int64 `json:"id"`
		Type, Title, Username string
	}
	err := c.call(ctx, "getChat", map[string]any{"chat_id": chatID}, &x)
	return outbound.ChatInfo{ID: x.ID, Type: x.Type, Title: x.Title, Username: x.Username}, err
}
func (c *Client) GetChatMember(ctx context.Context, chatID, userID int64) (outbound.MemberInfo, error) {
	var x struct {
		Status             string `json:"status"`
		CanManageChat      bool   `json:"can_manage_chat"`
		CanDeleteMessages  bool   `json:"can_delete_messages"`
		CanRestrictMembers bool   `json:"can_restrict_members"`
		CanInviteUsers     bool   `json:"can_invite_users"`
		CanPinMessages     bool   `json:"can_pin_messages"`
	}
	err := c.call(ctx, "getChatMember", map[string]any{"chat_id": chatID, "user_id": userID}, &x)
	perms := map[string]any{"can_manage_chat": x.CanManageChat, "can_delete_messages": x.CanDeleteMessages, "can_restrict_members": x.CanRestrictMembers, "can_invite_users": x.CanInviteUsers, "can_pin_messages": x.CanPinMessages}
	return outbound.MemberInfo{Status: x.Status, IsAdmin: x.Status == "creator" || x.Status == "administrator", Permissions: perms}, err
}
func (c *Client) botUserID(ctx context.Context) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.botID != 0 {
		return c.botID, nil
	}
	var x struct {
		ID int64 `json:"id"`
	}
	if err := c.call(ctx, "getMe", map[string]any{}, &x); err != nil {
		return 0, err
	}
	c.botID = x.ID
	return x.ID, nil
}
func (c *Client) GetBotMember(ctx context.Context, chatID int64) (outbound.MemberInfo, error) {
	id, err := c.botUserID(ctx)
	if err != nil {
		return outbound.MemberInfo{}, err
	}
	return c.GetChatMember(ctx, chatID, id)
}
func (c *Client) GetMemberCount(ctx context.Context, chatID int64) (int, error) {
	var count int
	err := c.call(ctx, "getChatMemberCount", map[string]any{"chat_id": chatID}, &count)
	return count, err
}
func (c *Client) GetAdministrators(ctx context.Context, chatID int64) ([]outbound.AdministratorInfo, error) {
	var raw []struct {
		Status string `json:"status"`
		User   struct {
			ID        int64  `json:"id"`
			IsBot     bool   `json:"is_bot"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Username  string `json:"username"`
		} `json:"user"`
	}
	if err := c.call(ctx, "getChatAdministrators", map[string]any{"chat_id": chatID}, &raw); err != nil {
		return nil, err
	}
	out := make([]outbound.AdministratorInfo, 0, len(raw))
	for _, x := range raw {
		if x.User.IsBot {
			continue
		}
		role := "ADMINISTRATOR"
		if x.Status == "creator" {
			role = "CREATOR"
		}
		out = append(out, outbound.AdministratorInfo{User: tdto.User{ID: x.User.ID, IsBot: x.User.IsBot, FirstName: x.User.FirstName, LastName: x.User.LastName, Username: x.User.Username}, Role: role})
	}
	return out, nil
}
