package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	pospostgres "business-central-backend/internal/pos/adapters/outbound/postgres"
	posdto "business-central-backend/internal/pos/application/dto"
	"business-central-backend/internal/synchronization/application/dto"
	"business-central-backend/internal/synchronization/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ outbound.Repository = (*Repository)(nil)

// advanceCanonicalOrderStatus follows the database order state machine rather
// than jumping directly to FULFILLED when an offline repair payment is
// replayed. This mirrors the online repair payment command.
func advanceCanonicalOrderStatus(ctx context.Context, tx pgx.Tx, merchantID, orderID, target string) error {
	var current string
	if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, merchantID, orderID).Scan(&current); err != nil {
		return err
	}
	current = strings.ToUpper(strings.TrimSpace(current))
	target = strings.ToUpper(strings.TrimSpace(target))
	if target == "PENDING_PAYMENT" {
		switch current {
		case "DRAFT":
			current = "PENDING_PAYMENT"
		case "PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PARTIALLY_FULFILLED", "FULFILLED":
			return nil
		default:
			return app.Validation("A payment cannot be recorded for an order in its current status.", map[string]any{"order_status": current})
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status=$3::text,placed_at=COALESCE(placed_at,now()),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, orderID, current); err != nil {
			return err
		}
		return nil
	}
	if target == "CONFIRMED" {
		for current != "CONFIRMED" && current != "PROCESSING" && current != "PARTIALLY_FULFILLED" && current != "FULFILLED" {
			var next string
			switch current {
			case "DRAFT":
				next = "PENDING_PAYMENT"
			case "PENDING_PAYMENT":
				next = "CONFIRMED"
			default:
				return app.Validation("A repair part cannot be consumed for an order in its current status.", map[string]any{"order_status": current})
			}
			if _, err := tx.Exec(ctx, `UPDATE orders SET status=$3::text,placed_at=COALESCE(placed_at,now()),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, orderID, next); err != nil {
				return err
			}
			current = next
		}
		return nil
	}
	if target != "FULFILLED" {
		return app.Validation("The requested canonical order status is not supported for a repair payment.", map[string]any{"order_status": target})
	}
	for current != "FULFILLED" {
		var next string
		switch current {
		case "DRAFT":
			next = "PENDING_PAYMENT"
		case "PENDING_PAYMENT":
			next = "CONFIRMED"
		case "CONFIRMED":
			next = "PROCESSING"
		case "PROCESSING", "PARTIALLY_FULFILLED":
			next = "FULFILLED"
		default:
			return app.Validation("A payment cannot fulfill an order in its current status.", map[string]any{"order_status": current})
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status=$3::text,placed_at=COALESCE(placed_at,now()),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, orderID, next); err != nil {
			return err
		}
		current = next
	}
	return nil
}

type shopSettingsPayload struct {
	Name        *string         `json:"name"`
	Code        *string         `json:"code"`
	Address     json.RawMessage `json:"address"`
	Timezone    *string         `json:"timezone"`
	IsActive    *bool           `json:"is_active"`
	FooterNote  *string         `json:"footer_note"`
	IncludeTax  *bool           `json:"include_tax"`
	TaxRate     *string         `json:"tax_rate"`
	TaxLabel    *string         `json:"tax_label"`
	ReceiptNote *string         `json:"receipt_note"`
}

type deliverySyncPayload struct {
	ShopID      string `json:"shop_id"`
	Name        string `json:"name"`
	ContactInfo string `json:"contact_info"`
	IsActive    *bool  `json:"is_active"`
}

type catalogProductSyncPayload struct {
	Name            string   `json:"name"`
	Description     *string  `json:"description"`
	ProductType     string   `json:"product_type"`
	ManufactureDate *string  `json:"manufacture_date"`
	ExpiredDate     *string  `json:"expired_date"`
	IsActive        bool     `json:"is_active"`
	CategoryIDs     []string `json:"category_ids"`
}

type catalogCategorySyncPayload struct {
	ParentCategoryID *string `json:"parent_category_id"`
	Name             string  `json:"name"`
	Slug             string  `json:"slug"`
	Description      *string `json:"description"`
	ImageURL         *string `json:"image_url"`
	SortOrder        int     `json:"sort_order"`
}

type catalogVariantSyncPayload struct {
	ProductID      string          `json:"product_id"`
	SKU            string          `json:"sku"`
	Barcode        *string         `json:"barcode"`
	Name           string          `json:"name"`
	Attributes     json.RawMessage `json:"attributes"`
	UnitOfMeasure  string          `json:"unit_of_measure"`
	BaseUnitID     string          `json:"base_unit_id"`
	IsStockTracked bool            `json:"is_stock_tracked"`
}

type catalogAttributeDefinitionSyncPayload struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	ValueType string `json:"value_type"`
}

type catalogAttributeOptionSyncPayload struct {
	DefinitionID string `json:"definition_id"`
	Value        string `json:"value"`
	Label        string `json:"label"`
	Position     int    `json:"position"`
}

type productPriceSyncPayload struct {
	SyncID      string     `json:"sync_id"`
	PriceListID string     `json:"price_list_id"`
	VariantID   string     `json:"variant_id"`
	Amount      string     `json:"amount"`
	ValidFrom   time.Time  `json:"valid_from"`
	ValidUntil  *time.Time `json:"valid_until"`
}

type priceListSyncPayload struct {
	Code         string `json:"code"`
	CurrencyCode string `json:"currency_code"`
	IsDefault    bool   `json:"is_default"`
}

type catalogUnitSyncPayload struct {
	MeasurementGroupID *string `json:"measurement_group_id"`
	Code               string  `json:"code"`
	Name               string  `json:"name"`
	Symbol             *string `json:"symbol"`
	DimensionCode      string  `json:"dimension_code"`
	AllowsDecimal      bool    `json:"allows_decimal"`
	IsActive           bool    `json:"is_active"`
}

type catalogConversionSyncPayload struct {
	FromUnitID     string `json:"from_unit_id"`
	ToUnitID       string `json:"to_unit_id"`
	Multiplier     string `json:"multiplier"`
	AdditiveOffset string `json:"additive_offset"`
	IsActive       bool   `json:"is_active"`
}

type stockReceiptSyncPayload struct {
	VariantID             string `json:"variant_id"`
	DestinationLocationID string `json:"destination_location_id"`
	UnitID                string `json:"unit_id"`
	Quantity              string `json:"quantity"`
	UnitCost              string `json:"unit_cost,omitempty"`
	EventKey              string `json:"event_key"`
}

type repairDraftSyncPayload struct {
	ShopID           string          `json:"shop_id"`
	Priority         string          `json:"priority"`
	Device           json.RawMessage `json:"device"`
	IssueDescription string          `json:"issue_description"`
	CustomerName     *string         `json:"customer_name"`
	CustomerPhone    *string         `json:"customer_phone"`
	Note             *string         `json:"note"`
}

type repairDiagnosticSyncPayload struct {
	ShopID        string  `json:"shop_id"`
	RepairOrderID string  `json:"repair_order_id"`
	WorkItemID    *string `json:"work_item_id"`
	Diagnosis     string  `json:"diagnosis"`
	EstimatedCost *string `json:"estimated_cost"`
}

type repairImageSyncPayload struct {
	ShopID        string  `json:"shop_id"`
	RepairOrderID string  `json:"repair_order_id"`
	WorkItemID    *string `json:"work_item_id"`
	Filename      string  `json:"filename"`
	ContentType   string  `json:"content_type"`
	DataBase64    string  `json:"data_base64"`
}

type repairApprovalSyncPayload struct {
	ShopID          string     `json:"shop_id"`
	RepairOrderID   string     `json:"repair_order_id"`
	WorkItemID      *string    `json:"work_item_id"`
	ApprovalVersion int        `json:"approval_version"`
	Status          string     `json:"status"`
	ApprovedAmount  *string    `json:"approved_amount"`
	ApprovedAt      *time.Time `json:"approved_at"`
}

type repairWarrantySyncPayload struct {
	ShopID        string    `json:"shop_id"`
	RepairOrderID string    `json:"repair_order_id"`
	WorkItemID    *string   `json:"work_item_id"`
	StartsAt      time.Time `json:"starts_at"`
	EndsAt        time.Time `json:"ends_at"`
	Terms         *string   `json:"terms"`
}

type repairPartSyncPayload struct {
	ShopID                 string  `json:"shop_id"`
	RepairOrderID          string  `json:"repair_order_id"`
	WorkItemID             *string `json:"work_item_id"`
	VariantID              *string `json:"variant_id"`
	CustomerSuppliedPartID *string `json:"customer_supplied_part_id"`
	Quantity               string  `json:"quantity"`
	UnitPrice              string  `json:"unit_price"`
	Status                 string  `json:"status"`
	PromotionID            *string `json:"promotion_id"`
}

type repairPaymentSyncPayload struct {
	ShopID        string `json:"shop_id"`
	RepairOrderID string `json:"repair_order_id"`
	Kind          string `json:"kind"`
	PaymentTypeID string `json:"payment_type_id"`
	Method        string `json:"method"`
	Amount        string `json:"amount"`
	Allocations   []struct {
		WorkItemID string `json:"work_item_id"`
		Amount     string `json:"amount"`
	} `json:"allocations"`
}

type repairTicketSyncPayload struct {
	TicketID         string                      `json:"ticket_id"`
	ShopID           string                      `json:"shop_id"`
	OrderNumber      string                      `json:"order_number"`
	Priority         string                      `json:"priority"`
	Device           map[string]any              `json:"device"`
	IssueDescription string                      `json:"issue_description"`
	CustomerName     *string                     `json:"customer_name"`
	CustomerPhone    *string                     `json:"customer_phone"`
	AdditionalFee    string                      `json:"additional_fee"`
	Note             *string                     `json:"note"`
	Fields           map[string]json.RawMessage  `json:"fields"`
	WorkItems        []repairWorkItemSyncPayload `json:"work_items"`
}

type repairWorkItemSyncPayload struct {
	ID               string                     `json:"id"`
	Type             string                     `json:"type"`
	Device           map[string]any             `json:"device"`
	IssueDescription string                     `json:"issue_description"`
	Issues           []string                   `json:"issues"`
	Conditions       []string                   `json:"conditions"`
	Note             *string                    `json:"note"`
	WaitingDays      *int                       `json:"waiting_days"`
	WaitingEndDate   *string                    `json:"waiting_end_date"`
	Fields           map[string]json.RawMessage `json:"fields"`
}

type offlineCheckoutSnapshot struct {
	CurrencyCode  string `json:"currency_code"`
	Subtotal      string `json:"subtotal"`
	DiscountTotal string `json:"discount_total"`
	TaxTotal      string `json:"tax_total"`
	GrandTotal    string `json:"grand_total"`
}

type offlineCheckoutSyncPayload struct {
	ShopID             string                   `json:"shop_id"`
	Request            posdto.CreateSaleRequest `json:"request"`
	Snapshot           offlineCheckoutSnapshot  `json:"snapshot"`
	LineSnapshots      json.RawMessage          `json:"line_snapshots"`
	InventorySnapshots json.RawMessage          `json:"inventory_snapshots"`
}

var taxRatePattern = regexp.MustCompile(`^\d+(\.\d{1,4})?$`)

func (r *Repository) RegisterDevice(ctx context.Context, claims *authdto.Claims, request dto.RegisterDeviceRequest) (dto.Handshake, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return dto.Handshake{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return dto.Handshake{}, err
	}

	var device dto.Device
	var deviceName *string
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_devices(merchant_id,membership_id,device_identifier,device_name,last_seen_at,is_active)
		VALUES($1::uuid,NULLIF($2,'')::uuid,$3,$4,now(),TRUE)
		ON CONFLICT (merchant_id,device_identifier) DO UPDATE
		SET membership_id=COALESCE(EXCLUDED.membership_id,sync_devices.membership_id),
		    device_name=COALESCE(NULLIF(EXCLUDED.device_name,''),sync_devices.device_name),
		    last_seen_at=now(),is_active=TRUE
		RETURNING id,merchant_id,membership_id,device_identifier,device_name,last_seen_at,is_active`,
		claims.MerchantID, claims.MembershipID, request.DeviceIdentifier, request.DeviceName,
	).Scan(&device.ID, &device.MerchantID, &device.MembershipID, &device.DeviceIdentifier, &deviceName, &device.LastSeenAt, &device.IsActive); err != nil {
		return dto.Handshake{}, err
	}
	device.DeviceName = deviceName

	var session dto.Session
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_sessions(merchant_id,device_id,client_session_key,status,last_server_sequence)
		VALUES($1::uuid,$2::uuid,$3,'OPEN',COALESCE((SELECT server_sequence FROM sync_checkpoints WHERE merchant_id=$1::uuid AND device_id=$2::uuid AND scope=$4),0))
		ON CONFLICT (merchant_id,device_id,client_session_key) DO UPDATE
		SET status='OPEN',completed_at=NULL,last_server_sequence=COALESCE(sync_sessions.last_server_sequence,EXCLUDED.last_server_sequence)
		RETURNING id,client_session_key,status,COALESCE(last_server_sequence,0),started_at`,
		claims.MerchantID, device.ID, request.ClientSessionKey, request.Scope,
	).Scan(&session.ID, &session.ClientSessionKey, &session.Status, &session.LastServerSequence, &session.StartedAt); err != nil {
		return dto.Handshake{}, err
	}
	session.Scope = request.Scope
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_checkpoints(merchant_id,device_id,scope,server_sequence)
		VALUES($1::uuid,$2::uuid,$3,0)
		ON CONFLICT (merchant_id,device_id,scope) DO NOTHING`, claims.MerchantID, device.ID, request.Scope); err != nil {
		return dto.Handshake{}, err
	}
	var serverSequence int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(server_sequence),0) FROM sync_changes WHERE merchant_id=$1::uuid`, claims.MerchantID).Scan(&serverSequence); err != nil {
		return dto.Handshake{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.Handshake{}, err
	}
	return dto.Handshake{ProtocolVersion: dto.ProtocolVersion, SchemaVersion: "1", Device: device, Session: session, ServerSequence: serverSequence}, nil
}

func (r *Repository) Push(ctx context.Context, claims *authdto.Claims, request dto.PushRequest) (dto.PushResponse, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return dto.PushResponse{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return dto.PushResponse{}, err
	}
	deviceID, err := sessionDevice(ctx, tx, claims, request.SessionID)
	if err != nil {
		return dto.PushResponse{}, err
	}
	results := make([]dto.OperationResult, 0, len(request.Operations))
	for _, operation := range request.Operations {
		result, operationErr := r.applyOperation(ctx, tx, claims, deviceID, request.SessionID, operation)
		if operationErr != nil {
			return dto.PushResponse{}, operationErr
		}
		results = append(results, result)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_devices SET last_seen_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, deviceID); err != nil {
		return dto.PushResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.PushResponse{}, err
	}
	return dto.PushResponse{Results: results}, nil
}

func (r *Repository) applyOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	result := dto.OperationResult{ClientOperationID: operation.ClientOperationID}
	computedHash, err := canonicalPayloadHash(operation.Payload)
	if err != nil {
		return result, app.Validation("Operation payload must be valid JSON.", nil)
	}
	if operation.PayloadHash != "" && operation.PayloadHash != computedHash {
		return result, app.NewError("PAYLOAD_HASH_MISMATCH", "The operation payload does not match its SHA-256 hash.", 409)
	}
	operation.PayloadHash = computedHash
	var existing dto.OperationResult
	var existingEntityType, existingEntityID, existingOperationType string
	var existingServerID string
	var existingSequence, existingVersion, existingBaseVersion *int64
	var existingRequestPayload, existingPayload []byte
	var existingPayloadHash *string
	lookupErr := tx.QueryRow(ctx, `
		SELECT o.id,o.entity_type,o.entity_id,o.operation_type,o.status,o.server_sequence,o.result_entity_version,o.payload,o.payload_hash,COALESCE(o.result_payload,c.server_payload),o.base_version
		FROM sync_operations o
		LEFT JOIN sync_conflicts c ON c.merchant_id=o.merchant_id AND c.operation_id=o.id
		WHERE o.merchant_id=$1::uuid AND o.device_id=$2::uuid AND o.client_operation_id=$3
		FOR UPDATE OF o`, claims.MerchantID, deviceID, operation.ClientOperationID).
		Scan(&existingServerID, &existingEntityType, &existingEntityID, &existingOperationType, &existing.Status, &existingSequence, &existingVersion, &existingRequestPayload, &existingPayloadHash, &existingPayload, &existingBaseVersion)
	if lookupErr == nil {
		effectiveHash := ""
		if existingPayloadHash != nil {
			effectiveHash = *existingPayloadHash
		} else {
			effectiveHash, _ = canonicalPayloadHash(existingRequestPayload)
		}
		if existingEntityType != operation.EntityType || existingEntityID != operation.EntityID || existingOperationType != operation.OperationType || !sameOptionalVersion(existingBaseVersion, operation.BaseVersion) || effectiveHash != computedHash {
			return result, app.NewError("IDEMPOTENCY_KEY_REUSED", "The operation identifier was already used for different operation content.", 409)
		}
		if (existing.Status == "APPLIED" || existing.Status == "CONFLICT") && (existingVersion == nil || len(existingPayload) == 0) && existingEntityType == "SHOP_SETTINGS" {
			payload, version, loadErr := loadShopSettings(ctx, tx, claims.MerchantID, existingEntityID)
			if loadErr != nil {
				return result, loadErr
			}
			existingPayload = payload
			existingVersion = &version
		}
		existing.ServerOperationID = existingServerID
		existing.ServerSequence = existingSequence
		existing.EntityVersion = existingVersion
		existing.ServerPayload = json.RawMessage(existingPayload)
		return existing, nil
	}
	if !errors.Is(lookupErr, pgx.ErrNoRows) {
		return result, lookupErr
	}

	if operation.DependencyOperationID != "" {
		var dependencyStatus string
		err := tx.QueryRow(ctx, `SELECT status FROM sync_operations WHERE merchant_id=$1::uuid AND device_id=$2::uuid AND client_operation_id=$3`, claims.MerchantID, deviceID, operation.DependencyOperationID).Scan(&dependencyStatus)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && dependencyStatus != "APPLIED" {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "DEPENDENCY_NOT_APPLIED", "The dependency operation has not been applied.")
		}
		if err != nil {
			return result, err
		}
	}
	if !claims.PlatformAdmin {
		var allowed bool
		if err := tx.QueryRow(ctx, `SELECT app_has_permission('tenant.write')`).Scan(&allowed); err != nil {
			return result, err
		}
		if !allowed {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "PERMISSION_REVOKED", "The active membership no longer has permission to synchronize this operation.")
		}
	}
	payload := operation.Payload
	if operation.EntityType == "POS_CHECKOUT" {
		return r.applyOfflineCheckoutOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "DELIVERY" {
		return r.applyDeliveryOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "CATALOG_PRODUCT" {
		return r.applyCatalogProductOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "CATALOG_CATEGORY" {
		return r.applyCatalogCategoryOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "CATALOG_VARIANT" {
		return r.applyCatalogVariantOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "CATALOG_ATTRIBUTE_DEFINITION" || operation.EntityType == "CATALOG_ATTRIBUTE_OPTION" {
		return r.applyCatalogAttributeOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "PRODUCT_PRICE" {
		return r.applyProductPriceOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "PRICE_LIST" {
		return r.applyPriceListOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "CATALOG_UNIT" || operation.EntityType == "CATALOG_CONVERSION" {
		return r.applyCatalogMeasurementOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "STOCK_RECEIPT" {
		return r.applyStockReceiptOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_DRAFT" {
		return r.applyRepairDraftOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_TICKET" {
		return r.applyRepairTicketOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_DIAGNOSTIC" {
		return r.applyRepairDiagnosticOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_IMAGE" {
		return r.applyRepairImageOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_APPROVAL" {
		return r.applyRepairApprovalOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_WARRANTY" {
		return r.applyRepairWarrantyOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_PART" {
		return r.applyRepairPartOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType == "REPAIR_PAYMENT" {
		return r.applyRepairPaymentOperation(ctx, tx, claims, deviceID, sessionID, operation)
	}
	if operation.EntityType != "SHOP_SETTINGS" || operation.OperationType != "UPDATE" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "This synchronization operation is not enabled yet.")
	}
	if operation.ShopID != nil && strings.TrimSpace(*operation.ShopID) != operation.EntityID {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_SCOPE_MISMATCH", "The shop scope does not match the settings entity.")
	}
	var settings shopSettingsPayload
	if err := json.Unmarshal(payload, &settings); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Shop settings payload must be a JSON object.")
	}
	if err := validateShopSettings(settings); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return result, err
		}
		if assignedShop != nil && *assignedShop != operation.EntityID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_FORBIDDEN", "The active staff membership is assigned to another shop.")
		}
	}

	serverPayload, currentVersion, err := loadShopSettings(ctx, tx, claims.MerchantID, operation.EntityID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The shop does not exist.")
		}
		return result, err
	}
	if operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}

	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb)
		RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), payload).Scan(&serverID, &sequence); err != nil {
		return result, err
	}
	if err := updateShopSettings(ctx, tx, claims.MerchantID, operation.EntityID, settings); err != nil {
		return result, err
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at)
		VALUES($1::uuid,'SHOP_SETTINGS',$2::uuid,$3,now())
		ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return result, err
	}
	updatedPayload, _, err := loadShopSettings(ctx, tx, claims.MerchantID, operation.EntityID)
	if err != nil {
		return result, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return result, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload)
		VALUES($1::uuid,$3::uuid,$2,'SHOP_SETTINGS',$3::uuid,$4,$5::uuid,'UPDATE',$6::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, updatedPayload); err != nil {
		return result, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func (r *Repository) applyOfflineCheckoutOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_CHECKOUT_OPERATION", "Offline checkout requires a shop-scoped CREATE operation.")
	}
	var payload offlineCheckoutSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Offline checkout payload must be a JSON object.")
	}
	shopID := strings.TrimSpace(*operation.ShopID)
	if err := validateOfflineCheckoutPayload(payload, shopID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_CHECKOUT_PAYLOAD", err.Error())
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var active bool
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT is_active,shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, claims.MembershipID).Scan(&active, &assignedShop); err != nil {
			return dto.OperationResult{}, err
		}
		if !active {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "MEMBERSHIP_INACTIVE", "The membership is no longer active.")
		}
		if assignedShop != nil && *assignedShop != shopID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_REASSIGNED", "The membership is no longer assigned to the checkout shop.")
		}
	}
	payload.Request.IdempotencyKey = operation.ClientOperationID
	requestedPaymentMethod := strings.ToUpper(strings.TrimSpace(payload.Request.PaymentMethod))
	requestedPaymentCategory := requestedPaymentMethod
	if strings.TrimSpace(payload.Request.PaymentTypeID) != "" {
		if err := tx.QueryRow(ctx, `SELECT category_code FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, payload.Request.PaymentTypeID).Scan(&requestedPaymentCategory); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "VALIDATION_ERROR", "The selected payment type is not available for this merchant.")
		}
	}
	// Validate an external-payment intent by simulating the same canonical sale
	// as cash inside a savepoint. The savepoint is always rolled back for the
	// external method, so no order, payment, stock movement, audit, idempotency
	// record, or ordered change can be reported as captured without provider
	// authorization.
	payload.Request.PaymentMethod = "CASH"
	if _, err := tx.Exec(ctx, `SAVEPOINT offline_checkout_attempt`); err != nil {
		return dto.OperationResult{}, err
	}
	canonical, saleErr := pospostgres.CreateSaleWithTx(ctx, tx, claims, payload.Request)
	if saleErr != nil {
		if _, rollbackErr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT offline_checkout_attempt`); rollbackErr != nil {
			return dto.OperationResult{}, rollbackErr
		}
		var apiErr *app.Error
		if errors.As(saleErr, &apiErr) {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, apiErr.Code, apiErr.Message)
		}
		return dto.OperationResult{}, saleErr
	}
	authoritative := offlineCheckoutSnapshot{
		CurrencyCode:  canonical.CurrencyCode,
		Subtotal:      canonical.Subtotal,
		DiscountTotal: canonical.DiscountTotal,
		TaxTotal:      canonical.TaxTotal,
		GrandTotal:    canonical.GrandTotal,
	}
	if authoritative != payload.Snapshot {
		if _, err := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT offline_checkout_attempt`); err != nil {
			return dto.OperationResult{}, err
		}
		serverPayload, _ := json.Marshal(map[string]any{
			"provisional_id":      operation.EntityID,
			"review_required":     true,
			"authoritative_quote": authoritative,
			"offline_snapshot":    payload.Snapshot,
		})
		return insertRejectedWithPayload(ctx, tx, claims, deviceID, sessionID, operation, "CHECKOUT_RECONCILIATION_REQUIRED", "Current price, tax, promotion, or stock rules differ from the provisional checkout.", serverPayload)
	}
	if requestedPaymentCategory != "CASH" {
		if _, err := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT offline_checkout_attempt`); err != nil {
			return dto.OperationResult{}, err
		}
		serverPayload, _ := json.Marshal(map[string]any{
			"provisional_id":                 operation.EntityID,
			"review_required":                true,
			"payment_authorization_required": true,
			"payment_method":                 requestedPaymentMethod,
			"authoritative_quote":            authoritative,
		})
		return insertRejectedWithPayload(ctx, tx, claims, deviceID, sessionID, operation, "PAYMENT_AUTHORIZATION_REQUIRED", "The provisional external payment intent requires verified provider authorization before checkout can complete.", serverPayload)
	}
	if _, err := tx.Exec(ctx, `RELEASE SAVEPOINT offline_checkout_attempt`); err != nil {
		return dto.OperationResult{}, err
	}
	resultPayload, err := json.Marshal(map[string]any{
		"provisional_id":  operation.EntityID,
		"canonical_order": canonical,
		"review_required": false,
	})
	if err != nil {
		return dto.OperationResult{}, err
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload,applied_at,result_payload,result_entity_version) VALUES($1::uuid,$2::uuid,$3::uuid,$4,'POS_CHECKOUT',$5::uuid,'CREATE',NULL,$6,$7,'APPLIED',$8::jsonb,now(),$9::jsonb,1) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityID, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload, resultPayload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'POS_CHECKOUT',$2::uuid,1,now())`, claims.MerchantID, operation.EntityID); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'POS_CHECKOUT',$4::uuid,1,$5::uuid,'CREATE',$6::jsonb)`, claims.MerchantID, shopID, sequence, operation.EntityID, serverID, resultPayload); err != nil {
		return dto.OperationResult{}, err
	}
	version := int64(1)
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &version, ServerPayload: resultPayload}, nil
}

func validateOfflineCheckoutPayload(payload offlineCheckoutSyncPayload, expectedShopID string) error {
	if strings.TrimSpace(expectedShopID) == "" || strings.TrimSpace(payload.ShopID) != expectedShopID || strings.TrimSpace(payload.Request.ShopID) != expectedShopID {
		return errors.New("the checkout shop scope and sale request must match")
	}
	if len(payload.Request.Lines) == 0 {
		return errors.New("the checkout must contain at least one line")
	}
	for _, value := range []string{payload.Snapshot.CurrencyCode, payload.Snapshot.Subtotal, payload.Snapshot.DiscountTotal, payload.Snapshot.TaxTotal, payload.Snapshot.GrandTotal} {
		if strings.TrimSpace(value) == "" {
			return errors.New("the complete provisional total snapshot is required")
		}
	}
	if len(payload.LineSnapshots) == 0 || !json.Valid(payload.LineSnapshots) || len(payload.InventorySnapshots) == 0 || !json.Valid(payload.InventorySnapshots) {
		return errors.New("line and inventory snapshots must be valid JSON arrays")
	}
	return nil
}

func (r *Repository) applyCatalogProductOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Product synchronization is merchant-scoped.")
	}
	var complexityLevel string
	if err := tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, claims.MerchantID).Scan(&complexityLevel); err != nil {
		return dto.OperationResult{}, err
	}
	if complexityLevel == "SIMPLE" && operation.OperationType == "CREATE" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ONLINE_REQUIRED", "POS simple products must be created online so their standard variant is created atomically.")
	}
	var payload catalogProductSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || operation.OperationType != "DELETE" && validateCatalogProductPayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Product metadata payload is invalid.")
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_PRODUCT' AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, _, loadErr := loadCatalogProduct(ctx, tx, claims.MerchantID, operation.EntityID)
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The product already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The product does not exist.")
	}
	if operation.OperationType != "CREATE" && operation.BaseVersion == nil && currentVersion > 0 || operation.OperationType != "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != currentVersion {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Product creation must start at version zero.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "CREATE" {
		if _, err := tx.Exec(ctx, `INSERT INTO products(id,merchant_id,name,description,product_type,is_active,manufacture_date,expired_date) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,NULLIF($7::text,'')::date,NULLIF($8::text,'')::date)`, operation.EntityID, claims.MerchantID, strings.TrimSpace(payload.Name), payload.Description, strings.ToUpper(strings.TrimSpace(payload.ProductType)), payload.IsActive, payload.ManufactureDate, payload.ExpiredDate); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "UPDATE" {
		if _, err := tx.Exec(ctx, `UPDATE products SET name=$3,description=$4,product_type=$5,is_active=$6,manufacture_date=NULLIF($7::text,'')::date,expired_date=NULLIF($8::text,'')::date,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, strings.TrimSpace(payload.Name), payload.Description, strings.ToUpper(strings.TrimSpace(payload.ProductType)), payload.IsActive, payload.ManufactureDate, payload.ExpiredDate); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "DELETE" {
		if _, err := tx.Exec(ctx, `SAVEPOINT catalog_product_delete`); err != nil {
			return dto.OperationResult{}, err
		}
		// Product variants are aggregate children. Delete them first so an unused
		// POS-simple product's managed standard variant does not block its parent.
		// Genuine stock and business-history references remain RESTRICTed and make
		// the entire delete roll back.
		_, deleteErr := tx.Exec(ctx, `DELETE FROM product_variants WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, claims.MerchantID, operation.EntityID)
		if deleteErr == nil {
			_, deleteErr = tx.Exec(ctx, `DELETE FROM products WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
		}
		if deleteErr != nil {
			if _, rollbackErr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT catalog_product_delete`); rollbackErr != nil {
				return dto.OperationResult{}, rollbackErr
			}
			message := "This product has stock or business history and cannot be deleted. Deactivate it instead."
			resultPayload := json.RawMessage(`{"id":"` + operation.EntityID + `"}`)
			if _, updateErr := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, currentVersion); updateErr != nil {
				return dto.OperationResult{}, updateErr
			}
			return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: "DELETE_REJECTED", Message: message, ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: resultPayload}, nil
		}
		if _, err := tx.Exec(ctx, `RELEASE SAVEPOINT catalog_product_delete`); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Product synchronization supports create, update, and delete.")
	}
	if operation.OperationType != "DELETE" {
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_product_categories WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
			return dto.OperationResult{}, err
		}
		for _, categoryID := range payload.CategoryIDs {
			if _, err := tx.Exec(ctx, `INSERT INTO catalog_product_categories(merchant_id,product_id,category_id) SELECT $1::uuid,$2::uuid,id FROM catalog_categories WHERE merchant_id=$1::uuid AND id=$3::uuid`, claims.MerchantID, operation.EntityID, categoryID); err != nil {
				return dto.OperationResult{}, err
			}
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_PRODUCT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "is_deleted": true})
	} else {
		updatedPayload, _, _ = loadCatalogProduct(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	if len(updatedPayload) == 0 {
		return dto.OperationResult{}, errors.New("unable to serialize synchronized product result")
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'CATALOG_PRODUCT',$3::uuid,$4,$5::uuid,$6,$7::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateCatalogProductPayload(payload catalogProductSyncPayload) error {
	if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.ProductType) == "" {
		return errors.New("product name and type are required")
	}
	for _, value := range []*string{payload.ManufactureDate, payload.ExpiredDate} {
		if value != nil && strings.TrimSpace(*value) != "" {
			if _, err := time.Parse("2006-01-02", strings.TrimSpace(*value)); err != nil {
				return errors.New("product dates must use YYYY-MM-DD format")
			}
		}
	}
	return nil
}

func (r *Repository) applyCatalogCategoryOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Category synchronization is merchant-scoped.")
	}
	var payload catalogCategorySyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || operation.OperationType != "DELETE" && validateCatalogCategoryPayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Category payload is invalid.")
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_CATEGORY' AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, _, loadErr := loadCatalogCategory(ctx, tx, claims.MerchantID, operation.EntityID)
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The category already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The category does not exist.")
	}
	if operation.OperationType != "CREATE" && (operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Category creation must start at version zero.")
	}
	if operation.OperationType == "CREATE" {
		var conflictingID string
		err := tx.QueryRow(ctx, `SELECT id::text FROM catalog_categories WHERE merchant_id=$1::uuid AND slug=$2 LIMIT 1`, claims.MerchantID, strings.ToLower(strings.TrimSpace(payload.Slug))).Scan(&conflictingID)
		if err == nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "A category with this slug already exists.")
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return dto.OperationResult{}, err
		}
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "CREATE" {
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_categories(id,merchant_id,parent_category_id,name,slug,description,image_url,sort_order) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)`, operation.EntityID, claims.MerchantID, payload.ParentCategoryID, strings.TrimSpace(payload.Name), strings.ToLower(strings.TrimSpace(payload.Slug)), payload.Description, payload.ImageURL, payload.SortOrder); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "UPDATE" {
		if _, err := tx.Exec(ctx, `UPDATE catalog_categories SET parent_category_id=$3,name=$4,slug=$5,description=$6,image_url=$7,sort_order=$8,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, operation.EntityID, payload.ParentCategoryID, strings.TrimSpace(payload.Name), strings.ToLower(strings.TrimSpace(payload.Slug)), payload.Description, payload.ImageURL, payload.SortOrder); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "DELETE" {
		if _, err := tx.Exec(ctx, `SAVEPOINT catalog_category_delete`); err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_categories WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, operation.EntityID); err != nil {
			if _, rollbackErr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT catalog_category_delete`); rollbackErr != nil {
				return dto.OperationResult{}, rollbackErr
			}
			message := "The category cannot be deleted while it has child categories."
			resultPayload := json.RawMessage(`{"id":"` + operation.EntityID + `"}`)
			if _, updateErr := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, currentVersion); updateErr != nil {
				return dto.OperationResult{}, updateErr
			}
			return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: "DELETE_REJECTED", Message: message, ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: resultPayload}, nil
		}
		if _, err := tx.Exec(ctx, `RELEASE SAVEPOINT catalog_category_delete`); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Category synchronization supports create, update, and delete.")
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CATEGORY',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "is_deleted": true})
	} else {
		updatedPayload, _, _ = loadCatalogCategory(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'CATALOG_CATEGORY',$3::uuid,$4,$5::uuid,$6,$7::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateCatalogCategoryPayload(payload catalogCategorySyncPayload) error {
	if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.Slug) == "" || payload.SortOrder < 0 {
		return errors.New("category name, slug, and non-negative sort order are required")
	}
	return nil
}

func loadCatalogCategory(ctx context.Context, tx pgx.Tx, merchantID, categoryID string) (json.RawMessage, int64, error) {
	var payload json.RawMessage
	var version int64
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',k.id::text,'merchant_id',k.merchant_id::text,'parent_category_id',k.parent_category_id::text,'name',k.name,'slug',k.slug,'description',k.description,'image_url',k.image_url,'sort_order',k.sort_order),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=k.merchant_id AND entity_type='CATALOG_CATEGORY' AND entity_id=k.id),0) FROM catalog_categories k WHERE k.merchant_id=$1::uuid AND k.id=$2::uuid`, merchantID, categoryID).Scan(&payload, &version)
	return payload, version, err
}

func (r *Repository) applyCatalogVariantOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Variant synchronization is merchant-scoped.")
	}
	var complexityLevel string
	if err := tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, claims.MerchantID).Scan(&complexityLevel); err != nil {
		return dto.OperationResult{}, err
	}
	if complexityLevel == "SIMPLE" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "POS_SIMPLE_VARIANT_MANAGED", "POS simple standard variants are managed with their product.")
	}
	var payload catalogVariantSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || operation.OperationType != "DELETE" && validateCatalogVariantPayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Variant payload is invalid.")
	}
	if operation.OperationType != "DELETE" {
		if err := validateSyncVariantAttributes(ctx, tx, claims.MerchantID, payload.Attributes); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
		}
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_VARIANT' AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, _, loadErr := loadCatalogVariant(ctx, tx, claims.MerchantID, operation.EntityID)
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The variant already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The variant does not exist.")
	}
	if operation.OperationType != "CREATE" && (operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Variant creation must start at version zero.")
	}
	if operation.OperationType == "DELETE" {
		var existing catalogVariantSyncPayload
		if err := json.Unmarshal(serverPayload, &existing); err == nil {
			if payload.ProductID != "" && existing.ProductID != payload.ProductID {
				return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "A variant cannot change its product.")
			}
			payload.ProductID = existing.ProductID
		}
	} else if operation.OperationType == "UPDATE" {
		var existing catalogVariantSyncPayload
		if err := json.Unmarshal(serverPayload, &existing); err == nil && existing.ProductID != payload.ProductID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "A variant cannot change its product.")
		}
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "CREATE" {
		if _, err := tx.Exec(ctx, `INSERT INTO product_variants(id,merchant_id,product_id,sku,barcode,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9::uuid,$10)`, operation.EntityID, claims.MerchantID, payload.ProductID, strings.TrimSpace(payload.SKU), payload.Barcode, strings.TrimSpace(payload.Name), payload.Attributes, strings.TrimSpace(payload.UnitOfMeasure), payload.BaseUnitID, payload.IsStockTracked); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "UPDATE" {
		if _, err := tx.Exec(ctx, `UPDATE product_variants SET sku=$3,barcode=$4,name=$5,attributes=$6::jsonb,unit_of_measure=$7,base_unit_id=$8::uuid,is_stock_tracked=$9,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, strings.TrimSpace(payload.SKU), payload.Barcode, strings.TrimSpace(payload.Name), payload.Attributes, strings.TrimSpace(payload.UnitOfMeasure), payload.BaseUnitID, payload.IsStockTracked); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "DELETE" {
		if _, err := tx.Exec(ctx, `SAVEPOINT catalog_variant_delete`); err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM product_variants WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
			if _, rollbackErr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT catalog_variant_delete`); rollbackErr != nil {
				return dto.OperationResult{}, rollbackErr
			}
			message := "The variant cannot be deleted while it is referenced by business records."
			resultPayload := json.RawMessage(`{"id":"` + operation.EntityID + `"}`)
			if _, updateErr := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, currentVersion); updateErr != nil {
				return dto.OperationResult{}, updateErr
			}
			return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: "DELETE_REJECTED", Message: message, ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: resultPayload}, nil
		}
		if _, err := tx.Exec(ctx, `RELEASE SAVEPOINT catalog_variant_delete`); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Variant synchronization supports create, update, and delete.")
	}
	if operation.OperationType != "DELETE" {
		if err := storeSyncVariantAttributes(ctx, tx, claims.MerchantID, payload.ProductID, operation.EntityID, payload.Attributes); err != nil {
			return dto.OperationResult{}, err
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_VARIANT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "product_id": payload.ProductID, "is_deleted": true})
	} else {
		updatedPayload, _, _ = loadCatalogVariant(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'CATALOG_VARIANT',$3::uuid,$4,$5::uuid,$6,$7::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateCatalogVariantPayload(payload catalogVariantSyncPayload) error {
	if strings.TrimSpace(payload.ProductID) == "" || strings.TrimSpace(payload.SKU) == "" || strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.BaseUnitID) == "" || strings.TrimSpace(payload.UnitOfMeasure) == "" || len(payload.Attributes) == 0 || !json.Valid(payload.Attributes) {
		return errors.New("variant product, SKU, name, unit, and attributes are required")
	}
	return nil
}

func syncVariantAttributeOptionValue(valueType string, raw json.RawMessage) (string, bool) {
	switch valueType {
	case "NUMBER":
		var value json.Number
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return value.String(), true
	case "BOOLEAN":
		var value bool
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return fmt.Sprintf("%t", value), true
	case "JSON":
		return string(raw), true
	default:
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return value, true
	}
}

func validateSyncVariantAttributes(ctx context.Context, tx pgx.Tx, merchantID string, attrs json.RawMessage) error {
	if len(attrs) == 0 {
		attrs = json.RawMessage(`{}`)
	}
	values := map[string]json.RawMessage{}
	if !json.Valid(attrs) || json.Unmarshal(attrs, &values) != nil || values == nil {
		return errors.New("variant attributes must be a JSON object")
	}
	rows, err := tx.Query(ctx, `SELECT id::text,code,value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid`, merchantID)
	if err != nil {
		return err
	}
	type definition struct{ id, valueType string }
	definitions := map[string]definition{}
	for rows.Next() {
		var id, code, valueType string
		if err := rows.Scan(&id, &code, &valueType); err != nil {
			rows.Close()
			return err
		}
		definitions[code] = definition{id: id, valueType: valueType}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for code, raw := range values {
		definition, ok := definitions[code]
		if !ok || string(raw) == "null" {
			return fmt.Errorf("variant attribute %q is not configured", code)
		}
		switch definition.valueType {
		case "TEXT", "DATE":
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
				return fmt.Errorf("variant attribute %q must be text", code)
			}
		case "NUMBER":
			var value json.Number
			if err := json.Unmarshal(raw, &value); err != nil {
				return fmt.Errorf("variant attribute %q must be a number", code)
			}
		case "BOOLEAN":
			var value bool
			if err := json.Unmarshal(raw, &value); err != nil {
				return fmt.Errorf("variant attribute %q must be boolean", code)
			}
		case "SELECT":
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
				return fmt.Errorf("variant attribute %q must use a configured option", code)
			}
		}
		optionValue, ok := syncVariantAttributeOptionValue(definition.valueType, raw)
		if !ok {
			continue
		}
		var hasValues bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, merchantID, definition.id).Scan(&hasValues); err != nil {
			return err
		}
		if definition.valueType == "SELECT" && !hasValues {
			return fmt.Errorf("variant attribute %q must use a configured value", code)
		}
		if hasValues {
			var allowed bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3)`, merchantID, definition.id, optionValue).Scan(&allowed); err != nil {
				return err
			}
			if !allowed {
				return fmt.Errorf("variant attribute %q uses an unconfigured value", code)
			}
		}
	}
	return nil
}

func storeSyncVariantAttributes(ctx context.Context, tx pgx.Tx, merchantID, productID, variantID string, attrs json.RawMessage) error {
	if len(attrs) == 0 {
		attrs = json.RawMessage(`{}`)
	}
	values := map[string]json.RawMessage{}
	if err := json.Unmarshal(attrs, &values); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND product_id=$2::uuid AND variant_id=$3::uuid`, merchantID, productID, variantID); err != nil {
		return err
	}
	for code, raw := range values {
		var definitionID string
		if err := tx.QueryRow(ctx, `SELECT id::text FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND code=$2`, merchantID, code).Scan(&definitionID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_attribute_values(merchant_id,definition_id,product_id,variant_id,value) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb)`, merchantID, definitionID, productID, variantID, raw); err != nil {
			return err
		}
	}
	return nil
}

func loadCatalogVariant(ctx context.Context, tx pgx.Tx, merchantID, variantID string) (json.RawMessage, int64, error) {
	var payload json.RawMessage
	var version int64
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',v.id::text,'merchant_id',v.merchant_id::text,'product_id',v.product_id::text,'sku',v.sku,'barcode',v.barcode,'name',v.name,'attributes',v.attributes,'unit_of_measure',v.unit_of_measure,'base_unit_id',v.base_unit_id::text,'is_stock_tracked',v.is_stock_tracked),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=v.merchant_id AND entity_type='CATALOG_VARIANT' AND entity_id=v.id),0) FROM product_variants v WHERE v.merchant_id=$1::uuid AND v.id=$2::uuid`, merchantID, variantID).Scan(&payload, &version)
	return payload, version, err
}

var catalogAttributeCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_-]{0,99}$`)

func validateCatalogAttributeDefinitionPayload(payload catalogAttributeDefinitionSyncPayload) error {
	valueType := strings.ToUpper(strings.TrimSpace(payload.ValueType))
	if !catalogAttributeCodePattern.MatchString(strings.ToUpper(strings.TrimSpace(payload.Code))) || strings.TrimSpace(payload.Name) == "" {
		return errors.New("attribute code and name are required")
	}
	if valueType != "TEXT" && valueType != "NUMBER" && valueType != "BOOLEAN" && valueType != "SELECT" && valueType != "DATE" && valueType != "JSON" {
		return errors.New("attribute value_type is invalid")
	}
	return nil
}

func validateCatalogAttributeOptionPayload(payload catalogAttributeOptionSyncPayload) error {
	if strings.TrimSpace(payload.DefinitionID) == "" || strings.TrimSpace(payload.Value) == "" || strings.TrimSpace(payload.Label) == "" || payload.Position < 0 {
		return errors.New("attribute option definition, value, label, and non-negative position are required")
	}
	return nil
}

func syncAttributeOptionJSONValue(valueType, value string) (json.RawMessage, error) {
	switch valueType {
	case "NUMBER":
		var number json.Number
		if err := json.Unmarshal([]byte(value), &number); err != nil {
			return nil, errors.New("a number attribute value must contain a valid JSON number")
		}
		return json.RawMessage(value), nil
	case "BOOLEAN":
		var boolean bool
		if err := json.Unmarshal([]byte(value), &boolean); err != nil {
			return nil, errors.New("a boolean attribute value must be true or false")
		}
		return json.RawMessage(value), nil
	case "JSON":
		if !json.Valid([]byte(value)) {
			return nil, errors.New("a JSON attribute value must contain valid JSON")
		}
		return json.RawMessage(value), nil
	default:
		return json.Marshal(value)
	}
}

func loadCatalogAttributeDefinition(ctx context.Context, tx pgx.Tx, merchantID, definitionID string) (json.RawMessage, int64, error) {
	var payload json.RawMessage
	var version int64
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',d.id::text,'merchant_id',d.merchant_id::text,'code',d.code,'name',d.name,'value_type',d.value_type,'options',COALESCE((SELECT json_agg(json_build_object('id',o.id::text,'merchant_id',o.merchant_id::text,'definition_id',o.definition_id::text,'value',o.value,'label',o.label,'position',o.position,'sync_version',COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=o.merchant_id AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=o.id),0)) ORDER BY o.position,o.label) FROM catalog_attribute_options o WHERE o.merchant_id=d.merchant_id AND o.definition_id=d.id),'[]'::json)),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='CATALOG_ATTRIBUTE_DEFINITION' AND entity_id=d.id),0) FROM catalog_attribute_definitions d WHERE d.merchant_id=$1::uuid AND d.id=$2::uuid`, merchantID, definitionID).Scan(&payload, &version)
	return payload, version, err
}

func loadCatalogAttributeOption(ctx context.Context, tx pgx.Tx, merchantID, optionID string) (json.RawMessage, int64, error) {
	var payload json.RawMessage
	var version int64
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',o.id::text,'merchant_id',o.merchant_id::text,'definition_id',o.definition_id::text,'value',o.value,'label',o.label,'position',o.position),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=o.merchant_id AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=o.id),0) FROM catalog_attribute_options o WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, merchantID, optionID).Scan(&payload, &version)
	return payload, version, err
}

func (r *Repository) applyCatalogAttributeOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Catalog attributes are merchant-scoped.")
	}
	isDefinition := operation.EntityType == "CATALOG_ATTRIBUTE_DEFINITION"
	var definitionPayload catalogAttributeDefinitionSyncPayload
	var optionPayload catalogAttributeOptionSyncPayload
	if isDefinition {
		if err := json.Unmarshal(operation.Payload, &definitionPayload); err != nil || operation.OperationType != "DELETE" && validateCatalogAttributeDefinitionPayload(definitionPayload) != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Attribute definition payload is invalid.")
		}
	} else if err := json.Unmarshal(operation.Payload, &optionPayload); err != nil || operation.OperationType != "DELETE" && validateCatalogAttributeOptionPayload(optionPayload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Attribute option payload is invalid.")
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type=$3 AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID, operation.EntityType).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var serverPayload json.RawMessage
	var loadErr error
	if isDefinition {
		serverPayload, _, loadErr = loadCatalogAttributeDefinition(ctx, tx, claims.MerchantID, operation.EntityID)
	} else {
		serverPayload, _, loadErr = loadCatalogAttributeOption(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The catalog attribute already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The catalog attribute does not exist.")
	}
	if operation.OperationType != "CREATE" && (operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Catalog attribute creation must start at version zero.")
	}
	if !isDefinition && operation.OperationType != "DELETE" {
		var valueType string
		if err := tx.QueryRow(ctx, `SELECT value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, optionPayload.DefinitionID).Scan(&valueType); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "The attribute definition does not exist.")
		}
		if _, err := syncAttributeOptionJSONValue(valueType, strings.TrimSpace(optionPayload.Value)); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
		}
	}
	if !isDefinition && operation.OperationType == "DELETE" {
		var existing catalogAttributeOptionSyncPayload
		if err := json.Unmarshal(serverPayload, &existing); err == nil {
			optionPayload.DefinitionID = existing.DefinitionID
			optionPayload.Value = existing.Value
		}
		var valueType string
		if err := tx.QueryRow(ctx, `SELECT value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, optionPayload.DefinitionID).Scan(&valueType); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "The attribute definition does not exist.")
		}
		valueJSON, err := syncAttributeOptionJSONValue(valueType, optionPayload.Value)
		if err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
		}
		var assigned bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3::jsonb)`, claims.MerchantID, optionPayload.DefinitionID, valueJSON).Scan(&assigned); err != nil {
			return dto.OperationResult{}, err
		}
		if assigned {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "DELETE_REJECTED", "This attribute value is assigned to a variant.")
		}
	}
	if !isDefinition && operation.OperationType == "UPDATE" {
		var existing catalogAttributeOptionSyncPayload
		if err := json.Unmarshal(serverPayload, &existing); err != nil || existing.DefinitionID != optionPayload.DefinitionID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "An attribute option cannot change its definition.")
		}
		var valueType string
		if err := tx.QueryRow(ctx, `SELECT value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, optionPayload.DefinitionID).Scan(&valueType); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_REFERENCE", "The attribute definition does not exist.")
		}
	}
	if isDefinition && operation.OperationType == "DELETE" {
		var hasChildren, assigned bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid),EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&hasChildren, &assigned); err != nil {
			return dto.OperationResult{}, err
		}
		if hasChildren || assigned {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "DELETE_REJECTED", "Remove attribute options and assignments before deleting this definition.")
		}
	}
	if isDefinition && operation.OperationType == "UPDATE" {
		var oldCode, oldType string
		if err := tx.QueryRow(ctx, `SELECT code,value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID).Scan(&oldCode, &oldType); err != nil {
			return dto.OperationResult{}, err
		}
		var assigned bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&assigned); err != nil {
			return dto.OperationResult{}, err
		}
		if assigned && (oldCode != strings.ToUpper(strings.TrimSpace(definitionPayload.Code)) || oldType != strings.ToUpper(strings.TrimSpace(definitionPayload.ValueType))) {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UPDATE_REJECTED", "An attribute code or value type cannot change after it has been assigned to a variant.")
		}
		if oldType != strings.ToUpper(strings.TrimSpace(definitionPayload.ValueType)) {
			var hasOptions bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&hasOptions); err != nil {
				return dto.OperationResult{}, err
			}
			if hasOptions {
				return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UPDATE_REJECTED", "Remove attribute values before changing its value type.")
			}
		}
	}
	if !isDefinition && operation.OperationType != "CREATE" && operation.OperationType != "DELETE" {
		var oldValue, valueType string
		if err := tx.QueryRow(ctx, `SELECT o.value,d.value_type FROM catalog_attribute_options o JOIN catalog_attribute_definitions d ON d.merchant_id=o.merchant_id AND d.id=o.definition_id WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, claims.MerchantID, operation.EntityID).Scan(&oldValue, &valueType); err != nil {
			return dto.OperationResult{}, err
		}
		if oldValue != optionPayload.Value {
			oldJSON, err := syncAttributeOptionJSONValue(valueType, oldValue)
			if err != nil {
				return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
			}
			var assigned bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3::jsonb)`, claims.MerchantID, optionPayload.DefinitionID, oldJSON).Scan(&assigned); err != nil {
				return dto.OperationResult{}, err
			}
			if assigned {
				return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UPDATE_REJECTED", "An option value cannot change while it is assigned to a variant.")
			}
		}
	}
	var serverID string
	var sequence int64
	var err error
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if isDefinition {
		switch operation.OperationType {
		case "CREATE":
			_, err = tx.Exec(ctx, `INSERT INTO catalog_attribute_definitions(id,merchant_id,code,name,value_type) VALUES($1::uuid,$2::uuid,$3,$4,$5)`, operation.EntityID, claims.MerchantID, strings.ToUpper(strings.TrimSpace(definitionPayload.Code)), strings.TrimSpace(definitionPayload.Name), strings.ToUpper(strings.TrimSpace(definitionPayload.ValueType)))
		case "UPDATE":
			_, err = tx.Exec(ctx, `UPDATE catalog_attribute_definitions SET code=$3,name=$4,value_type=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, strings.ToUpper(strings.TrimSpace(definitionPayload.Code)), strings.TrimSpace(definitionPayload.Name), strings.ToUpper(strings.TrimSpace(definitionPayload.ValueType)))
		case "DELETE":
			_, err = tx.Exec(ctx, `DELETE FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
		default:
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Attribute definition synchronization supports create, update, and delete.")
		}
	} else {
		switch operation.OperationType {
		case "CREATE":
			_, err = tx.Exec(ctx, `INSERT INTO catalog_attribute_options(id,merchant_id,definition_id,value,label,position) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6)`, operation.EntityID, claims.MerchantID, optionPayload.DefinitionID, strings.TrimSpace(optionPayload.Value), strings.TrimSpace(optionPayload.Label), optionPayload.Position)
		case "UPDATE":
			_, err = tx.Exec(ctx, `UPDATE catalog_attribute_options SET value=$3,label=$4,position=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, strings.TrimSpace(optionPayload.Value), strings.TrimSpace(optionPayload.Label), optionPayload.Position)
		case "DELETE":
			_, err = tx.Exec(ctx, `DELETE FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
		default:
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Attribute option synchronization supports create, update, and delete.")
		}
	}
	if err != nil {
		return dto.OperationResult{}, err
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,$2,$3::uuid,$4,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityType, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "definition_id": optionPayload.DefinitionID, "is_deleted": true})
	} else if isDefinition {
		updatedPayload, _, err = loadCatalogAttributeDefinition(ctx, tx, claims.MerchantID, operation.EntityID)
	} else {
		updatedPayload, _, err = loadCatalogAttributeOption(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,$3,$4::uuid,$5,$6::uuid,$7,$8::jsonb)`, claims.MerchantID, sequence, operation.EntityType, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func (r *Repository) applyProductPriceOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Price synchronization is merchant-scoped.")
	}
	var payload productPriceSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || strings.TrimSpace(payload.SyncID) != operation.EntityID || operation.OperationType != "DELETE" && validateProductPricePayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Product price payload is invalid.")
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='PRODUCT_PRICE' AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, priceExists, loadErr := loadProductPrice(ctx, tx, claims.MerchantID, payload)
	if loadErr != nil {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" {
		var variantPriceExists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_prices WHERE merchant_id=$1::uuid AND price_list_id=$2::uuid AND variant_id=$3::uuid)`, claims.MerchantID, payload.PriceListID, payload.VariantID).Scan(&variantPriceExists); err != nil {
			return dto.OperationResult{}, err
		}
		if variantPriceExists {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "This product variant already has a price in the price list.")
		}
	}
	if operation.OperationType == "CREATE" && priceExists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The product price already exists.")
	}
	if operation.OperationType != "CREATE" && !priceExists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The product price does not exist.")
	}
	if operation.OperationType != "CREATE" && (operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Price creation must start at version zero.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "DELETE" {
		if _, err := tx.Exec(ctx, `DELETE FROM product_prices WHERE merchant_id=$1::uuid AND price_list_id=$2::uuid AND variant_id=$3::uuid AND valid_from=$4`, claims.MerchantID, payload.PriceListID, payload.VariantID, payload.ValidFrom); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		if _, err := tx.Exec(ctx, `INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount,valid_from,valid_until) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6) ON CONFLICT(merchant_id,price_list_id,variant_id) DO UPDATE SET amount=EXCLUDED.amount,valid_until=EXCLUDED.valid_until`, claims.MerchantID, payload.PriceListID, payload.VariantID, payload.Amount, payload.ValidFrom, payload.ValidUntil); err != nil {
			return dto.OperationResult{}, err
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRODUCT_PRICE',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"sync_id": operation.EntityID, "price_list_id": payload.PriceListID, "variant_id": payload.VariantID, "valid_from": payload.ValidFrom, "is_deleted": true})
	} else {
		updatedPayload, _, _ = loadProductPrice(ctx, tx, claims.MerchantID, payload)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'PRODUCT_PRICE',$3::uuid,$4,$5::uuid,$6,$7::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateProductPricePayload(payload productPriceSyncPayload) error {
	if strings.TrimSpace(payload.PriceListID) == "" || strings.TrimSpace(payload.VariantID) == "" || strings.TrimSpace(payload.Amount) == "" || payload.ValidFrom.IsZero() {
		return errors.New("price list, variant, amount, and valid_from are required")
	}
	return nil
}

func loadProductPrice(ctx context.Context, tx pgx.Tx, merchantID string, input productPriceSyncPayload) (json.RawMessage, bool, error) {
	var payload json.RawMessage
	err := tx.QueryRow(ctx, `SELECT json_build_object('sync_id',$1::text,'merchant_id',p.merchant_id::text,'price_list_id',p.price_list_id::text,'variant_id',p.variant_id::text,'amount',p.amount::text,'valid_from',p.valid_from,'valid_until',p.valid_until) FROM product_prices p WHERE p.merchant_id=$2::uuid AND p.price_list_id=$3::uuid AND p.variant_id=$4::uuid AND p.valid_from=$5`, input.SyncID, merchantID, input.PriceListID, input.VariantID, input.ValidFrom).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	return payload, err == nil, err
}

func (r *Repository) applyPriceListOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Price-list synchronization is merchant-scoped.")
	}
	var payload priceListSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || operation.OperationType != "DELETE" && validatePriceListPayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Price-list payload is invalid.")
	}
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='PRICE_LIST' AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, exists, loadErr := loadPriceList(ctx, tx, claims.MerchantID, operation.EntityID)
	if loadErr != nil {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The price list already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The price list does not exist.")
	}
	if operation.OperationType != "CREATE" && (operation.BaseVersion == nil && currentVersion > 0 || operation.BaseVersion != nil && *operation.BaseVersion != currentVersion) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Price-list creation must start at version zero.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::varchar,$5::varchar,$6::uuid,$7::varchar,$8::bigint,$9::varchar,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "CREATE" {
		if _, err := tx.Exec(ctx, `INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1::uuid,$2::uuid,$3,$4,$5)`, operation.EntityID, claims.MerchantID, strings.TrimSpace(payload.Code), strings.ToUpper(strings.TrimSpace(payload.CurrencyCode)), payload.IsDefault); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "UPDATE" {
		if _, err := tx.Exec(ctx, `UPDATE price_lists SET code=$3,currency_code=$4,is_default=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, strings.TrimSpace(payload.Code), strings.ToUpper(strings.TrimSpace(payload.CurrencyCode)), payload.IsDefault); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "DELETE" {
		var priceCount int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_prices WHERE merchant_id=$1::uuid AND price_list_id=$2::uuid`, claims.MerchantID, operation.EntityID).Scan(&priceCount); err != nil {
			return dto.OperationResult{}, err
		}
		if priceCount > 0 {
			message := "The price list cannot be deleted while it contains product prices."
			resultPayload := json.RawMessage(`{"id":"` + operation.EntityID + `"}`)
			if _, updateErr := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, currentVersion); updateErr != nil {
				return dto.OperationResult{}, updateErr
			}
			return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: "DELETE_REJECTED", Message: message, ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: resultPayload}, nil
		}
		if _, err := tx.Exec(ctx, `DELETE FROM price_lists WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Price-list synchronization supports create, update, and delete.")
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRICE_LIST',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "is_deleted": true})
	} else {
		updatedPayload, _, _ = loadPriceList(ctx, tx, claims.MerchantID, operation.EntityID)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'PRICE_LIST',$3::uuid,$4,$5::uuid,$6,$7::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func (r *Repository) applyCatalogMeasurementOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Measurement synchronization is merchant-scoped.")
	}
	isUnit := operation.EntityType == "CATALOG_UNIT"
	var unitPayload catalogUnitSyncPayload
	var conversionPayload catalogConversionSyncPayload
	if isUnit {
		if err := json.Unmarshal(operation.Payload, &unitPayload); err != nil || operation.OperationType != "DELETE" && validateCatalogUnitPayload(unitPayload) != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Unit payload is invalid.")
		}
	} else {
		if err := json.Unmarshal(operation.Payload, &conversionPayload); err != nil || operation.OperationType != "DELETE" && validateCatalogConversionPayload(conversionPayload) != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Conversion payload is invalid.")
		}
	}
	entityType := operation.EntityType
	var currentVersion int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type=$3 AND entity_id=$2::uuid),0)`, claims.MerchantID, operation.EntityID, entityType).Scan(&currentVersion); err != nil {
		return dto.OperationResult{}, err
	}
	serverPayload, loadErr := loadCatalogMeasurement(ctx, tx, claims.MerchantID, operation.EntityID, isUnit)
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The measurement entity already exists.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The measurement entity does not exist.")
	}
	if operation.OperationType != "CREATE" && ((operation.BaseVersion == nil && currentVersion > 0) || (operation.BaseVersion != nil && *operation.BaseVersion != currentVersion)) {
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "Measurement creation must start at version zero.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if isUnit {
		if operation.OperationType == "CREATE" {
			_, err := tx.Exec(ctx, `INSERT INTO unit_definitions(id,merchant_id,measurement_group_id,code,name,symbol,dimension_code,allows_decimal,is_active) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9)`, operation.EntityID, claims.MerchantID, unitPayload.MeasurementGroupID, strings.TrimSpace(unitPayload.Code), strings.TrimSpace(unitPayload.Name), unitPayload.Symbol, defaultString(unitPayload.DimensionCode, "CUSTOM"), unitPayload.AllowsDecimal, unitPayload.IsActive)
			if err != nil {
				return dto.OperationResult{}, err
			}
		} else if operation.OperationType == "UPDATE" {
			_, err := tx.Exec(ctx, `UPDATE unit_definitions SET measurement_group_id=$3,code=$4,name=$5,symbol=$6,dimension_code=$7,allows_decimal=$8,is_active=$9,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, unitPayload.MeasurementGroupID, strings.TrimSpace(unitPayload.Code), strings.TrimSpace(unitPayload.Name), unitPayload.Symbol, defaultString(unitPayload.DimensionCode, "CUSTOM"), unitPayload.AllowsDecimal, unitPayload.IsActive)
			if err != nil {
				return dto.OperationResult{}, err
			}
		} else if operation.OperationType == "DELETE" {
			if _, err := tx.Exec(ctx, `SAVEPOINT catalog_unit_delete`); err != nil {
				return dto.OperationResult{}, err
			}
			if _, err := tx.Exec(ctx, `DELETE FROM unit_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
				if _, rollbackErr := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT catalog_unit_delete`); rollbackErr != nil {
					return dto.OperationResult{}, rollbackErr
				}
				resultPayload := json.RawMessage(`{"id":"` + operation.EntityID + `"}`)
				message := "The unit cannot be deleted while it is referenced by products, stock, or business records."
				if _, updateErr := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, currentVersion); updateErr != nil {
					return dto.OperationResult{}, updateErr
				}
				return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: "DELETE_REJECTED", Message: message, ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: resultPayload}, nil
			}
			if _, err := tx.Exec(ctx, `RELEASE SAVEPOINT catalog_unit_delete`); err != nil {
				return dto.OperationResult{}, err
			}
		} else {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Unit synchronization supports create, update, and delete.")
		}
	} else {
		if operation.OperationType == "CREATE" {
			_, err := tx.Exec(ctx, `INSERT INTO unit_conversions(id,merchant_id,from_unit_id,to_unit_id,multiplier,additive_offset,is_active) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7)`, operation.EntityID, claims.MerchantID, conversionPayload.FromUnitID, conversionPayload.ToUnitID, conversionPayload.Multiplier, defaultString(conversionPayload.AdditiveOffset, "0"), conversionPayload.IsActive)
			if err != nil {
				return dto.OperationResult{}, err
			}
		} else if operation.OperationType == "UPDATE" {
			_, err := tx.Exec(ctx, `UPDATE unit_conversions SET from_unit_id=$3::uuid,to_unit_id=$4::uuid,multiplier=$5,additive_offset=$6,is_active=$7,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, conversionPayload.FromUnitID, conversionPayload.ToUnitID, conversionPayload.Multiplier, defaultString(conversionPayload.AdditiveOffset, "0"), conversionPayload.IsActive)
			if err != nil {
				return dto.OperationResult{}, err
			}
		} else if operation.OperationType == "DELETE" {
			if _, err := tx.Exec(ctx, `DELETE FROM unit_conversions WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
				return dto.OperationResult{}, err
			}
		} else {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Conversion synchronization supports create, update, and delete.")
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,$2,$3::uuid,$4,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, entityType, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var updatedPayload []byte
	if operation.OperationType == "DELETE" {
		updatedPayload, _ = json.Marshal(map[string]any{"id": operation.EntityID, "is_deleted": true})
	} else {
		updatedPayload, _ = loadCatalogMeasurement(ctx, tx, claims.MerchantID, operation.EntityID, isUnit)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,$3,$4::uuid,$5,$6::uuid,$7,$8::jsonb)`, claims.MerchantID, sequence, entityType, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateCatalogUnitPayload(payload catalogUnitSyncPayload) error {
	if strings.TrimSpace(payload.Code) == "" || strings.TrimSpace(payload.Name) == "" {
		return errors.New("unit code and name are required")
	}
	return nil
}

func validateCatalogConversionPayload(payload catalogConversionSyncPayload) error {
	if strings.TrimSpace(payload.FromUnitID) == "" || strings.TrimSpace(payload.ToUnitID) == "" || strings.TrimSpace(payload.Multiplier) == "" {
		return errors.New("conversion endpoints and multiplier are required")
	}
	if payload.FromUnitID == payload.ToUnitID {
		return errors.New("conversion endpoints must differ")
	}
	return nil
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func loadCatalogMeasurement(ctx context.Context, tx pgx.Tx, merchantID, entityID string, isUnit bool) (json.RawMessage, error) {
	var payload json.RawMessage
	var err error
	if isUnit {
		err = tx.QueryRow(ctx, `SELECT json_build_object('id',u.id::text,'merchant_id',u.merchant_id::text,'measurement_group_id',u.measurement_group_id::text,'code',u.code,'name',u.name,'symbol',u.symbol,'dimension_code',u.dimension_code,'allows_decimal',u.allows_decimal,'is_active',u.is_active) FROM unit_definitions u WHERE u.merchant_id=$1::uuid AND u.id=$2::uuid`, merchantID, entityID).Scan(&payload)
	} else {
		err = tx.QueryRow(ctx, `SELECT json_build_object('id',u.id::text,'merchant_id',u.merchant_id::text,'from_unit_id',u.from_unit_id::text,'to_unit_id',u.to_unit_id::text,'multiplier',u.multiplier::text,'additive_offset',u.additive_offset::text,'is_active',u.is_active) FROM unit_conversions u WHERE u.merchant_id=$1::uuid AND u.id=$2::uuid`, merchantID, entityID).Scan(&payload)
	}
	return payload, err
}

func (r *Repository) applyStockReceiptOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID == nil || operation.OperationType != "CREATE" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Offline stock receiving supports shop-scoped direct receipts only.")
	}
	var payload stockReceiptSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || validateStockReceiptPayload(payload) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Stock receipt payload is invalid.")
	}
	var allowed bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM user_memberships um JOIN locations l ON l.merchant_id=um.merchant_id AND l.id=$3::uuid WHERE um.merchant_id=$1::uuid AND um.id=$2::uuid AND um.is_active AND (um.shop_id IS NULL OR l.shop_id=um.shop_id) AND l.is_active)`, claims.MerchantID, claims.MembershipID, payload.DestinationLocationID).Scan(&allowed); err != nil {
		return dto.OperationResult{}, err
	}
	if !allowed {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_SCOPE_MISMATCH", "Stock can only be received into an active location assigned to this membership.")
	}
	var tracked, batchTracked bool
	if err := tx.QueryRow(ctx, `SELECT pv.is_stock_tracked,COALESCE(vip.track_batches,false) FROM product_variants pv JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id LEFT JOIN variant_inventory_policies vip ON vip.merchant_id=pv.merchant_id AND vip.variant_id=pv.id WHERE pv.merchant_id=$1::uuid AND pv.id=$2::uuid AND p.is_active`, claims.MerchantID, payload.VariantID).Scan(&tracked, &batchTracked); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The product variant does not exist or is inactive.")
	}
	if !tracked || batchTracked {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "RECEIPT_NOT_ALLOWED", "This variant cannot receive a direct offline stock receipt.")
	}
	if strings.TrimSpace(payload.UnitCost) == "" {
		if err := tx.QueryRow(ctx, `SELECT unit_cost::text
			FROM inventory_movements
			WHERE merchant_id=$1::uuid AND variant_id=$2::uuid AND movement_type='RECEIPT' AND unit_cost IS NOT NULL
			ORDER BY occurred_at DESC, created_at DESC, id DESC
			LIMIT 1`, claims.MerchantID, payload.VariantID).Scan(&payload.UnitCost); errors.Is(err, pgx.ErrNoRows) {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNIT_COST_REQUIRED", "The first stock-in for this product variant requires an original unit cost.")
		} else if err != nil {
			return dto.OperationResult{}, err
		}
	}
	if operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "A stock receipt must start at version zero.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,'PENDING',$10::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO inventory_movements(id,merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_id,unit_cost,event_key) VALUES($1::uuid,$2::uuid,$3::uuid,'RECEIPT',$4::uuid,$5,NULLIF($6,'')::uuid,$7,$8)`, operation.EntityID, claims.MerchantID, payload.VariantID, payload.DestinationLocationID, payload.Quantity, payload.UnitID, payload.UnitCost, payload.EventKey); err != nil {
		return dto.OperationResult{}, err
	}
	newVersion := int64(1)
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'STOCK_RECEIPT',$2::uuid,1,now())`, claims.MerchantID, operation.EntityID); err != nil {
		return dto.OperationResult{}, err
	}
	updatedPayload, err := loadStockReceipt(ctx, tx, claims.MerchantID, operation.EntityID)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'STOCK_RECEIPT',$3::uuid,$4,$5::uuid,'CREATE',$6::jsonb)`, claims.MerchantID, sequence, operation.EntityID, newVersion, serverID, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateStockReceiptPayload(payload stockReceiptSyncPayload) error {
	if strings.TrimSpace(payload.VariantID) == "" || strings.TrimSpace(payload.DestinationLocationID) == "" || strings.TrimSpace(payload.Quantity) == "" || strings.TrimSpace(payload.EventKey) == "" {
		return errors.New("variant, location, quantity, and event key are required")
	}
	quantity, quantityOK := new(big.Rat).SetString(strings.TrimSpace(payload.Quantity))
	if !quantityOK || quantity.Sign() <= 0 {
		return errors.New("quantity must be positive")
	}
	if strings.TrimSpace(payload.UnitCost) != "" {
		cost, costOK := new(big.Rat).SetString(strings.TrimSpace(payload.UnitCost))
		if !costOK || cost.Sign() < 0 {
			return errors.New("cost must be non-negative")
		}
	}
	return nil
}

func loadStockReceipt(ctx context.Context, tx pgx.Tx, merchantID, movementID string) (json.RawMessage, error) {
	var payload json.RawMessage
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',m.id::text,'merchant_id',m.merchant_id::text,'variant_id',m.variant_id::text,'movement_type',m.movement_type,'destination_location_id',m.destination_location_id::text,'unit_id',m.unit_id::text,'quantity',m.quantity::text,'unit_cost',m.unit_cost::text,'event_key',m.event_key,'occurred_at',m.occurred_at) FROM inventory_movements m WHERE m.merchant_id=$1::uuid AND m.id=$2::uuid`, merchantID, movementID).Scan(&payload)
	return payload, err
}

func validatePriceListPayload(payload priceListSyncPayload) error {
	if strings.TrimSpace(payload.Code) == "" || len(strings.TrimSpace(payload.CurrencyCode)) != 3 {
		return errors.New("price-list code and three-letter currency are required")
	}
	return nil
}

func loadPriceList(ctx context.Context, tx pgx.Tx, merchantID, listID string) (json.RawMessage, bool, error) {
	var payload json.RawMessage
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',p.id::text,'merchant_id',p.merchant_id::text,'code',p.code,'currency_code',p.currency_code,'is_default',p.is_default) FROM price_lists p WHERE p.merchant_id=$1::uuid AND p.id=$2::uuid`, merchantID, listID).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	return payload, err == nil, err
}

func validateRepairTicketPayload(payload repairTicketSyncPayload, expectedShopID, expectedID string) error {
	if payload.ShopID != expectedShopID || (payload.TicketID != "" && payload.TicketID != expectedID) {
		return errors.New("repair ticket scope or identifier does not match the operation")
	}
	if strings.TrimSpace(payload.OrderNumber) == "" || strings.TrimSpace(payload.IssueDescription) == "" {
		return errors.New("repair ticket requires an order number and issue")
	}
	if strings.TrimSpace(payload.Priority) == "" {
		payload.Priority = "NORMAL"
	}
	switch strings.ToUpper(strings.TrimSpace(payload.Priority)) {
	case "LOW", "NORMAL", "HIGH", "URGENT":
	default:
		return errors.New("repair ticket priority is invalid")
	}
	if strings.TrimSpace(syncDeviceString(payload.Device, "device_type")) == "" {
		return errors.New("repair ticket device type is required")
	}
	if len(payload.WorkItems) > 100 {
		return errors.New("repair ticket cannot contain more than 100 work items")
	}
	seenWorkItems := map[string]bool{}
	for _, item := range payload.WorkItems {
		if strings.TrimSpace(item.ID) != "" {
			if _, err := uuid.Parse(strings.TrimSpace(item.ID)); err != nil {
				return errors.New("repair work item id is invalid")
			}
			if seenWorkItems[strings.TrimSpace(item.ID)] {
				return errors.New("repair work item ids must be unique")
			}
			seenWorkItems[strings.TrimSpace(item.ID)] = true
		}
		itemType := strings.ToUpper(strings.TrimSpace(item.Type))
		if itemType == "" {
			itemType = "DEVICE"
		}
		switch itemType {
		case "DEVICE", "VEHICLE", "PATIENT", "OTHER":
		default:
			return errors.New("repair work item type is invalid")
		}
		if len(item.Issues) == 0 && strings.TrimSpace(item.IssueDescription) != "" {
			item.Issues = []string{item.IssueDescription}
		}
		if len(item.Issues) == 0 || len(item.Issues) > 20 || len(item.Conditions) > 20 || strings.TrimSpace(syncDeviceString(item.Device, "device_type")) == "" {
			return errors.New("every repair work item requires a device type and issue")
		}
		for _, value := range append(append([]string{}, item.Issues...), item.Conditions...) {
			if strings.TrimSpace(value) == "" || len([]rune(strings.TrimSpace(value))) > 500 {
				return errors.New("repair issue and condition values must be non-empty and at most 500 characters")
			}
		}
		if item.WaitingDays != nil && *item.WaitingDays < 0 {
			return errors.New("repair waiting days must be zero or greater")
		}
		if item.WaitingEndDate != nil {
			if _, err := time.Parse(time.DateOnly, strings.TrimSpace(*item.WaitingEndDate)); err != nil {
				return errors.New("repair waiting end date must use YYYY-MM-DD format")
			}
		}
	}
	if payload.AdditionalFee != "" {
		amount, err := strconv.ParseFloat(payload.AdditionalFee, 64)
		if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
			return errors.New("repair additional fee is invalid")
		}
	}
	return nil
}

func syncDeviceString(device map[string]any, key string) string {
	if device == nil {
		return ""
	}
	value, _ := device[key].(string)
	return strings.TrimSpace(value)
}

func syncDeviceMetadata(device map[string]any) json.RawMessage {
	value, ok := device["metadata"]
	if !ok || value == nil {
		return json.RawMessage(`{}`)
	}
	encoded, err := json.Marshal(value)
	if err != nil || !json.Valid(encoded) {
		return json.RawMessage(`{}`)
	}
	return encoded
}

func syncCustomFieldMap(fields map[string]json.RawMessage) map[string]json.RawMessage {
	if fields == nil {
		return map[string]json.RawMessage{}
	}
	return fields
}

type syncedCustomFieldDefinition struct {
	ID              string
	FieldCode       string
	ValueType       string
	IsRequired      bool
	Options         json.RawMessage
	ValidationRules json.RawMessage
	VisibilityRules json.RawMessage
	FormVersion     int
}

func validateSyncedCustomFieldValue(def syncedCustomFieldDefinition, raw json.RawMessage) error {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return fmt.Errorf("repair custom field %q is invalid JSON", def.FieldCode)
	}
	switch def.ValueType {
	case "TEXT", "DATE", "SELECT":
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("repair custom field %q must be text", def.FieldCode)
		}
		if def.ValueType == "DATE" {
			if !validSyncedCustomFieldDate(text) {
				return fmt.Errorf("repair custom field %q contains an invalid date", def.FieldCode)
			}
		}
		if def.ValueType == "SELECT" {
			var options []any
			if err := json.Unmarshal(def.Options, &options); err == nil && len(options) > 0 {
				found := false
				for _, option := range options {
					if option == text {
						found = true
						break
					}
					if object, ok := option.(map[string]any); ok && object["value"] == text {
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("repair custom field %q is not one of the configured options", def.FieldCode)
				}
			}
		}
	case "NUMBER":
		if _, ok := value.(float64); !ok {
			return fmt.Errorf("repair custom field %q must be numeric", def.FieldCode)
		}
	case "BOOLEAN":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("repair custom field %q must be boolean", def.FieldCode)
		}
	case "JSON":
		// Any valid JSON value is valid for a JSON field.
	default:
		return fmt.Errorf("repair custom field %q has an unsupported value type", def.FieldCode)
	}
	var rules map[string]any
	if err := json.Unmarshal(def.ValidationRules, &rules); err == nil {
		if min, ok := rules["min"].(float64); ok {
			if number, ok := value.(float64); ok && number < min {
				return fmt.Errorf("repair custom field %q is below its minimum", def.FieldCode)
			}
		}
		if max, ok := rules["max"].(float64); ok {
			if number, ok := value.(float64); ok && number > max {
				return fmt.Errorf("repair custom field %q is above its maximum", def.FieldCode)
			}
		}
		if pattern, ok := rules["pattern"].(string); ok {
			if text, ok := value.(string); ok {
				matched, err := regexp.MatchString(pattern, text)
				if err != nil || !matched {
					return fmt.Errorf("repair custom field %q does not match its validation rule", def.FieldCode)
				}
			}
		}
	}
	return nil
}

func validSyncedCustomFieldDate(value string) bool {
	if _, err := time.Parse(time.RFC3339, value); err == nil {
		return true
	}
	_, err := time.Parse("2006-01-02", value)
	return err == nil
}

func syncedCustomFieldConditionMatches(condition map[string]any, values map[string]json.RawMessage) bool {
	field, _ := condition["field_code"].(string)
	if field == "" {
		field, _ = condition["field"].(string)
	}
	if field == "" {
		return true
	}
	raw, exists := values[field]
	operator, _ := condition["operator"].(string)
	if operator == "" {
		operator = "equals"
	}
	if operator == "exists" {
		expected, ok := condition["value"].(bool)
		if !ok {
			expected = true
		}
		return exists == expected
	}
	if !exists {
		return operator == "not_equals" || operator == "not_in"
	}
	var actual any
	if err := json.Unmarshal(raw, &actual); err != nil {
		return false
	}
	expected, hasExpected := condition["value"]
	if !hasExpected {
		expected, hasExpected = condition["equals"]
	}
	if !hasExpected {
		return true
	}
	same := reflect.DeepEqual(actual, expected)
	switch operator {
	case "not_equals":
		return !same
	case "in", "not_in":
		options, ok := expected.([]any)
		if !ok {
			return false
		}
		contains := false
		for _, option := range options {
			if reflect.DeepEqual(actual, option) {
				contains = true
				break
			}
		}
		if operator == "not_in" {
			return !contains
		}
		return contains
	default:
		return same
	}
}

func syncedCustomFieldVisible(rules json.RawMessage, values map[string]json.RawMessage) bool {
	if len(rules) == 0 || string(rules) == "{}" || string(rules) == "null" {
		return true
	}
	var configuration map[string]any
	if json.Unmarshal(rules, &configuration) != nil {
		return true
	}
	if all, ok := configuration["all"].([]any); ok {
		for _, entry := range all {
			condition, valid := entry.(map[string]any)
			if valid && !syncedCustomFieldVisible(mustSyncedJSON(condition), values) {
				return false
			}
		}
		return true
	}
	if anyRules, ok := configuration["any"].([]any); ok {
		for _, entry := range anyRules {
			condition, valid := entry.(map[string]any)
			if valid && syncedCustomFieldVisible(mustSyncedJSON(condition), values) {
				return true
			}
		}
		return len(anyRules) == 0
	}
	if nested, ok := configuration["when"].(map[string]any); ok {
		return syncedCustomFieldConditionMatches(nested, values)
	}
	return syncedCustomFieldConditionMatches(configuration, values)
}

func mustSyncedJSON(value any) json.RawMessage {
	raw, _ := json.Marshal(value)
	return raw
}

func validateSyncedCustomFields(ctx context.Context, tx pgx.Tx, merchantID, entityType, fieldScope, serviceType string, fields map[string]json.RawMessage) error {
	fields = syncCustomFieldMap(fields)
	rows, err := tx.Query(ctx, `SELECT id,field_code,value_type,is_required,options,validation_rules,visibility_rules,form_version FROM custom_field_definitions WHERE merchant_id=$1::uuid AND entity_type=$2 AND field_scope=$3 AND is_active AND (service_type IS NULL OR service_type=$4)`, merchantID, entityType, fieldScope, serviceType)
	if err != nil {
		return err
	}
	defer rows.Close()
	definitions := map[string]syncedCustomFieldDefinition{}
	for rows.Next() {
		var definition syncedCustomFieldDefinition
		if err := rows.Scan(&definition.ID, &definition.FieldCode, &definition.ValueType, &definition.IsRequired, &definition.Options, &definition.ValidationRules, &definition.VisibilityRules, &definition.FormVersion); err != nil {
			return err
		}
		definitions[definition.FieldCode] = definition
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for code, raw := range fields {
		definition, ok := definitions[code]
		if !ok {
			return fmt.Errorf("repair custom field %q is not defined for this form", code)
		}
		if err := validateSyncedCustomFieldValue(definition, raw); err != nil {
			return err
		}
	}
	for code, definition := range definitions {
		if definition.IsRequired && syncedCustomFieldVisible(definition.VisibilityRules, fields) {
			if _, ok := fields[code]; !ok {
				return fmt.Errorf("required repair custom field %q is missing", code)
			}
		}
	}
	return nil
}

func storeSyncedCustomFields(ctx context.Context, tx pgx.Tx, merchantID, entityType, fieldScope, serviceType, entityID string, fields map[string]json.RawMessage) (int, error) {
	fields = syncCustomFieldMap(fields)
	if err := validateSyncedCustomFields(ctx, tx, merchantID, entityType, fieldScope, serviceType, fields); err != nil {
		return 0, err
	}
	formVersion := 1
	for code, value := range fields {
		if !json.Valid(value) {
			return 0, errors.New("repair custom field value is invalid JSON")
		}
		var definitionID string
		var definitionVersion int
		err := tx.QueryRow(ctx, `SELECT id,form_version FROM custom_field_definitions WHERE merchant_id=$1::uuid AND entity_type=$2 AND field_scope=$3 AND field_code=$4 AND is_active AND (service_type IS NULL OR service_type=$5) ORDER BY service_type NULLS LAST LIMIT 1`, merchantID, entityType, fieldScope, code, serviceType).Scan(&definitionID, &definitionVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fmt.Errorf("repair custom field %q is not defined for this form", code)
		}
		if err != nil {
			return 0, err
		}
		if definitionVersion > formVersion {
			formVersion = definitionVersion
		}
		if _, err := tx.Exec(ctx, `INSERT INTO custom_field_values(merchant_id,definition_id,entity_type,entity_id,form_version,value)
			VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::jsonb)
			ON CONFLICT (merchant_id,definition_id,entity_id) DO UPDATE SET entity_type=EXCLUDED.entity_type,form_version=EXCLUDED.form_version,value=EXCLUDED.value`,
			merchantID, definitionID, entityType, entityID, definitionVersion, value); err != nil {
			return 0, err
		}
	}
	var requiredCode string
	var visibilityRules json.RawMessage
	rows, err := tx.Query(ctx, `SELECT field_code,visibility_rules FROM custom_field_definitions
		WHERE merchant_id=$1::uuid AND entity_type=$2 AND field_scope=$3 AND is_active AND is_required
		AND (service_type IS NULL OR service_type=$4)`, merchantID, entityType, fieldScope, serviceType)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	for rows.Next() {
		if err := rows.Scan(&requiredCode, &visibilityRules); err != nil {
			return 0, err
		}
		if syncedCustomFieldVisible(visibilityRules, fields) {
			if _, ok := fields[requiredCode]; ok {
				continue
			}
			return 0, fmt.Errorf("required repair custom field %q is missing", requiredCode)
		}
	}
	return formVersion, rows.Err()
}

func (r *Repository) applyRepairTicketOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil || strings.TrimSpace(*operation.ShopID) == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Offline repair synchronization supports shop-scoped ticket creation only.")
	}
	var payload repairTicketSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || validateRepairTicketPayload(payload, *operation.ShopID, operation.EntityID) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "The offline repair ticket payload is invalid or incomplete.")
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return dto.OperationResult{}, err
		}
		if assignedShop != nil && *assignedShop != payload.ShopID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_FORBIDDEN", "The active staff membership is assigned to another shop.")
		}
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_orders WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&exists); err != nil {
		return dto.OperationResult{}, err
	}
	if exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair ticket already exists on the server.")
	}
	if operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_BASE_VERSION", "A new repair ticket must start at version zero.")
	}
	items := payload.WorkItems
	if len(items) == 0 {
		items = []repairWorkItemSyncPayload{{
			Type: "DEVICE", Device: payload.Device, IssueDescription: payload.IssueDescription, Issues: []string{payload.IssueDescription}, Note: payload.Note,
		}}
	}
	if err := validateSyncedCustomFields(ctx, tx, claims.MerchantID, "REPAIR_TICKET", "TICKET", "REPAIR", payload.Fields); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	for _, item := range items {
		if err := validateSyncedCustomFields(ctx, tx, claims.MerchantID, "REPAIR_WORK_ITEM", "WORK_ITEM", "REPAIR", item.Fields); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
		}
	}
	ticketFields := syncCustomFieldMap(payload.Fields)
	ticketVersion, err := storeSyncedCustomFields(ctx, tx, claims.MerchantID, "REPAIR_TICKET", "TICKET", "REPAIR", operation.EntityID, ticketFields)
	if err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	customerID := ""
	if payload.CustomerName != nil && strings.TrimSpace(*payload.CustomerName) != "" {
		if err := tx.QueryRow(ctx, `INSERT INTO customers(merchant_id,customer_number,display_name,phone) VALUES($1::uuid,'REP-'||substring(uuid_generate_v4()::text,1,8),$2,$3) RETURNING id`, claims.MerchantID, strings.TrimSpace(*payload.CustomerName), nullableSyncString(payload.CustomerPhone)).Scan(&customerID); err != nil {
			return dto.OperationResult{}, err
		}
	}
	additional := 0.0
	if strings.TrimSpace(payload.AdditionalFee) != "" {
		additional, _ = strconv.ParseFloat(strings.TrimSpace(payload.AdditionalFee), 64)
	}
	additional = math.Round(additional*100) / 100
	var includeTax bool
	var taxRate float64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0)::float8 FROM shops s LEFT JOIN payment_settings ps ON ps.merchant_id=s.merchant_id AND ps.shop_id=s.id WHERE s.merchant_id=$1::uuid AND s.id=$2::uuid`, claims.MerchantID, payload.ShopID).Scan(&includeTax, &taxRate); err != nil {
		return dto.OperationResult{}, err
	}
	tax := 0.0
	if includeTax {
		tax = math.Round(additional*taxRate/100*100) / 100
	}
	total := math.Round((additional+tax)*100) / 100
	orderID := uuid.New().String()
	serviceOrderID := uuid.New().String()
	if _, err := tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,customer_id,order_number,channel,status,currency_code,subtotal,discount_total,tax_total,shipping_total,grand_total,placed_at)
		SELECT $1::uuid,$2::uuid,NULLIF($3,'')::uuid,$4,'SERVICE','CONFIRMED',m.default_currency_code,$5,0,$6,0,$7,now() FROM merchants m WHERE m.id=$2::uuid`, orderID, claims.MerchantID, customerID, payload.OrderNumber, additional, tax, total); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,1,'Repair service',1,$3,0,$4,$5)`, claims.MerchantID, orderID, additional, tax, total); err != nil {
		return dto.OperationResult{}, err
	}
	priority := strings.ToUpper(strings.TrimSpace(payload.Priority))
	if priority == "" {
		priority = "NORMAL"
	}
	if _, err := tx.Exec(ctx, `INSERT INTO service_orders(id,merchant_id,customer_id,shop_id,order_id,order_number,service_type,status,priority) VALUES($1::uuid,$2::uuid,NULLIF($3,'')::uuid,$4::uuid,$5::uuid,$6,'REPAIR','OPEN',$7)`, serviceOrderID, claims.MerchantID, customerID, payload.ShopID, orderID, payload.OrderNumber, priority); err != nil {
		return dto.OperationResult{}, err
	}
	deviceIDs := make([]string, 0, len(items))
	workItemIDs := make([]string, 0, len(items))
	waitingStarts := make([]string, 0, len(items))
	waitingEnds := make([]string, 0, len(items))
	waitingDayCounts := make([]int, 0, len(items))
	for index, item := range items {
		itemType := strings.ToUpper(strings.TrimSpace(item.Type))
		if itemType == "" {
			itemType = "DEVICE"
		}
		deviceIDValue := uuid.New().String()
		workItemID := uuid.New().String()
		if strings.TrimSpace(item.ID) != "" {
			workItemID = strings.TrimSpace(item.ID)
		}
		deviceIDs = append(deviceIDs, deviceIDValue)
		workItemIDs = append(workItemIDs, workItemID)
		metadata := syncDeviceMetadata(item.Device)
		if _, err := tx.Exec(ctx, `INSERT INTO repair_devices(id,merchant_id,customer_id,device_type,manufacturer,model,serial_number,metadata) VALUES($1::uuid,$2::uuid,NULLIF($3,'')::uuid,$4,$5,$6,$7,$8::jsonb)`, deviceIDValue, claims.MerchantID, customerID, syncDeviceString(item.Device, "device_type"), nullableSyncStringValue(item.Device, "manufacturer"), nullableSyncStringValue(item.Device, "model"), nullableSyncStringValue(item.Device, "serial_number"), metadata); err != nil {
			return dto.OperationResult{}, err
		}
		fields := syncCustomFieldMap(item.Fields)
		fieldsJSON, err := json.Marshal(fields)
		if err != nil {
			return dto.OperationResult{}, err
		}
		formVersion, err := storeSyncedCustomFields(ctx, tx, claims.MerchantID, "REPAIR_WORK_ITEM", "WORK_ITEM", "REPAIR", workItemID, fields)
		if err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO service_order_work_items(id,merchant_id,service_order_id,sequence_number,item_type,status,form_version,summary) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,'OPEN',$6,$7)`, workItemID, claims.MerchantID, serviceOrderID, index+1, itemType, formVersion, syncDeviceString(item.Device, "device_type")); err != nil {
			return dto.OperationResult{}, err
		}
		if len(item.Issues) == 0 {
			item.Issues = []string{item.IssueDescription}
		}
		item.IssueDescription = strings.TrimSpace(item.Issues[0])
		issuesJSON, _ := json.Marshal(item.Issues)
		conditionsJSON, _ := json.Marshal(item.Conditions)
		var waitingStart, waitingEnd string
		var waitingDays int
		if err := tx.QueryRow(ctx, `INSERT INTO repair_work_item_devices(merchant_id,work_item_id,repair_device_id,issue_description,issues,conditions,notes,waiting_end_date,custom_fields) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,$6::jsonb,$7,COALESCE(NULLIF($8::text,'')::date,CURRENT_DATE+COALESCE($9::int,0)),$10::jsonb) RETURNING waiting_start_date::text,waiting_end_date::text,(waiting_end_date-waiting_start_date)::int`, claims.MerchantID, workItemID, deviceIDValue, item.IssueDescription, issuesJSON, conditionsJSON, item.Note, item.WaitingEndDate, item.WaitingDays, fieldsJSON).Scan(&waitingStart, &waitingEnd, &waitingDays); err != nil {
			return dto.OperationResult{}, err
		}
		waitingStarts = append(waitingStarts, waitingStart)
		waitingEnds = append(waitingEnds, waitingEnd)
		waitingDayCounts = append(waitingDayCounts, waitingDays)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_orders(id,merchant_id,service_order_id,device_id,order_number,status,issue_description,customer_id,customer_name,customer_phone,labor_fee,additional_fee,tax_amount,total_cost,note,form_version,deposit_paid,payment_status) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'RECEIVED',$6,NULLIF($7,'')::uuid,$8,$9,0,$10,$11,$12,$13,$14,0,'UNPAID')`, operation.EntityID, claims.MerchantID, serviceOrderID, deviceIDs[0], payload.OrderNumber, items[0].IssueDescription, customerID, nullableSyncString(payload.CustomerName), nullableSyncString(payload.CustomerPhone), additional, tax, total, payload.Note, ticketVersion); err != nil {
		return dto.OperationResult{}, err
	}
	var serverID, currencyCode string
	var sequence int64
	if err := tx.QueryRow(ctx, `SELECT currency_code FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, orderID).Scan(&currencyCode); err != nil {
		return dto.OperationResult{}, err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	workPayload := make([]map[string]any, 0, len(items))
	for index := range items {
		itemType := strings.ToUpper(strings.TrimSpace(items[index].Type))
		if itemType == "" {
			itemType = "DEVICE"
		}
		workPayload = append(workPayload, map[string]any{
			"id": workItemIDs[index], "device_id": deviceIDs[index], "sequence_number": index + 1,
			"type": itemType, "status": "OPEN", "device": items[index].Device,
			"issue_description": items[index].IssueDescription, "issues": items[index].Issues, "conditions": items[index].Conditions, "note": items[index].Note,
			"waiting_start_date": waitingStarts[index], "waiting_end_date": waitingEnds[index], "waiting_days": waitingDayCounts[index],
			"fields": syncCustomFieldMap(items[index].Fields),
		})
	}
	ticketWaitingStart, ticketWaitingEnd := waitingStarts[0], waitingEnds[0]
	for index := 1; index < len(waitingStarts); index++ {
		if waitingStarts[index] < ticketWaitingStart {
			ticketWaitingStart = waitingStarts[index]
		}
		if waitingEnds[index] > ticketWaitingEnd {
			ticketWaitingEnd = waitingEnds[index]
		}
	}
	ticketStartDate, _ := time.Parse(time.DateOnly, ticketWaitingStart)
	ticketEndDate, _ := time.Parse(time.DateOnly, ticketWaitingEnd)
	resultPayload, err := json.Marshal(map[string]any{
		"id": operation.EntityID, "repair_order_id": operation.EntityID, "service_order_id": serviceOrderID, "shop_id": payload.ShopID,
		"order_number": payload.OrderNumber, "status": "RECEIVED", "payment_status": "UNPAID", "currency_code": currencyCode,
		"priority": priority, "issue_description": items[0].IssueDescription, "device": items[0].Device,
		"device_id": deviceIDs[0], "customer_name": nullableSyncString(payload.CustomerName),
		"customer_phone": nullableSyncString(payload.CustomerPhone), "note": payload.Note, "received_at": time.Now().UTC().Format(time.RFC3339),
		"waiting_start_date": ticketWaitingStart, "waiting_end_date": ticketWaitingEnd, "waiting_days": int(ticketEndDate.Sub(ticketStartDate).Hours() / 24),
		"additional_fee": fmt.Sprintf("%.2f", additional), "tax_amount": fmt.Sprintf("%.2f", tax), "total_cost": fmt.Sprintf("%.2f", total), "form_version": ticketVersion, "fields": ticketFields, "work_items": workPayload,
	})
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'REPAIR_TICKET',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=1 WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, serverID, resultPayload); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'REPAIR_TICKET',$4::uuid,1,$5::uuid,'CREATE',$6::jsonb)`, claims.MerchantID, payload.ShopID, sequence, operation.EntityID, serverID, resultPayload); err != nil {
		return dto.OperationResult{}, err
	}
	version := int64(1)
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &version, ServerPayload: resultPayload}, nil
}

func nullableSyncString(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return strings.TrimSpace(*value)
}

func nullableSyncStringValuePtr(value *string) any {
	return nullableSyncString(value)
}

func nullableSyncStringValue(values map[string]any, key string) any {
	value := syncDeviceString(values, key)
	if value == "" {
		return nil
	}
	return value
}

func validateRepairDraftPayload(payload repairDraftSyncPayload, expectedShopID string) error {
	if payload.ShopID != expectedShopID || strings.TrimSpace(payload.Priority) == "" || strings.TrimSpace(payload.IssueDescription) == "" || len(payload.Device) == 0 {
		return errors.New("repair draft requires matching shop, priority, device, and issue")
	}
	var device map[string]any
	if err := json.Unmarshal(payload.Device, &device); err != nil {
		return errors.New("repair draft device is invalid")
	}
	deviceType, _ := device["device_type"].(string)
	if strings.TrimSpace(deviceType) == "" {
		return errors.New("repair draft device is invalid")
	}
	return nil
}

func loadRepairDraft(ctx context.Context, tx pgx.Tx, merchantID, draftID string) (json.RawMessage, int64, error) {
	var payload []byte
	var version int64
	err := tx.QueryRow(ctx, `SELECT jsonb_build_object('id',id::text,'shop_id',shop_id::text,'payload',payload,'is_deleted',is_deleted),version FROM repair_drafts WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, draftID).Scan(&payload, &version)
	return json.RawMessage(payload), version, err
}

func (r *Repository) applyRepairDraftOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID == nil || *operation.ShopID == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_SCOPE_MISMATCH", "A repair draft must identify its shop.")
	}
	var payload repairDraftSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || validateRepairDraftPayload(payload, *operation.ShopID) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Only intake fields may be saved in a repair draft; payment, pricing, stock, and completion fields are not allowed.")
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return dto.OperationResult{}, err
		}
		if assignedShop != nil && *assignedShop != payload.ShopID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_FORBIDDEN", "The active staff membership is assigned to another shop.")
		}
	}
	var currentVersion int64
	var existingDeleted bool
	err := tx.QueryRow(ctx, `SELECT version,is_deleted FROM repair_drafts WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, claims.MerchantID, operation.EntityID).Scan(&currentVersion, &existingDeleted)
	exists := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return dto.OperationResult{}, err
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair draft identifier is already in use.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The repair draft does not exist.")
	}
	if operation.OperationType != "CREATE" && operation.BaseVersion == nil && currentVersion > 0 || operation.OperationType != "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != currentVersion {
		serverPayload, _, loadErr := loadRepairDraft(ctx, tx, claims.MerchantID, operation.EntityID)
		if loadErr != nil {
			return dto.OperationResult{}, loadErr
		}
		return insertConflict(ctx, tx, claims, deviceID, sessionID, operation, currentVersion, serverPayload)
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	newVersion := currentVersion + 1
	if operation.OperationType == "DELETE" {
		if _, err := tx.Exec(ctx, `UPDATE repair_drafts SET is_deleted=TRUE,version=$3,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
			return dto.OperationResult{}, err
		}
	} else if operation.OperationType == "CREATE" {
		if _, err := tx.Exec(ctx, `INSERT INTO repair_drafts(id,merchant_id,shop_id,created_by_membership_id,payload,version) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5::jsonb,$6)`, operation.EntityID, claims.MerchantID, payload.ShopID, claims.MembershipID, operation.Payload, newVersion); err != nil {
			return dto.OperationResult{}, err
		}
	} else {
		if _, err := tx.Exec(ctx, `UPDATE repair_drafts SET shop_id=$3::uuid,payload=$4::jsonb,is_deleted=FALSE,version=$5,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, payload.ShopID, operation.Payload, newVersion); err != nil {
			return dto.OperationResult{}, err
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'REPAIR_DRAFT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	resultPayload := operation.Payload
	if operation.OperationType == "DELETE" {
		resultPayload = json.RawMessage(`{"id":"` + operation.EntityID + `","is_deleted":true}`)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, resultPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'REPAIR_DRAFT',$4::uuid,$5,$6::uuid,$7,$8::jsonb)`, claims.MerchantID, payload.ShopID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, resultPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: resultPayload}, nil
}

func validateRepairDiagnosticPayload(payload repairDiagnosticSyncPayload, expectedShopID string) error {
	if payload.ShopID != expectedShopID || strings.TrimSpace(payload.RepairOrderID) == "" || strings.TrimSpace(payload.Diagnosis) == "" {
		return errors.New("diagnostic requires matching shop, repair order, and text")
	}
	return nil
}

func validateRepairChildScope(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, shopID, repairOrderID string, workItemID *string) error {
	if strings.TrimSpace(shopID) == "" || strings.TrimSpace(repairOrderID) == "" {
		return errors.New("repair child requires a shop and repair order")
	}
	var actualShopID string
	if err := tx.QueryRow(ctx, `SELECT so.shop_id::text FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid AND ro.status <> 'REFUNDED'`, claims.MerchantID, repairOrderID).Scan(&actualShopID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("repair order does not exist or is no longer active")
		}
		return err
	}
	if actualShopID != shopID {
		return errors.New("repair child shop does not match the repair order")
	}
	if workItemID != nil && strings.TrimSpace(*workItemID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*workItemID)); err != nil {
			return errors.New("repair child work item id is invalid")
		}
		var belongs bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid AND wi.id=$3::uuid)`, claims.MerchantID, repairOrderID, strings.TrimSpace(*workItemID)).Scan(&belongs); err != nil {
			return err
		}
		if !belongs {
			return errors.New("repair child work item does not belong to the repair order")
		}
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return err
		}
		if assignedShop != nil && *assignedShop != shopID {
			return errors.New("active staff membership is assigned to another shop")
		}
	}
	return nil
}

func (r *Repository) applyRepairDiagnosticOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only append-only repair diagnostic creation is synchronized.")
	}
	var payload repairDiagnosticSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || validateRepairDiagnosticPayload(payload, *operation.ShopID) != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair diagnostic payload is invalid.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, payload.WorkItemID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var existingDiagnostic bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_diagnostics WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&existingDiagnostic); err != nil {
		return dto.OperationResult{}, err
	}
	if existingDiagnostic {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The diagnostic identifier is already in use.")
	}
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_diagnostics(id,merchant_id,repair_order_id,work_item_id,performed_by_membership_id,diagnosis,estimated_cost) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,NULLIF($5,'')::uuid,$6,$7)`, operation.EntityID, claims.MerchantID, payload.RepairOrderID, nullableSyncStringValuePtr(payload.WorkItemID), claims.MembershipID, strings.TrimSpace(payload.Diagnosis), payload.EstimatedCost); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'REPAIR_DIAGNOSTIC',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now()`, claims.MerchantID, operation.EntityID); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=1 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, operation.Payload); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'REPAIR_DIAGNOSTIC',$4::uuid,1,$5::uuid,'CREATE',$6::jsonb)`, claims.MerchantID, payload.ShopID, sequence, operation.EntityID, serverID, operation.Payload); err != nil {
		return dto.OperationResult{}, err
	}
	version := int64(1)
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &version, ServerPayload: operation.Payload}, nil
}

func insertPendingRepairChildOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (string, int64, error) {
	var serverID string
	var sequence int64
	err := tx.QueryRow(ctx, `INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb) RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload).Scan(&serverID, &sequence)
	return serverID, sequence, err
}

func completeRepairChildOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, operation dto.Operation, serverID string, sequence int64, resultPayload json.RawMessage) (dto.OperationResult, error) {
	version := int64(1)
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,$2,$3::uuid,$4,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=GREATEST(sync_entity_versions.version,EXCLUDED.version),updated_at=now()`, claims.MerchantID, operation.EntityType, operation.EntityID, version); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, serverID, resultPayload, version); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid,$6,$7::uuid,$8,$9::jsonb)`, claims.MerchantID, operation.ShopID, sequence, operation.EntityType, operation.EntityID, version, serverID, operation.OperationType, resultPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &version, ServerPayload: resultPayload}, nil
}

func (r *Repository) applyRepairImageOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only repair image creation is synchronized.")
	}
	var payload repairImageSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ShopID != *operation.ShopID || strings.TrimSpace(payload.Filename) == "" || strings.TrimSpace(payload.ContentType) == "" || strings.TrimSpace(payload.DataBase64) == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair image payload is invalid.")
	}
	data, err := base64.StdEncoding.DecodeString(payload.DataBase64)
	if err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair image data must be valid base64.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, payload.WorkItemID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_order_images WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&exists); err != nil {
		return dto.OperationResult{}, err
	}
	if exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair image identifier is already in use.")
	}
	serverID, sequence, err := insertPendingRepairChildOperation(ctx, tx, claims, deviceID, sessionID, operation)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_order_images(id,merchant_id,repair_order_id,work_item_id,filename,content_type,image_data) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5,$6,$7)`, operation.EntityID, claims.MerchantID, payload.RepairOrderID, nullableSyncStringValuePtr(payload.WorkItemID), strings.TrimSpace(payload.Filename), strings.TrimSpace(payload.ContentType), data); err != nil {
		return dto.OperationResult{}, err
	}
	return completeRepairChildOperation(ctx, tx, claims, operation, serverID, sequence, operation.Payload)
}

func (r *Repository) applyRepairApprovalOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only repair approval creation is synchronized.")
	}
	var payload repairApprovalSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ShopID != *operation.ShopID || payload.ApprovalVersion <= 0 || strings.TrimSpace(payload.Status) == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair approval payload is invalid.")
	}
	payload.Status = strings.ToUpper(strings.TrimSpace(payload.Status))
	if payload.Status != "PENDING" && payload.Status != "APPROVED" && payload.Status != "REJECTED" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair approval status is invalid.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, payload.WorkItemID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_approvals WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&exists); err != nil {
		return dto.OperationResult{}, err
	}
	if exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair approval identifier is already in use.")
	}
	serverID, sequence, err := insertPendingRepairChildOperation(ctx, tx, claims, deviceID, sessionID, operation)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_approvals(id,merchant_id,repair_order_id,work_item_id,approval_version,status,approved_amount,approved_at) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5,$6,$7,$8)`, operation.EntityID, claims.MerchantID, payload.RepairOrderID, nullableSyncStringValuePtr(payload.WorkItemID), payload.ApprovalVersion, payload.Status, payload.ApprovedAmount, payload.ApprovedAt); err != nil {
		return dto.OperationResult{}, err
	}
	return completeRepairChildOperation(ctx, tx, claims, operation, serverID, sequence, operation.Payload)
}

func (r *Repository) applyRepairWarrantyOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only repair warranty creation is synchronized.")
	}
	var payload repairWarrantySyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ShopID != *operation.ShopID || payload.StartsAt.IsZero() || payload.EndsAt.IsZero() || !payload.EndsAt.After(payload.StartsAt) {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair warranty payload is invalid.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, payload.WorkItemID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_warranties WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&exists); err != nil {
		return dto.OperationResult{}, err
	}
	if exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair warranty identifier is already in use.")
	}
	serverID, sequence, err := insertPendingRepairChildOperation(ctx, tx, claims, deviceID, sessionID, operation)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_warranties(id,merchant_id,repair_order_id,work_item_id,starts_at,ends_at,terms) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5,$6,$7)`, operation.EntityID, claims.MerchantID, payload.RepairOrderID, nullableSyncStringValuePtr(payload.WorkItemID), payload.StartsAt.UTC(), payload.EndsAt.UTC(), payload.Terms); err != nil {
		return dto.OperationResult{}, err
	}
	return completeRepairChildOperation(ctx, tx, claims, operation, serverID, sequence, operation.Payload)
}

func (r *Repository) applyRepairPartOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only repair part creation is synchronized.")
	}
	var payload repairPartSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ShopID != *operation.ShopID || strings.TrimSpace(payload.Quantity) == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair part payload is invalid.")
	}
	if (payload.VariantID == nil) == (payload.CustomerSuppliedPartID == nil) {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "A repair part must identify exactly one source.")
	}
	quantity, err := strconv.ParseFloat(strings.TrimSpace(payload.Quantity), 64)
	if err != nil || quantity <= 0 || math.IsNaN(quantity) || math.IsInf(quantity, 0) {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair part quantity must be positive.")
	}
	status := strings.ToUpper(strings.TrimSpace(payload.Status))
	if status == "" {
		status = "REQUESTED"
	}
	switch status {
	case "REQUESTED", "ORDERED", "USED", "RETURNED", "CANCELLED":
	default:
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair part status is invalid.")
	}
	if payload.PromotionID != nil && strings.TrimSpace(*payload.PromotionID) != "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ONLINE_REQUIRED", "Repair part promotions must be applied online so redemption remains authoritative.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, payload.WorkItemID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_order_parts WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&exists); err != nil {
		return dto.OperationResult{}, err
	}
	if exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair part identifier is already in use.")
	}

	actualUnitPrice := strings.TrimSpace(payload.UnitPrice)
	var orderID, locationID, orderStatus, description, unitID, priceText string
	var stockTracked bool
	if payload.VariantID != nil {
		if _, err := uuid.Parse(strings.TrimSpace(*payload.VariantID)); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair part variant id is invalid.")
		}
		err := tx.QueryRow(ctx, `SELECT so.order_id,o.fulfillment_location_id,o.status,p.name||' · '||pv.name,pv.base_unit_id,pv.is_stock_tracked,COALESCE((SELECT pp.amount FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now()) ORDER BY pp.valid_from DESC LIMIT 1),0)::text FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id JOIN product_variants pv ON pv.merchant_id=ro.merchant_id AND pv.id=$3::uuid JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid FOR UPDATE OF o`, claims.MerchantID, payload.RepairOrderID, *payload.VariantID).Scan(&orderID, &locationID, &orderStatus, &description, &unitID, &stockTracked, &priceText)
		if err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The repair, stock location, or product price is unavailable.")
		}
		actualUnitPrice = priceText
	} else {
		if _, err := uuid.Parse(strings.TrimSpace(*payload.CustomerSuppliedPartID)); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Customer supplied part id is invalid.")
		}
		if actualUnitPrice == "" {
			actualUnitPrice = "0"
		}
	}
	unitPrice, err := strconv.ParseFloat(actualUnitPrice, 64)
	if err != nil || unitPrice < 0 || math.IsNaN(unitPrice) || math.IsInf(unitPrice, 0) {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair part price is invalid.")
	}
	if payload.VariantID != nil && status == "USED" && unitPrice <= 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "The catalog part has no usable authoritative price.")
	}
	actualUnitPrice = fmt.Sprintf("%.2f", unitPrice)
	serverID, sequence, err := insertPendingRepairChildOperation(ctx, tx, claims, deviceID, sessionID, operation)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_order_parts(id,merchant_id,repair_order_id,work_item_id,variant_id,customer_supplied_part_id,quantity,unit_price,status) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,$5::uuid,$6::uuid,$7,$8,$9)`, operation.EntityID, claims.MerchantID, payload.RepairOrderID, nullableSyncStringValuePtr(payload.WorkItemID), nullableSyncStringValuePtr(payload.VariantID), nullableSyncStringValuePtr(payload.CustomerSuppliedPartID), payload.Quantity, actualUnitPrice, status); err != nil {
		return dto.OperationResult{}, err
	}
	if payload.VariantID != nil && status == "USED" {
		gross := math.Round(quantity*unitPrice*100) / 100
		var includeTax bool
		var taxRate float64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0) FROM orders o JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id LEFT JOIN payment_settings ps ON ps.merchant_id=l.merchant_id AND ps.shop_id=l.shop_id WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, claims.MerchantID, orderID).Scan(&includeTax, &taxRate); err != nil {
			return dto.OperationResult{}, err
		}
		partTax := 0.0
		if includeTax {
			partTax = math.Round(gross*taxRate/100*100) / 100
		}
		var lineNumber int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(line_number),0)+1 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2`, claims.MerchantID, orderID).Scan(&lineNumber); err != nil {
			return dto.OperationResult{}, err
		}
		var lineID string
		if err := tx.QueryRow(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,variant_id,unit_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,$7,$8,0,$9,$10) RETURNING id`, claims.MerchantID, orderID, lineNumber, *payload.VariantID, unitID, description, payload.Quantity, actualUnitPrice, partTax, gross+partTax).Scan(&lineID); err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET subtotal=subtotal+$3, tax_total=tax_total+$4, grand_total=grand_total+$3+$4, updated_at=now() WHERE merchant_id=$1::uuid AND id=$2`, claims.MerchantID, orderID, gross, partTax); err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE repair_orders ro SET total_cost=o.grand_total,tax_amount=o.tax_total FROM service_orders so JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2 AND so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id`, claims.MerchantID, payload.RepairOrderID); err != nil {
			return dto.OperationResult{}, err
		}
		if stockTracked {
			if err := advanceCanonicalOrderStatus(ctx, tx, claims.MerchantID, orderID, "CONFIRMED"); err != nil {
				return dto.OperationResult{}, err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,entered_quantity,order_line_id,event_key) VALUES($1::uuid,$2::uuid,'SALE',$3::uuid,$4,$5::uuid,$4,$6::uuid,$7)`, claims.MerchantID, *payload.VariantID, locationID, payload.Quantity, unitID, lineID, "repair-part:"+operation.EntityID); err != nil {
				return dto.OperationResult{}, err
			}
		}
	}
	var repairTotal string
	if err := tx.QueryRow(ctx, `SELECT total_cost::text FROM repair_orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, payload.RepairOrderID).Scan(&repairTotal); err != nil {
		return dto.OperationResult{}, err
	}
	resultPayload, err := json.Marshal(map[string]any{
		"id": operation.EntityID, "shop_id": payload.ShopID, "repair_order_id": payload.RepairOrderID,
		"work_item_id": payload.WorkItemID, "variant_id": payload.VariantID, "customer_supplied_part_id": payload.CustomerSuppliedPartID,
		"quantity": payload.Quantity, "unit_price": actualUnitPrice, "status": status, "repair_total": repairTotal,
	})
	if err != nil {
		return dto.OperationResult{}, err
	}
	return completeRepairChildOperation(ctx, tx, claims, operation, serverID, sequence, resultPayload)
}

func (r *Repository) applyRepairPaymentOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.OperationType != "CREATE" || operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "UNSUPPORTED_OPERATION", "Only repair cash payment creation is synchronized.")
	}
	var payload repairPaymentSyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ShopID != *operation.ShopID || strings.TrimSpace(payload.RepairOrderID) == "" || strings.TrimSpace(payload.Kind) == "" || strings.TrimSpace(payload.Method) == "" || strings.TrimSpace(payload.Amount) == "" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair payment payload is invalid.")
	}
	payload.Kind = strings.ToUpper(strings.TrimSpace(payload.Kind))
	payload.Method = strings.TrimSpace(payload.Method)
	if payload.Kind != "DEPOSIT" && payload.Kind != "FINAL" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair payment kind is invalid.")
	}
	var paymentTypeName, paymentCategory string
	if strings.TrimSpace(payload.PaymentTypeID) != "" {
		if err := tx.QueryRow(ctx, `SELECT name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, payload.PaymentTypeID).Scan(&paymentTypeName, &paymentCategory); err != nil {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "VALIDATION_ERROR", "The selected payment type is not available for this merchant.")
		}
	} else if strings.EqualFold(payload.Method, "CASH") {
		if err := tx.QueryRow(ctx, `SELECT id,name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND category_code='CASH' AND is_active ORDER BY CASE WHEN name='Cash' THEN 0 ELSE 1 END,created_at LIMIT 1`, claims.MerchantID).Scan(&payload.PaymentTypeID, &paymentTypeName, &paymentCategory); err != nil {
			return dto.OperationResult{}, err
		}
	}
	if paymentCategory != "CASH" {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ONLINE_REQUIRED", "Offline repair synchronization accepts cash payments only; external payment methods require online authorization.")
	}
	amount, err := strconv.ParseFloat(strings.TrimSpace(payload.Amount), 64)
	if err != nil || amount <= 0 || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Repair payment amount must be positive.")
	}
	if err := validateRepairChildScope(ctx, tx, claims, payload.ShopID, payload.RepairOrderID, nil); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", err.Error())
	}
	var existing bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid)`, claims.MerchantID, operation.EntityID).Scan(&existing); err != nil {
		return dto.OperationResult{}, err
	}
	if existing {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The repair payment identifier is already in use.")
	}
	var totalCost, paid, serviceOrderID, orderIDCanonical string
	if err := tx.QueryRow(ctx, `SELECT ro.total_cost::text,COALESCE((SELECT SUM(p.amount) FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id WHERE a.merchant_id=ro.merchant_id AND a.repair_order_id=ro.id AND p.status='CAPTURED'),0)::text,ro.service_order_id,so.order_id FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid FOR UPDATE`, claims.MerchantID, payload.RepairOrderID).Scan(&totalCost, &paid, &serviceOrderID, &orderIDCanonical); err != nil {
		return dto.OperationResult{}, err
	}
	totalValue, _ := strconv.ParseFloat(totalCost, 64)
	paidValue, _ := strconv.ParseFloat(paid, 64)
	if amount+paidValue > totalValue+0.005 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Payment exceeds the remaining repair balance.")
	}
	if payload.Kind == "FINAL" && math.Abs(amount-(totalValue-paidValue)) > 0.005 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "The final payment must equal the outstanding repair balance.")
	}
	serverID, sequence, err := insertPendingRepairChildOperation(ctx, tx, claims, deviceID, sessionID, operation)
	if err != nil {
		return dto.OperationResult{}, err
	}
	amountText := fmt.Sprintf("%.2f", amount)
	if _, err := tx.Exec(ctx, `INSERT INTO payments(id,merchant_id,order_id,payment_type_id,method,status,amount,idempotency_key,captured_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'CAPTURED',$6,$7,now())`, operation.EntityID, claims.MerchantID, orderIDCanonical, payload.PaymentTypeID, paymentTypeName, amountText, "sync-repair-payment:"+operation.EntityID); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO repair_payment_allocations(merchant_id,repair_order_id,payment_id,payment_kind) VALUES($1::uuid,$2::uuid,$3::uuid,$4)`, claims.MerchantID, payload.RepairOrderID, operation.EntityID, payload.Kind); err != nil {
		return dto.OperationResult{}, err
	}
	if len(payload.Allocations) == 0 {
		var onlyWorkItem string
		if err := tx.QueryRow(ctx, `SELECT CASE WHEN COUNT(*)=1 THEN MIN(wi.id)::text ELSE '' END FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, claims.MerchantID, payload.RepairOrderID).Scan(&onlyWorkItem); err != nil {
			return dto.OperationResult{}, err
		}
		if onlyWorkItem == "" {
			_, _ = tx.Exec(ctx, `DELETE FROM repair_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "PAYMENT_ALLOCATION_REQUIRED", "Multi-device repair payments require work-item allocations.")
		}
		payload.Allocations = append(payload.Allocations, struct {
			WorkItemID string `json:"work_item_id"`
			Amount     string `json:"amount"`
		}{WorkItemID: onlyWorkItem, Amount: amountText})
	}
	allocated := 0.0
	seenAllocations := map[string]bool{}
	for _, allocation := range payload.Allocations {
		allocationAmount, parseErr := strconv.ParseFloat(allocation.Amount, 64)
		workItemID := strings.TrimSpace(allocation.WorkItemID)
		allocationAmount = math.Round(allocationAmount*100) / 100
		if parseErr != nil || math.IsNaN(allocationAmount) || math.IsInf(allocationAmount, 0) || allocationAmount <= 0 || seenAllocations[workItemID] {
			_, _ = tx.Exec(ctx, `DELETE FROM service_work_item_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM repair_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYMENT_ALLOCATION", "A payment allocation is invalid or references another ticket.")
		}
		var allocationBalance float64
		balanceErr := tx.QueryRow(ctx, `SELECT GREATEST(
			gross.subtotal
			- ROUND(CASE WHEN COALESCE(canonical.subtotal,0)>0 THEN COALESCE(canonical.discount_total,0)*gross.subtotal/canonical.subtotal ELSE 0 END,2)
			+ ROUND(CASE WHEN COALESCE(canonical.subtotal,0)>0 THEN COALESCE(canonical.tax_total,0)*gross.subtotal/canonical.subtotal ELSE 0 END,2)
			- COALESCE((SELECT SUM(existing.amount * GREATEST(payment.amount-COALESCE((SELECT SUM(refund.amount) FROM refunds refund WHERE refund.merchant_id=payment.merchant_id AND refund.payment_id=payment.id AND refund.status='SUCCEEDED'),0),0)/NULLIF(payment.amount,0)) FROM service_work_item_payment_allocations existing JOIN payments payment ON payment.merchant_id=existing.merchant_id AND payment.id=existing.payment_id WHERE existing.merchant_id=wi.merchant_id AND existing.work_item_id=wi.id AND payment.status='CAPTURED'),0),0)::float8
			FROM repair_orders ro
			JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id
			JOIN repair_work_item_devices device ON device.merchant_id=wi.merchant_id AND device.work_item_id=wi.id
			JOIN service_orders service_order ON service_order.merchant_id=wi.merchant_id AND service_order.id=wi.service_order_id
			JOIN orders canonical ON canonical.merchant_id=service_order.merchant_id AND canonical.id=service_order.order_id
			JOIN LATERAL (SELECT device.additional_fee+COALESCE((SELECT SUM(item.quantity*item.unit_price) FROM service_order_items item WHERE item.merchant_id=wi.merchant_id AND item.work_item_id=wi.id AND item.status<>'CANCELLED'),0) subtotal) gross ON TRUE
			WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid AND wi.id=$3::uuid`, claims.MerchantID, payload.RepairOrderID, workItemID).Scan(&allocationBalance)
		if balanceErr != nil && !errors.Is(balanceErr, pgx.ErrNoRows) {
			return dto.OperationResult{}, balanceErr
		}
		if errors.Is(balanceErr, pgx.ErrNoRows) || allocationAmount-allocationBalance > 0.021 {
			_, _ = tx.Exec(ctx, `DELETE FROM service_work_item_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM repair_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYMENT_ALLOCATION", "A payment allocation is invalid, exceeds the work-item balance, or references another ticket.")
		}
		seenAllocations[workItemID] = true
		allocated += allocationAmount
		if _, err := tx.Exec(ctx, `INSERT INTO service_work_item_payment_allocations(merchant_id,payment_id,work_item_id,amount) VALUES($1::uuid,$2::uuid,$3::uuid,$4)`, claims.MerchantID, operation.EntityID, workItemID, fmt.Sprintf("%.2f", allocationAmount)); err != nil {
			return dto.OperationResult{}, err
		}
	}
	if math.Abs(allocated-amount) > 0.005 {
		_, _ = tx.Exec(ctx, `DELETE FROM service_work_item_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM repair_payment_allocations WHERE merchant_id=$1::uuid AND payment_id=$2::uuid; DELETE FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID)
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYMENT_ALLOCATION", "Work-item allocations must equal the payment amount.")
	}
	newPaid := paidValue + amount
	newStatus := "UNPAID"
	if newPaid > 0 {
		newStatus = "DEPOSIT_PAID"
	}
	if newPaid+0.005 >= totalValue && totalValue > 0 {
		newStatus = "PAID"
	}
	if _, err := tx.Exec(ctx, `UPDATE repair_orders SET deposit_paid=$3,payment_status=$4,status=CASE WHEN $5='PAID' THEN 'COMPLETED' ELSE status END,completed_at=CASE WHEN $5='PAID' THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, payload.RepairOrderID, fmt.Sprintf("%.2f", newPaid), newStatus, newStatus); err != nil {
		return dto.OperationResult{}, err
	}
	canonicalTarget := "PENDING_PAYMENT"
	if newStatus == "PAID" {
		canonicalTarget = "FULFILLED"
	}
	if err := advanceCanonicalOrderStatus(ctx, tx, claims.MerchantID, orderIDCanonical, canonicalTarget); err != nil {
		return dto.OperationResult{}, err
	}
	if newStatus == "PAID" {
		if _, err := tx.Exec(ctx, `UPDATE service_orders SET status='COMPLETED',completed_at=COALESCE(completed_at,now()) WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serviceOrderID); err != nil {
			return dto.OperationResult{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,entered_quantity,order_line_id,event_key)
			SELECT ol.merchant_id,ol.variant_id,'SALE',o.fulfillment_location_id,convert_unit_quantity(ol.merchant_id,ol.quantity,ol.unit_id,pv.base_unit_id),ol.unit_id,ol.quantity,ol.id,'repair-order-line:'||ol.id
			FROM order_lines ol JOIN orders o ON o.merchant_id=ol.merchant_id AND o.id=ol.order_id JOIN product_variants pv ON pv.merchant_id=ol.merchant_id AND pv.id=ol.variant_id
			WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid AND pv.is_stock_tracked AND o.status='FULFILLED' AND NOT EXISTS (SELECT 1 FROM inventory_movements im WHERE im.merchant_id=ol.merchant_id AND im.order_line_id=ol.id AND im.movement_type='SALE')`, claims.MerchantID, orderIDCanonical); err != nil {
			return dto.OperationResult{}, err
		}
	}
	resultPayload, err := json.Marshal(map[string]any{
		"id": operation.EntityID, "shop_id": payload.ShopID, "repair_order_id": payload.RepairOrderID,
		"kind": payload.Kind, "method": payload.Method, "status": "CAPTURED", "amount": amountText,
		"allocations":    payload.Allocations,
		"payment_status": newStatus, "deposit_paid": fmt.Sprintf("%.2f", newPaid),
		"parent_status": func() string {
			if newStatus == "PAID" {
				return "COMPLETED"
			}
			return ""
		}(),
	})
	if err != nil {
		return dto.OperationResult{}, err
	}
	return completeRepairChildOperation(ctx, tx, claims, operation, serverID, sequence, resultPayload)
}

func loadCatalogProduct(ctx context.Context, tx pgx.Tx, merchantID, productID string) (json.RawMessage, int64, error) {
	var payload []byte
	var version int64
	err := tx.QueryRow(ctx, `SELECT json_build_object('id',p.id::text,'name',p.name,'description',p.description,'product_type',p.product_type,'manufacture_date',p.manufacture_date,'expired_date',p.expired_date,'is_active',p.is_active,'category_ids',COALESCE((SELECT json_agg(pc.category_id::text ORDER BY pc.category_id) FROM catalog_product_categories pc WHERE pc.merchant_id=p.merchant_id AND pc.product_id=p.id),'[]'::json)), COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=p.merchant_id AND entity_type='CATALOG_PRODUCT' AND entity_id=p.id),0) FROM products p WHERE p.merchant_id=$1::uuid AND p.id=$2::uuid`, merchantID, productID).Scan(&payload, &version)
	return json.RawMessage(payload), version, err
}

func (r *Repository) applyDeliveryOperation(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation) (dto.OperationResult, error) {
	if operation.ShopID == nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_SCOPE_MISMATCH", "A delivery operation must identify its shop.")
	}
	var payload deliverySyncPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "Delivery payload must be a JSON object.")
	}
	if payload.ShopID == "" && operation.ShopID != nil {
		payload.ShopID = *operation.ShopID
	}
	if err := validateDeliveryPayload(payload, *operation.ShopID); err != nil {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "INVALID_PAYLOAD", "A delivery needs a matching shop, name, and contact info.")
	}
	if operation.OperationType == "UPDATE" {
		var merchant bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM membership_roles mr JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id WHERE mr.merchant_id=$1::uuid AND mr.membership_id=$2::uuid AND lower(r.code)=ANY($3::text[]))`, claims.MerchantID, claims.MembershipID, []string{"owner", "merchant"}).Scan(&merchant); err != nil {
			return dto.OperationResult{}, err
		}
		if !merchant {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "FORBIDDEN", "Merchant owner access is required to edit delivery options.")
		}
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return dto.OperationResult{}, err
		}
		if assignedShop != nil && *assignedShop != payload.ShopID {
			return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "SHOP_FORBIDDEN", "The active staff membership is assigned to another shop.")
		}
	}

	_, currentVersion, loadErr := loadDelivery(ctx, tx, claims.MerchantID, operation.EntityID)
	exists := loadErr == nil
	if loadErr != nil && !errors.Is(loadErr, pgx.ErrNoRows) {
		return dto.OperationResult{}, loadErr
	}
	if operation.OperationType == "CREATE" && exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "ALREADY_EXISTS", "The delivery identifier is already in use.")
	}
	if operation.OperationType != "CREATE" && !exists {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "NOT_FOUND", "The delivery option does not exist.")
	}
	if operation.OperationType != "CREATE" && operation.BaseVersion == nil && currentVersion > 0 || operation.OperationType != "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != currentVersion {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "VERSION_CONFLICT", "The delivery option changed on the server and must be refreshed.")
	}
	if operation.OperationType == "CREATE" && operation.BaseVersion != nil && *operation.BaseVersion != 0 {
		return insertRejected(ctx, tx, claims, deviceID, sessionID, operation, "VERSION_CONFLICT", "A new delivery must start at version zero.")
	}

	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'PENDING',$11::jsonb)
		RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	isActive := true
	if payload.IsActive != nil {
		isActive = *payload.IsActive
	}
	switch operation.OperationType {
	case "CREATE":
		if _, err := tx.Exec(ctx, `INSERT INTO deliveries(id,merchant_id,shop_id,name,contact_info,is_active) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6)`, operation.EntityID, claims.MerchantID, payload.ShopID, strings.TrimSpace(payload.Name), strings.TrimSpace(payload.ContactInfo), isActive); err != nil {
			return dto.OperationResult{}, err
		}
	case "UPDATE":
		if _, err := tx.Exec(ctx, `UPDATE deliveries SET shop_id=$3::uuid,name=$4,contact_info=$5,is_active=$6,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID, payload.ShopID, strings.TrimSpace(payload.Name), strings.TrimSpace(payload.ContactInfo), isActive); err != nil {
			return dto.OperationResult{}, err
		}
	case "DELETE":
		if _, err := tx.Exec(ctx, `UPDATE deliveries SET is_active=FALSE,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operation.EntityID); err != nil {
			return dto.OperationResult{}, err
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at)
		VALUES($1::uuid,'DELIVERY',$2::uuid,$3,now())
		ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, operation.EntityID, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	updatedPayload, _, err := loadDelivery(ctx, tx, claims.MerchantID, operation.EntityID)
	if err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',applied_at=now(),result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, serverID, updatedPayload, newVersion); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'DELIVERY',$4::uuid,$5,$6::uuid,$7,$8::jsonb)`, claims.MerchantID, payload.ShopID, sequence, operation.EntityID, newVersion, serverID, operation.OperationType, updatedPayload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "APPLIED", ServerSequence: &sequence, EntityVersion: &newVersion, ServerPayload: updatedPayload}, nil
}

func validateDeliveryPayload(payload deliverySyncPayload, expectedShopID string) error {
	if payload.ShopID == "" || payload.ShopID != expectedShopID {
		return errors.New("delivery shop scope does not match the operation")
	}
	if strings.TrimSpace(payload.Name) == "" || strings.TrimSpace(payload.ContactInfo) == "" {
		return errors.New("delivery name and contact info are required")
	}
	return nil
}

func insertRejected(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation, code, message string) (dto.OperationResult, error) {
	return insertRejectedWithPayload(ctx, tx, claims, deviceID, sessionID, operation, code, message, nil)
}

func insertRejectedWithPayload(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation, code, message string, serverPayload json.RawMessage) (dto.OperationResult, error) {
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload,result_payload)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'REJECTED',$11::jsonb,$12::jsonb)
		RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload, serverPayload).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_logs(merchant_id,device_id,operation_id,level,message,details) VALUES($1::uuid,$2::uuid,$3::uuid,'WARN',$4,$5::jsonb)`, claims.MerchantID, deviceID, serverID, message, fmt.Sprintf(`{"code":%q}`, code)); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "REJECTED", Code: code, Message: message, ServerSequence: &sequence, ServerPayload: serverPayload}, nil
}

func insertConflict(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, deviceID, sessionID string, operation dto.Operation, currentVersion int64, serverPayload json.RawMessage) (dto.OperationResult, error) {
	var serverID string
	var sequence int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO sync_operations(merchant_id,device_id,session_id,client_operation_id,entity_type,entity_id,operation_type,base_version,payload_hash,dependency_client_operation_id,status,payload,result_payload,result_entity_version)
		VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,'CONFLICT',$11::jsonb,$12::jsonb,$13)
		RETURNING id,server_sequence`, claims.MerchantID, deviceID, sessionID, operation.ClientOperationID, operation.EntityType, operation.EntityID, operation.OperationType, operation.BaseVersion, operation.PayloadHash, nilIfEmpty(operation.DependencyOperationID), operation.Payload, serverPayload, currentVersion).Scan(&serverID, &sequence); err != nil {
		return dto.OperationResult{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_conflicts(merchant_id,operation_id,status,server_payload,client_payload) VALUES($1::uuid,$2::uuid,'OPEN',$3::jsonb,$4::jsonb)`, claims.MerchantID, serverID, serverPayload, operation.Payload); err != nil {
		return dto.OperationResult{}, err
	}
	return dto.OperationResult{ClientOperationID: operation.ClientOperationID, ServerOperationID: serverID, Status: "CONFLICT", Code: "VERSION_CONFLICT", Message: "The server entity changed before this operation could be applied.", ServerSequence: &sequence, EntityVersion: &currentVersion, ServerPayload: serverPayload}, nil
}

func (r *Repository) ResolveConflict(ctx context.Context, claims *authdto.Claims, operationID string, request dto.ResolveConflictRequest) (dto.ConflictResolution, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return dto.ConflictResolution{}, err
	}

	var entityType, entityID, conflictStatus, operationStatus string
	var clientPayload, resultPayload []byte
	var resultVersion *int64
	var serverSequence *int64
	var resolvedStrategy *string
	err = tx.QueryRow(ctx, `
		SELECT o.entity_type,o.entity_id,o.status,o.payload,o.result_payload,o.result_entity_version,o.server_sequence,
		       c.status,c.resolution->>'strategy'
		FROM sync_operations o
		JOIN sync_conflicts c ON c.merchant_id=o.merchant_id AND c.operation_id=o.id
		WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid
		FOR UPDATE OF o,c`, claims.MerchantID, operationID).
		Scan(&entityType, &entityID, &operationStatus, &clientPayload, &resultPayload, &resultVersion, &serverSequence, &conflictStatus, &resolvedStrategy)
	if errors.Is(err, pgx.ErrNoRows) {
		return dto.ConflictResolution{}, app.NewError("SYNC_CONFLICT_NOT_FOUND", "The synchronization conflict does not exist.", 404)
	}
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	if entityType == "CATALOG_PRODUCT" {
		return r.resolveCatalogProductConflict(ctx, tx, claims, operationID, entityID, clientPayload, serverSequence, request)
	}
	if entityType == "REPAIR_DRAFT" {
		return r.resolveRepairDraftConflict(ctx, tx, claims, operationID, entityID, clientPayload, serverSequence, request)
	}
	if conflictStatus != "OPEN" {
		strategy := request.Strategy
		if resolvedStrategy != nil && *resolvedStrategy != "" {
			strategy = *resolvedStrategy
		}
		version := int64(0)
		if resultVersion != nil {
			version = *resultVersion
		}
		return dto.ConflictResolution{OperationID: operationID, Strategy: strategy, Status: conflictStatus, EntityVersion: version, ServerSequence: serverSequence, ServerPayload: resultPayload}, nil
	}
	if entityType != "SHOP_SETTINGS" {
		return dto.ConflictResolution{}, app.NewError("UNSUPPORTED_CONFLICT", "Conflict resolution is not enabled for this entity type.", 409)
	}
	if claims.MembershipID != "" && !claims.PlatformAdmin {
		var assignedShop *string
		if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, claims.MembershipID).Scan(&assignedShop); err != nil {
			return dto.ConflictResolution{}, err
		}
		if assignedShop != nil && *assignedShop != entityID {
			return dto.ConflictResolution{}, app.NewError("FORBIDDEN", "The active staff membership is assigned to another shop.", 403)
		}
	}

	serverPayload, currentVersion, err := loadShopSettings(ctx, tx, claims.MerchantID, entityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return dto.ConflictResolution{}, app.NewError("NOT_FOUND", "The shop does not exist.", 404)
	}
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	if request.Strategy == "KEEP_SERVER" {
		if _, err := tx.Exec(ctx, `
			UPDATE sync_conflicts SET status='IGNORED',resolution=jsonb_build_object('strategy','KEEP_SERVER'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid
			WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
			return dto.ConflictResolution{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, serverPayload, currentVersion); err != nil {
			return dto.ConflictResolution{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return dto.ConflictResolution{}, err
		}
		return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "IGNORED", EntityVersion: currentVersion, ServerSequence: serverSequence, ServerPayload: serverPayload}, nil
	}

	var settings shopSettingsPayload
	if err := json.Unmarshal(clientPayload, &settings); err != nil {
		return dto.ConflictResolution{}, app.NewError("INVALID_PAYLOAD", "Shop settings payload must be a JSON object.", 409)
	}
	if err := validateShopSettings(settings); err != nil {
		return dto.ConflictResolution{}, app.NewError("INVALID_PAYLOAD", err.Error(), 409)
	}
	if err := updateShopSettings(ctx, tx, claims.MerchantID, entityID, settings); err != nil {
		return dto.ConflictResolution{}, err
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at)
		VALUES($1::uuid,'SHOP_SETTINGS',$2::uuid,$3,now())
		ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, entityID, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	updatedPayload, _, err := loadShopSettings(ctx, tx, claims.MerchantID, entityID)
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	var sequence int64
	if err := tx.QueryRow(ctx, `SELECT nextval('sync_server_sequence_seq')`).Scan(&sequence); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sync_operations SET status='APPLIED',server_sequence=$3,applied_at=now(),result_payload=$4::jsonb,result_entity_version=$5
		WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, sequence, updatedPayload, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sync_conflicts SET status='RESOLVED',resolution=jsonb_build_object('strategy','APPLY_CLIENT'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid
		WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload)
		VALUES($1::uuid,$3::uuid,$2,'SHOP_SETTINGS',$3::uuid,$4,$5::uuid,'UPDATE',$6::jsonb)`, claims.MerchantID, sequence, entityID, newVersion, operationID, updatedPayload); err != nil {
		return dto.ConflictResolution{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.ConflictResolution{}, err
	}
	return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "RESOLVED", EntityVersion: newVersion, ServerSequence: &sequence, ServerPayload: updatedPayload}, nil
}

func (r *Repository) resolveCatalogProductConflict(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, operationID, entityID string, clientPayload []byte, serverSequence *int64, request dto.ResolveConflictRequest) (dto.ConflictResolution, error) {
	serverPayload, currentVersion, err := loadCatalogProduct(ctx, tx, claims.MerchantID, entityID)
	if errors.Is(err, pgx.ErrNoRows) {
		return dto.ConflictResolution{}, app.NewError("NOT_FOUND", "The product does not exist.", 404)
	}
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	if request.Strategy == "KEEP_SERVER" {
		if _, err := tx.Exec(ctx, `UPDATE sync_conflicts SET status='IGNORED',resolution=jsonb_build_object('strategy','KEEP_SERVER'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
			return dto.ConflictResolution{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, serverPayload, currentVersion); err != nil {
			return dto.ConflictResolution{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return dto.ConflictResolution{}, err
		}
		return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "IGNORED", EntityVersion: currentVersion, ServerSequence: serverSequence, ServerPayload: serverPayload}, nil
	}
	var payload catalogProductSyncPayload
	if err := json.Unmarshal(clientPayload, &payload); err != nil || validateCatalogProductPayload(payload) != nil {
		return dto.ConflictResolution{}, app.NewError("INVALID_PAYLOAD", "Product metadata payload is invalid.", 409)
	}
	if _, err := tx.Exec(ctx, `UPDATE products SET name=$3,description=$4,product_type=$5,is_active=$6,manufacture_date=NULLIF($7::text,'')::date,expired_date=NULLIF($8::text,'')::date,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, entityID, strings.TrimSpace(payload.Name), payload.Description, strings.ToUpper(strings.TrimSpace(payload.ProductType)), payload.IsActive, payload.ManufactureDate, payload.ExpiredDate); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM catalog_product_categories WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, claims.MerchantID, entityID); err != nil {
		return dto.ConflictResolution{}, err
	}
	for _, categoryID := range payload.CategoryIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_product_categories(merchant_id,product_id,category_id) SELECT $1::uuid,$2::uuid,id FROM catalog_categories WHERE merchant_id=$1::uuid AND id=$3::uuid`, claims.MerchantID, entityID, categoryID); err != nil {
			return dto.ConflictResolution{}, err
		}
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_PRODUCT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, entityID, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	updatedPayload, _, err := loadCatalogProduct(ctx, tx, claims.MerchantID, entityID)
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	var sequence int64
	if err := tx.QueryRow(ctx, `SELECT nextval('sync_server_sequence_seq')`).Scan(&sequence); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',server_sequence=$3,applied_at=now(),result_payload=$4::jsonb,result_entity_version=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, sequence, updatedPayload, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_conflicts SET status='RESOLVED',resolution=jsonb_build_object('strategy','APPLY_CLIENT'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2,'CATALOG_PRODUCT',$3::uuid,$4,$5::uuid,'UPDATE',$6::jsonb)`, claims.MerchantID, sequence, entityID, newVersion, operationID, updatedPayload); err != nil {
		return dto.ConflictResolution{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.ConflictResolution{}, err
	}
	return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "RESOLVED", EntityVersion: newVersion, ServerSequence: &sequence, ServerPayload: updatedPayload}, nil
}

func (r *Repository) resolveRepairDraftConflict(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, operationID, entityID string, clientPayload []byte, serverSequence *int64, request dto.ResolveConflictRequest) (dto.ConflictResolution, error) {
	serverPayload, currentVersion, err := loadRepairDraft(ctx, tx, claims.MerchantID, entityID)
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	if request.Strategy == "KEEP_SERVER" {
		if _, err := tx.Exec(ctx, `UPDATE sync_conflicts SET status='IGNORED',resolution=jsonb_build_object('strategy','KEEP_SERVER'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
			return dto.ConflictResolution{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='REJECTED',result_payload=$3::jsonb,result_entity_version=$4 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, serverPayload, currentVersion); err != nil {
			return dto.ConflictResolution{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return dto.ConflictResolution{}, err
		}
		return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "IGNORED", EntityVersion: currentVersion, ServerSequence: serverSequence, ServerPayload: serverPayload}, nil
	}
	var payload repairDraftSyncPayload
	if err := json.Unmarshal(clientPayload, &payload); err != nil || validateRepairDraftPayload(payload, payload.ShopID) != nil {
		return dto.ConflictResolution{}, app.NewError("INVALID_PAYLOAD", "Repair draft payload is invalid.", 409)
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `UPDATE repair_drafts SET shop_id=$3::uuid,payload=$4::jsonb,is_deleted=FALSE,version=$5,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, entityID, payload.ShopID, clientPayload, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'REPAIR_DRAFT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, claims.MerchantID, entityID, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	updatedPayload, _, err := loadRepairDraft(ctx, tx, claims.MerchantID, entityID)
	if err != nil {
		return dto.ConflictResolution{}, err
	}
	var sequence int64
	if err := tx.QueryRow(ctx, `SELECT nextval('sync_server_sequence_seq')`).Scan(&sequence); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_operations SET status='APPLIED',server_sequence=$3,applied_at=now(),result_payload=$4::jsonb,result_entity_version=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, operationID, sequence, updatedPayload, newVersion); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_conflicts SET status='RESOLVED',resolution=jsonb_build_object('strategy','APPLY_CLIENT'),resolved_at=now(),resolved_by_membership_id=NULLIF($3,'')::uuid WHERE merchant_id=$1::uuid AND operation_id=$2::uuid`, claims.MerchantID, operationID, claims.MembershipID); err != nil {
		return dto.ConflictResolution{}, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_id,operation_type,payload) VALUES($1::uuid,$2::uuid,$3,'REPAIR_DRAFT',$4::uuid,$5,$6::uuid,'UPDATE',$7::jsonb)`, claims.MerchantID, payload.ShopID, sequence, entityID, newVersion, operationID, updatedPayload); err != nil {
		return dto.ConflictResolution{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.ConflictResolution{}, err
	}
	return dto.ConflictResolution{OperationID: operationID, Strategy: request.Strategy, Status: "RESOLVED", EntityVersion: newVersion, ServerSequence: &sequence, ServerPayload: updatedPayload}, nil
}

func validateShopSettings(payload shopSettingsPayload) error {
	if payload.Name != nil && strings.TrimSpace(*payload.Name) == "" || payload.Code != nil && strings.TrimSpace(*payload.Code) == "" {
		return errors.New("Shop name and code cannot be empty.")
	}
	if payload.Address != nil && !json.Valid(payload.Address) {
		return errors.New("Address must be valid JSON.")
	}
	if payload.TaxRate != nil {
		value := strings.TrimSpace(*payload.TaxRate)
		if !taxRatePattern.MatchString(value) {
			return errors.New("Tax rate must be a non-negative number with at most four decimal places.")
		}
		rat, ok := new(big.Rat).SetString(value)
		if !ok || rat.Cmp(big.NewRat(100, 1)) > 0 {
			return errors.New("Tax rate must be between 0 and 100.")
		}
	}
	return nil
}

func loadShopSettings(ctx context.Context, tx pgx.Tx, merchantID, shopID string) (json.RawMessage, int64, error) {
	var payload []byte
	if err := tx.QueryRow(ctx, `
		SELECT json_build_object('id',s.id,'merchant_id',s.merchant_id,'name',s.name,'code',s.code,'address',s.address,'timezone',s.timezone,'is_active',s.is_active,'footer_note',s.footer_note,'include_tax',COALESCE(ps.include_tax,FALSE),'tax_rate',COALESCE(ps.tax_rate,0)::text,'tax_label',COALESCE(ps.tax_label,'Tax'),'receipt_note',COALESCE(ps.receipt_note,''))
		FROM shops s LEFT JOIN payment_settings ps ON ps.merchant_id=s.merchant_id AND ps.shop_id=s.id
		WHERE s.merchant_id=$1::uuid AND s.id=$2::uuid
		FOR UPDATE OF s`, merchantID, shopID).Scan(&payload); err != nil {
		return nil, 0, err
	}
	var version int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(version,0) FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='SHOP_SETTINGS' AND entity_id=$2::uuid`, merchantID, shopID).Scan(&version); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, err
	}
	return json.RawMessage(payload), version, nil
}

func updateShopSettings(ctx context.Context, tx pgx.Tx, merchantID, shopID string, payload shopSettingsPayload) error {
	var address any
	if payload.Address != nil {
		address = string(payload.Address)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE shops SET name=COALESCE($3,name),code=COALESCE($4,code),address=COALESCE($5::jsonb,address),timezone=COALESCE($6,timezone),is_active=COALESCE($7,is_active),footer_note=COALESCE($8,footer_note)
		WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, shopID, trimPointer(payload.Name), trimPointer(payload.Code), address, trimPointer(payload.Timezone), payload.IsActive, trimPointer(payload.FooterNote)); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO payment_settings(merchant_id,shop_id,include_tax,tax_rate,tax_label,receipt_note)
		VALUES($1::uuid,$2::uuid,COALESCE($3,FALSE),COALESCE(NULLIF($4,'')::numeric,0),COALESCE(NULLIF($5,''),'Tax'),COALESCE($6,''))
		ON CONFLICT (merchant_id,shop_id) DO UPDATE SET include_tax=COALESCE($3,payment_settings.include_tax),tax_rate=COALESCE(NULLIF($4,'')::numeric,payment_settings.tax_rate),tax_label=COALESCE($5,payment_settings.tax_label),receipt_note=COALESCE($6,payment_settings.receipt_note)`, merchantID, shopID, payload.IncludeTax, trimPointer(payload.TaxRate), trimPointer(payload.TaxLabel), trimPointer(payload.ReceiptNote))
	return err
}

func trimPointer(value *string) any {
	if value == nil {
		return nil
	}
	return strings.TrimSpace(*value)
}

func loadDelivery(ctx context.Context, tx pgx.Tx, merchantID, deliveryID string) (json.RawMessage, int64, error) {
	var payload json.RawMessage
	var version int64
	if err := tx.QueryRow(ctx, `
		SELECT json_build_object('id',d.id,'merchant_id',d.merchant_id,'shop_id',d.shop_id,'name',d.name,'contact_info',d.contact_info,'is_active',d.is_active,'created_at',d.created_at),
		       COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='DELIVERY' AND entity_id=d.id),0)
		FROM deliveries d
		WHERE d.merchant_id=$1::uuid AND d.id=$2::uuid
		FOR UPDATE`, merchantID, deliveryID).Scan(&payload, &version); err != nil {
		return nil, 0, err
	}
	return payload, version, nil
}

func canonicalPayloadHash(payload json.RawMessage) (string, error) {
	var value any
	if err := json.Unmarshal(payload, &value); err != nil {
		return "", err
	}
	canonical, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(canonical)
	return fmt.Sprintf("%x", digest), nil
}

func sameOptionalVersion(left, right *int64) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func nilIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func (r *Repository) Pull(ctx context.Context, claims *authdto.Claims, request dto.PullRequest) (dto.PullResponse, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return dto.PullResponse{}, err
	}
	defer tx.Rollback(ctx)
	if err := setContext(ctx, tx, claims); err != nil {
		return dto.PullResponse{}, err
	}
	deviceID, err := sessionDevice(ctx, tx, claims, request.SessionID)
	if err != nil {
		return dto.PullResponse{}, err
	}
	var current int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(server_sequence),0) FROM sync_changes WHERE merchant_id=$1::uuid`, claims.MerchantID).Scan(&current); err != nil {
		return dto.PullResponse{}, err
	}
	rows, err := tx.Query(ctx, `
		SELECT c.server_sequence,c.entity_type,c.entity_id,c.entity_version,c.operation_type,c.operation_id,c.payload,c.created_at
		FROM sync_changes c LEFT JOIN sync_operations o ON o.merchant_id=c.merchant_id AND o.id=c.operation_id
		WHERE c.merchant_id=$1::uuid AND c.server_sequence>$2 AND c.server_sequence<=$5
		  AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid) IS NULL
		       OR c.shop_id IS NULL
		       OR c.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid))
		ORDER BY c.server_sequence
		LIMIT $3`, claims.MerchantID, request.AfterSequence, request.Limit+1, claims.MembershipID, current)
	if err != nil {
		return dto.PullResponse{}, err
	}
	defer rows.Close()
	changes := make([]dto.Change, 0, request.Limit)
	for rows.Next() {
		var change dto.Change
		if err := rows.Scan(&change.ServerSequence, &change.EntityType, &change.EntityID, &change.EntityVersion, &change.OperationType, &change.OperationID, &change.Payload, &change.CreatedAt); err != nil {
			return dto.PullResponse{}, err
		}
		changes = append(changes, change)
	}
	if err := rows.Err(); err != nil {
		return dto.PullResponse{}, err
	}
	hasMore := len(changes) > request.Limit
	if hasMore {
		changes = changes[:request.Limit]
	}
	next := request.AfterSequence
	if len(changes) > 0 {
		next = changes[len(changes)-1].ServerSequence
	}
	if !hasMore {
		// Advancing across filtered changes is safe once every visible change in
		// the page has been returned; otherwise a shop-assigned device would
		// rescan another shop's sequence range forever.
		next = current
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_checkpoints SET server_sequence=GREATEST(server_sequence,$4),updated_at=now() WHERE merchant_id=$1::uuid AND device_id=$2::uuid AND scope=$3`, claims.MerchantID, deviceID, request.Scope, next); err != nil {
		return dto.PullResponse{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_sessions SET last_server_sequence=GREATEST(COALESCE(last_server_sequence,0),$3) WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, request.SessionID, next); err != nil {
		return dto.PullResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return dto.PullResponse{}, err
	}
	return dto.PullResponse{Scope: request.Scope, Changes: changes, NextSequence: next, CurrentSequence: current, HasMore: hasMore}, nil
}

func setContext(ctx context.Context, tx pgx.Tx, claims *authdto.Claims) error {
	_, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1::text,true),set_config('app.merchant_id',$2::text,true)`, claims.IdentityID, claims.MerchantID)
	return err
}

func sessionDevice(ctx context.Context, tx pgx.Tx, claims *authdto.Claims, sessionID string) (string, error) {
	var deviceID string
	err := tx.QueryRow(ctx, `
		SELECT d.id
		FROM sync_sessions s JOIN sync_devices d ON d.merchant_id=s.merchant_id AND d.id=s.device_id
		WHERE s.merchant_id=$1::uuid AND s.id=$2::uuid AND s.status='OPEN' AND d.is_active
		  AND ($3::boolean OR d.membership_id=NULLIF($4,'')::uuid)
		FOR UPDATE OF s`, claims.MerchantID, sessionID, claims.PlatformAdmin, claims.MembershipID).Scan(&deviceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", app.NewError("SYNC_SESSION_NOT_FOUND", "The synchronization session is not active for this account.", 404)
	}
	return deviceID, err
}
