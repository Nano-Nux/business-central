package application

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"business-central-backend/internal/ai/domain"
	"business-central-backend/internal/ai/ports/outbound"
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
)

const (
	maxReadSteps          = 5
	maxReadRows           = 300
	maxObservationBytes   = 128 * 1024
	readPlanningTimeout   = 45 * time.Second
	readStepTimeout       = 15 * time.Second
	readFormattingTimeout = 25 * time.Second
)

// answerReadOnly owns the loop, budgets and scope. The model only proposes
// structured reads. Current-turn observations are never stored or sent to clients.
func (s *Service) answerReadOnly(ctx context.Context, claims *authdto.Claims, shopID string, isStaff bool, prompt string, history []outbound.ConversationMessage, question string, catalog []domain.ReadDataset, currency string) (string, int, error) {
	planCtx, cancel := context.WithTimeout(ctx, readPlanningTimeout)
	defer cancel()
	observations := []domain.ReadObservation{}
	seen := map[string]bool{}
	rowCount := 0
	incomplete := false
	truncated := false
	finished := false
	for step := 0; step < maxReadSteps; step++ {
		if err := planCtx.Err(); err != nil {
			incomplete = true
			break
		}
		if err := s.checkInvestigationAccess(planCtx, claims, shopID, isStaff); err != nil {
			return "", 0, err
		}
		stepCtx, stop := context.WithTimeout(planCtx, readStepTimeout)
		direct, call, err := s.llm.GenerateQueryToolCall(stepCtx, prompt, history, question, observations)
		stop()
		if err != nil {
			if errors.Is(err, domain.ErrInvalidTool) {
				return "", 0, app.NewError("AI_INVALID_TOOL", "AI requested an unavailable tool.", 502)
			}
			if errors.Is(err, domain.ErrInvalidRead) {
				var fits bool
				observations, fits = appendReadObservation(observations, domain.ReadObservation{Error: "READ_REJECTED: use only the declared structured read schema and approved catalog."})
				if !fits {
					incomplete = true
					break
				}
				continue
			}
			if len(observations) == 0 {
				return "", 0, fmt.Errorf("ai query analysis: %w", err)
			}
			incomplete = true
			break
		}
		if call == nil {
			if len(observations) == 0 {
				if err := s.checkInvestigationAccess(ctx, claims, shopID, isStaff); err != nil {
					return "", 0, err
				}
				return conversationalHTML(direct), 0, nil
			}
			finished = true
			break
		}
		if call.ToolName != "read_shop_data" {
			return "", 0, app.NewError("AI_INVALID_TOOL", "AI requested an unavailable tool.", 502)
		}
		query := call.Query
		// Clamp only otherwise valid limits; invalid proposals still reach the
		// compiler and are rejected rather than silently made valid.
		remaining := maxReadRows - rowCount
		if query.Limit >= 0 && query.Limit <= 100 && (query.Limit == 0 || query.Limit > remaining) {
			query.Limit = min(100, remaining)
		}
		encoded, err := json.Marshal(query)
		if err != nil || len(encoded) > 16*1024 {
			var fits bool
			observations, fits = appendReadObservation(observations, domain.ReadObservation{Error: "READ_REJECTED: read arguments exceed the allowed bounds."})
			if !fits {
				incomplete = true
				break
			}
			continue
		}
		if seen[string(encoded)] {
			incomplete = true
			break
		}
		seen[string(encoded)] = true
		// Recheck immediately before execution as well as before planning. This
		// also prevents sending earlier privileged results after a role downgrade.
		if err := s.checkInvestigationAccess(planCtx, claims, shopID, isStaff); err != nil {
			return "", 0, err
		}
		rows, readErr := s.repo.ExecuteReadOnlyQuery(planCtx, claims.MerchantID, claims.MembershipID, shopID, claims.IdentityID, query, isStaff)
		observation := domain.ReadObservation{Query: query}
		if readErr != nil {
			if errors.Is(readErr, domain.ErrReadRestricted) {
				if err := s.checkInvestigationAccess(ctx, claims, shopID, isStaff); err != nil {
					return "", 0, err
				}
				return "<div class=\"ai-restriction-box\"><p>Business profit, profit margins, and original purchase prices are confidential store metrics strictly restricted to merchant owners.</p></div>", 0, nil
			}
			if errors.Is(readErr, domain.ErrInvalidRead) {
				observation.Error = "READ_REJECTED: use only approved datasets, columns, operators and value types; restricted data is unavailable."
			} else {
				// Never feed SQL, driver diagnostics, infrastructure or record data
				// from an error into the planner, formatter or stored HTML.
				observation.Error = "READ_UNAVAILABLE: the requested data could not be retrieved."
				incomplete = true
			}
		} else {
			observation.Records = domain.FormatMoneyRecords(rows, query, catalog, currency)
			observation.PossiblyTruncated = len(rows) >= query.Limit && query.Limit > 0
		}
		candidate, fits := appendReadObservation(observations, observation)
		if !fits || len(rows) > remaining {
			incomplete = true
			break
		}
		observations = candidate
		rowCount += len(observation.Records)
		truncated = truncated || observation.PossiblyTruncated
		if readErr != nil && !errors.Is(readErr, domain.ErrInvalidRead) {
			break
		}
		if rowCount >= maxReadRows {
			incomplete = true
			break
		}
	}
	if !finished {
		incomplete = true
	}
	// Use the parent budget so exhausting the planning budget still leaves time
	// for the tool-free formatter and persistence. Access failures discard data.
	if err := s.checkInvestigationAccess(ctx, claims, shopID, isStaff); err != nil {
		return "", 0, err
	}
	formatCtx, stop := context.WithTimeout(ctx, readFormattingTimeout)
	defer stop()
	answer, _ := s.llm.HumanizeAndFormatHTML(formatCtx, question, observations, currency)
	if strings.TrimSpace(answer) == "" {
		answer = "<p>The requested information could not be fully retrieved. Please try a more specific question.</p>"
	}
	if incomplete || truncated {
		answer += readLimitNotice(question)
	}
	if err := s.checkInvestigationAccess(ctx, claims, shopID, isStaff); err != nil {
		return "", 0, err
	}
	return answer, rowCount, nil
}

func appendReadObservation(existing []domain.ReadObservation, next domain.ReadObservation) ([]domain.ReadObservation, bool) {
	candidate := append(append([]domain.ReadObservation{}, existing...), next)
	payload, err := json.Marshal(candidate)
	if err != nil || len(payload) > maxObservationBytes {
		return existing, false
	}
	return candidate, true
}

func (s *Service) checkInvestigationAccess(ctx context.Context, claims *authdto.Claims, shopID string, isStaff bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := s.checkAccess(ctx, claims); err != nil {
		return err
	}
	if err := s.requireShop(ctx, claims, &shopID); err != nil {
		return err
	}
	isOwner, err := s.auth.HasAnyRole(ctx, claims, "owner", "merchant")
	if err != nil {
		return err
	}
	if (!isOwner && !claims.PlatformAdmin) != isStaff {
		return app.NewError("FORBIDDEN", "Your permissions changed. Please start a new request.", 403)
	}
	return nil
}

func conversationalHTML(text string) string {
	if strings.TrimSpace(text) == "" {
		text = "I'm Nanonux AI. How can I assist you with your business today?"
	}
	var result strings.Builder
	for _, paragraph := range strings.Split(text, "\n\n") {
		if paragraph = strings.TrimSpace(paragraph); paragraph != "" {
			result.WriteString("<p>" + strings.ReplaceAll(html.EscapeString(paragraph), "\n", "<br/>") + "</p>")
		}
	}
	return result.String()
}

func readLimitNotice(question string) string {
	if domain.IsMyanmarQuestion(question) {
		return "<p><strong>အချက်အလက်အချို့ မပြည့်စုံနိုင်ပါ။</strong> ရှာဖွေမှု သို့မဟုတ် ရလဒ်အရေအတွက် ကန့်သတ်ချက်ကြောင့် ရလဒ်များကို အပြည့်အစုံဟု မယူဆပါနှင့်။ ပိုမိုတိကျသော မေးခွန်းဖြင့် ထပ်မံမေးမြန်းနိုင်ပါသည်။</p>"
	}
	return "<p><strong>Some information may be incomplete.</strong> A read failed or an investigation/result limit was reached. Treat limited results as a sample, not a complete listing; ask a more specific question if needed.</p>"
}
