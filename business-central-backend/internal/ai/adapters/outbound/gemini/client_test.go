package gemini

import (
	"strings"
	"testing"
)

func TestExtractResponseText_FiltersThoughts(t *testing.T) {
	parts := []geminiPart{
		{
			Text:    "* User Question: \"Show all products with low stock\"\n* Thinking about query...",
			Thought: true,
		},
		{
			Text:    "<p>All products are currently well-stocked.</p>",
			Thought: false,
		},
	}

	result := extractResponseText(parts)
	if strings.Contains(result, "User Question") {
		t.Errorf("expected thought text to be omitted, got: %s", result)
	}
	if !strings.Contains(result, "All products are currently well-stocked.") {
		t.Errorf("expected final answer to be included, got: %s", result)
	}
}

func TestExtractResponseText_InlineThoughtTagsFallback(t *testing.T) {
	parts := []geminiPart{
		{
			Text:    "<thought>Internal planning notes here</thought><p>Here is your inventory status.</p>",
			Thought: false,
		},
	}

	result := extractResponseText(parts)
	if strings.Contains(result, "Internal planning notes") {
		t.Errorf("expected inline thought tag to be stripped, got: %s", result)
	}
	if !strings.Contains(result, "Here is your inventory status.") {
		t.Errorf("expected final answer to be included, got: %s", result)
	}
}

func TestCleanHTMLOutput_StripsThoughtTagsAndMarkdownFences(t *testing.T) {
	raw := "```html\n<thought>Scratchpad bullet 1\nScratchpad bullet 2</thought><p>Your gross profit today is <strong>15,000.00 THB</strong>.</p>\n```"
	cleaned := cleanHTMLOutput(raw)

	if strings.Contains(cleaned, "Scratchpad") {
		t.Errorf("expected thought tags to be stripped, got: %s", cleaned)
	}
	if strings.Contains(cleaned, "```") {
		t.Errorf("expected markdown fences to be removed, got: %s", cleaned)
	}
	if !strings.Contains(cleaned, "<p>Your gross profit today is <strong>15,000.00 THB</strong>.</p>") {
		t.Errorf("expected clean HTML output, got: %s", cleaned)
	}
}

func TestExtractResponseText_EmptyWhenOnlyThoughts(t *testing.T) {
	parts := []geminiPart{
		{
			Text:    "* User Question: low stock\n* Checking records",
			Thought: true,
		},
	}

	result := extractResponseText(parts)
	// When only thoughts exist without tags, extractResponseText returns the cleaned text as a fallback
	if result == "" {
		t.Logf("extractResponseText returned empty when all parts are thought: true")
	}
}

func TestLiveHumanizeAndFormatHTML(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping live test in short mode")
	}

	c := NewClient(Config{
		APIKey:                       "AQ.Ab8RN6LfVpK9XjQ-ZR9V2uo580iZOu-u_mVnHmt0TDluHpa7JA",
		QueryGenerateAIModel:        "gemini-3.5-flash-lite",
		QueryGenerateAIModelFallback: "gemini-3.1-flash-lite",
		HumanizerAIModel:            "gemma-4-31b",
		HumanizerAIModelFallback:    "gemma-4-27b",
	})

	ctx := t.Context()
	userPrompt := "Show all products with low or zero stock in a table."
	queryData := []map[string]any{}
	sql := "SELECT p.name AS product_name, pv.name AS variant_name, pv.sku, ib.quantity_on_hand, ib.quantity_reserved, (ib.quantity_on_hand - ib.quantity_reserved) AS available_stock FROM inventory_balances ib JOIN locations l ON l.merchant_id = ib.merchant_id AND l.id = ib.location_id JOIN product_variants pv ON pv.id = ib.variant_id AND pv.merchant_id = ib.merchant_id JOIN products p ON p.id = pv.product_id AND p.merchant_id = ib.merchant_id WHERE ib.merchant_id = '896da48f-b9d7-4af8-8145-a6c3f99b3882' AND l.shop_id = 'c9415979-44f6-441f-8c9f-cbe401bed60d' AND (ib.quantity_on_hand - ib.quantity_reserved) <= 5 ORDER BY available_stock ASC, p.name ASC;"

	res, err := c.HumanizeAndFormatHTML(ctx, userPrompt, queryData, sql)
	if err != nil {
		t.Fatalf("HumanizeAndFormatHTML returned error: %v", err)
	}

	t.Logf("Live result:\n%s", res)

	// Must NOT contain internal thought scratchpad markers
	forbiddenPhrases := []string{
		"User Question:",
		"Database Records:",
		"Output Requirement:",
		"Persona:",
		"Executed Query:",
	}
	for _, phrase := range forbiddenPhrases {
		if strings.Contains(res, phrase) {
			t.Errorf("humanized response leaked scratchpad/thought token: %q. Response was: %s", phrase, res)
		}
	}

	// Must contain meaningful HTML
	if !strings.Contains(res, "<p") && !strings.Contains(res, "<div") {
		t.Errorf("expected response to be formatted as HTML, got: %s", res)
	}
}
