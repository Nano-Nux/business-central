package commands

import (
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/operations/application/dto"
)

type StockIn struct {
	Actor   *authdto.Claims
	Request dto.StockInRequest
}
