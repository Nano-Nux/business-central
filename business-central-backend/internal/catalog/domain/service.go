package domain

import entities "business-central-backend/internal/catalog/domain/entities"

func ValidateProductVariant(name, sku, baseUnitID string) error {
	if _, err := entities.NewProduct(name, "PHYSICAL"); err != nil {
		return err
	}
	_, err := entities.NewVariant(sku, name, baseUnitID)
	return err
}
