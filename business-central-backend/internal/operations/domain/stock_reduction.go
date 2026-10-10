package domain

import (
	"errors"
	"math/big"
	"regexp"
	"strings"
	"unicode/utf8"
)

var stockQuantityPattern = regexp.MustCompile(`^[0-9]{1,14}(\.[0-9]{1,6})?$`)

func ValidateStockReduction(quantity, reason, eventKey string) error {
	if !stockQuantityPattern.MatchString(quantity) {
		return errors.New("Quantity must be a positive number with at most six decimal places.")
	}
	value, ok := new(big.Rat).SetString(quantity)
	if !ok || value.Sign() <= 0 {
		return errors.New("Quantity must be greater than zero.")
	}
	if strings.TrimSpace(reason) == "" || utf8.RuneCountInString(reason) > 1000 {
		return errors.New("A reduction reason of at most 1000 characters is required.")
	}
	if strings.TrimSpace(eventKey) == "" || len(eventKey) > 255 {
		return errors.New("A stable event key of at most 255 characters is required.")
	}
	return nil
}
