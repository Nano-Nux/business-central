package dto

import "time"

type StockConversionRule struct {
	ID                     string    `json:"id"`
	MerchantID             string    `json:"merchant_id"`
	ProductID              string    `json:"product_id"`
	ProductName            string    `json:"product_name"`
	SourceVariantID        string    `json:"source_variant_id"`
	SourceVariantName      string    `json:"source_variant_name"`
	SourceSKU              string    `json:"source_sku"`
	DestinationVariantID   string    `json:"destination_variant_id"`
	DestinationVariantName string    `json:"destination_variant_name"`
	DestinationSKU         string    `json:"destination_sku"`
	DestinationQuantity    int       `json:"destination_quantity"`
	IsActive               bool      `json:"is_active"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type StockConversionRuleRequest struct {
	SourceVariantID      string `json:"source_variant_id"`
	DestinationVariantID string `json:"destination_variant_id"`
	DestinationQuantity  int    `json:"destination_quantity"`
	IsActive             *bool  `json:"is_active,omitempty"`
}

type StockConversionRequest struct {
	RuleID     string `json:"rule_id"`
	LocationID string `json:"location_id"`
	Quantity   int    `json:"quantity"`
	Notes      string `json:"notes,omitempty"`
}

type StockConversion struct {
	ID                    string    `json:"id"`
	RuleID                string    `json:"rule_id"`
	LocationID            string    `json:"location_id"`
	SourceVariantID       string    `json:"source_variant_id"`
	DestinationVariantID  string    `json:"destination_variant_id"`
	SourceQuantity        int       `json:"source_quantity"`
	DestinationQuantity   int       `json:"destination_quantity"`
	TotalCost             string    `json:"total_cost"`
	CreatedByMembershipID string    `json:"created_by_membership_id"`
	AppliedAt             time.Time `json:"applied_at"`
}

type StockConversionPreview struct {
	RuleID              string `json:"rule_id"`
	LocationID          string `json:"location_id"`
	SourceQuantity      int    `json:"source_quantity"`
	DestinationQuantity int    `json:"destination_quantity"`
	SourceBefore        string `json:"source_before"`
	SourceAfter         string `json:"source_after"`
	DestinationBefore   string `json:"destination_before"`
	DestinationAfter    string `json:"destination_after"`
}
