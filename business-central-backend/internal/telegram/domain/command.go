package domain

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

var quantityToken = regexp.MustCompile(`(?i)^quantity=([^\s]+)$`)

var (
	ErrMissingProduct   = errors.New("product name or SKU is required")
	ErrMissingQuantity  = errors.New("exactly one quantity=<positive number> token is required")
	ErrInvalidQuantity  = errors.New("quantity must be positive, below 100000000000000, and use at most six decimal places")
	ErrUnexpectedTokens = errors.New("only one optional SKU may follow quantity")
)

const MaxOrderItems = 20

type TakeOrderItem struct {
	ProductName string
	Quantity    float64
	SKU         string
}

type TakeOrderCommand struct {
	CustomerName string
	Items        []TakeOrderItem
}

// ParseTakeOrder implements the public, keyword-based command grammar. It does
// not infer quantity by position and never silently discards trailing tokens.
func ParseTakeOrder(text string) (TakeOrderCommand, error) {
	lines := strings.Split(strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n")), "\n")
	fields := strings.Fields(lines[0])
	if len(fields) == 0 {
		return TakeOrderCommand{}, ErrMissingProduct
	}
	command := strings.ToLower(strings.SplitN(fields[0], "@", 2)[0])
	if command != "/takeorder" {
		return TakeOrderCommand{}, errors.New("not a takeorder command")
	}
	lines[0] = strings.Join(fields[1:], " ")
	result := TakeOrderCommand{Items: []TakeOrderItem{}}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(strings.ToLower(line), "customer=") {
			name := strings.TrimSpace(line[len("customer="):])
			if name == "" || utf8.RuneCountInString(name) > 255 || strings.IndexFunc(name, unicode.IsControl) >= 0 || result.CustomerName != "" || len(result.Items) > 0 {
				return TakeOrderCommand{}, errors.New("use one customer=<name> line before the products, with 1–255 characters")
			}
			result.CustomerName = name
			continue
		}
		if len(result.Items) == MaxOrderItems {
			return TakeOrderCommand{}, errors.New("an order supports at most 20 product lines")
		}
		item, err := parseItem(line)
		if err != nil {
			return TakeOrderCommand{}, err
		}
		result.Items = append(result.Items, item)
	}
	if len(result.Items) == 0 {
		return TakeOrderCommand{}, ErrMissingProduct
	}
	return result, nil
}

func parseItem(line string) (TakeOrderItem, error) {
	fields := strings.Fields(line)
	quantityIndex := -1
	quantityValue := ""
	for i := 0; i < len(fields); i++ {
		if match := quantityToken.FindStringSubmatch(fields[i]); match != nil {
			if quantityIndex != -1 {
				return TakeOrderItem{}, ErrMissingQuantity
			}
			quantityIndex, quantityValue = i, match[1]
		}
	}
	if quantityIndex == -1 {
		return TakeOrderItem{}, ErrMissingQuantity
	}
	name := strings.TrimSpace(strings.Join(fields[:quantityIndex], " "))
	if len(fields[quantityIndex+1:]) > 1 {
		return TakeOrderItem{}, ErrUnexpectedTokens
	}
	quantity, err := strconv.ParseFloat(quantityValue, 64)
	if err != nil || !ValidQuantity(quantity) {
		return TakeOrderItem{}, ErrInvalidQuantity
	}
	sku := ""
	if quantityIndex+1 < len(fields) {
		sku = strings.TrimSpace(fields[quantityIndex+1])
	}
	if name == "" && sku == "" {
		return TakeOrderItem{}, ErrMissingProduct
	}
	return TakeOrderItem{ProductName: name, Quantity: quantity, SKU: sku}, nil
}

func ValidQuantity(quantity float64) bool {
	return !math.IsNaN(quantity) && !math.IsInf(quantity, 0) && quantity >= 0.000001 && quantity < 100000000000000 && math.Abs(quantity-math.Round(quantity*1000000)/1000000) < 0.000000000001
}

func NormalizeName(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}
