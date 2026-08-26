package outbound

import (
	"context"

	authdto "business-central-backend/internal/auth/application/dto"
	catalogdto "business-central-backend/internal/catalog/application/dto"
)

// Repository is the catalog aggregate persistence port.
type Repository interface {
	CreateBarcode(context.Context, *authdto.Claims, catalogdto.BarcodeRequest) (catalogdto.Barcode, error)
	DeleteBarcode(context.Context, *authdto.Claims, string) error
	ListProducts(context.Context, *authdto.Claims) ([]catalogdto.Product, error)
	GetProduct(context.Context, *authdto.Claims, string) (catalogdto.Product, error)
	CreateProduct(context.Context, *authdto.Claims, catalogdto.ProductRequest) (catalogdto.Product, error)
	UpdateProduct(context.Context, *authdto.Claims, string, catalogdto.ProductRequest) (catalogdto.Product, error)
	DeleteProduct(context.Context, *authdto.Claims, string) error
	ListVariants(context.Context, *authdto.Claims, string) ([]catalogdto.Variant, error)
	GetVariant(context.Context, *authdto.Claims, string) (catalogdto.Variant, error)
	CreateVariant(context.Context, *authdto.Claims, string, catalogdto.VariantRequest) (catalogdto.Variant, error)
	UpdateVariant(context.Context, *authdto.Claims, string, catalogdto.VariantRequest) (catalogdto.Variant, error)
	DeleteVariant(context.Context, *authdto.Claims, string) error
	ListAttributeDefinitions(context.Context, *authdto.Claims) ([]catalogdto.AttributeDefinition, error)
	GetAttributeDefinition(context.Context, *authdto.Claims, string) (catalogdto.AttributeDefinition, error)
	CreateAttributeDefinition(context.Context, *authdto.Claims, catalogdto.AttributeDefinitionRequest) (catalogdto.AttributeDefinition, error)
	UpdateAttributeDefinition(context.Context, *authdto.Claims, string, catalogdto.AttributeDefinitionRequest) (catalogdto.AttributeDefinition, error)
	DeleteAttributeDefinition(context.Context, *authdto.Claims, string) error
	ListAttributeOptions(context.Context, *authdto.Claims, string) ([]catalogdto.AttributeOption, error)
	CreateAttributeOption(context.Context, *authdto.Claims, string, catalogdto.AttributeOptionRequest) (catalogdto.AttributeOption, error)
	UpdateAttributeOption(context.Context, *authdto.Claims, string, catalogdto.AttributeOptionRequest) (catalogdto.AttributeOption, error)
	DeleteAttributeOption(context.Context, *authdto.Claims, string) error
	ListUnits(context.Context, *authdto.Claims) ([]catalogdto.Unit, error)
	GetUnit(context.Context, *authdto.Claims, string) (catalogdto.Unit, error)
	CreateUnit(context.Context, *authdto.Claims, catalogdto.UnitRequest) (catalogdto.Unit, error)
	UpdateUnit(context.Context, *authdto.Claims, string, catalogdto.UnitRequest) (catalogdto.Unit, error)
	DeleteUnit(context.Context, *authdto.Claims, string) error
	ListConversions(context.Context, *authdto.Claims) ([]catalogdto.Conversion, error)
	GetConversion(context.Context, *authdto.Claims, string) (catalogdto.Conversion, error)
	CreateConversion(context.Context, *authdto.Claims, catalogdto.ConversionRequest) (catalogdto.Conversion, error)
	UpdateConversion(context.Context, *authdto.Claims, string, catalogdto.ConversionRequest) (catalogdto.Conversion, error)
	DeleteConversion(context.Context, *authdto.Claims, string) error
	ListBrands(context.Context, *authdto.Claims) ([]catalogdto.Brand, error)
	CreateBrand(context.Context, *authdto.Claims, catalogdto.BrandRequest) (catalogdto.Brand, error)
	UpdateBrand(context.Context, *authdto.Claims, string, catalogdto.BrandRequest) (catalogdto.Brand, error)
	DeleteBrand(context.Context, *authdto.Claims, string) error
	ListCategories(context.Context, *authdto.Claims) ([]catalogdto.Category, error)
	CreateCategory(context.Context, *authdto.Claims, catalogdto.CategoryRequest) (catalogdto.Category, error)
	UpdateCategory(context.Context, *authdto.Claims, string, catalogdto.CategoryRequest) (catalogdto.Category, error)
	DeleteCategory(context.Context, *authdto.Claims, string) error
	AssignCategory(context.Context, *authdto.Claims, string, string) error
	RemoveCategory(context.Context, *authdto.Claims, string, string) error
	ListImages(context.Context, *authdto.Claims, string) ([]catalogdto.Image, error)
	CreateImage(context.Context, *authdto.Claims, string, catalogdto.ImageRequest) (catalogdto.Image, error)
	UpdateImage(context.Context, *authdto.Claims, string, catalogdto.ImageRequest) (catalogdto.Image, error)
	DeleteImage(context.Context, *authdto.Claims, string) error
	ListVariantImages(context.Context, *authdto.Claims, string) ([]catalogdto.Image, error)
	CreateVariantImage(context.Context, *authdto.Claims, string, catalogdto.ImageRequest) (catalogdto.Image, error)
	GetPolicy(context.Context, *authdto.Claims, string) (catalogdto.InventoryPolicy, error)
	UpsertPolicy(context.Context, *authdto.Claims, string, catalogdto.InventoryPolicyRequest) (catalogdto.InventoryPolicy, error)
	DeletePolicy(context.Context, *authdto.Claims, string) error
}
