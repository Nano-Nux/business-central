package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"business-central-backend/internal/ai/ports/outbound"
)

type Config struct {
	APIKey                       string
	QueryGenerateAIModel        string
	QueryGenerateAIModelFallback string
	HumanizerAIModel            string
	HumanizerAIModelFallback    string
}

type Client struct {
	apiKey                       string
	queryGenerateAIModel        string
	queryGenerateAIModelFallback string
	humanizerAIModel            string
	humanizerAIModelFallback    string
	httpClient                  *http.Client
}

func NewClient(cfg Config) *Client {
	qModel := cfg.QueryGenerateAIModel
	if qModel == "" {
		qModel = "gemini-3.5-flash-lite"
	}
	qFallback := cfg.QueryGenerateAIModelFallback
	if qFallback == "" {
		qFallback = "gemini-3.1-flash-lite"
	}
	hModel := cfg.HumanizerAIModel
	if hModel == "" {
		hModel = "gemma-4-31b"
	}
	hFallback := cfg.HumanizerAIModelFallback
	if hFallback == "" {
		hFallback = "gemma-4-27b"
	}

	return &Client{
		apiKey:                       cfg.APIKey,
		queryGenerateAIModel:        qModel,
		queryGenerateAIModelFallback: qFallback,
		humanizerAIModel:            hModel,
		humanizerAIModelFallback:    hFallback,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// Data structures for Google Generative AI REST API
type geminiRequest struct {
	SystemInstruction *geminiContent `json:"system_instruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	Tools             []geminiTool    `json:"tools,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text         string              `json:"text,omitempty"`
	Thought      bool                `json:"thought,omitempty"`
	FunctionCall *geminiFunctionCall `json:"functionCall,omitempty"`
	InlineData   *geminiInlineData   `json:"inline_data,omitempty"`
}

type geminiInlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"` // base64
}

type geminiFunctionCall struct {
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

type geminiTool struct {
	FunctionDeclarations []geminiFunctionDeclaration `json:"function_declarations"`
}

type geminiFunctionDeclaration struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []geminiPart `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

func (c *Client) normalizeModelName(model string) string {
	m := strings.TrimPrefix(model, "models/")
	// Map known model aliases to API identifiers
	switch m {
	case "gemma-4-31b":
		return "gemma-4-31b-it"
	case "gemma-4-27b":
		return "gemma-4-26b-a4b-it"
	default:
		return m
	}
}

func (c *Client) postGenerateContent(ctx context.Context, model string, req geminiRequest) (*geminiResponse, error) {
	if c.apiKey == "" {
		return nil, errors.New("GEMINI_API_KEY is not configured")
	}

	modelName := c.normalizeModelName(model)
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", modelName)

	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBytes))
	if err != nil {
		return nil, fmt.Errorf("create http request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do http request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	var geminiResp geminiResponse
	if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("unmarshal response (status %d): %w", resp.StatusCode, err)
	}

	if geminiResp.Error != nil {
		return nil, fmt.Errorf("gemini api error (%d %s): %s", geminiResp.Error.Code, geminiResp.Error.Status, geminiResp.Error.Message)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("gemini api returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return &geminiResp, nil
}

func (c *Client) GenerateQueryToolCall(ctx context.Context, systemPrompt string, history []outbound.ConversationMessage, userPrompt string) (directResponse string, toolCall *outbound.ToolCallResult, err error) {
	contents := make([]geminiContent, 0, len(history)+1)
	for _, h := range history {
		role := h.Role
		if role == "assistant" {
			role = "model"
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: h.Content}},
		})
	}
	contents = append(contents, geminiContent{
		Role:  "user",
		Parts: []geminiPart{{Text: userPrompt}},
	})

	tools := []geminiTool{
		{
			FunctionDeclarations: []geminiFunctionDeclaration{
				{
					Name: "run_read_only_sql",
					Description: "Execute a safe, read-only SELECT SQL query against the merchant PostgreSQL database to retrieve data (products, prices, orders, sales, profit, inventory balances, customers, shops). Always scope merchant-specific queries to the current merchant_id.",
					Parameters: map[string]any{
						"type": "OBJECT",
						"properties": map[string]any{
							"sql_query": map[string]any{
								"type":        "STRING",
								"description": "The exact SELECT SQL query to execute in PostgreSQL. Must only be SELECT statements.",
							},
						},
						"required": []string{"sql_query"},
					},
				},
			},
		},
	}

	req := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: contents,
		Tools:    tools,
	}

	// Try primary model first, fallback on error
	resp, err := c.postGenerateContent(ctx, c.queryGenerateAIModel, req)
	if err != nil {
		log.Printf("AI primary query model (%s) failed: %v. Trying fallback (%s)...", c.queryGenerateAIModel, err, c.queryGenerateAIModelFallback)
		resp, err = c.postGenerateContent(ctx, c.queryGenerateAIModelFallback, req)
		if err != nil {
			return "", nil, fmt.Errorf("query generation failed on both primary and fallback: %w", err)
		}
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", nil, errors.New("empty response from query generation model")
	}

	for _, part := range resp.Candidates[0].Content.Parts {
		if part.FunctionCall != nil && part.FunctionCall.Name == "run_read_only_sql" {
			var args struct {
				SQLQuery string `json:"sql_query"`
			}
			if err := json.Unmarshal(part.FunctionCall.Args, &args); err == nil && args.SQLQuery != "" {
				return "", &outbound.ToolCallResult{
					ToolName: "run_read_only_sql",
					SQLQuery: args.SQLQuery,
				}, nil
			}
		}
	}

	// Direct text response - extract only non-thought conversational parts
	directText := extractResponseText(resp.Candidates[0].Content.Parts)
	return directText, nil, nil
}

func (c *Client) HumanizeAndFormatHTML(ctx context.Context, userPrompt string, queryData []map[string]any, executedSQL string) (string, error) {
	queryDataJSON, _ := json.MarshalIndent(queryData, "", "  ")

	systemPrompt := `You are Nanonux AI, an intelligent, calm, and highly capable business assistant for Business Central.
The user asked a question, and the system retrieved the database records below.
Your task is to analyze the data, answer the user's question accurately, and format the output directly as semantic HTML.

RULES:
1. OUTPUT HTML DIRECTLY: Output clean semantic HTML without wrapping in markdown code blocks like ` + "```html ... ```" + `.
2. NO INTERNAL REASONING / SCRATCHPAD: Output ONLY the final conversational response. Never output planning notes, internal reasoning, or scratchpad steps.
3. HUMANIZED, CALM & EMPATHETIC: Always speak in a professional, warm, and natural conversational tone. When there are zero records or an empty result, clearly and reassuringly explain what this means in plain business terms (e.g. reassuring the user that all products are currently well-stocked and none are low on stock), rather than stating raw empty data.
4. TABLES: When presenting lists, comparisons, variant prices, inventory levels, order items, or metrics with rows, render an HTML <table> with <thead>, <tr>, <th> and <tbody>, <tr>, <td>.
5. STAT HIGHLIGHTS: For top-level metrics (e.g. today's total revenue, profit, total quantity, items low on stock), highlight them using metric cards or strong badges like:
   <div class="ai-stat-card"><span class="stat-label">Total Revenue</span><strong>12,500.00 THB</strong></div>
6. CURRENCY & FORMATTING: Format currency amounts with proper 2 decimal places and currency symbol/code. If profit is positive, use green emphasis; if negative, red.
7. NO RAW JSON OR SQL: Never expose raw JSON syntax, internal database table names, or technical SQL queries to the user. Present the findings with warmth and clarity.
8. CONCISE: Provide a clear answer followed by any structured table/breakdown.`

	prompt := fmt.Sprintf("User Question: %s\n\nExecuted Query: %s\n\nDatabase Records (%d rows):\n%s\n\nPlease formulate the response in HTML format.",
		userPrompt, executedSQL, len(queryData), string(queryDataJSON))

	req := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: systemPrompt}},
		},
		Contents: []geminiContent{
			{
				Role:  "user",
				Parts: []geminiPart{{Text: prompt}},
			},
		},
	}

	// Try humanizer models in sequence: Primary -> Fallback -> Primary query generator
	modelsToTry := []string{
		c.humanizerAIModel,
		c.humanizerAIModelFallback,
		c.queryGenerateAIModel,
	}

	var lastErr error
	for _, model := range modelsToTry {
		resp, err := c.postGenerateContent(ctx, model, req)
		if err == nil && len(resp.Candidates) > 0 && len(resp.Candidates[0].Content.Parts) > 0 {
			rawHTML := extractResponseText(resp.Candidates[0].Content.Parts)
			if rawHTML != "" {
				cleaned := cleanHTMLOutput(rawHTML)
				if cleaned != "" {
					return cleaned, nil
				}
			}
		}
		if err != nil {
			lastErr = err
			log.Printf("Humanizer model %s failed: %v. Trying next...", model, err)
		}
	}

	// If all LLM calls failed, generate a clean programmatic HTML table fallback
	return fallbackHTMLFormat(userPrompt, queryData), lastErr
}

func (c *Client) TranscribeAudio(ctx context.Context, audioBytes []byte, mimeType string) (string, error) {
	if len(audioBytes) == 0 {
		return "", errors.New("audio data is empty")
	}
	if mimeType == "" {
		mimeType = "audio/webm"
	}

	base64Audio := base64.StdEncoding.EncodeToString(audioBytes)

	req := geminiRequest{
		Contents: []geminiContent{
			{
				Parts: []geminiPart{
					{
						InlineData: &geminiInlineData{
							MimeType: mimeType,
							Data:     base64Audio,
						},
					},
					{
						Text: "Transcribe the spoken words in this audio verbatim. Output only the transcribed text with punctuation. Do not include quotes, timestamps, or explanatory words.",
					},
				},
			},
		},
	}

	// Use audio-capable model
	model := "gemini-3.5-flash-lite"
	resp, err := c.postGenerateContent(ctx, model, req)
	if err != nil {
		// Try fallback
		resp, err = c.postGenerateContent(ctx, c.queryGenerateAIModelFallback, req)
		if err != nil {
			return "", fmt.Errorf("transcription failed: %w", err)
		}
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", errors.New("no transcription returned")
	}

	transcribed := extractResponseText(resp.Candidates[0].Content.Parts)
	if transcribed == "" {
		return "", errors.New("no transcription text returned")
	}
	return transcribed, nil
}

var (
	scriptTagRegex  = regexp.MustCompile(`(?is)<\s*script[^>]*>.*?<\s*/\s*script\s*>`)
	styleTagRegex   = regexp.MustCompile(`(?is)<\s*style[^>]*>.*?<\s*/\s*style\s*>`)
	iframeTagRegex  = regexp.MustCompile(`(?is)<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>`)
	objectTagRegex  = regexp.MustCompile(`(?is)<\s*object[^>]*>.*?<\s*/\s*object\s*>`)
	embedTagRegex   = regexp.MustCompile(`(?is)<\s*embed[^>]*>.*?<\s*/\s*embed\s*>`)
	formTagRegex    = regexp.MustCompile(`(?is)<\s*form[^>]*>.*?<\s*/\s*form\s*>`)
	linkMetaRegex   = regexp.MustCompile(`(?is)<\s*(link|meta|base)[^>]*>`)
	eventAttrRegex  = regexp.MustCompile(`(?i)\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)`)
	jsProtocolRegex = regexp.MustCompile(`(?i)\b(?:href|src)\s*=\s*["']?\s*javascript:[^"'>]*["']?`)
	dataHTMLRegex   = regexp.MustCompile(`(?i)\b(?:href|src)\s*=\s*["']?\s*data:text/html[^"'>]*["']?`)
	thoughtTagRegex = regexp.MustCompile(`(?is)<\s*(?:thought|think)[^>]*>.*?<\s*/\s*(?:thought|think)\s*>`)
)

// extractResponseText filters out internal chain-of-thought/reasoning parts (where Thought == true)
// and returns the actual conversational response text intended for the user.
func extractResponseText(parts []geminiPart) string {
	var sb strings.Builder
	for _, part := range parts {
		if !part.Thought && part.Text != "" {
			cleaned := thoughtTagRegex.ReplaceAllString(part.Text, "")
			sb.WriteString(cleaned)
		}
	}
	res := strings.TrimSpace(sb.String())
	if res != "" {
		return res
	}

	// Fallback: If no non-thought part has text, check if text was returned with inline thought tags
	for _, part := range parts {
		if part.Text != "" {
			cleaned := thoughtTagRegex.ReplaceAllString(part.Text, "")
			cleaned = strings.TrimSpace(cleaned)
			if cleaned != "" {
				return cleaned
			}
		}
	}
	return ""
}

func cleanHTMLOutput(raw string) string {
	trimmed := strings.TrimSpace(raw)
	// Strip any inline thought/think tags
	trimmed = thoughtTagRegex.ReplaceAllString(trimmed, "")
	trimmed = strings.TrimSpace(trimmed)

	// If the model wrapped in ```html ... ```, remove fences
	if strings.HasPrefix(trimmed, "```html") {
		trimmed = strings.TrimPrefix(trimmed, "```html")
		trimmed = strings.TrimSuffix(trimmed, "```")
	} else if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
	}
	trimmed = strings.TrimSpace(trimmed)

	// Strip dangerous XSS vectors
	trimmed = scriptTagRegex.ReplaceAllString(trimmed, "")
	trimmed = styleTagRegex.ReplaceAllString(trimmed, "")
	trimmed = iframeTagRegex.ReplaceAllString(trimmed, "")
	trimmed = objectTagRegex.ReplaceAllString(trimmed, "")
	trimmed = embedTagRegex.ReplaceAllString(trimmed, "")
	trimmed = formTagRegex.ReplaceAllString(trimmed, "")
	trimmed = linkMetaRegex.ReplaceAllString(trimmed, "")
	trimmed = eventAttrRegex.ReplaceAllString(trimmed, "")
	trimmed = jsProtocolRegex.ReplaceAllString(trimmed, "")
	trimmed = dataHTMLRegex.ReplaceAllString(trimmed, "")

	return strings.TrimSpace(trimmed)
}

func fallbackHTMLFormat(userPrompt string, queryData []map[string]any) string {
	if len(queryData) == 0 {
		return "<p>No matching records were found in the database for your query.</p>"
	}

	var sb strings.Builder
	sb.WriteString("<p>Here is the retrieved information:</p>")
	sb.WriteString("<div class=\"table-wrap\"><table class=\"ai-table\"><thead><tr>")

	// Get headers from first row
	headers := make([]string, 0, len(queryData[0]))
	for k := range queryData[0] {
		headers = append(headers, k)
	}
	for _, h := range headers {
		sb.WriteString("<th>" + html.EscapeString(strings.Title(strings.ReplaceAll(h, "_", " "))) + "</th>")
	}
	sb.WriteString("</tr></thead><tbody>")

	for _, row := range queryData {
		sb.WriteString("<tr>")
		for _, h := range headers {
			sb.WriteString(fmt.Sprintf("<td>%s</td>", html.EscapeString(fmt.Sprintf("%v", row[h]))))
		}
		sb.WriteString("</tr>")
	}
	sb.WriteString("</tbody></table></div>")
	return sb.String()
}
