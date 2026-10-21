package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

type Client struct {
	APIKey, Model string
	HTTP          *http.Client
	BaseURL       string
}

func (c *Client) Reply(ctx context.Context, prompt string, history []domain.Message, exchanges []ports.Exchange) (reply ports.Reply, err error) {
	if c.APIKey == "" {
		return reply, errors.New("receptionist Gemini key is missing")
	}
	contents := []any{}
	for _, m := range history {
		if m.Role == "system" {
			continue
		}
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		// The welcome message is UI content. Begin model history with a visitor
		// turn and merge repeated same-role records (such as availability notices).
		if len(contents) == 0 && role == "model" {
			continue
		}
		if len(contents) > 0 {
			previous := contents[len(contents)-1].(map[string]any)
			if previous["role"] == role {
				previous["parts"] = append(previous["parts"].([]any), map[string]string{"text": m.Content})
				continue
			}
		}
		contents = append(contents, map[string]any{"role": role, "parts": []any{map[string]string{"text": m.Content}}})
	}
	for _, x := range exchanges {
		contents = append(contents, x.State)
		parts := []any{}
		for i, call := range x.Calls {
			response := map[string]any{"name": call.Name, "response": x.Results[i]}
			if call.ID != "" {
				response["id"] = call.ID
			}
			parts = append(parts, map[string]any{"functionResponse": response})
		}
		contents = append(contents, map[string]any{"role": "user", "parts": parts})
	}
	body := map[string]any{"systemInstruction": map[string]any{"parts": []any{map[string]string{"text": prompt}}}, "contents": contents, "tools": []any{map[string]any{"functionDeclarations": []any{map[string]any{"name": "check_calendar_slots", "description": "Check real appointment availability for a date in the configured business timezone. Does not book. Returns selectable time buttons, not a completed booking. The visitor selects a time to open contact details and confirm. Use optional time bounds for preferences; do not repeat a list of times in prose.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"date": map[string]string{"type": "string", "description": "Date in YYYY-MM-DD format, within the next 60 days."}, "not_before": map[string]string{"type": "string", "description": "Optional earliest appointment start in HH:MM business-local time, for example 14:00 for afternoon after 2 pm."}, "before": map[string]string{"type": "string", "description": "Optional latest appointment end in HH:MM business-local time; 24:00 means end of day."}}, "required": []string{"date"}}}}}}, "generationConfig": map[string]any{"maxOutputTokens": 2048, "temperature": 0.3}}
	encoded, e := json.Marshal(body)
	if e != nil {
		return reply, e
	}
	model := c.Model
	if model == "" {
		model = "gemini-2.5-flash"
	}
	base := c.BaseURL
	if base == "" {
		base = "https://generativelanguage.googleapis.com/v1beta"
	}
	req, e := http.NewRequestWithContext(ctx, "POST", base+"/models/"+url.PathEscape(model)+":generateContent", bytes.NewReader(encoded))
	if e != nil {
		return reply, e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", c.APIKey)
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	res, e := client.Do(req)
	if e != nil {
		return reply, errors.New("receptionist model unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return reply, errors.New("receptionist model request failed")
	}
	var response struct {
		Candidates []struct {
			Content      json.RawMessage `json:"content"`
			FinishReason string          `json:"finishReason"`
		} `json:"candidates"`
	}
	if e = json.NewDecoder(io.LimitReader(res.Body, 2<<20)).Decode(&response); e != nil {
		return reply, e
	}
	if len(response.Candidates) == 0 {
		return reply, errors.New("no model response")
	}
	candidate := response.Candidates[0]
	if candidate.FinishReason != "STOP" {
		return reply, errors.New("incomplete model response")
	}
	reply.State = candidate.Content
	var content struct {
		Parts []struct {
			Text    string          `json:"text"`
			Thought bool            `json:"thought"`
			Call    *ports.ToolCall `json:"functionCall"`
		} `json:"parts"`
	}
	if e = json.Unmarshal(candidate.Content, &content); e != nil {
		return reply, e
	}
	var texts []string
	for _, part := range content.Parts {
		if part.Thought {
			continue
		}
		if part.Text != "" {
			texts = append(texts, part.Text)
		}
		if part.Call != nil {
			reply.Calls = append(reply.Calls, *part.Call)
		}
	}
	reply.Text = strings.Join(texts, "\n")
	return reply, nil
}
