package domain

import (
	"encoding/json"
	"math/big"
	"strings"
)

// FormatMoneyRecords attaches currency only to catalog-approved monetary outputs.
// Counts, quantities, percentages and null (unavailable) amounts stay unchanged.
// Copies preserve the original database results and do not perform conversion.
func FormatMoneyRecords(rows []map[string]any, query ReadQuery, catalog []ReadDataset, defaultCurrency string) []map[string]any {
	monetary := map[string]bool{}
	for _, dataset := range catalog {
		if dataset.Name != query.Dataset {
			continue
		}
		for _, column := range dataset.Columns {
			if column.Monetary {
				monetary[column.Name] = true
				for _, aggregate := range query.Aggregates {
					if aggregate.Column == column.Name && aggregate.Function != "count" {
						monetary[aggregate.Function+"_"+column.Name] = true
					}
				}
			}
		}
	}
	result := make([]map[string]any, len(rows))
	for i, row := range rows {
		currency := strings.TrimSpace(defaultCurrency)
		if explicit, ok := row["currency_code"].(string); ok && strings.TrimSpace(explicit) != "" {
			currency = strings.TrimSpace(explicit)
		}
		result[i] = make(map[string]any, len(row))
		for key, value := range row {
			result[i][key] = value
			if monetary[key] && value != nil && currency != "" {
				if amount, ok := formatAmount(value); ok {
					result[i][key] = amount + " " + currency
				}
			}
		}
	}
	return result
}

func formatAmount(value any) (string, bool) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", false
	}
	// Numeric database values may serialize as numbers or decimal strings.
	var decimal string
	if json.Unmarshal(encoded, &decimal) != nil {
		decimal = string(encoded)
	}
	amount, ok := new(big.Rat).SetString(decimal)
	if !ok {
		return "", false
	}
	negative := amount.Sign() < 0
	amount.Abs(amount).Mul(amount, big.NewRat(100, 1))
	cents, remainder := new(big.Int), new(big.Int)
	cents.QuoRem(amount.Num(), amount.Denom(), remainder)
	if remainder.Lsh(remainder, 1).Cmp(amount.Denom()) >= 0 {
		cents.Add(cents, big.NewInt(1))
	}
	digits := cents.String()
	for len(digits) < 3 {
		digits = "0" + digits
	}
	whole, fraction := digits[:len(digits)-2], digits[len(digits)-2:]
	for pos := len(whole) - 3; pos > 0; pos -= 3 {
		whole = whole[:pos] + "," + whole[pos:]
	}
	if negative && cents.Sign() != 0 {
		whole = "-" + whole
	}
	return whole + "." + fraction, true
}
