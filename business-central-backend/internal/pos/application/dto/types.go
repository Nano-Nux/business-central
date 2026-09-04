package dto

import (
	"encoding/json"
	"time"
)

type Shop struct {
	ID               string          `json:"id"`
	MerchantID       string          `json:"merchant_id"`
	BusinessTypeID   *string         `json:"business_type_id,omitempty"`
	BusinessTypeName string          `json:"business_type_name,omitempty"`
	Name             string          `json:"name"`
	Code             string          `json:"code"`
	Address          json.RawMessage `json:"address"`
	Timezone         *string         `json:"timezone,omitempty"`
	IsActive         bool            `json:"is_active"`
	ModuleCodes      []string        `json:"module_codes"`
	IncludeTax       bool            `json:"include_tax"`
	TaxRate          string          `json:"tax_rate"`
	TaxLabel         string          `json:"tax_label"`
	ReceiptNote      string          `json:"receipt_note"`
	FooterNote       string          `json:"footer_note"`
	SyncVersion      int64           `json:"sync_version"`
}
type Location struct {
	ID           string  `json:"id"`
	ShopID       *string `json:"shop_id,omitempty"`
	Code         string  `json:"code"`
	Name         string  `json:"name"`
	LocationType string  `json:"location_type"`
	IsActive     bool    `json:"is_active"`
}
type Terminal struct {
	ID               string    `json:"id"`
	MerchantID       string    `json:"merchant_id"`
	ShopID           string    `json:"shop_id"`
	Name             string    `json:"name"`
	DeviceIdentifier *string   `json:"device_identifier,omitempty"`
	IsActive         bool      `json:"is_active"`
	CreatedAt        time.Time `json:"created_at"`
}
type Session struct {
	ID           string     `json:"id"`
	MerchantID   string     `json:"merchant_id"`
	ShopID       string     `json:"shop_id"`
	TerminalID   *string    `json:"terminal_id,omitempty"`
	MembershipID string     `json:"membership_id"`
	Status       string     `json:"status"`
	OpenedAt     time.Time  `json:"opened_at"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`
	OpeningCash  string     `json:"opening_cash"`
	ExpectedCash *string    `json:"expected_cash,omitempty"`
	CountedCash  *string    `json:"counted_cash,omitempty"`
	Variance     *string    `json:"variance,omitempty"`
}
type ShopRequest struct {
	BusinessTypeID *string         `json:"business_type_id,omitempty"`
	Name           string          `json:"name"`
	Code           string          `json:"code"`
	Address        json.RawMessage `json:"address,omitempty"`
	Timezone       *string         `json:"timezone,omitempty"`
	IsActive       *bool           `json:"is_active,omitempty"`
	ModuleCodes    []string        `json:"module_codes,omitempty"`
	IncludeTax     *bool           `json:"include_tax,omitempty"`
	TaxRate        *string         `json:"tax_rate,omitempty"`
	TaxLabel       *string         `json:"tax_label,omitempty"`
	ReceiptNote    *string         `json:"receipt_note,omitempty"`
	FooterNote     *string         `json:"footer_note,omitempty"`
}
type Delivery struct {
	ID          string    `json:"id"`
	MerchantID  string    `json:"merchant_id"`
	ShopID      string    `json:"shop_id"`
	Name        string    `json:"name"`
	ContactInfo string    `json:"contact_info"`
	IsActive    bool      `json:"is_active"`
	SyncVersion int64     `json:"sync_version,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
type DeliveryRequest struct {
	ShopID      string `json:"shop_id"`
	Name        string `json:"name"`
	ContactInfo string `json:"contact_info"`
	IsActive    *bool  `json:"is_active,omitempty"`
}

type Customer struct {
	ID                string          `json:"id"`
	MerchantID        string          `json:"merchant_id"`
	CustomerNumber    string          `json:"customer_number"`
	CustomerType      string          `json:"customer_type"`
	DisplayName       string          `json:"display_name"`
	Email             *string         `json:"email,omitempty"`
	Phone             *string         `json:"phone,omitempty"`
	LoyaltyIdentifier *string         `json:"loyalty_identifier,omitempty"`
	Metadata          json.RawMessage `json:"metadata"`
	OrderCount        int             `json:"order_count"`
	RepairCount       int             `json:"repair_count"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

type CustomerRequest struct {
	CustomerType      string  `json:"customer_type"`
	DisplayName       string  `json:"display_name"`
	Email             *string `json:"email,omitempty"`
	Phone             *string `json:"phone,omitempty"`
	LoyaltyIdentifier *string `json:"loyalty_identifier,omitempty"`
}
type TerminalRequest struct {
	ShopID           string  `json:"shop_id"`
	Name             string  `json:"name"`
	DeviceIdentifier *string `json:"device_identifier,omitempty"`
	IsActive         *bool   `json:"is_active,omitempty"`
}
type SessionRequest struct {
	ShopID       string  `json:"shop_id"`
	TerminalID   *string `json:"terminal_id,omitempty"`
	MembershipID string  `json:"membership_id"`
	OpeningCash  string  `json:"opening_cash,omitempty"`
	Status       string  `json:"status,omitempty"`
	ExpectedCash *string `json:"expected_cash,omitempty"`
	CountedCash  *string `json:"counted_cash,omitempty"`
}

type CatalogItem struct {
	ID             string  `json:"id"`
	ProductID      string  `json:"product_id"`
	ProductName    string  `json:"product_name"`
	Name           string  `json:"name"`
	SKU            string  `json:"sku"`
	Barcode        *string `json:"barcode,omitempty"`
	BaseUnitID     string  `json:"base_unit_id"`
	Price          string  `json:"price"`
	CurrencyCode   string  `json:"currency_code"`
	QuantityOnHand string  `json:"quantity_on_hand"`
	IsStockTracked bool    `json:"is_stock_tracked"`
	StockAssetID   *string `json:"stock_asset_id,omitempty"`
	BarcodeMatch   string  `json:"barcode_match,omitempty"`
}

type SaleLineRequest struct {
	VariantID string `json:"variant_id"`
	Quantity  string `json:"quantity"`
	AssetID   string `json:"asset_id,omitempty"`
}

type CreateSaleRequest struct {
	ShopID          string            `json:"shop_id,omitempty"`
	LocationID      string            `json:"location_id,omitempty"`
	CustomerID      string            `json:"customer_id,omitempty"`
	CustomerName    string            `json:"customer_name,omitempty"`
	CustomerPhone   string            `json:"customer_phone,omitempty"`
	DeliveryID      string            `json:"delivery_id,omitempty"`
	DeliveryFee     string            `json:"delivery_fee,omitempty"`
	ManualPromotion string            `json:"manual_promotion,omitempty"`
	Note            string            `json:"note,omitempty"`
	PromotionID     string            `json:"promotion_id,omitempty"`
	PaymentTypeID   string            `json:"payment_type_id,omitempty"`
	PaymentMethod   string            `json:"payment_method"`
	IdempotencyKey  string            `json:"idempotency_key"`
	Lines           []SaleLineRequest `json:"lines"`
}

type CreateRefundRequest struct {
	PaymentID      string `json:"payment_id"`
	Amount         string `json:"amount"`
	Reason         string `json:"reason,omitempty"`
	RefundID       string `json:"refund_id,omitempty"`
	IdempotencyKey string `json:"idempotency_key"`
}

type Refund struct {
	ID        string    `json:"id"`
	PaymentID string    `json:"payment_id"`
	OrderID   string    `json:"order_id"`
	Status    string    `json:"status"`
	Amount    string    `json:"amount"`
	Reason    *string   `json:"reason,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type SaleOrder struct {
	ID            string    `json:"id"`
	OrderNumber   string    `json:"order_number"`
	Status        string    `json:"status"`
	CurrencyCode  string    `json:"currency_code"`
	Subtotal      string    `json:"subtotal"`
	DiscountTotal string    `json:"discount_total"`
	TaxTotal      string    `json:"tax_total"`
	GrandTotal    string    `json:"grand_total"`
	CreatedAt     time.Time `json:"created_at"`
}

type SaleQuote struct {
	CurrencyCode  string `json:"currency_code"`
	Subtotal      string `json:"subtotal"`
	DiscountTotal string `json:"discount_total"`
	TaxTotal      string `json:"tax_total"`
	GrandTotal    string `json:"grand_total"`
}

type InvoiceLine struct {
	Name       string  `json:"name"`
	Quantity   string  `json:"quantity"`
	UnitPrice  string  `json:"unit_price"`
	WorkItemID *string `json:"work_item_id,omitempty"`
}

type InvoiceWorkItem struct {
	ID               string          `json:"id"`
	SequenceNumber   int             `json:"sequence_number"`
	Type             string          `json:"type"`
	Status           string          `json:"status"`
	FormVersion      int             `json:"form_version"`
	DeviceType       string          `json:"device_type"`
	Manufacturer     *string         `json:"manufacturer,omitempty"`
	Model            *string         `json:"model,omitempty"`
	SerialNumber     *string         `json:"serial_number,omitempty"`
	IssueDescription string          `json:"issue_description"`
	Issues           []string        `json:"issues"`
	Conditions       []string        `json:"conditions"`
	Note             *string         `json:"note,omitempty"`
	Fields           json.RawMessage `json:"fields"`
	AdditionalFee    string          `json:"additional_fee"`
	WaitingStartDate string          `json:"waiting_start_date"`
	WaitingEndDate   string          `json:"waiting_end_date"`
	WaitingDays      int             `json:"waiting_days"`
	Subtotal         string          `json:"subtotal"`
	DiscountTotal    string          `json:"discount_total"`
	TaxAmount        string          `json:"tax_amount"`
	Total            string          `json:"total"`
	Paid             string          `json:"paid"`
	Balance          string          `json:"balance"`
}

type Invoice struct {
	ID               string            `json:"id"`
	Number           string            `json:"number"`
	Customer         string            `json:"customer"`
	CustomerPhone    *string           `json:"customer_phone,omitempty"`
	MerchantName     string            `json:"merchant_name"`
	ShopName         *string           `json:"shop_name,omitempty"`
	ShopID           *string           `json:"shop_id,omitempty"`
	ShopLogoURL      *string           `json:"shop_logo_url,omitempty"`
	ShowShopLogo     bool              `json:"show_shop_logo"`
	CurrencyCode     string            `json:"currency_code"`
	CreatedAt        time.Time         `json:"created_at"`
	Status           string            `json:"status"`
	Kind             string            `json:"kind"`
	TicketStatus     *string           `json:"ticket_status,omitempty"`
	PaymentStatus    *string           `json:"payment_status,omitempty"`
	WaitingStartDate string            `json:"waiting_start_date,omitempty"`
	WaitingEndDate   string            `json:"waiting_end_date,omitempty"`
	WaitingDays      int               `json:"waiting_days,omitempty"`
	Subtotal         string            `json:"subtotal"`
	DiscountTotal    string            `json:"discount_total"`
	TaxTotal         string            `json:"tax_total"`
	GrandTotal       string            `json:"grand_total"`
	DeliveryName     *string           `json:"delivery_name,omitempty"`
	DeliveryFee      string            `json:"delivery_fee"`
	DeliveryContact  *string           `json:"delivery_contact,omitempty"`
	Note             *string           `json:"note,omitempty"`
	PaymentType      *string           `json:"payment_type,omitempty"`
	TaxLabel         string            `json:"tax_label"`
	ReceiptNote      string            `json:"receipt_note"`
	FooterNote       string            `json:"footer_note"`
	Items            []InvoiceLine     `json:"items"`
	WorkItems        []InvoiceWorkItem `json:"work_items,omitempty"`
	TicketFields     json.RawMessage   `json:"ticket_fields,omitempty"`
}
