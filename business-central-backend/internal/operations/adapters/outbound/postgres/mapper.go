package postgres

import operationsdto "business-central-backend/internal/operations/application/dto"

// DTO mappings are kept at the outbound boundary so application contracts do
// not depend on database adapter types.
type PriceList = operationsdto.PriceList
type PaymentType = operationsdto.PaymentType
type PaymentTypeCategory = operationsdto.PaymentTypeCategory
type PaymentTypeRequest = operationsdto.PaymentTypeRequest
type ProductPrice = operationsdto.ProductPrice
type Promotion = operationsdto.Promotion
type PromotionCode = operationsdto.PromotionCode
type PromotionProduct = operationsdto.PromotionProduct
type Movement = operationsdto.Movement
type StockAsset = operationsdto.StockAsset
type StorageItem = operationsdto.StorageItem
type TransactionHistoryEntry = operationsdto.TransactionHistoryEntry
type ReceivableLine = operationsdto.ReceivableLine
type StockInRequest = operationsdto.StockInRequest
type StockOutRequest = operationsdto.StockOutRequest
type PriceListRequest = operationsdto.PriceListRequest
type ProductPriceRequest = operationsdto.ProductPriceRequest
type PromotionRequest = operationsdto.PromotionRequest
type PromotionCodeRequest = operationsdto.PromotionCodeRequest
type PromotionProductRequest = operationsdto.PromotionProductRequest
