package application

import (
	"context"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/reports/application/dto"
	"business-central-backend/internal/reports/ports/inbound"
	"business-central-backend/internal/reports/ports/outbound"
)

type Service struct{ outbound.Repository }

func NewService(repository outbound.Repository) *Service { return &Service{Repository: repository} }

var _ inbound.Reports = (*Service)(nil)

func (s *Service) SalesSummary(ctx context.Context, claims *authdto.Claims, query app.ListQuery) (dto.SalesSummary, error) {
	return s.Repository.SalesSummary(ctx, claims, query)
}

func (s *Service) SalesByDay(ctx context.Context, claims *authdto.Claims, query app.ListQuery) ([]dto.SalesByDay, int, error) {
	return s.Repository.SalesByDay(ctx, claims, query)
}

func (s *Service) TopProducts(ctx context.Context, claims *authdto.Claims, query app.ListQuery) ([]dto.TopProduct, int, error) {
	return s.Repository.TopProducts(ctx, claims, query)
}
