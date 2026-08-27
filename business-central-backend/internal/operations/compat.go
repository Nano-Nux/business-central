// Package operations preserves legacy DTO imports during the bounded-context migration.
package operations

import "business-central-backend/internal/operations/application/dto"

type PriceList = dto.PriceList
type PaymentType = dto.PaymentType
type PaymentTypeCategory = dto.PaymentTypeCategory
type PaymentTypeRequest = dto.PaymentTypeRequest
type ProductPrice = dto.ProductPrice
type Promotion = dto.Promotion
type PromotionCode = dto.PromotionCode
type Movement = dto.Movement
type StockInRequest = dto.StockInRequest
type StockOutRequest = dto.StockOutRequest
type PriceListRequest = dto.PriceListRequest
type ProductPriceRequest = dto.ProductPriceRequest
type PromotionRequest = dto.PromotionRequest
type PromotionCodeRequest = dto.PromotionCodeRequest
type PromotionProductRequest = dto.PromotionProductRequest
