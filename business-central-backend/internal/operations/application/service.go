package application

import (
	"context"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	domainops "business-central-backend/internal/operations/domain/entities"
	operationsinbound "business-central-backend/internal/operations/ports/inbound"
	operationsoutbound "business-central-backend/internal/operations/ports/outbound"
)

type Service struct{ operationsoutbound.Repository }

func NewService(port operationsoutbound.Repository) *Service {
	return &Service{Repository: port}
}

var _ operationsinbound.Operations = (*Service)(nil)

func invalid(message string) error { return app.Validation(message, nil) }

func (s *Service) CreatePriceList(ctx context.Context, claims *authdto.Claims, request operationsdto.PriceListRequest) (operationsdto.PriceList, error) {
	if _, err := domainops.NewPriceList(request.Code, request.CurrencyCode); err != nil {
		return operationsdto.PriceList{}, invalid("Price list code and currency_code are required.")
	}
	return s.Repository.CreatePriceList(ctx, claims, request)
}

func (s *Service) UpdatePriceList(ctx context.Context, claims *authdto.Claims, id string, request operationsdto.PriceListRequest) (operationsdto.PriceList, error) {
	if _, err := domainops.NewPriceList(request.Code, request.CurrencyCode); err != nil {
		return operationsdto.PriceList{}, invalid("Price list code and currency_code are required.")
	}
	return s.Repository.UpdatePriceList(ctx, claims, id, request)
}

func (s *Service) UpsertPrice(ctx context.Context, claims *authdto.Claims, request operationsdto.ProductPriceRequest) (operationsdto.ProductPrice, error) {
	if err := domainops.Price(request.PriceListID, request.VariantID, request.Amount); err != nil {
		return operationsdto.ProductPrice{}, invalid("price_list_id, variant_id, and amount are required.")
	}
	return s.Repository.UpsertPrice(ctx, claims, request)
}

func (s *Service) CreatePromotion(ctx context.Context, claims *authdto.Claims, request operationsdto.PromotionRequest) (operationsdto.Promotion, error) {
	if _, err := domainops.NewPromotion(request.Name, request.PromotionType, request.Value); err != nil {
		return operationsdto.Promotion{}, invalid("name, promotion_type, and value are required.")
	}
	return s.Repository.CreatePromotion(ctx, claims, request)
}

func (s *Service) UpdatePromotion(ctx context.Context, claims *authdto.Claims, id string, request operationsdto.PromotionRequest) (operationsdto.Promotion, error) {
	if _, err := domainops.NewPromotion(request.Name, request.PromotionType, request.Value); err != nil {
		return operationsdto.Promotion{}, invalid("name, promotion_type, and value are required.")
	}
	return s.Repository.UpdatePromotion(ctx, claims, id, request)
}

func (s *Service) CreatePromotionCode(ctx context.Context, claims *authdto.Claims, request operationsdto.PromotionCodeRequest) (operationsdto.PromotionCode, error) {
	if err := domainops.PromotionCode(request.PromotionID, request.Code); err != nil {
		return operationsdto.PromotionCode{}, invalid("promotion_id and code are required.")
	}
	return s.Repository.CreatePromotionCode(ctx, claims, request)
}

func (s *Service) AssignPromotionProduct(ctx context.Context, claims *authdto.Claims, request operationsdto.PromotionProductRequest) error {
	if err := domainops.PromotionProduct(request.PromotionID, request.ProductID); err != nil {
		return invalid("promotion_id and product_id are required.")
	}
	return s.Repository.AssignPromotionProduct(ctx, claims, request)
}

func (s *Service) StockIn(ctx context.Context, claims *authdto.Claims, request operationsdto.StockInRequest) (operationsdto.Movement, error) {
	if err := domainops.StockIn(request.PurchaseOrderID, request.PurchaseOrderLineID, request.VariantID, request.DestinationLocationID, request.Quantity, request.UnitCost, request.EventKey); err != nil {
		return operationsdto.Movement{}, invalid("variant_id, destination_location_id, a positive quantity, and event_key are required. When supplied, unit_cost must be non-negative. Purchase order and line IDs must be supplied together when receiving an order.")
	}
	if request.PurchaseOrderID != "" && request.ReceiptNumber == "" {
		return operationsdto.Movement{}, invalid("receipt_number is required when receiving a purchase order.")
	}
	return s.Repository.StockIn(ctx, claims, request)
}

func (s *Service) StockOut(ctx context.Context, claims *authdto.Claims, request operationsdto.StockOutRequest) (operationsdto.Movement, error) {
	if err := domainops.StockOut(request.OrderLineID, request.VariantID, request.SourceLocationID, request.Quantity, request.EventKey); err != nil {
		return operationsdto.Movement{}, invalid("order_line_id, variant_id, source_location_id, quantity, and event_key are required.")
	}
	return s.Repository.StockOut(ctx, claims, request)
}

func (s *Service) ListTransactionHistory(ctx context.Context, claims *authdto.Claims, query app.ListQuery) ([]operationsdto.TransactionHistoryEntry, int, error) {
	return s.Repository.ListTransactionHistory(ctx, claims, query)
}
