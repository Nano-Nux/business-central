package entities

import (
	"errors"
	"strings"
)

var ErrInvalidPaymentType = errors.New("payment type is invalid")

func PaymentType(name, category string) error {
	name = strings.TrimSpace(name)
	category = strings.ToUpper(strings.TrimSpace(category))
	if name == "" || len(name) > 255 {
		return ErrInvalidPaymentType
	}
	switch category {
	case "CASH", "ONLINE", "DIGITAL":
		return nil
	default:
		return ErrInvalidPaymentType
	}
}
