// Package catalog exposes legacy DTO and constructor names. Persistence lives
// in adapters/outbound/postgres for the catalog bounded context.
package dto

import (
	"encoding/json"
	"time"

	"business-central-backend/internal/media"
)

type Product struct {
	ID              string     `json:"id"`
	MerchantID      string     `json:"merchant_id"`
	BrandID         *string    `json:"brand_id,omitempty"`
	Name            string     `json:"name"`
	Barcode         *string    `json:"barcode,omitempty"`
	Description     *string    `json:"description,omitempty"`
	ProductType     string     `json:"product_type"`
	ManufactureDate *time.Time `json:"manufacture_date,omitempty"`
	ExpiredDate     *time.Time `json:"expired_date,omitempty"`
	IsActive        bool       `json:"is_active"`
	CategoryIDs     []string   `json:"category_ids"`
	CategoryNames   []string   `json:"category_names"`
	Images          []Image    `json:"images"`
	SyncVersion     int64      `json:"sync_version,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}
type Variant struct {
	ID             string          `json:"id"`
	MerchantID     string          `json:"merchant_id"`
	ProductID      string          `json:"product_id"`
	SKU            string          `json:"sku"`
	Barcode        *string         `json:"barcode,omitempty"`
	Name           string          `json:"name"`
	Attributes     json.RawMessage `json:"attributes"`
	UnitOfMeasure  string          `json:"unit_of_measure"`
	BaseUnitID     string          `json:"base_unit_id"`
	IsStockTracked bool            `json:"is_stock_tracked"`
	Images         []Image         `json:"images"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
	SyncVersion    int64           `json:"sync_version,omitempty"`
}
type AttributeDefinition struct {
	ID          string            `json:"id"`
	MerchantID  string            `json:"merchant_id"`
	Code        string            `json:"code"`
	Name        string            `json:"name"`
	ValueType   string            `json:"value_type"`
	Options     []AttributeOption `json:"options"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
	SyncVersion int64             `json:"sync_version,omitempty"`
}
type AttributeOption struct {
	ID           string `json:"id"`
	MerchantID   string `json:"merchant_id"`
	DefinitionID string `json:"definition_id"`
	Value        string `json:"value"`
	Label        string `json:"label"`
	Position     int    `json:"position"`
	SyncVersion  int64  `json:"sync_version,omitempty"`
}
type Unit struct {
	ID                 string    `json:"id"`
	MerchantID         string    `json:"merchant_id"`
	MeasurementGroupID *string   `json:"measurement_group_id,omitempty"`
	Code               string    `json:"code"`
	Name               string    `json:"name"`
	Symbol             *string   `json:"symbol,omitempty"`
	DimensionCode      string    `json:"dimension_code"`
	AllowsDecimal      bool      `json:"allows_decimal"`
	IsActive           bool      `json:"is_active"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
	SyncVersion        int64     `json:"sync_version,omitempty"`
}
type Conversion struct {
	ID             string    `json:"id"`
	MerchantID     string    `json:"merchant_id"`
	FromUnitID     string    `json:"from_unit_id"`
	ToUnitID       string    `json:"to_unit_id"`
	Multiplier     string    `json:"multiplier"`
	AdditiveOffset string    `json:"additive_offset"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	SyncVersion    int64     `json:"sync_version,omitempty"`
}
type Brand struct {
	ID          string    `json:"id"`
	MerchantID  string    `json:"merchant_id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description *string   `json:"description,omitempty"`
	ImageURL    *string   `json:"image_url,omitempty"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
type Category struct {
	ID               string    `json:"id"`
	MerchantID       string    `json:"merchant_id"`
	ParentCategoryID *string   `json:"parent_category_id,omitempty"`
	Name             string    `json:"name"`
	Slug             string    `json:"slug"`
	Description      *string   `json:"description,omitempty"`
	ImageURL         *string   `json:"image_url,omitempty"`
	SortOrder        int       `json:"sort_order"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	SyncVersion      int64     `json:"sync_version,omitempty"`
}
type Image struct {
	ID         string    `json:"id"`
	MerchantID string    `json:"merchant_id"`
	ProductID  *string   `json:"product_id,omitempty"`
	VariantID  *string   `json:"variant_id,omitempty"`
	ImageURL   string    `json:"image_url"`
	SourceType string    `json:"source_type"`
	AltText    *string   `json:"alt_text,omitempty"`
	Position   int       `json:"position"`
	CreatedAt  time.Time `json:"created_at"`
}
type InventoryPolicy struct {
	ID                    string    `json:"id"`
	MerchantID            string    `json:"merchant_id"`
	VariantID             string    `json:"variant_id"`
	TrackBatches          bool      `json:"track_batches"`
	TrackExpiry           bool      `json:"track_expiry"`
	TrackSerials          bool      `json:"track_serials"`
	TrackUniqueAssets     bool      `json:"track_unique_assets"`
	TrackReservations     bool      `json:"track_reservations"`
	AllowUnitConversions  bool      `json:"allow_unit_conversions"`
	AllowPackBreaking     bool      `json:"allow_pack_breaking"`
	AllowMultipleBarcodes bool      `json:"allow_multiple_barcodes"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type ProductRequest struct {
	BrandID         *string                 `json:"brand_id"`
	Name            string                  `json:"name"`
	Barcode         *string                 `json:"barcode,omitempty"`
	Description     *string                 `json:"description,omitempty"`
	ProductType     string                  `json:"product_type,omitempty"`
	ManufactureDate *string                 `json:"manufacture_date,omitempty"`
	ExpiredDate     *string                 `json:"expired_date,omitempty"`
	IsActive        *bool                   `json:"is_active,omitempty"`
	CategoryIDs     *[]string               `json:"category_ids,omitempty"`
	StandardVariant *StandardVariantRequest `json:"standard_variant,omitempty"`
}
type Barcode struct {
	ID         string `json:"id"`
	Code       string `json:"code"`
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	IsPrimary  bool   `json:"is_primary"`
	IsActive   bool   `json:"is_active"`
}
type BarcodeRequest struct {
	Code       string `json:"code"`
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	IsPrimary  *bool  `json:"is_primary,omitempty"`
}
type StandardVariantRequest struct {
	BaseUnitID     string          `json:"base_unit_id"`
	Attributes     json.RawMessage `json:"attributes,omitempty"`
	IsStockTracked *bool           `json:"is_stock_tracked,omitempty"`
}
type VariantRequest struct {
	SKU            string          `json:"sku"`
	Barcode        *string         `json:"barcode,omitempty"`
	Name           string          `json:"name"`
	Attributes     json.RawMessage `json:"attributes,omitempty"`
	UnitOfMeasure  string          `json:"unit_of_measure,omitempty"`
	BaseUnitID     string          `json:"base_unit_id"`
	IsStockTracked *bool           `json:"is_stock_tracked,omitempty"`
}
type AttributeDefinitionRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	ValueType string `json:"value_type"`
}
type AttributeOptionRequest struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Position int    `json:"position"`
}
type UnitRequest struct {
	MeasurementGroupID *string `json:"measurement_group_id,omitempty"`
	Code               string  `json:"code"`
	Name               string  `json:"name"`
	Symbol             *string `json:"symbol,omitempty"`
	DimensionCode      string  `json:"dimension_code,omitempty"`
	AllowsDecimal      *bool   `json:"allows_decimal,omitempty"`
	IsActive           *bool   `json:"is_active,omitempty"`
}
type ConversionRequest struct {
	FromUnitID     string `json:"from_unit_id"`
	ToUnitID       string `json:"to_unit_id"`
	Multiplier     string `json:"multiplier"`
	AdditiveOffset string `json:"additive_offset,omitempty"`
	IsActive       *bool  `json:"is_active,omitempty"`
}
type BrandRequest struct {
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}
type CategoryRequest struct {
	ParentCategoryID *string `json:"parent_category_id,omitempty"`
	Name             string  `json:"name"`
	Slug             string  `json:"slug"`
	Description      *string `json:"description,omitempty"`
	ImageURL         *string `json:"image_url,omitempty"`
	SortOrder        *int    `json:"sort_order,omitempty"`
}
type ImageRequest struct {
	ImageURL   string  `json:"image_url"`
	SourceType string  `json:"source_type,omitempty"`
	AltText    *string `json:"alt_text,omitempty"`
	Position   *int    `json:"position,omitempty"`
}
type ImageUpload = media.Upload
type InventoryPolicyRequest struct {
	TrackBatches          *bool `json:"track_batches,omitempty"`
	TrackExpiry           *bool `json:"track_expiry,omitempty"`
	TrackSerials          *bool `json:"track_serials,omitempty"`
	TrackUniqueAssets     *bool `json:"track_unique_assets,omitempty"`
	TrackReservations     *bool `json:"track_reservations,omitempty"`
	AllowUnitConversions  *bool `json:"allow_unit_conversions,omitempty"`
	AllowPackBreaking     *bool `json:"allow_pack_breaking,omitempty"`
	AllowMultipleBarcodes *bool `json:"allow_multiple_barcodes,omitempty"`
}
