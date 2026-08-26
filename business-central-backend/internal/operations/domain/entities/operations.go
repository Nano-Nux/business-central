package entities

import (
	"errors"
	"math/big"
	"strings"
)

var ErrRequired = errors.New("a required operations field is missing")

type PriceListAggregate struct {
	Code         string
	CurrencyCode string
}

func NewPriceList(code, currency string) (PriceListAggregate, error) {
	if err := PriceList(code, currency); err != nil {
		return PriceListAggregate{}, err
	}
	return PriceListAggregate{Code: strings.TrimSpace(code), CurrencyCode: strings.ToUpper(strings.TrimSpace(currency))}, nil
}

type PromotionAggregate struct {
	Name          string
	PromotionType string
	Value         string
}

func NewPromotion(name, promotionType, value string) (PromotionAggregate, error) {
	if err := Promotion(name, promotionType, value); err != nil {
		return PromotionAggregate{}, err
	}
	return PromotionAggregate{Name: strings.TrimSpace(name), PromotionType: strings.TrimSpace(promotionType), Value: strings.TrimSpace(value)}, nil
}

type InventoryMovementCommand struct {
	VariantID  string
	Quantity   string
	EventKey   string
	LocationID string
}

func Required(values ...string) error {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return ErrRequired
		}
	}
	return nil
}

func PriceList(code, currency string) error { return Required(code, currency) }
func Price(priceListID, variantID, amount string) error {
	return Required(priceListID, variantID, amount)
}
func Promotion(name, promotionType, value string) error    { return Required(name, promotionType, value) }
func PromotionCode(promotionID, code string) error         { return Required(promotionID, code) }
func PromotionProduct(promotionID, productID string) error { return Required(promotionID, productID) }
func StockIn(purchaseOrderID, lineID, variantID, locationID, quantity, unitCost, eventKey string) error {
	if err := Required(variantID, locationID, quantity, eventKey); err != nil {
		return err
	}
	hasOrder := strings.TrimSpace(purchaseOrderID) != ""
	hasLine := strings.TrimSpace(lineID) != ""
	if hasOrder != hasLine {
		return ErrRequired
	}
	quantityValue, quantityOK := new(big.Rat).SetString(strings.TrimSpace(quantity))
	if !quantityOK || quantityValue.Sign() <= 0 {
		return ErrRequired
	}
	if strings.TrimSpace(unitCost) != "" {
		costValue, costOK := new(big.Rat).SetString(strings.TrimSpace(unitCost))
		if !costOK || costValue.Sign() < 0 {
			return ErrRequired
		}
	}
	return nil
}
func StockOut(orderLineID, variantID, locationID, quantity, eventKey string) error {
	return Required(orderLineID, variantID, locationID, quantity, eventKey)
}
