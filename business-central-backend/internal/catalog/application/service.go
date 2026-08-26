package application

import (
	"context"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	catalogdto "business-central-backend/internal/catalog/application/dto"
	domaincatalog "business-central-backend/internal/catalog/domain/entities"
	cataloginbound "business-central-backend/internal/catalog/ports/inbound"
	catalogoutbound "business-central-backend/internal/catalog/ports/outbound"
	"business-central-backend/internal/media"
)

type Service struct {
	catalogoutbound.Repository
	imageStorage media.Storage
}

func NewService(port catalogoutbound.Repository, storage ...media.Storage) *Service {
	service := &Service{Repository: port}
	if len(storage) > 0 {
		service.imageStorage = storage[0]
	}
	return service
}

var _ cataloginbound.Catalog = (*Service)(nil)

func invalid(message string) error {
	return app.Validation(message, nil)
}

func validateProductDates(request catalogdto.ProductRequest) error {
	for label, value := range map[string]*string{"manufacture_date": request.ManufactureDate, "expired_date": request.ExpiredDate} {
		if value != nil && *value != "" {
			if _, err := time.Parse("2006-01-02", *value); err != nil {
				return invalid(label + " must use YYYY-MM-DD format.")
			}
		}
	}
	return nil
}

func normalizeProductDates(request catalogdto.ProductRequest) catalogdto.ProductRequest {
	for _, value := range []**string{&request.ManufactureDate, &request.ExpiredDate} {
		if *value == nil {
			continue
		}
		trimmed := strings.TrimSpace(**value)
		if trimmed == "" {
			*value = nil
			continue
		}
		*value = &trimmed
	}
	return request
}

func (s *Service) CreateProduct(ctx context.Context, claims *authdto.Claims, request catalogdto.ProductRequest) (catalogdto.Product, error) {
	request = normalizeProductDates(request)
	if _, err := domaincatalog.NewProduct(request.Name, request.ProductType); err != nil {
		return catalogdto.Product{}, invalid("Product name is required.")
	}
	if err := validateProductDates(request); err != nil {
		return catalogdto.Product{}, err
	}
	return s.Repository.CreateProduct(ctx, claims, request)
}

func (s *Service) UpdateProduct(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.ProductRequest) (catalogdto.Product, error) {
	request = normalizeProductDates(request)
	if _, err := domaincatalog.NewProduct(request.Name, request.ProductType); err != nil {
		return catalogdto.Product{}, invalid("Product name is required.")
	}
	if err := validateProductDates(request); err != nil {
		return catalogdto.Product{}, err
	}
	return s.Repository.UpdateProduct(ctx, claims, id, request)
}

func (s *Service) CreateVariant(ctx context.Context, claims *authdto.Claims, productID string, request catalogdto.VariantRequest) (catalogdto.Variant, error) {
	if _, err := domaincatalog.NewVariant(request.SKU, request.Name, request.BaseUnitID); err != nil {
		return catalogdto.Variant{}, invalid("SKU, name, and base_unit_id are required.")
	}
	return s.Repository.CreateVariant(ctx, claims, productID, request)
}

func (s *Service) UpdateVariant(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.VariantRequest) (catalogdto.Variant, error) {
	if _, err := domaincatalog.NewVariant(request.SKU, request.Name, request.BaseUnitID); err != nil {
		return catalogdto.Variant{}, invalid("SKU, name, and base_unit_id are required.")
	}
	return s.Repository.UpdateVariant(ctx, claims, id, request)
}

func (s *Service) CreateAttributeDefinition(ctx context.Context, claims *authdto.Claims, request catalogdto.AttributeDefinitionRequest) (catalogdto.AttributeDefinition, error) {
	return s.Repository.CreateAttributeDefinition(ctx, claims, request)
}

func (s *Service) UpdateAttributeDefinition(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.AttributeDefinitionRequest) (catalogdto.AttributeDefinition, error) {
	return s.Repository.UpdateAttributeDefinition(ctx, claims, id, request)
}

func (s *Service) CreateAttributeOption(ctx context.Context, claims *authdto.Claims, definitionID string, request catalogdto.AttributeOptionRequest) (catalogdto.AttributeOption, error) {
	return s.Repository.CreateAttributeOption(ctx, claims, definitionID, request)
}

func (s *Service) UpdateAttributeOption(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.AttributeOptionRequest) (catalogdto.AttributeOption, error) {
	return s.Repository.UpdateAttributeOption(ctx, claims, id, request)
}

func (s *Service) CreateUnit(ctx context.Context, claims *authdto.Claims, request catalogdto.UnitRequest) (catalogdto.Unit, error) {
	if err := domaincatalog.Unit(request.Code, request.Name); err != nil {
		return catalogdto.Unit{}, invalid("Unit code and name are required.")
	}
	return s.Repository.CreateUnit(ctx, claims, request)
}

func (s *Service) UpdateUnit(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.UnitRequest) (catalogdto.Unit, error) {
	if err := domaincatalog.Unit(request.Code, request.Name); err != nil {
		return catalogdto.Unit{}, invalid("Unit code and name are required.")
	}
	return s.Repository.UpdateUnit(ctx, claims, id, request)
}

func (s *Service) CreateConversion(ctx context.Context, claims *authdto.Claims, request catalogdto.ConversionRequest) (catalogdto.Conversion, error) {
	if err := domaincatalog.Conversion(request.FromUnitID, request.ToUnitID, request.Multiplier); err != nil {
		return catalogdto.Conversion{}, invalid("from_unit_id, to_unit_id, and multiplier are required.")
	}
	return s.Repository.CreateConversion(ctx, claims, request)
}

func (s *Service) UpdateConversion(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.ConversionRequest) (catalogdto.Conversion, error) {
	if err := domaincatalog.Conversion(request.FromUnitID, request.ToUnitID, request.Multiplier); err != nil {
		return catalogdto.Conversion{}, invalid("from_unit_id, to_unit_id, and multiplier are required.")
	}
	return s.Repository.UpdateConversion(ctx, claims, id, request)
}

func (s *Service) CreateBrand(ctx context.Context, claims *authdto.Claims, request catalogdto.BrandRequest) (catalogdto.Brand, error) {
	if err := domaincatalog.Brand(request.Name, request.Slug); err != nil {
		return catalogdto.Brand{}, invalid("Brand name and slug are required.")
	}
	return s.Repository.CreateBrand(ctx, claims, request)
}

func (s *Service) UpdateBrand(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.BrandRequest) (catalogdto.Brand, error) {
	if err := domaincatalog.Brand(request.Name, request.Slug); err != nil {
		return catalogdto.Brand{}, invalid("Brand name and slug are required.")
	}
	return s.Repository.UpdateBrand(ctx, claims, id, request)
}

func (s *Service) CreateCategory(ctx context.Context, claims *authdto.Claims, request catalogdto.CategoryRequest) (catalogdto.Category, error) {
	if err := domaincatalog.Category(request.Name, request.Slug); err != nil {
		return catalogdto.Category{}, invalid("Category name and slug are required.")
	}
	return s.Repository.CreateCategory(ctx, claims, request)
}

func (s *Service) UpdateCategory(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.CategoryRequest) (catalogdto.Category, error) {
	if err := domaincatalog.Category(request.Name, request.Slug); err != nil {
		return catalogdto.Category{}, invalid("Category name and slug are required.")
	}
	return s.Repository.UpdateCategory(ctx, claims, id, request)
}

func (s *Service) CreateImage(ctx context.Context, claims *authdto.Claims, productID string, request catalogdto.ImageRequest) (catalogdto.Image, error) {
	request, err := normalizeImageRequest(request)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.CreateImage(ctx, claims, productID, request)
}

func (s *Service) UpdateImage(ctx context.Context, claims *authdto.Claims, id string, request catalogdto.ImageRequest) (catalogdto.Image, error) {
	request, err := normalizeImageRequest(request)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.UpdateImage(ctx, claims, id, request)
}

func (s *Service) CreateVariantImage(ctx context.Context, claims *authdto.Claims, variantID string, request catalogdto.ImageRequest) (catalogdto.Image, error) {
	request, err := normalizeImageRequest(request)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.CreateVariantImage(ctx, claims, variantID, request)
}

func (s *Service) UploadProductImage(ctx context.Context, claims *authdto.Claims, productID string, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
	request, err := s.storeUpload(ctx, claims, upload)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.CreateImage(ctx, claims, productID, request)
}

func (s *Service) UploadVariantImage(ctx context.Context, claims *authdto.Claims, variantID string, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
	request, err := s.storeUpload(ctx, claims, upload)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.CreateVariantImage(ctx, claims, variantID, request)
}

func (s *Service) UploadImage(ctx context.Context, claims *authdto.Claims, imageID string, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
	request, err := s.storeUpload(ctx, claims, upload)
	if err != nil {
		return catalogdto.Image{}, err
	}
	return s.Repository.UpdateImage(ctx, claims, imageID, request)
}

func (s *Service) storeUpload(ctx context.Context, claims *authdto.Claims, upload catalogdto.ImageUpload) (catalogdto.ImageRequest, error) {
	if s.imageStorage == nil {
		return catalogdto.ImageRequest{}, app.NewError("STORAGE_UNAVAILABLE", "Direct image upload is not configured.", 503)
	}
	if err := media.ValidateUpload(&upload); err != nil {
		return catalogdto.ImageRequest{}, err
	}
	imageURL, err := s.imageStorage.Store(ctx, claims.MerchantID, upload)
	if err != nil {
		return catalogdto.ImageRequest{}, fmt.Errorf("store catalog image: %w", err)
	}
	return catalogdto.ImageRequest{ImageURL: imageURL, SourceType: "UPLOAD", AltText: upload.AltText, Position: upload.Position}, nil
}

func normalizeImageRequest(request catalogdto.ImageRequest) (catalogdto.ImageRequest, error) {
	if err := domaincatalog.Image(request.ImageURL); err != nil {
		return catalogdto.ImageRequest{}, invalid("Image URL is required.")
	}
	resolved, err := media.NormalizeURL(media.URLRequest{ImageURL: request.ImageURL, SourceType: request.SourceType}, false)
	if err != nil {
		return catalogdto.ImageRequest{}, err
	}
	request.ImageURL = resolved.ImageURL
	request.SourceType = resolved.SourceType
	return request, nil
}
