package dto

// StockReductionRequest removes a positive quantity in the variant's base unit.
// It never edits an existing movement or creates a commercial sale.
type StockReductionRequest struct {
	VariantID        string `json:"variant_id"`
	SourceLocationID string `json:"source_location_id"`
	Quantity         string `json:"quantity"`
	Reason           string `json:"reason"`
	EventKey         string `json:"event_key"`
}
