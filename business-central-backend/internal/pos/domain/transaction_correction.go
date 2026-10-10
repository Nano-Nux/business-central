package domain

import (
	"errors"
	"math/big"
	"regexp"
)

var correctionDecimal = regexp.MustCompile(`^[0-9]+(?:\.[0-9]+)?$`)

// ValidateCorrectionLine rejects non-finite values and invalid commercial amounts
// before any aggregate or inventory record is touched.
func ValidateCorrectionLine(quantity, price, discount, tax string) error {
	values := make([]*big.Rat, 4)
	for i, value := range []string{quantity, price, discount, tax} {
		if i > 1 && value == "" {
			value = "0"
		}
		if len(value) > 32 || !correctionDecimal.MatchString(value) {
			return errors.New("Items require a positive quantity and non-negative decimal prices, discounts and tax.")
		}
		values[i] = new(big.Rat)
		if _, ok := values[i].SetString(value); !ok {
			return errors.New("Invalid item amount.")
		}
	}
	if values[0].Sign() <= 0 {
		return errors.New("Item quantity must be greater than zero.")
	}
	gross := new(big.Rat).Mul(values[0], values[1])
	if values[2].Cmp(gross) > 0 {
		return errors.New("Item discount cannot exceed its price times quantity.")
	}
	return nil
}
