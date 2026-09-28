package domain

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var quantityToken = regexp.MustCompile(`(?i)^quantity=([^\s]+)$`)

var (
	ErrMissingProduct   = errors.New("product name or SKU is required")
	ErrMissingQuantity  = errors.New("exactly one quantity=<positive number> token is required")
	ErrInvalidQuantity  = errors.New("quantity must be a positive number")
	ErrUnexpectedTokens = errors.New("only one optional SKU may follow quantity")
)

type TakeOrderCommand struct {
	ProductName string
	Quantity    float64
	SKU         string
}

// ParseTakeOrder implements the public, keyword-based command grammar. It does
// not infer quantity by position and never silently discards trailing tokens.
func ParseTakeOrder(text string) (TakeOrderCommand, error) {
	fields := strings.Fields(strings.TrimSpace(text))
	if len(fields) == 0 {
		return TakeOrderCommand{}, ErrMissingProduct
	}
	command := strings.ToLower(strings.SplitN(fields[0], "@", 2)[0])
	if command != "/takeorder" {
		return TakeOrderCommand{}, errors.New("not a takeorder command")
	}
	quantityIndex := -1
	quantityValue := ""
	for i := 1; i < len(fields); i++ {
		if match := quantityToken.FindStringSubmatch(fields[i]); match != nil {
			if quantityIndex != -1 {
				return TakeOrderCommand{}, ErrMissingQuantity
			}
			quantityIndex, quantityValue = i, match[1]
		}
	}
	if quantityIndex == -1 {
		return TakeOrderCommand{}, ErrMissingQuantity
	}
	name := strings.TrimSpace(strings.Join(fields[1:quantityIndex], " "))
	if len(fields[quantityIndex+1:]) > 1 {
		return TakeOrderCommand{}, ErrUnexpectedTokens
	}
	quantity, err := strconv.ParseFloat(quantityValue, 64)
	if err != nil || quantity <= 0 || math.IsNaN(quantity) || math.IsInf(quantity, 0) {
		return TakeOrderCommand{}, ErrInvalidQuantity
	}
	sku := ""
	if quantityIndex+1 < len(fields) {
		sku = strings.TrimSpace(fields[quantityIndex+1])
	}
	if name == "" && sku == "" {
		return TakeOrderCommand{}, ErrMissingProduct
	}
	return TakeOrderCommand{ProductName: name, Quantity: quantity, SKU: sku}, nil
}

func NormalizeName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}
