package postgres

import catalogdto "business-central-backend/internal/catalog/application/dto"

// DTO mappings are kept at the outbound boundary so application contracts do
// not depend on database adapter types.
type Product = catalogdto.Product
type Variant = catalogdto.Variant
type AttributeDefinition = catalogdto.AttributeDefinition
type AttributeOption = catalogdto.AttributeOption
type Unit = catalogdto.Unit
type Conversion = catalogdto.Conversion
type Brand = catalogdto.Brand
type Category = catalogdto.Category
type Image = catalogdto.Image
type InventoryPolicy = catalogdto.InventoryPolicy
type ProductRequest = catalogdto.ProductRequest
type Barcode = catalogdto.Barcode
type BarcodeRequest = catalogdto.BarcodeRequest
type VariantRequest = catalogdto.VariantRequest
type AttributeDefinitionRequest = catalogdto.AttributeDefinitionRequest
type AttributeOptionRequest = catalogdto.AttributeOptionRequest
type UnitRequest = catalogdto.UnitRequest
type ConversionRequest = catalogdto.ConversionRequest
type BrandRequest = catalogdto.BrandRequest
type CategoryRequest = catalogdto.CategoryRequest
type ImageRequest = catalogdto.ImageRequest
type InventoryPolicyRequest = catalogdto.InventoryPolicyRequest
