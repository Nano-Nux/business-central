package domain

import entities "business-central-backend/internal/operations/domain/entities"

func ValidateStockIn(purchaseOrderID, lineID, variantID, locationID, quantity, unitCost, eventKey string) error {
	return entities.StockIn(purchaseOrderID, lineID, variantID, locationID, quantity, unitCost, eventKey)
}
