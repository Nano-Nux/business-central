package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/operations/application/dto"
)

type CreatePriceList struct {
	Actor   *authdto.Claims
	Request dto.PriceListRequest
}
