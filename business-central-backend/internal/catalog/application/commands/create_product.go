package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/catalog/application/dto"
)

type CreateProduct struct {
	Actor   *authdto.Claims
	Request dto.ProductRequest
}
