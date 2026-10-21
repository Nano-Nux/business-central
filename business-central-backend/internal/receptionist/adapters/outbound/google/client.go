package google

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"business-central-backend/internal/receptionist/domain"
	"business-central-backend/internal/receptionist/ports"
)

type Client struct {
	ClientID, ClientSecret, RedirectURL string
	HTTP                                *http.Client
	// Overridden only by adapter tests, never from visitor input.
	TokenURL, CalendarURL string
}

func (c *Client) client() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 20 * time.Second}
}
func (c *Client) Configured() bool {
	return c.ClientID != "" && c.ClientSecret != "" && c.RedirectURL != ""
}
func (c *Client) URL(state, verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	q := url.Values{"client_id": {c.ClientID}, "redirect_uri": {c.RedirectURL}, "response_type": {"code"}, "scope": {"https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy"}, "access_type": {"offline"}, "prompt": {"consent"}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(h[:])}, "code_challenge_method": {"S256"}}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (c *Client) token(ctx context.Context, values url.Values) (t tokenResponse, err error) {
	endpoint := c.TokenURL
	if endpoint == "" {
		endpoint = "https://oauth2.googleapis.com/token"
	}
	values.Set("client_id", c.ClientID)
	values.Set("client_secret", c.ClientSecret)
	req, e := http.NewRequestWithContext(ctx, "POST", endpoint, strings.NewReader(values.Encode()))
	if e != nil {
		return t, e
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, e := c.client().Do(req)
	if e != nil {
		return t, errors.New("Google authorization unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return t, errors.New("Google credentials rejected; reconnect Calendar")
	}
	e = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&t)
	return t, e
}
func (c *Client) Exchange(ctx context.Context, code, verifier string) (string, error) {
	t, e := c.token(ctx, url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {c.RedirectURL}, "code_verifier": {verifier}})
	if e != nil {
		return "", e
	}
	if t.RefreshToken == "" {
		return "", errors.New("Google did not grant offline access")
	}
	return t.RefreshToken, nil
}
func (c *Client) call(ctx context.Context, refresh, method, path string, body any) (data []byte, status int, err error) {
	t, e := c.token(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}})
	if e != nil {
		return nil, 0, e
	}
	if t.AccessToken == "" {
		return nil, 0, errors.New("Google did not return an access token")
	}
	base := c.CalendarURL
	if base == "" {
		base = "https://www.googleapis.com/calendar/v3"
	}
	var payload []byte
	if body != nil {
		payload, e = json.Marshal(body)
		if e != nil {
			return nil, 0, e
		}
	}
	req, e := http.NewRequestWithContext(ctx, method, base+path, bytes.NewReader(payload))
	if e != nil {
		return nil, 0, e
	}
	req.Header.Set("Authorization", "Bearer "+t.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	res, e := c.client().Do(req)
	if e != nil {
		return nil, 0, errors.New("Google Calendar request could not be confirmed")
	}
	defer res.Body.Close()
	data, e = io.ReadAll(io.LimitReader(res.Body, 2<<20))
	return data, res.StatusCode, e
}
func (c *Client) Busy(ctx context.Context, refresh string, settings domain.Settings, span domain.Slot) (busy []domain.Slot, err error) {
	data, status, e := c.call(ctx, refresh, "POST", "/freeBusy", map[string]any{"timeMin": span.Start, "timeMax": span.End, "timeZone": settings.Timezone, "items": []any{map[string]string{"id": settings.CalendarID}}})
	if e != nil {
		return nil, e
	}
	if status != 200 {
		return nil, fmt.Errorf("Google availability returned HTTP %d", status)
	}
	var result struct {
		Calendars map[string]struct {
			Busy   []domain.Slot     `json:"busy"`
			Errors []json.RawMessage `json:"errors"`
		} `json:"calendars"`
	}
	if e = json.Unmarshal(data, &result); e != nil {
		return nil, e
	}
	cal, ok := result.Calendars[settings.CalendarID]
	if !ok || len(cal.Errors) > 0 {
		return nil, errors.New("Google calendar is not accessible")
	}
	return cal.Busy, nil
}

type event struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	URL    string `json:"htmlLink"`
	Start  struct {
		DateTime time.Time `json:"dateTime"`
	} `json:"start"`
	End struct {
		DateTime time.Time `json:"dateTime"`
	} `json:"end"`
	Extended struct {
		Private map[string]string `json:"private"`
	} `json:"extendedProperties"`
}

func eventURL(raw string) string {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || (u.Host != "www.google.com" && u.Host != "calendar.google.com") {
		return ""
	}
	return u.String()
}
func verifyEvent(data []byte, b domain.Booking) (string, error) {
	var event event
	if e := json.Unmarshal(data, &event); e != nil {
		return "", e
	}
	if event.ID != b.EventID || event.Status == "cancelled" || event.Extended.Private["nanonux_booking_id"] != b.ID || !event.Start.DateTime.Equal(b.Start) || !event.End.DateTime.Equal(b.End) {
		return "", errors.New("Google event identity does not match the booking")
	}
	return eventURL(event.URL), nil
}
func (c *Client) Find(ctx context.Context, refresh string, b domain.Booking) (string, bool, error) {
	data, status, e := c.call(ctx, refresh, "GET", "/calendars/"+url.PathEscape(b.CalendarID)+"/events/"+url.PathEscape(b.EventID), nil)
	if e != nil {
		return "", false, e
	}
	if status == 404 {
		return "", false, nil
	}
	if status != 200 {
		return "", false, fmt.Errorf("Google event lookup returned HTTP %d", status)
	}
	link, e := verifyEvent(data, b)
	return link, true, e
}
func (c *Client) Create(ctx context.Context, refresh string, b domain.Booking) (string, error) {
	data, status, e := c.call(ctx, refresh, "POST", "/calendars/"+url.PathEscape(b.CalendarID)+"/events?sendUpdates=all", map[string]any{"id": b.EventID, "summary": "Nanonux Business Central — demo / support call", "description": "Name: " + b.Name + "\nCompany: " + b.Company + "\nRequest: " + b.Notes + "\nBooking reference: " + b.ID, "start": map[string]any{"dateTime": b.Start, "timeZone": b.Timezone}, "end": map[string]any{"dateTime": b.End, "timeZone": b.Timezone}, "attendees": []any{map[string]string{"email": b.Email, "displayName": b.Name}}, "extendedProperties": map[string]any{"private": map[string]string{"nanonux_booking_id": b.ID}}, "guestsCanModify": false, "guestsCanInviteOthers": false})
	if e != nil {
		return "", e
	}
	if status == 409 {
		link, found, e := c.Find(ctx, refresh, b)
		if e == nil && !found {
			return "", errors.New("Google event conflict could not be reconciled")
		}
		return link, e
	}
	if status != 200 && status != 201 {
		if status == 400 || status == 401 || status == 403 || status == 404 || status == 410 || status == 422 {
			return "", ports.ErrCalendarRejected
		}
		return "", fmt.Errorf("Google event creation returned HTTP %d", status)
	}
	return verifyEvent(data, b)
}
