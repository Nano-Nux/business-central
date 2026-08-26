package inbound

import (
	"context"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
)

type Operations interface {
	ListPriceLists(context.Context, *authdto.Claims) ([]operationsdto.PriceList, error)
	CreatePriceList(context.Context, *authdto.Claims, operationsdto.PriceListRequest) (operationsdto.PriceList, error)
	UpdatePriceList(context.Context, *authdto.Claims, string, operationsdto.PriceListRequest) (operationsdto.PriceList, error)
	DeletePriceList(context.Context, *authdto.Claims, string) error
	ListPrices(context.Context, *authdto.Claims, string) ([]operationsdto.ProductPrice, error)
	UpsertPrice(context.Context, *authdto.Claims, operationsdto.ProductPriceRequest) (operationsdto.ProductPrice, error)
	DeletePrice(context.Context, *authdto.Claims, operationsdto.ProductPriceRequest) error
	ListPromotions(context.Context, *authdto.Claims) ([]operationsdto.Promotion, error)
	CreatePromotion(context.Context, *authdto.Claims, operationsdto.PromotionRequest) (operationsdto.Promotion, error)
	UpdatePromotion(context.Context, *authdto.Claims, string, operationsdto.PromotionRequest) (operationsdto.Promotion, error)
	DeletePromotion(context.Context, *authdto.Claims, string) error
	CreatePromotionCode(context.Context, *authdto.Claims, operationsdto.PromotionCodeRequest) (operationsdto.PromotionCode, error)
	ListPromotionCodes(context.Context, *authdto.Claims, string) ([]operationsdto.PromotionCode, error)
	DeletePromotionCode(context.Context, *authdto.Claims, string) error
	AssignPromotionProduct(context.Context, *authdto.Claims, operationsdto.PromotionProductRequest) error
	ListPromotionProducts(context.Context, *authdto.Claims, string) ([]operationsdto.PromotionProduct, error)
	RemovePromotionProduct(context.Context, *authdto.Claims, string) error
	ListMovements(context.Context, *authdto.Claims) ([]operationsdto.Movement, error)
	ListStockAssets(context.Context, *authdto.Claims) ([]operationsdto.StockAsset, error)
	ListStorage(context.Context, *authdto.Claims) ([]operationsdto.StorageItem, error)
	GetMovementDetail(context.Context, *authdto.Claims, string) (operationsdto.StockMovementDetail, error)
	ListTransactionHistory(context.Context, *authdto.Claims, app.ListQuery) ([]operationsdto.TransactionHistoryEntry, int, error)
	GetTransactionHistoryDetail(context.Context, *authdto.Claims, string) (operationsdto.TransactionHistoryDetail, error)
	ListReceivableLines(context.Context, *authdto.Claims) ([]operationsdto.ReceivableLine, error)
	StockIn(context.Context, *authdto.Claims, operationsdto.StockInRequest) (operationsdto.Movement, error)
	StockOut(context.Context, *authdto.Claims, operationsdto.StockOutRequest) (operationsdto.Movement, error)
}
