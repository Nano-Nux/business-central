package entities

import (
	"errors"
	"strings"
)

var ErrRequired = errors.New("a required catalog field is missing")

func Required(value string) bool { return strings.TrimSpace(value) != "" }

// ProductAggregate is the catalog aggregate root. Variants are addressed by
// product ID at the application boundary and persisted by the adapter.
type ProductAggregate struct {
	Name        string
	ProductType string
}

func NewProduct(name, productType string) (ProductAggregate, error) {
	if err := Product(name, productType); err != nil {
		return ProductAggregate{}, err
	}
	if strings.TrimSpace(productType) == "" {
		productType = "PHYSICAL"
	}
	return ProductAggregate{Name: strings.TrimSpace(name), ProductType: strings.ToUpper(strings.TrimSpace(productType))}, nil
}

type VariantEntity struct {
	SKU        string
	Name       string
	BaseUnitID string
}

func NewVariant(sku, name, baseUnitID string) (VariantEntity, error) {
	if err := Variant(sku, name, baseUnitID); err != nil {
		return VariantEntity{}, err
	}
	return VariantEntity{SKU: strings.TrimSpace(sku), Name: strings.TrimSpace(name), BaseUnitID: baseUnitID}, nil
}

func Product(name, productType string) error {
	if !Required(name) {
		return ErrRequired
	}
	if strings.TrimSpace(productType) == "" {
		return nil
	}
	return nil
}

func Variant(sku, name, baseUnitID string) error {
	if !Required(sku) || !Required(name) || !Required(baseUnitID) {
		return ErrRequired
	}
	return nil
}

func Unit(code, name string) error {
	if !Required(code) || !Required(name) {
		return ErrRequired
	}
	return nil
}

func Conversion(fromUnitID, toUnitID, multiplier string) error {
	if !Required(fromUnitID) || !Required(toUnitID) || !Required(multiplier) {
		return ErrRequired
	}
	return nil
}

func Brand(name string, slug *string) error {
	if !Required(name) {
		return ErrRequired
	}
	return nil
}

func Category(name string, slug *string) error {
	if !Required(name) {
		return ErrRequired
	}
	return nil
}

func Image(imageURL string) error {
	if !Required(imageURL) {
		return ErrRequired
	}
	return nil
}
