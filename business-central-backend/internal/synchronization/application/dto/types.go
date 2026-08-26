package dto

import (
	"encoding/json"
	"time"
)

const ProtocolVersion = "1"

type RegisterDeviceRequest struct {
	DeviceIdentifier string `json:"device_identifier"`
	DeviceName       string `json:"device_name,omitempty"`
	ClientSessionKey string `json:"client_session_key"`
	Scope            string `json:"scope,omitempty"`
}

type Device struct {
	ID               string    `json:"id"`
	MerchantID       string    `json:"merchant_id"`
	MembershipID     *string   `json:"membership_id,omitempty"`
	DeviceIdentifier string    `json:"device_identifier"`
	DeviceName       *string   `json:"device_name,omitempty"`
	LastSeenAt       time.Time `json:"last_seen_at"`
	IsActive         bool      `json:"is_active"`
}

type Session struct {
	ID                 string    `json:"id"`
	ClientSessionKey   string    `json:"client_session_key"`
	Status             string    `json:"status"`
	Scope              string    `json:"scope"`
	LastServerSequence int64     `json:"last_server_sequence"`
	StartedAt          time.Time `json:"started_at"`
}

type Handshake struct {
	ProtocolVersion string  `json:"protocol_version"`
	SchemaVersion   string  `json:"schema_version"`
	Device          Device  `json:"device"`
	Session         Session `json:"session"`
	ServerSequence  int64   `json:"server_sequence"`
}

type Operation struct {
	ClientOperationID     string          `json:"operation_id"`
	EntityType            string          `json:"entity_type"`
	EntityID              string          `json:"entity_id"`
	ShopID                *string         `json:"shop_id,omitempty"`
	OperationType         string          `json:"operation_type"`
	BaseVersion           *int64          `json:"base_version,omitempty"`
	PayloadHash           string          `json:"payload_hash,omitempty"`
	DependencyOperationID string          `json:"dependency_operation_id,omitempty"`
	Payload               json.RawMessage `json:"payload"`
	ClientCreatedAt       *time.Time      `json:"client_created_at,omitempty"`
}

type PushRequest struct {
	SessionID  string      `json:"session_id"`
	Operations []Operation `json:"operations"`
}

type OperationResult struct {
	ClientOperationID string          `json:"operation_id"`
	ServerOperationID string          `json:"server_operation_id,omitempty"`
	Status            string          `json:"status"`
	Code              string          `json:"code,omitempty"`
	Message           string          `json:"message,omitempty"`
	ServerSequence    *int64          `json:"server_sequence,omitempty"`
	EntityVersion     *int64          `json:"entity_version,omitempty"`
	ServerPayload     json.RawMessage `json:"server_payload,omitempty"`
}

type PushResponse struct {
	Results []OperationResult `json:"results"`
}

type ResolveConflictRequest struct {
	Strategy string `json:"strategy"`
}

type ConflictResolution struct {
	OperationID    string          `json:"operation_id"`
	Strategy       string          `json:"strategy"`
	Status         string          `json:"status"`
	EntityVersion  int64           `json:"entity_version"`
	ServerSequence *int64          `json:"server_sequence,omitempty"`
	ServerPayload  json.RawMessage `json:"server_payload"`
}

type PullRequest struct {
	SessionID     string `json:"session_id"`
	Scope         string `json:"scope,omitempty"`
	AfterSequence int64  `json:"after_sequence"`
	Limit         int    `json:"limit,omitempty"`
}

type Change struct {
	ServerSequence int64           `json:"server_sequence"`
	EntityType     string          `json:"entity_type"`
	EntityID       string          `json:"entity_id"`
	EntityVersion  int64           `json:"entity_version"`
	OperationType  string          `json:"operation_type"`
	OperationID    *string         `json:"operation_id,omitempty"`
	Payload        json.RawMessage `json:"payload"`
	CreatedAt      time.Time       `json:"created_at"`
}

type PullResponse struct {
	Scope           string   `json:"scope"`
	Changes         []Change `json:"changes"`
	NextSequence    int64    `json:"next_sequence"`
	CurrentSequence int64    `json:"current_sequence"`
	HasMore         bool     `json:"has_more"`
}
