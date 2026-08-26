package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/catalog/application/dto"
)

type UpdateProduct struct {
	Actor     *authdto.Claims
	ProductID string
	Request   dto.ProductRequest
}
