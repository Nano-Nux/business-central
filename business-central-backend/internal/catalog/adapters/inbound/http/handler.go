package http

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/auth/ports/inbound"
	catalogdto "business-central-backend/internal/catalog/application/dto"
	cataloginbound "business-central-backend/internal/catalog/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	cataloginbound.Catalog
	Authorization inbound.Authentication
}

func NewHandler(useCases cataloginbound.Catalog, authorization inbound.Authentication) *Handler {
	return &Handler{Catalog: useCases, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/catalog/products", h.listProducts)
	r.Post("/catalog/products", h.createProduct)
	r.Get("/catalog/products/:id", h.getProduct)
	r.Patch("/catalog/products/:id", h.updateProduct)
	r.Delete("/catalog/products/:id", h.deleteProduct)
	r.Get("/catalog/products/:productId/variants", h.listVariants)
	r.Post("/catalog/products/:productId/variants", h.createVariant)
	r.Get("/catalog/variants/:id", h.getVariant)
	r.Patch("/catalog/variants/:id", h.updateVariant)
	r.Delete("/catalog/variants/:id", h.deleteVariant)
	r.Post("/catalog/barcodes", h.createBarcode)
	r.Delete("/catalog/barcodes/:id", h.deleteBarcode)
	r.Get("/catalog/attributes", h.listAttributeDefinitions)
	r.Post("/catalog/attributes", h.createAttributeDefinition)
	r.Get("/catalog/attributes/:definitionId/options", h.listAttributeOptions)
	r.Post("/catalog/attributes/:definitionId/options", h.createAttributeOption)
	r.Get("/catalog/attributes/:id", h.getAttributeDefinition)
	r.Patch("/catalog/attributes/:id", h.updateAttributeDefinition)
	r.Delete("/catalog/attributes/:id", h.deleteAttributeDefinition)
	r.Patch("/catalog/attribute-options/:id", h.updateAttributeOption)
	r.Delete("/catalog/attribute-options/:id", h.deleteAttributeOption)
	r.Get("/units", h.listUnits)
	r.Post("/units", h.createUnit)
	r.Get("/units/:id", h.getUnit)
	r.Patch("/units/:id", h.updateUnit)
	r.Delete("/units/:id", h.deleteUnit)
	r.Get("/unit-conversions", h.listConversions)
	r.Post("/unit-conversions", h.createConversion)
	r.Get("/unit-conversions/:id", h.getConversion)
	r.Patch("/unit-conversions/:id", h.updateConversion)
	r.Delete("/unit-conversions/:id", h.deleteConversion)
	r.Get("/catalog/brands", h.listBrands)
	r.Post("/catalog/brands", h.createBrand)
	r.Patch("/catalog/brands/:id", h.updateBrand)
	r.Delete("/catalog/brands/:id", h.deleteBrand)
	r.Get("/catalog/categories", h.listCategories)
	r.Post("/catalog/categories", h.createCategory)
	r.Patch("/catalog/categories/:id", h.updateCategory)
	r.Delete("/catalog/categories/:id", h.deleteCategory)
	r.Post("/catalog/products/:productId/categories/:categoryId", h.assignCategory)
	r.Delete("/catalog/products/:productId/categories/:categoryId", h.removeCategory)
	r.Get("/catalog/products/:productId/images", h.listImages)
	r.Post("/catalog/products/:productId/images", h.createImage)
	r.Post("/catalog/products/:productId/images/upload", h.uploadProductImage)
	r.Get("/catalog/variants/:variantId/images", h.listVariantImages)
	r.Post("/catalog/variants/:variantId/images", h.createVariantImage)
	r.Post("/catalog/variants/:variantId/images/upload", h.uploadVariantImage)
	r.Patch("/catalog/images/:id", h.updateImage)
	r.Post("/catalog/images/:id/upload", h.uploadExistingImage)
	r.Delete("/catalog/images/:id", h.deleteImage)
	r.Get("/catalog/variants/:variantId/inventory-policy", h.getPolicy)
	r.Put("/catalog/variants/:variantId/inventory-policy", h.upsertPolicy)
	r.Delete("/catalog/variants/:variantId/inventory-policy", h.deletePolicy)
}

func (h *Handler) catalogPermission(c fiber.Ctx, permission string) error {
	return h.requirePermission(c, permission)
}
func (h *Handler) createBarcode(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.BarcodeRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.CreateBarcode(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}
func (h *Handler) deleteBarcode(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteBarcode(ctx, claims(c), c.Params("id")); err != nil {
		return noResourceOrDatabase(err, "Barcode")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listProducts(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListProducts(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Product, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"name": item.Name, "barcode": catalogPtr(item.Barcode), "product_type": item.ProductType, "brand_id": catalogPtr(item.BrandID), "categories": strings.Join(item.CategoryNames, " "), "is_active": catalogBool(item.IsActive)})
	})
}

func (h *Handler) createProduct(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.ProductRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.CreateProduct(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getProduct(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.GetProduct(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Product")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateProduct(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.ProductRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.UpdateProduct(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Product")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteProduct(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteProduct(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Product")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listVariants(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListVariants(ctx, claims(c), c.Params("productId"))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Variant, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"name": item.Name, "sku": item.SKU, "barcode": catalogPtr(item.Barcode), "product_id": item.ProductID, "base_unit_id": item.BaseUnitID, "is_stock_tracked": catalogBool(item.IsStockTracked)})
	})
}

func (h *Handler) createVariant(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.VariantRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.CreateVariant(ctx, claims(c), c.Params("productId"), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getVariant(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.GetVariant(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Product variant")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateVariant(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.VariantRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.UpdateVariant(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Product variant")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteVariant(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteVariant(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Product variant")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listAttributeDefinitions(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Catalog.ListAttributeDefinitions(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, items, listQuery(c), func(item catalogdto.AttributeDefinition, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"code": item.Code, "name": item.Name, "value_type": item.ValueType})
	})
}

func (h *Handler) createAttributeDefinition(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var request catalogdto.AttributeDefinitionRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.CreateAttributeDefinition(ctx, claims(c), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) getAttributeDefinition(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.GetAttributeDefinition(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Attribute definition")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) updateAttributeDefinition(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var request catalogdto.AttributeDefinitionRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.UpdateAttributeDefinition(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Attribute definition")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) deleteAttributeDefinition(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteAttributeDefinition(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Attribute definition")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listAttributeOptions(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Catalog.ListAttributeOptions(ctx, claims(c), c.Params("definitionId"))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, items, listQuery(c), func(item catalogdto.AttributeOption, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"value": item.Value, "label": item.Label, "definition_id": item.DefinitionID})
	})
}

func (h *Handler) createAttributeOption(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var request catalogdto.AttributeOptionRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.CreateAttributeOption(ctx, claims(c), c.Params("definitionId"), request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) updateAttributeOption(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var request catalogdto.AttributeOptionRequest
	if err := c.Bind().JSON(&request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := h.Catalog.UpdateAttributeOption(ctx, claims(c), c.Params("id"), request)
	if err != nil {
		return noResourceOrDatabase(err, "Attribute option")
	}
	return c.JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) deleteAttributeOption(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteAttributeOption(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Attribute option")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listBrands(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListBrands(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Brand, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"name": item.Name, "slug": item.Slug, "is_active": catalogBool(item.IsActive)})
	})
}

func (h *Handler) createBrand(c fiber.Ctx) error {
	var r catalogdto.BrandRequest
	return h.catalogCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.CreateBrand(ctx, claims(c), *r.(*catalogdto.BrandRequest))
	})
}

func (h *Handler) updateBrand(c fiber.Ctx) error {
	var r catalogdto.BrandRequest
	return h.catalogUpdate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.UpdateBrand(ctx, claims(c), c.Params("id"), *r.(*catalogdto.BrandRequest))
	}, "Brand")
}

func (h *Handler) deleteBrand(c fiber.Ctx) error {
	return h.catalogDelete(c, func(ctx context.Context) error { return h.Catalog.DeleteBrand(ctx, claims(c), c.Params("id")) }, "Brand")
}

func (h *Handler) listCategories(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListCategories(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Category, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"name": item.Name, "slug": item.Slug, "parent_category_id": catalogPtr(item.ParentCategoryID)})
	})
}

func (h *Handler) createCategory(c fiber.Ctx) error {
	var r catalogdto.CategoryRequest
	return h.catalogCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.CreateCategory(ctx, claims(c), *r.(*catalogdto.CategoryRequest))
	})
}

func (h *Handler) updateCategory(c fiber.Ctx) error {
	var r catalogdto.CategoryRequest
	return h.catalogUpdate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.UpdateCategory(ctx, claims(c), c.Params("id"), *r.(*catalogdto.CategoryRequest))
	}, "Category")
}

func (h *Handler) deleteCategory(c fiber.Ctx) error {
	return h.catalogDelete(c, func(ctx context.Context) error { return h.Catalog.DeleteCategory(ctx, claims(c), c.Params("id")) }, "Category")
}

func (h *Handler) assignCategory(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.AssignCategory(ctx, claims(c), c.Params("productId"), c.Params("categoryId")); err != nil {
		return databaseError(err)
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) removeCategory(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.RemoveCategory(ctx, claims(c), c.Params("productId"), c.Params("categoryId")); err != nil {
		return noResource(err, "Product category")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listImages(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListImages(ctx, claims(c), c.Params("productId"))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Image, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"product_id": catalogPtr(item.ProductID), "image_url": item.ImageURL})
	})
}

func (h *Handler) createImage(c fiber.Ctx) error {
	var r catalogdto.ImageRequest
	return h.catalogCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.CreateImage(ctx, claims(c), c.Params("productId"), *r.(*catalogdto.ImageRequest))
	})
}

func (h *Handler) updateImage(c fiber.Ctx) error {
	var r catalogdto.ImageRequest
	return h.catalogUpdate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Catalog.UpdateImage(ctx, claims(c), c.Params("id"), *r.(*catalogdto.ImageRequest))
	}, "Image")
}

func (h *Handler) deleteImage(c fiber.Ctx) error {
	return h.catalogDelete(c, func(ctx context.Context) error { return h.Catalog.DeleteImage(ctx, claims(c), c.Params("id")) }, "Image")
}

func (h *Handler) listVariantImages(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Catalog.ListVariantImages(ctx, claims(c), c.Params("variantId"))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, items, listQuery(c), func(item catalogdto.Image, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"variant_id": catalogPtr(item.VariantID), "image_url": item.ImageURL})
	})
}

func (h *Handler) createVariantImage(c fiber.Ctx) error {
	var request catalogdto.ImageRequest
	return h.catalogCreate(c, &request, func(ctx context.Context, value any) (any, error) {
		return h.Catalog.CreateVariantImage(ctx, claims(c), c.Params("variantId"), *value.(*catalogdto.ImageRequest))
	})
}

func (h *Handler) uploadProductImage(c fiber.Ctx) error {
	return h.uploadImage(c, func(ctx context.Context, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
		return h.Catalog.UploadProductImage(ctx, claims(c), c.Params("productId"), upload)
	})
}

func (h *Handler) uploadVariantImage(c fiber.Ctx) error {
	return h.uploadImage(c, func(ctx context.Context, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
		return h.Catalog.UploadVariantImage(ctx, claims(c), c.Params("variantId"), upload)
	})
}

func (h *Handler) uploadExistingImage(c fiber.Ctx) error {
	return h.uploadImage(c, func(ctx context.Context, upload catalogdto.ImageUpload) (catalogdto.Image, error) {
		item, err := h.Catalog.UploadImage(ctx, claims(c), c.Params("id"), upload)
		if errors.Is(err, pgx.ErrNoRows) {
			return catalogdto.Image{}, app.NewError("NOT_FOUND", "Image not found.", 404)
		}
		return item, err
	})
}

func (h *Handler) uploadImage(c fiber.Ctx, save func(context.Context, catalogdto.ImageUpload) (catalogdto.Image, error)) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return app.Validation("A multipart image file field named file is required.", nil)
	}
	file, err := fileHeader.Open()
	if err != nil {
		return app.Validation("The uploaded image could not be read.", nil)
	}
	defer file.Close()
	var altText *string
	if value := strings.TrimSpace(c.FormValue("alt_text")); value != "" {
		altText = &value
	}
	var position *int
	if value := strings.TrimSpace(c.FormValue("position")); value != "" {
		parsed, parseErr := strconv.Atoi(value)
		if parseErr != nil || parsed < 0 {
			return app.Validation("position must be a non-negative integer.", nil)
		}
		position = &parsed
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	item, err := save(ctx, catalogdto.ImageUpload{
		FileName: fileHeader.Filename, ContentType: fileHeader.Header.Get("Content-Type"),
		Size: fileHeader.Size, Content: file, AltText: altText, Position: position,
	})
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": item, "meta": map[string]any{}})
}

func (h *Handler) getPolicy(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.GetPolicy(ctx, claims(c), c.Params("variantId"))
	if err != nil {
		return noResource(err, "Inventory policy")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) upsertPolicy(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.InventoryPolicyRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.UpsertPolicy(ctx, claims(c), c.Params("variantId"), r)
	if err != nil {
		return databaseError(err)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deletePolicy(c fiber.Ctx) error {
	return h.catalogDelete(c, func(ctx context.Context) error {
		return h.Catalog.DeletePolicy(ctx, claims(c), c.Params("variantId"))
	}, "Inventory policy")
}

func (h *Handler) listUnits(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListUnits(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Unit, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"code": item.Code, "name": item.Name, "dimension_code": item.DimensionCode, "is_active": catalogBool(item.IsActive)})
	})
}

func (h *Handler) createUnit(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.UnitRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.CreateUnit(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getUnit(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.GetUnit(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Unit")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateUnit(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.UnitRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.UpdateUnit(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Unit")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteUnit(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteUnit(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Unit")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listConversions(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.ListConversions(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return catalogListPage(c, v, listQuery(c), func(item catalogdto.Conversion, q app.ListQuery) bool {
		return catalogMatches(q, map[string]string{"from_unit_id": item.FromUnitID, "to_unit_id": item.ToUnitID, "multiplier": item.Multiplier, "is_active": catalogBool(item.IsActive)})
	})
}

func (h *Handler) createConversion(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.ConversionRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.CreateConversion(ctx, claims(c), r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) getConversion(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.GetConversion(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Unit conversion")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) updateConversion(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	var r catalogdto.ConversionRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Catalog.UpdateConversion(ctx, claims(c), c.Params("id"), r)
	if err != nil {
		return noResourceOrDatabase(err, "Unit conversion")
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) deleteConversion(c fiber.Ctx) error {
	if err := h.catalogPermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Catalog.DeleteConversion(ctx, claims(c), c.Params("id")); err != nil {
		return noResource(err, "Unit conversion")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) requirePermission(c fiber.Ctx, permission string) error {
	allowed, err := h.Authorization.HasPermission(c.Context(), claims(c), permission)
	if err != nil {
		return app.Internal(err)
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "You do not have permission to perform this action.", 403)
	}
	return nil
}

func (h *Handler) catalogCreate(c fiber.Ctx, request any, fn func(context.Context, any) (any, error)) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := fn(ctx, request)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(201).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) catalogUpdate(c fiber.Ctx, request any, fn func(context.Context, any) (any, error), resource string) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(request); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := fn(ctx, request)
	if err != nil {
		return noResourceOrDatabase(err, resource)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) catalogDelete(c fiber.Ctx, fn func(context.Context) error, resource string) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := fn(ctx); err != nil {
		return noResource(err, resource)
	}
	return c.Status(204).Send(nil)
}

func contextWithTimeout(c fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Context(), 15*time.Second)
}

func claims(c fiber.Ctx) *authdto.Claims {
	value, _ := c.Locals("claims").(*authdto.Claims)
	return value
}

func noRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	return databaseError(err)
}

func databaseError(err error) error {
	if apiErr, ok := err.(*app.Error); ok {
		return apiErr
	}
	if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
		return app.NewError("CONFLICT", "The requested resource conflicts with an existing record.", 409)
	}
	if strings.Contains(err.Error(), "no rows") {
		return app.NewError("NOT_FOUND", "User not found.", 404)
	}
	return &app.Error{Code: "INTERNAL_ERROR", Message: err.Error(), Status: 500, Internal: err}
}

func noResource(err error, resource string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", resource+" not found.", 404)
	}
	return databaseError(err)
}

func noResourceOrDatabase(err error, resource string) error { return noResource(err, resource) }
