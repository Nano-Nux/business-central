// Package catalog preserves legacy DTO imports during the bounded-context migration.
package catalog

import "business-central-backend/internal/catalog/application/dto"

type Product = dto.Product
type Variant = dto.Variant
type Unit = dto.Unit
type Conversion = dto.Conversion
type Brand = dto.Brand
type Category = dto.Category
type Image = dto.Image
type InventoryPolicy = dto.InventoryPolicy
type ProductRequest = dto.ProductRequest
type VariantRequest = dto.VariantRequest
type UnitRequest = dto.UnitRequest
type ConversionRequest = dto.ConversionRequest
type BrandRequest = dto.BrandRequest
type CategoryRequest = dto.CategoryRequest
type ImageRequest = dto.ImageRequest
type ImageUpload = dto.ImageUpload
type InventoryPolicyRequest = dto.InventoryPolicyRequest
