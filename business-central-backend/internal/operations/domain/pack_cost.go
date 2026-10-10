package domain

import "errors"

// SplitPackCost distributes whole currency cents across whole output units.
// It preserves the exact source value with at most two FIFO cost tiers.
func SplitPackCost(totalCents int64, outputUnits int64) (higherUnits, higherUnitCents, lowerUnits, lowerUnitCents int64, err error) {
	if totalCents < 0 || outputUnits < 1 {
		return 0, 0, 0, 0, errors.New("stock conversion cost and output quantity are invalid")
	}
	lowerUnitCents = totalCents / outputUnits
	higherUnits = totalCents % outputUnits
	higherUnitCents = lowerUnitCents + 1
	lowerUnits = outputUnits - higherUnits
	return
}
