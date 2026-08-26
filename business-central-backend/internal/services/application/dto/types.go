package dto

import (
	"encoding/json"
	"time"
)

type ServiceCategory struct {
	ID         string  `json:"id"`
	MerchantID string  `json:"merchant_id"`
	Name       string  `json:"name"`
	ParentID   *string `json:"parent_id,omitempty"`
}

type ServiceCategoryRequest struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id,omitempty"`
}

type ServiceDefinition struct {
	ID              string  `json:"id"`
	MerchantID      string  `json:"merchant_id"`
	CategoryID      *string `json:"category_id,omitempty"`
	Code            string  `json:"code"`
	Name            string  `json:"name"`
	Description     *string `json:"description,omitempty"`
	DurationMinutes *int    `json:"duration_minutes,omitempty"`
	IsActive        bool    `json:"is_active"`
	LaborFee        string  `json:"labor_fee"`
}

type ServiceDefinitionRequest struct {
	CategoryID      *string `json:"category_id,omitempty"`
	Code            string  `json:"code"`
	Name            string  `json:"name"`
	Description     *string `json:"description,omitempty"`
	DurationMinutes *int    `json:"duration_minutes,omitempty"`
	IsActive        *bool   `json:"is_active,omitempty"`
	LaborFee        string  `json:"labor_fee,omitempty"`
}

type ServicePrice struct {
	MerchantID  string     `json:"merchant_id"`
	ServiceID   string     `json:"service_id"`
	PriceListID *string    `json:"price_list_id,omitempty"`
	Amount      string     `json:"amount"`
	ValidFrom   time.Time  `json:"valid_from"`
	ValidUntil  *time.Time `json:"valid_until,omitempty"`
}

type ServicePriceRequest struct {
	ServiceID   string     `json:"service_id"`
	PriceListID *string    `json:"price_list_id,omitempty"`
	Amount      string     `json:"amount"`
	ValidFrom   *time.Time `json:"valid_from,omitempty"`
	ValidUntil  *time.Time `json:"valid_until,omitempty"`
}

type ServiceOrder struct {
	ID          string     `json:"id"`
	MerchantID  string     `json:"merchant_id"`
	CustomerID  *string    `json:"customer_id,omitempty"`
	PatientID   *string    `json:"patient_id,omitempty"`
	ShopID      *string    `json:"shop_id,omitempty"`
	OrderID     *string    `json:"order_id,omitempty"`
	OrderNumber string     `json:"order_number"`
	ServiceType string     `json:"service_type"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	OpenedAt    time.Time  `json:"opened_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type ServiceOrderRequest struct {
	CustomerID  *string `json:"customer_id,omitempty"`
	PatientID   *string `json:"patient_id,omitempty"`
	ShopID      *string `json:"shop_id,omitempty"`
	OrderID     *string `json:"order_id,omitempty"`
	OrderNumber string  `json:"order_number"`
	ServiceType string  `json:"service_type"`
	Status      string  `json:"status,omitempty"`
	Priority    string  `json:"priority,omitempty"`
}

type ServiceOrderItem struct {
	ID             string  `json:"id"`
	MerchantID     string  `json:"merchant_id"`
	ServiceOrderID string  `json:"service_order_id"`
	WorkItemID     *string `json:"work_item_id,omitempty"`
	ServiceID      *string `json:"service_id,omitempty"`
	VariantID      *string `json:"variant_id,omitempty"`
	Description    string  `json:"description"`
	Quantity       string  `json:"quantity"`
	UnitPrice      string  `json:"unit_price"`
	Status         string  `json:"status"`
}

type ServiceOrderItemRequest struct {
	ServiceOrderID string  `json:"service_order_id,omitempty"`
	WorkItemID     *string `json:"work_item_id,omitempty"`
	ServiceID      *string `json:"service_id,omitempty"`
	VariantID      *string `json:"variant_id,omitempty"`
	Description    string  `json:"description"`
	Quantity       string  `json:"quantity"`
	UnitPrice      string  `json:"unit_price"`
	Status         string  `json:"status,omitempty"`
}

type ServiceAppointment struct {
	ID                   string    `json:"id"`
	MerchantID           string    `json:"merchant_id"`
	ServiceOrderID       string    `json:"service_order_id"`
	ShopID               *string   `json:"shop_id,omitempty"`
	AssignedMembershipID *string   `json:"assigned_membership_id,omitempty"`
	StartsAt             time.Time `json:"starts_at"`
	EndsAt               time.Time `json:"ends_at"`
	Status               string    `json:"status"`
}

type ServiceAppointmentRequest struct {
	ServiceOrderID       string    `json:"service_order_id"`
	ShopID               *string   `json:"shop_id,omitempty"`
	AssignedMembershipID *string   `json:"assigned_membership_id,omitempty"`
	StartsAt             time.Time `json:"starts_at"`
	EndsAt               time.Time `json:"ends_at"`
	Status               string    `json:"status,omitempty"`
}

type ServiceNote struct {
	ID                 string    `json:"id"`
	MerchantID         string    `json:"merchant_id"`
	ServiceOrderID     string    `json:"service_order_id"`
	AuthorMembershipID *string   `json:"author_membership_id,omitempty"`
	Note               string    `json:"note"`
	CreatedAt          time.Time `json:"created_at"`
}

type ServiceNoteRequest struct {
	ServiceOrderID     string  `json:"service_order_id"`
	AuthorMembershipID *string `json:"author_membership_id,omitempty"`
	Note               string  `json:"note"`
}

type ServiceBilling struct {
	ID             string  `json:"id"`
	MerchantID     string  `json:"merchant_id"`
	ServiceOrderID string  `json:"service_order_id"`
	ARDocumentID   *string `json:"ar_document_id,omitempty"`
	Amount         string  `json:"amount"`
	Status         string  `json:"status"`
}

type ServiceBillingRequest struct {
	ServiceOrderID string  `json:"service_order_id"`
	ARDocumentID   *string `json:"ar_document_id,omitempty"`
	Amount         string  `json:"amount"`
	Status         string  `json:"status,omitempty"`
	PromotionID    *string `json:"promotion_id,omitempty"`
}

// CustomFieldDefinition describes a versioned, merchant-scoped service form
// field. Definitions remain separate from typed business data so they cannot
// become an alternate source of truth for pricing, stock, or payment state.
type CustomFieldDefinition struct {
	ID              string          `json:"id"`
	MerchantID      string          `json:"merchant_id"`
	EntityType      string          `json:"entity_type"`
	ModuleCode      string          `json:"module_code"`
	ServiceType     *string         `json:"service_type,omitempty"`
	FieldScope      string          `json:"field_scope"`
	FieldCode       string          `json:"field_code"`
	Label           string          `json:"label"`
	ValueType       string          `json:"value_type"`
	IsRequired      bool            `json:"is_required"`
	Options         json.RawMessage `json:"options"`
	ValidationRules json.RawMessage `json:"validation_rules"`
	VisibilityRules json.RawMessage `json:"visibility_rules"`
	DisplayOrder    int             `json:"display_order"`
	Section         *string         `json:"section,omitempty"`
	Printable       bool            `json:"printable"`
	FormVersion     int             `json:"form_version"`
	IsActive        bool            `json:"is_active"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type CustomFieldDefinitionRequest struct {
	EntityType      string          `json:"entity_type"`
	ModuleCode      string          `json:"module_code,omitempty"`
	ServiceType     *string         `json:"service_type,omitempty"`
	FieldScope      string          `json:"field_scope"`
	FieldCode       string          `json:"field_code"`
	Label           string          `json:"label"`
	ValueType       string          `json:"value_type"`
	IsRequired      bool            `json:"is_required,omitempty"`
	Options         json.RawMessage `json:"options,omitempty"`
	ValidationRules json.RawMessage `json:"validation_rules,omitempty"`
	VisibilityRules json.RawMessage `json:"visibility_rules,omitempty"`
	DisplayOrder    int             `json:"display_order,omitempty"`
	Section         *string         `json:"section,omitempty"`
	Printable       bool            `json:"printable,omitempty"`
	IsActive        *bool           `json:"is_active,omitempty"`
}

type CustomFieldValue struct {
	ID           string          `json:"id"`
	MerchantID   string          `json:"merchant_id"`
	DefinitionID string          `json:"definition_id"`
	EntityType   string          `json:"entity_type"`
	EntityID     string          `json:"entity_id"`
	FormVersion  int             `json:"form_version"`
	Value        json.RawMessage `json:"value"`
}

type CustomFieldValueRequest struct {
	DefinitionID string          `json:"definition_id"`
	Value        json.RawMessage `json:"value"`
	FormVersion  int             `json:"form_version,omitempty"`
}

type RepairDevice struct {
	ID           string          `json:"id"`
	MerchantID   string          `json:"merchant_id"`
	CustomerID   *string         `json:"customer_id,omitempty"`
	DeviceType   string          `json:"device_type"`
	Manufacturer *string         `json:"manufacturer,omitempty"`
	Model        *string         `json:"model,omitempty"`
	SerialNumber *string         `json:"serial_number,omitempty"`
	Metadata     json.RawMessage `json:"metadata"`
	CreatedAt    time.Time       `json:"created_at"`
}

type RepairDeviceRequest struct {
	CustomerID   *string         `json:"customer_id,omitempty"`
	DeviceType   string          `json:"device_type"`
	Manufacturer *string         `json:"manufacturer,omitempty"`
	Model        *string         `json:"model,omitempty"`
	SerialNumber *string         `json:"serial_number,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
}

// RepairWorkItemRequest describes one operational subject inside a service
// ticket. The legacy device/issue fields on CreateRepairTicketRequest remain
// accepted and are normalized into one work item when WorkItems is omitted.
type RepairWorkItemRequest struct {
	ID               string                     `json:"id,omitempty"`
	Type             string                     `json:"type,omitempty"`
	Device           RepairDeviceRequest        `json:"device"`
	IssueDescription string                     `json:"issue_description"`
	Issues           []string                   `json:"issues,omitempty"`
	Conditions       []string                   `json:"conditions,omitempty"`
	Note             *string                    `json:"note,omitempty"`
	AdditionalFee    string                     `json:"additional_fee,omitempty"`
	WaitingDays      *int                       `json:"waiting_days,omitempty"`
	WaitingEndDate   *string                    `json:"waiting_end_date,omitempty"`
	Fields           map[string]json.RawMessage `json:"fields,omitempty"`
}

type RepairWorkItem struct {
	ID               string                     `json:"id"`
	ServiceOrderID   string                     `json:"service_order_id"`
	SequenceNumber   int                        `json:"sequence_number"`
	Type             string                     `json:"type"`
	Status           string                     `json:"status"`
	FormVersion      int                        `json:"form_version"`
	Summary          *string                    `json:"summary,omitempty"`
	Device           RepairDevice               `json:"device"`
	IssueDescription string                     `json:"issue_description"`
	Issues           []string                   `json:"issues"`
	Conditions       []string                   `json:"conditions"`
	Note             *string                    `json:"note,omitempty"`
	AdditionalFee    string                     `json:"additional_fee"`
	WaitingStartDate string                     `json:"waiting_start_date"`
	WaitingEndDate   string                     `json:"waiting_end_date"`
	WaitingDays      int                        `json:"waiting_days"`
	Financials       WorkItemFinancials         `json:"financials"`
	Fields           map[string]json.RawMessage `json:"fields,omitempty"`
}

type RepairWorkItemUpdateRequest struct {
	Status               string                     `json:"status,omitempty"`
	Summary              *string                    `json:"summary,omitempty"`
	AssignedMembershipID *string                    `json:"assigned_membership_id,omitempty"`
	IssueDescription     *string                    `json:"issue_description,omitempty"`
	Issues               *[]string                  `json:"issues,omitempty"`
	Conditions           *[]string                  `json:"conditions,omitempty"`
	Note                 *string                    `json:"note,omitempty"`
	WaitingDays          *int                       `json:"waiting_days,omitempty"`
	WaitingEndDate       *string                    `json:"waiting_end_date,omitempty"`
	Device               *RepairDeviceRequest       `json:"device,omitempty"`
	Fields               map[string]json.RawMessage `json:"fields,omitempty"`
}

type RepairOrder struct {
	ID               string                     `json:"id"`
	MerchantID       string                     `json:"merchant_id"`
	ServiceOrderID   string                     `json:"service_order_id"`
	ShopID           *string                    `json:"shop_id,omitempty"`
	DeviceID         string                     `json:"device_id"`
	OrderNumber      string                     `json:"order_number"`
	Status           string                     `json:"status"`
	IssueDescription string                     `json:"issue_description"`
	ReceivedAt       time.Time                  `json:"received_at"`
	CompletedAt      *time.Time                 `json:"completed_at,omitempty"`
	WaitingStartDate string                     `json:"waiting_start_date"`
	WaitingEndDate   string                     `json:"waiting_end_date"`
	WaitingDays      int                        `json:"waiting_days"`
	CustomerID       *string                    `json:"customer_id,omitempty"`
	CustomerName     *string                    `json:"customer_name,omitempty"`
	CustomerPhone    *string                    `json:"customer_phone,omitempty"`
	PromotionID      *string                    `json:"promotion_id,omitempty"`
	Subtotal         string                     `json:"subtotal"`
	DiscountTotal    string                     `json:"discount_total"`
	DepositPaid      string                     `json:"deposit_paid"`
	PaymentStatus    string                     `json:"payment_status"`
	ServiceID        *string                    `json:"service_id,omitempty"`
	LaborFee         string                     `json:"labor_fee"`
	AdditionalFee    string                     `json:"additional_fee"`
	TaxAmount        string                     `json:"tax_amount"`
	TotalCost        string                     `json:"total_cost"`
	Note             *string                    `json:"note,omitempty"`
	WorkItems        []RepairWorkItem           `json:"work_items"`
	Fields           map[string]json.RawMessage `json:"fields,omitempty"`
	FormVersion      int                        `json:"form_version,omitempty"`
}

type RepairOrderRequest struct {
	ServiceOrderID        string     `json:"service_order_id"`
	DeviceID              string     `json:"device_id"`
	OrderNumber           string     `json:"order_number"`
	Status                string     `json:"status,omitempty"`
	IssueDescription      string     `json:"issue_description"`
	ReceivedAt            *time.Time `json:"received_at,omitempty"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	CustomerID            *string    `json:"customer_id,omitempty"`
	CustomerName          *string    `json:"customer_name,omitempty"`
	CustomerPhone         *string    `json:"customer_phone,omitempty"`
	PromotionID           *string    `json:"promotion_id,omitempty"`
	DepositAmount         string     `json:"deposit_amount,omitempty"`
	DepositPaymentMethod  string     `json:"deposit_payment_method,omitempty"`
	DepositIdempotencyKey string     `json:"deposit_idempotency_key,omitempty"`
	ServiceID             *string    `json:"service_id,omitempty"`
	LaborFee              string     `json:"labor_fee,omitempty"`
	AdditionalFee         string     `json:"additional_fee,omitempty"`
	Note                  *string    `json:"note,omitempty"`
	PaymentStatus         string     `json:"payment_status,omitempty"`
}

type RepairTicketDetailsRequest struct {
	CustomerName     *string                              `json:"customer_name,omitempty"`
	CustomerPhone    *string                              `json:"customer_phone,omitempty"`
	IssueDescription string                               `json:"issue_description"`
	Note             *string                              `json:"note,omitempty"`
	WorkItems        []RepairTicketWorkItemDetailsRequest `json:"work_items,omitempty"`
}

// RepairTicketBillingRequest replaces the editable ticket-level service
// pricing while preserving inventory part lines and canonical payment rows.
// Payment state is deliberately not accepted here; it is derived from the
// captured payment/refund ledger and changed through the payment endpoints.
type RepairTicketBillingRequest struct {
	ServiceItems []RepairServiceItemRequest       `json:"service_items"`
	WorkItems    []RepairTicketWorkItemFeeRequest `json:"work_items"`
	LaborFee     string                           `json:"labor_fee"`
	PromotionID  *string                          `json:"promotion_id"`
}

type RepairTicketWorkItemFeeRequest struct {
	ID            string `json:"id"`
	AdditionalFee string `json:"additional_fee"`
}

// RepairTicketWorkItemDetailsRequest updates the intake details that belong
// to one device/work item inside the parent repair ticket.
type RepairTicketWorkItemDetailsRequest struct {
	ID               string               `json:"id"`
	IssueDescription string               `json:"issue_description"`
	Issues           []string             `json:"issues,omitempty"`
	Conditions       []string             `json:"conditions,omitempty"`
	Note             *string              `json:"note,omitempty"`
	WaitingDays      *int                 `json:"waiting_days,omitempty"`
	WaitingEndDate   *string              `json:"waiting_end_date,omitempty"`
	Device           *RepairDeviceRequest `json:"device,omitempty"`
}

type RepairPreset struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	ShopID     string    `json:"shop_id"`
	PresetType string    `json:"preset_type"`
	Value      string    `json:"value"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type RepairPresetRequest struct {
	ShopID     string `json:"shop_id"`
	PresetType string `json:"preset_type"`
	Value      string `json:"value"`
}

type RepairTicketPartRequest struct {
	WorkItemID  *string `json:"work_item_id,omitempty"`
	VariantID   string  `json:"variant_id"`
	Quantity    string  `json:"quantity"`
	PromotionID *string `json:"promotion_id,omitempty"`
}

// RepairServiceItemRequest identifies a billable service or product on the
// parent ticket. Prices are resolved by the backend from the active catalog.
type RepairServiceItemRequest struct {
	WorkItemID *string `json:"work_item_id,omitempty"`
	ServiceID  *string `json:"service_id,omitempty"`
	VariantID  *string `json:"variant_id,omitempty"`
	Quantity   string  `json:"quantity"`
}

type CreateRepairTicketRequest struct {
	IdempotencyKey   string                     `json:"idempotency_key"`
	OrderNumber      string                     `json:"order_number"`
	ShopID           string                     `json:"shop_id"`
	Priority         string                     `json:"priority,omitempty"`
	Device           RepairDeviceRequest        `json:"device"`
	IssueDescription string                     `json:"issue_description"`
	WorkItems        []RepairWorkItemRequest    `json:"work_items,omitempty"`
	Fields           map[string]json.RawMessage `json:"fields,omitempty"`
	CustomerID       *string                    `json:"customer_id,omitempty"`
	CustomerName     *string                    `json:"customer_name,omitempty"`
	CustomerPhone    *string                    `json:"customer_phone,omitempty"`
	ServiceID        *string                    `json:"service_id,omitempty"`
	ServiceItems     []RepairServiceItemRequest `json:"service_items,omitempty"`
	PromotionID      *string                    `json:"promotion_id,omitempty"`
	AdditionalFee    string                     `json:"additional_fee,omitempty"`
	Note             *string                    `json:"note,omitempty"`
	PaymentStatus    string                     `json:"payment_status,omitempty"`
	DepositAmount    string                     `json:"deposit_amount,omitempty"`
	PaymentMethod    string                     `json:"payment_method,omitempty"`
	Parts            []RepairTicketPartRequest  `json:"parts,omitempty"`
	Images           []RepairImageRequest       `json:"images,omitempty"`
}

type RepairTicket struct {
	Device       RepairDevice               `json:"device"`
	WorkItems    []RepairWorkItem           `json:"work_items"`
	ServiceItems []ServiceOrderItem         `json:"service_items"`
	ServiceOrder ServiceOrder               `json:"service_order"`
	RepairOrder  RepairOrder                `json:"repair_order"`
	Parts        []RepairPart               `json:"parts"`
	Diagnostics  []RepairDiagnostic         `json:"diagnostics"`
	Approvals    []RepairApproval           `json:"approvals"`
	Warranties   []RepairWarranty           `json:"warranties"`
	Payment      *RepairPayment             `json:"payment,omitempty"`
	Images       []RepairImage              `json:"images"`
	CustomFields map[string]json.RawMessage `json:"custom_fields,omitempty"`
	FormVersion  int                        `json:"form_version,omitempty"`
}

type RepairPayment struct {
	ID            string                      `json:"id"`
	RepairOrderID string                      `json:"repair_order_id"`
	Kind          string                      `json:"kind"`
	Method        string                      `json:"method"`
	Status        string                      `json:"status"`
	Amount        string                      `json:"amount"`
	CreatedAt     time.Time                   `json:"created_at"`
	Allocations   []WorkItemPaymentAllocation `json:"allocations"`
}

type RepairPaymentRequest struct {
	Kind           string                             `json:"kind"`
	Method         string                             `json:"method"`
	Amount         string                             `json:"amount"`
	IdempotencyKey string                             `json:"idempotency_key"`
	Allocations    []WorkItemPaymentAllocationRequest `json:"allocations,omitempty"`
}

type WorkItemFinancials struct {
	Subtotal      string `json:"subtotal"`
	DiscountTotal string `json:"discount_total"`
	TaxAmount     string `json:"tax_amount"`
	Total         string `json:"total"`
	Paid          string `json:"paid"`
	Balance       string `json:"balance"`
}

type WorkItemPaymentAllocationRequest struct {
	WorkItemID string `json:"work_item_id"`
	Amount     string `json:"amount"`
}

type WorkItemPaymentAllocation struct {
	WorkItemID string `json:"work_item_id"`
	Amount     string `json:"amount"`
}

type RepairRefund struct {
	ID            string    `json:"id"`
	RepairOrderID string    `json:"repair_order_id"`
	PaymentID     string    `json:"payment_id"`
	OrderID       string    `json:"order_id"`
	Status        string    `json:"status"`
	Amount        string    `json:"amount"`
	Reason        *string   `json:"reason,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type RepairRefundRequest struct {
	PaymentID      string `json:"payment_id"`
	Amount         string `json:"amount"`
	Reason         string `json:"reason,omitempty"`
	RefundID       string `json:"refund_id,omitempty"`
	IdempotencyKey string `json:"idempotency_key"`
}

type RepairImage struct {
	ID            string    `json:"id"`
	RepairOrderID string    `json:"repair_order_id"`
	WorkItemID    *string   `json:"work_item_id,omitempty"`
	Filename      string    `json:"filename"`
	ContentType   string    `json:"content_type"`
	ImageURL      string    `json:"image_url,omitempty"`
	SourceType    string    `json:"source_type"`
	DataBase64    string    `json:"data_base64,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type RepairImageRequest struct {
	WorkItemID  *string `json:"work_item_id,omitempty"`
	Filename    string  `json:"filename"`
	ContentType string  `json:"content_type"`
	ImageURL    string  `json:"image_url,omitempty"`
	SourceType  string  `json:"source_type,omitempty"`
	DataBase64  string  `json:"data_base64,omitempty"`
}

type RepairDiagnostic struct {
	ID                      string    `json:"id"`
	MerchantID              string    `json:"merchant_id"`
	RepairOrderID           string    `json:"repair_order_id"`
	WorkItemID              *string   `json:"work_item_id,omitempty"`
	PerformedByMembershipID *string   `json:"performed_by_membership_id,omitempty"`
	Diagnosis               string    `json:"diagnosis"`
	EstimatedCost           *string   `json:"estimated_cost,omitempty"`
	CreatedAt               time.Time `json:"created_at"`
}

type RepairDiagnosticRequest struct {
	RepairOrderID           string  `json:"repair_order_id"`
	WorkItemID              *string `json:"work_item_id,omitempty"`
	PerformedByMembershipID *string `json:"performed_by_membership_id,omitempty"`
	Diagnosis               string  `json:"diagnosis"`
	EstimatedCost           *string `json:"estimated_cost,omitempty"`
}

type RepairPart struct {
	ID                     string  `json:"id"`
	MerchantID             string  `json:"merchant_id"`
	RepairOrderID          string  `json:"repair_order_id"`
	WorkItemID             *string `json:"work_item_id,omitempty"`
	VariantID              *string `json:"variant_id,omitempty"`
	CustomerSuppliedPartID *string `json:"customer_supplied_part_id,omitempty"`
	Quantity               string  `json:"quantity"`
	UnitPrice              string  `json:"unit_price"`
	Status                 string  `json:"status"`
	RepairTotal            string  `json:"repair_total,omitempty"`
}

type RepairPartRequest struct {
	RepairOrderID          string  `json:"repair_order_id"`
	WorkItemID             *string `json:"work_item_id,omitempty"`
	VariantID              *string `json:"variant_id,omitempty"`
	CustomerSuppliedPartID *string `json:"customer_supplied_part_id,omitempty"`
	Quantity               string  `json:"quantity"`
	UnitPrice              string  `json:"unit_price"`
	Status                 string  `json:"status,omitempty"`
	PromotionID            *string `json:"promotion_id,omitempty"`
}

type RepairApproval struct {
	ID              string     `json:"id"`
	MerchantID      string     `json:"merchant_id"`
	RepairOrderID   string     `json:"repair_order_id"`
	WorkItemID      *string    `json:"work_item_id,omitempty"`
	ApprovalVersion int        `json:"approval_version"`
	Status          string     `json:"status"`
	ApprovedAmount  *string    `json:"approved_amount,omitempty"`
	ApprovedAt      *time.Time `json:"approved_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type RepairApprovalRequest struct {
	RepairOrderID   string     `json:"repair_order_id"`
	WorkItemID      *string    `json:"work_item_id,omitempty"`
	ApprovalVersion int        `json:"approval_version"`
	Status          string     `json:"status"`
	ApprovedAmount  *string    `json:"approved_amount,omitempty"`
	ApprovedAt      *time.Time `json:"approved_at,omitempty"`
}

type RepairWarranty struct {
	ID            string    `json:"id"`
	MerchantID    string    `json:"merchant_id"`
	RepairOrderID string    `json:"repair_order_id"`
	WorkItemID    *string   `json:"work_item_id,omitempty"`
	StartsAt      time.Time `json:"starts_at"`
	EndsAt        time.Time `json:"ends_at"`
	Terms         *string   `json:"terms,omitempty"`
}

type RepairWarrantyRequest struct {
	RepairOrderID string    `json:"repair_order_id"`
	WorkItemID    *string   `json:"work_item_id,omitempty"`
	StartsAt      time.Time `json:"starts_at"`
	EndsAt        time.Time `json:"ends_at"`
	Terms         *string   `json:"terms,omitempty"`
}
