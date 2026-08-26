package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/pos/application/dto"
)

type CreateShop struct {
	Actor   *authdto.Claims
	Request dto.ShopRequest
}
