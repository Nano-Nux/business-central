package outbound

import (
	"business-central-backend/internal/ai/domain"
	"context"
)

type ToolCallResult struct {
	ToolName string
	Query    domain.ReadQuery
}

type ConversationMessage struct {
	Role    string // "user" or "model"
	Content string
}

type LLMClient interface {
	GenerateQueryToolCall(ctx context.Context, systemPrompt string, history []ConversationMessage, userPrompt string, observations []domain.ReadObservation) (directResponse string, toolCall *ToolCallResult, err error)
	HumanizeAndFormatHTML(ctx context.Context, userPrompt string, observations []domain.ReadObservation, defaultCurrency string) (string, error)
	TranscribeAudio(ctx context.Context, audioBytes []byte, mimeType string) (string, error)
}
