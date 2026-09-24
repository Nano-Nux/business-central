package outbound

import (
	"context"
)

type ToolCallResult struct {
	ToolName string
	SQLQuery string
}

type ConversationMessage struct {
	Role    string // "user" or "model"
	Content string
}

type LLMClient interface {
	GenerateQueryToolCall(ctx context.Context, systemPrompt string, history []ConversationMessage, userPrompt string) (directResponse string, toolCall *ToolCallResult, err error)
	HumanizeAndFormatHTML(ctx context.Context, userPrompt string, queryData []map[string]any, executedSQL string) (string, error)
	TranscribeAudio(ctx context.Context, audioBytes []byte, mimeType string) (string, error)
}
