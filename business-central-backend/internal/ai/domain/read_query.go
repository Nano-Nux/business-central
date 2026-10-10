package domain

// ReadQuery is an untrusted model proposal, never SQL. Scope and permissions
// are supplied separately by the authenticated application, not by the model.
type ReadQuery struct {
	Dataset    string          `json:"dataset"`
	Columns    []string        `json:"columns,omitempty"`
	Filters    []ReadFilter    `json:"filters,omitempty"`
	Aggregates []ReadAggregate `json:"aggregates,omitempty"`
	GroupBy    []string        `json:"group_by,omitempty"`
	OrderBy    []ReadOrder     `json:"order_by,omitempty"`
	Limit      int             `json:"limit,omitempty"`
}
type ReadFilter struct {
	Column   string `json:"column"`
	Operator string `json:"operator"`
	Value    string `json:"value"`
}
type ReadAggregate struct {
	Function string `json:"function"`
	Column   string `json:"column"`
}
type ReadOrder struct {
	Column     string `json:"column"`
	Descending bool   `json:"descending,omitempty"`
}
type ReadColumn struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Monetary bool   `json:"monetary,omitempty"`
}
type ReadDataset struct {
	Name    string       `json:"name"`
	Scope   string       `json:"scope"`
	Columns []ReadColumn `json:"columns"`
}
