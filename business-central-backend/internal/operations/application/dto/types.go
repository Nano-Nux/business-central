package dto

import "time"

type PriceList struct {
	ID           string `json:"id"`
	MerchantID   string `json:"merchant_id"`
	Code         string `json:"code"`
	CurrencyCode string `json:"currency_code"`
	IsDefault    bool   `json:"is_default"`
	SyncVersion  int64  `json:"sync_version,omitempty"`
}

type ProductPrice struct {
	SyncID      string     `json:"sync_id"`
	SyncVersion int64      `json:"sync_version,omitempty"`
	MerchantID  string     `json:"merchant_id"`
	PriceListID string     `json:"price_list_id"`
	VariantID   string     `json:"variant_id"`
	Amount      string     `json:"amount"`
	ValidFrom   time.Time  `json:"valid_from"`
	ValidUntil  *time.Time `json:"valid_until,omitempty"`
}

type Promotion struct {
	ID              string     `json:"id"`
	MerchantID      string     `json:"merchant_id"`
	Name            string     `json:"name"`
	PromotionType   string     `json:"promotion_type"`
	Value           string     `json:"value"`
	MinimumSubtotal string     `json:"minimum_subtotal"`
	UsageLimit      *int       `json:"usage_limit,omitempty"`
	RedemptionCount int        `json:"redemption_count"`
	StartsAt        *time.Time `json:"starts_at,omitempty"`
	EndsAt          *time.Time `json:"ends_at,omitempty"`
	IsActive        bool       `json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type PromotionCode struct {
	ID              string `json:"id"`
	MerchantID      string `json:"merchant_id"`
	PromotionID     string `json:"promotion_id"`
	Code            string `json:"code"`
	IsActive        bool   `json:"is_active"`
	UsageLimit      *int   `json:"usage_limit,omitempty"`
	RedemptionCount int    `json:"redemption_count"`
}
type PromotionProduct struct {
	ID          string  `json:"id"`
	PromotionID string  `json:"promotion_id"`
	ProductID   string  `json:"product_id"`
	VariantID   *string `json:"variant_id,omitempty"`
	ProductName string  `json:"product_name"`
	VariantName *string `json:"variant_name,omitempty"`
}

type Movement struct {
	ID                    string    `json:"id"`
	MerchantID            string    `json:"merchant_id"`
	VariantID             string    `json:"variant_id"`
	MovementType          string    `json:"movement_type"`
	SourceLocationID      *string   `json:"source_location_id,omitempty"`
	DestinationLocationID *string   `json:"destination_location_id,omitempty"`
	UnitID                *string   `json:"unit_id,omitempty"`
	ReceiptLineID         *string   `json:"receipt_line_id,omitempty"`
	OrderLineID           *string   `json:"order_line_id,omitempty"`
	ReversesMovementID    *string   `json:"reverses_movement_id,omitempty"`
	Quantity              string    `json:"quantity"`
	EnteredQuantity       *string   `json:"entered_quantity,omitempty"`
	UnitCost              *string   `json:"unit_cost,omitempty"`
	EventKey              string    `json:"event_key"`
	OccurredAt            time.Time `json:"occurred_at"`
	CreatedAt             time.Time `json:"created_at"`
}

type StockAsset struct {
	ID           string  `json:"id"`
	MerchantID   string  `json:"merchant_id"`
	VariantID    string  `json:"variant_id"`
	ProductName  string  `json:"product_name"`
	VariantName  string  `json:"variant_name"`
	SKU          string  `json:"sku"`
	LocationID   *string `json:"location_id,omitempty"`
	LocationName string  `json:"location_name,omitempty"`
	AssetTag     string  `json:"asset_tag"`
	Status       string  `json:"status"`
	BarcodeID    *string `json:"barcode_id,omitempty"`
	Barcode      *string `json:"barcode,omitempty"`
}

type StorageItem struct {
	ID              string     `json:"id"`
	Catalog         string     `json:"catalog"`
	ProductName     string     `json:"product_name"`
	VariantName     string     `json:"variant_name"`
	Brand           string     `json:"brand,omitempty"`
	Unit            string     `json:"unit"`
	StockCount      string     `json:"stock_count"`
	SellPrice       string     `json:"sell_price,omitempty"`
	OriginalPrice   string     `json:"original_price,omitempty"`
	Profit          string     `json:"profit,omitempty"`
	ExpiredDate     *time.Time `json:"expired_date,omitempty"`
	ManufactureDate *time.Time `json:"manufacture_date,omitempty"`
}

type StockMovementReceipt struct {
	ReceiptID           string     `json:"receipt_id"`
	ReceiptNumber       string     `json:"receipt_number"`
	ReceivedAt          time.Time  `json:"received_at"`
	PurchaseOrderID     string     `json:"purchase_order_id"`
	PurchaseOrderNumber string     `json:"purchase_order_number"`
	PurchaseOrderStatus string     `json:"purchase_order_status"`
	SupplierName        string     `json:"supplier_name"`
	CurrencyCode        string     `json:"currency_code"`
	BatchNumber         string     `json:"batch_number,omitempty"`
	ExpiresAt           *time.Time `json:"expires_at,omitempty"`
	QuantityReceived    string     `json:"quantity_received"`
	UnitCost            string     `json:"unit_cost"`
}

type StockMovementOrder struct {
	OrderID         string `json:"order_id"`
	OrderNumber     string `json:"order_number"`
	Channel         string `json:"channel"`
	Status          string `json:"status"`
	CurrencyCode    string `json:"currency_code"`
	CustomerName    string `json:"customer_name,omitempty"`
	CustomerPhone   string `json:"customer_phone,omitempty"`
	LineID          string `json:"line_id"`
	Description     string `json:"description"`
	OrderedQuantity string `json:"ordered_quantity"`
	UnitPrice       string `json:"unit_price"`
	DiscountAmount  string `json:"discount_amount"`
	TaxAmount       string `json:"tax_amount"`
	LineTotal       string `json:"line_total"`
}

type StockMovementCostAllocation struct {
	ID                     string `json:"id"`
	CostLayerID            string `json:"cost_layer_id"`
	Quantity               string `json:"quantity"`
	UnitCost               string `json:"unit_cost"`
	TotalCost              string `json:"total_cost"`
	LayerQuantityReceived  string `json:"layer_quantity_received"`
	LayerQuantityRemaining string `json:"layer_quantity_remaining"`
	SourceReceiptNumber    string `json:"source_receipt_number,omitempty"`
}

type StockMovementDetail struct {
	Movement                    Movement                      `json:"movement"`
	ProductName                 string                        `json:"product_name"`
	ProductDescription          string                        `json:"product_description,omitempty"`
	VariantName                 string                        `json:"variant_name"`
	SKU                         string                        `json:"sku"`
	Barcode                     string                        `json:"barcode,omitempty"`
	UnitName                    string                        `json:"unit_name,omitempty"`
	UnitSymbol                  string                        `json:"unit_symbol,omitempty"`
	SourceLocationName          string                        `json:"source_location_name,omitempty"`
	SourceLocationCode          string                        `json:"source_location_code,omitempty"`
	DestinationLocationName     string                        `json:"destination_location_name,omitempty"`
	DestinationLocationCode     string                        `json:"destination_location_code,omitempty"`
	TotalCost                   string                        `json:"total_cost"`
	SourceQuantityOnHand        *string                       `json:"source_quantity_on_hand,omitempty"`
	SourceQuantityReserved      *string                       `json:"source_quantity_reserved,omitempty"`
	DestinationQuantityOnHand   *string                       `json:"destination_quantity_on_hand,omitempty"`
	DestinationQuantityReserved *string                       `json:"destination_quantity_reserved,omitempty"`
	Receipt                     *StockMovementReceipt         `json:"receipt,omitempty"`
	Order                       *StockMovementOrder           `json:"order,omitempty"`
	CostAllocations             []StockMovementCostAllocation `json:"cost_allocations"`
}

// TransactionHistoryEntry is the cross-domain operational activity feed. It
// intentionally differs from Movement: movements describe stock ledger
// changes, while this read combines stock events with orders, refunds, and
// repair checkout payments for one chronological workspace view.
type TransactionHistoryEntry struct {
	ID            string    `json:"id"`
	EventType     string    `json:"event_type"`
	Reference     string    `json:"reference"`
	OccurredAt    time.Time `json:"occurred_at"`
	Status        string    `json:"status"`
	Channel       string    `json:"channel,omitempty"`
	CustomerName  *string   `json:"customer_name,omitempty"`
	CustomerPhone *string   `json:"customer_phone,omitempty"`
	PaymentMethod string    `json:"payment_method,omitempty"`
	Amount        string    `json:"amount,omitempty"`
	CurrencyCode  string    `json:"currency_code,omitempty"`
	ShopID        string    `json:"shop_id,omitempty"`
	ShopName      string    `json:"shop_name,omitempty"`
	Quantity      string    `json:"quantity,omitempty"`
	ProductName   string    `json:"product_name,omitempty"`
	VariantName   string    `json:"variant_name,omitempty"`
	SKU           string    `json:"sku,omitempty"`
	Details       string    `json:"details,omitempty"`
}

type TransactionOrderDetail struct {
	ID              string     `json:"id"`
	OrderNumber     string     `json:"order_number"`
	Channel         string     `json:"channel"`
	Status          string     `json:"status"`
	CurrencyCode    string     `json:"currency_code"`
	Subtotal        string     `json:"subtotal"`
	DiscountTotal   string     `json:"discount_total"`
	TaxTotal        string     `json:"tax_total"`
	ShippingTotal   string     `json:"shipping_total"`
	GrandTotal      string     `json:"grand_total"`
	CustomerName    string     `json:"customer_name,omitempty"`
	CustomerPhone   string     `json:"customer_phone,omitempty"`
	ShopID          string     `json:"shop_id,omitempty"`
	ShopName        string     `json:"shop_name,omitempty"`
	DeliveryName    string     `json:"delivery_name,omitempty"`
	DeliveryContact string     `json:"delivery_contact,omitempty"`
	Note            string     `json:"note,omitempty"`
	PaymentType     string     `json:"payment_type,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	PlacedAt        *time.Time `json:"placed_at,omitempty"`
}

type TransactionOrderLine struct {
	ID               string `json:"id"`
	Description      string `json:"description"`
	ProductName      string `json:"product_name,omitempty"`
	VariantName      string `json:"variant_name,omitempty"`
	SKU              string `json:"sku,omitempty"`
	Quantity         string `json:"quantity"`
	UnitPrice        string `json:"unit_price"`
	OriginalUnitCost string `json:"original_unit_cost"`
	OriginalCost     string `json:"original_cost"`
	CostPosted       bool   `json:"cost_posted"`
	DiscountAmount   string `json:"discount_amount"`
	TaxAmount        string `json:"tax_amount"`
	LineTotal        string `json:"line_total"`
	GrossProfit      string `json:"gross_profit"`
	GrossMargin      string `json:"gross_margin"`
}

type TransactionPayment struct {
	ID         string     `json:"id"`
	Method     string     `json:"method"`
	Status     string     `json:"status"`
	Amount     string     `json:"amount"`
	CapturedAt *time.Time `json:"captured_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type TransactionRefund struct {
	ID        string    `json:"id"`
	PaymentID string    `json:"payment_id"`
	Status    string    `json:"status"`
	Amount    string    `json:"amount"`
	Reason    string    `json:"reason,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type TransactionHistoryDetail struct {
	Entry       TransactionHistoryEntry `json:"entry"`
	Order       *TransactionOrderDetail `json:"order,omitempty"`
	Lines       []TransactionOrderLine  `json:"lines"`
	Payments    []TransactionPayment    `json:"payments"`
	Refunds     []TransactionRefund     `json:"refunds"`
	TotalCost   string                  `json:"total_cost"`
	GrossProfit string                  `json:"gross_profit"`
	GrossMargin string                  `json:"gross_margin"`
}

type StockInRequest struct {
	PurchaseOrderID       string     `json:"purchase_order_id"`
	PurchaseOrderLineID   string     `json:"purchase_order_line_id"`
	VariantID             string     `json:"variant_id"`
	DestinationLocationID string     `json:"destination_location_id"`
	UnitID                string     `json:"unit_id,omitempty"`
	ReceiptNumber         string     `json:"receipt_number"`
	BatchNumber           string     `json:"batch_number,omitempty"`
	ExpiresAt             *time.Time `json:"expires_at,omitempty"`
	Quantity              string     `json:"quantity"`
	UnitCost              string     `json:"unit_cost,omitempty"`
	EventKey              string     `json:"event_key"`
}

type ReceivableLine struct {
	PurchaseOrderID       string  `json:"purchase_order_id"`
	PurchaseOrderLineID   string  `json:"purchase_order_line_id"`
	OrderNumber           string  `json:"order_number"`
	SupplierName          string  `json:"supplier_name"`
	VariantID             string  `json:"variant_id"`
	VariantName           string  `json:"variant_name"`
	SKU                   string  `json:"sku"`
	DestinationLocationID string  `json:"destination_location_id"`
	DestinationName       string  `json:"destination_name"`
	UnitID                *string `json:"unit_id,omitempty"`
	QuantityRemaining     string  `json:"quantity_remaining"`
	UnitCost              string  `json:"unit_cost"`
}

type StockOutRequest struct {
	OrderLineID      string `json:"order_line_id"`
	VariantID        string `json:"variant_id"`
	SourceLocationID string `json:"source_location_id"`
	UnitID           string `json:"unit_id,omitempty"`
	EventKey         string `json:"event_key"`
	Quantity         string `json:"quantity"`
}

type PriceListRequest struct {
	Code         string `json:"code"`
	CurrencyCode string `json:"currency_code"`
	IsDefault    *bool  `json:"is_default,omitempty"`
}

type ProductPriceRequest struct {
	PriceListID string     `json:"price_list_id"`
	VariantID   string     `json:"variant_id"`
	Amount      string     `json:"amount"`
	ValidFrom   *time.Time `json:"valid_from,omitempty"`
	ValidUntil  *time.Time `json:"valid_until,omitempty"`
}

type PromotionRequest struct {
	Name            string     `json:"name"`
	PromotionType   string     `json:"promotion_type"`
	Value           string     `json:"value"`
	MinimumSubtotal string     `json:"minimum_subtotal,omitempty"`
	UsageLimit      *int       `json:"usage_limit,omitempty"`
	StartsAt        *time.Time `json:"starts_at,omitempty"`
	EndsAt          *time.Time `json:"ends_at,omitempty"`
	IsActive        *bool      `json:"is_active,omitempty"`
}

type PromotionCodeRequest struct {
	PromotionID string `json:"promotion_id"`
	Code        string `json:"code"`
	IsActive    *bool  `json:"is_active,omitempty"`
	UsageLimit  *int   `json:"usage_limit,omitempty"`
}

type PromotionProductRequest struct {
	PromotionID string `json:"promotion_id"`
	ProductID   string `json:"product_id"`
	VariantID   string `json:"variant_id,omitempty"`
}
