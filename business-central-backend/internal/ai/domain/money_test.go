package domain

import (
	"encoding/json"
	"testing"
)

func TestFormatMoneyRecords(t *testing.T) {
	catalog := []ReadDataset{{Name: "sales_profit", Columns: []ReadColumn{
		{Name: "gross_profit", Monetary: true}, {Name: "revenue", Monetary: true},
		{Name: "cost", Monetary: true}, {Name: "quantity"},
	}}}
	query := ReadQuery{Dataset: "sales_profit", Aggregates: []ReadAggregate{
		{Function: "sum", Column: "gross_profit"}, {Function: "count", Column: "revenue"},
	}}
	rows := []map[string]any{
		{"sum_gross_profit": 150000, "revenue": 550000, "cost": nil, "count": 4, "count_revenue": 4, "quantity": 150000},
		{"currency_code": "EUR", "sum_gross_profit": json.Number("-7000.005"), "revenue": "9007199254740993.12"},
		{"currency_code": " ", "gross_profit": 0},
	}
	formatted := FormatMoneyRecords(rows, query, catalog, "MMK")
	for key, want := range map[string]any{"sum_gross_profit": "150,000.00 MMK", "revenue": "550,000.00 MMK", "cost": nil, "count": 4, "count_revenue": 4, "quantity": 150000} {
		if formatted[0][key] != want {
			t.Errorf("%s = %v, want %v", key, formatted[0][key], want)
		}
	}
	if formatted[1]["sum_gross_profit"] != "-7,000.01 EUR" || formatted[1]["revenue"] != "9,007,199,254,740,993.12 EUR" {
		t.Fatalf("record currency or exact decimal formatting lost: %v", formatted[1])
	}
	if formatted[2]["gross_profit"] != "0.00 MMK" {
		t.Fatal("empty currency must use merchant default")
	}
	if rows[0]["sum_gross_profit"] != 150000 {
		t.Fatal("original query records were modified")
	}
	if got := FormatMoneyRecords(rows, ReadQuery{Dataset: "unknown"}, catalog, "USD"); got[0]["revenue"] != 550000 {
		t.Fatal("unknown monetary fields must not be guessed")
	}
}

func TestFormatAmount(t *testing.T) {
	for _, tc := range []struct {
		value any
		want  string
	}{
		{json.Number("1e6"), "1,000,000.00"}, {"0.005", "0.01"}, {"-0.004", "0.00"}, {"invalid", ""}, {nil, ""},
	} {
		got, ok := formatAmount(tc.value)
		if got != tc.want || ok != (tc.want != "") {
			t.Errorf("formatAmount(%v) = %q, %v; want %q", tc.value, got, ok, tc.want)
		}
	}
}
