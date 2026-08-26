package inbound

import (
	"context"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/reports/application/dto"
)

type Reports interface {
	SalesSummary(context.Context, *authdto.Claims, app.ListQuery) (dto.SalesSummary, error)
	SalesByDay(context.Context, *authdto.Claims, app.ListQuery) ([]dto.SalesByDay, int, error)
	TopProducts(context.Context, *authdto.Claims, app.ListQuery) ([]dto.TopProduct, int, error)
}
