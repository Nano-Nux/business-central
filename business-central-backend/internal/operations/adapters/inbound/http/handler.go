package http

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/auth/ports/inbound"
	operationsdto "business-central-backend/internal/operations/application/dto"
	operationsinbound "business-central-backend/internal/operations/ports/inbound"
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
)

type Handler struct {
	operationsinbound.Operations
	Authorization inbound.Authentication
}

func NewHandler(useCases operationsinbound.Operations, authorization inbound.Authentication) *Handler {
	return &Handler{Operations: useCases, Authorization: authorization}
}

func (h *Handler) RegisterRoutes(r fiber.Router) {
	r.Get("/pricing/price-lists", h.listPriceLists)
	r.Post("/pricing/price-lists", h.createPriceList)
	r.Patch("/pricing/price-lists/:id", h.updatePriceList)
	r.Delete("/pricing/price-lists/:id", h.deletePriceList)
	r.Get("/pricing/price-lists/:id/prices", h.listPrices)
	r.Post("/pricing/prices", h.upsertPrice)
	r.Delete("/pricing/prices", h.deletePrice)
	r.Get("/promotions", h.listPromotions)
	r.Post("/promotions", h.createPromotion)
	r.Patch("/promotions/:id", h.updatePromotion)
	r.Delete("/promotions/:id", h.deletePromotion)
	r.Post("/promotions/codes", h.createPromotionCode)
	r.Get("/promotions/:id/codes", h.listPromotionCodes)
	r.Delete("/promotions/codes/:id", h.deletePromotionCode)
	r.Post("/promotions/products", h.assignPromotionProduct)
	r.Get("/promotions/:id/products", h.listPromotionProducts)
	r.Delete("/promotions/products/:id", h.removePromotionProduct)
	r.Get("/inventory/movements", h.listMovements)
	r.Get("/inventory/assets", h.listStockAssets)
	r.Get("/inventory/storage", h.listStorage)
	r.Get("/inventory/movements/:id", h.getMovementDetail)
	r.Get("/transaction-history", h.listTransactionHistory)
	r.Get("/transaction-history/:id", h.getTransactionHistoryDetail)
	r.Get("/inventory/receivable-lines", h.listReceivableLines)
	r.Post("/inventory/stock-in", h.stockIn)
	r.Post("/inventory/stock-checkout", h.stockOut)
}

func (h *Handler) listReceivableLines(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListReceivableLines(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, items, listQuery(c), func(item operationsdto.ReceivableLine, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"order_number": item.OrderNumber, "supplier_name": item.SupplierName, "variant_name": item.VariantName, "sku": item.SKU})
	})
}

func (h *Handler) listPromotionCodes(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListPromotionCodes(ctx, claims(c), c.Params("id"))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, items, listQuery(c), func(item operationsdto.PromotionCode, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"code": item.Code})
	})
}
func (h *Handler) listPromotionProducts(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListPromotionProducts(ctx, claims(c), c.Params("id"))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, items, listQuery(c), func(item operationsdto.PromotionProduct, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"product_name": item.ProductName, "variant_name": operationsPtr(item.VariantName)})
	})
}

func (h *Handler) listPriceLists(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Operations.ListPriceLists(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, v, listQuery(c), func(item operationsdto.PriceList, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"code": item.Code, "currency_code": item.CurrencyCode, "is_default": operationsBool(item.IsDefault)})
	})
}

func (h *Handler) createPriceList(c fiber.Ctx) error {
	var r operationsdto.PriceListRequest
	return h.operationsCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.CreatePriceList(ctx, claims(c), *r.(*operationsdto.PriceListRequest))
	})
}

func (h *Handler) updatePriceList(c fiber.Ctx) error {
	var r operationsdto.PriceListRequest
	return h.operationsUpdate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.UpdatePriceList(ctx, claims(c), c.Params("id"), *r.(*operationsdto.PriceListRequest))
	}, "Price list")
}

func (h *Handler) deletePriceList(c fiber.Ctx) error {
	return h.operationsDelete(c, func(ctx context.Context) error {
		return h.Operations.DeletePriceList(ctx, claims(c), c.Params("id"))
	}, "Price list")
}

func (h *Handler) listPrices(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Operations.ListPrices(ctx, claims(c), c.Params("id"))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, v, listQuery(c), func(item operationsdto.ProductPrice, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"price_list_id": item.PriceListID, "variant_id": item.VariantID, "amount": item.Amount})
	})
}

func (h *Handler) upsertPrice(c fiber.Ctx) error {
	var r operationsdto.ProductPriceRequest
	return h.operationsCreateStatus(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.UpsertPrice(ctx, claims(c), *r.(*operationsdto.ProductPriceRequest))
	}, 200)
}

func (h *Handler) deletePrice(c fiber.Ctx) error {
	var r operationsdto.ProductPriceRequest
	if err := c.Bind().JSON(&r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	if err := h.Operations.DeletePrice(ctx, claims(c), r); err != nil {
		return noResource(err, "Product price")
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) listPromotions(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Operations.ListPromotions(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, v, listQuery(c), func(item operationsdto.Promotion, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"name": item.Name, "promotion_type": item.PromotionType, "value": item.Value})
	})
}

func (h *Handler) createPromotion(c fiber.Ctx) error {
	var r operationsdto.PromotionRequest
	return h.operationsCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.CreatePromotion(ctx, claims(c), *r.(*operationsdto.PromotionRequest))
	})
}

func (h *Handler) updatePromotion(c fiber.Ctx) error {
	var r operationsdto.PromotionRequest
	return h.operationsUpdate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.UpdatePromotion(ctx, claims(c), c.Params("id"), *r.(*operationsdto.PromotionRequest))
	}, "Promotion")
}

func (h *Handler) deletePromotion(c fiber.Ctx) error {
	return h.operationsDelete(c, func(ctx context.Context) error {
		return h.Operations.DeletePromotion(ctx, claims(c), c.Params("id"))
	}, "Promotion")
}

func (h *Handler) createPromotionCode(c fiber.Ctx) error {
	var r operationsdto.PromotionCodeRequest
	return h.operationsCreate(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.CreatePromotionCode(ctx, claims(c), *r.(*operationsdto.PromotionCodeRequest))
	})
}

func (h *Handler) deletePromotionCode(c fiber.Ctx) error {
	return h.operationsDelete(c, func(ctx context.Context) error {
		return h.Operations.DeletePromotionCode(ctx, claims(c), c.Params("id"))
	}, "Promotion code")
}

func (h *Handler) assignPromotionProduct(c fiber.Ctx) error {
	var r operationsdto.PromotionProductRequest
	return h.operationsNoContent(c, &r, func(ctx context.Context, r any) error {
		return h.Operations.AssignPromotionProduct(ctx, claims(c), *r.(*operationsdto.PromotionProductRequest))
	})
}

func (h *Handler) removePromotionProduct(c fiber.Ctx) error {
	return h.operationsDelete(c, func(ctx context.Context) error {
		return h.Operations.RemovePromotionProduct(ctx, claims(c), c.Params("id"))
	}, "Promotion product")
}

func (h *Handler) listMovements(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	v, err := h.Operations.ListMovements(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, v, listQuery(c), func(item operationsdto.Movement, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"variant_id": item.VariantID, "movement_type": item.MovementType, "source_location_id": operationsPtr(item.SourceLocationID), "destination_location_id": operationsPtr(item.DestinationLocationID), "event_key": item.EventKey})
	})
}

func (h *Handler) listStockAssets(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListStockAssets(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	return operationsListPage(c, items, listQuery(c), func(item operationsdto.StockAsset, q app.ListQuery) bool {
		return operationsMatches(q, map[string]string{"product_name": item.ProductName, "variant_name": item.VariantName, "sku": item.SKU, "asset_tag": item.AssetTag, "status": item.Status, "barcode": operationsPtr(item.Barcode)})
	})
}

func (h *Handler) listStorage(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	items, err := h.Operations.ListStorage(ctx, claims(c))
	if err != nil {
		return app.Internal(err)
	}
	q := listQuery(c)
	sortKey, descending := storageSort(c.Query("sort"))
	if sortKey != "" {
		sort.SliceStable(items, func(i, j int) bool {
			left, right := storageSortValue(items[i], sortKey), storageSortValue(items[j], sortKey)
			if storageNumericSort(sortKey) {
				leftNumber, leftErr := strconv.ParseFloat(left, 64)
				rightNumber, rightErr := strconv.ParseFloat(right, 64)
				if leftErr == nil && rightErr == nil {
					if descending {
						return leftNumber > rightNumber
					}
					return leftNumber < rightNumber
				}
			}
			if descending {
				return strings.ToLower(left) > strings.ToLower(right)
			}
			return strings.ToLower(left) < strings.ToLower(right)
		})
	}
	return operationsListPage(c, items, q, storageMatches)
}

func storageMatches(item operationsdto.StorageItem, q app.ListQuery) bool {
	fields := map[string]string{
		"catalog": item.Catalog, "product_name": item.ProductName, "variant_name": item.VariantName,
		"brand": item.Brand, "unit": item.Unit, "stock_count": item.StockCount, "sell_price": item.SellPrice,
		"original_price": item.OriginalPrice, "profit": item.Profit,
		"expired_date": storageDate(item.ExpiredDate), "manufacture_date": storageDate(item.ManufactureDate),
	}
	if q.Search != "" {
		found := false
		for _, value := range fields {
			if strings.Contains(strings.ToLower(value), strings.ToLower(q.Search)) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	for key, value := range q.Filters {
		actual, ok := fields[key]
		if ok && !strings.Contains(strings.ToLower(actual), strings.ToLower(value)) {
			return false
		}
	}
	return true
}

func storageDate(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format("2006-01-02")
}

func storageSort(raw string) (string, bool) {
	parts := strings.SplitN(strings.ToLower(strings.TrimSpace(raw)), ":", 2)
	allowed := map[string]bool{"catalog": true, "product_name": true, "variant_name": true, "brand": true, "unit": true, "stock_count": true, "sell_price": true, "original_price": true, "profit": true, "expired_date": true, "manufacture_date": true}
	if len(parts) == 0 || !allowed[parts[0]] {
		return "", false
	}
	return parts[0], len(parts) == 2 && parts[1] == "desc"
}

func storageSortValue(item operationsdto.StorageItem, key string) string {
	switch key {
	case "catalog":
		return item.Catalog
	case "product_name":
		return item.ProductName
	case "variant_name":
		return item.VariantName
	case "brand":
		return item.Brand
	case "unit":
		return item.Unit
	case "stock_count":
		return item.StockCount
	case "sell_price":
		return item.SellPrice
	case "original_price":
		return item.OriginalPrice
	case "profit":
		return item.Profit
	case "expired_date":
		return storageDate(item.ExpiredDate)
	case "manufacture_date":
		return storageDate(item.ManufactureDate)
	default:
		return ""
	}
}

func storageNumericSort(key string) bool {
	return key == "stock_count" || key == "sell_price" || key == "original_price" || key == "profit"
}

func (h *Handler) getMovementDetail(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	detail, err := h.Operations.GetMovementDetail(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Stock movement")
	}
	return c.JSON(map[string]any{"data": detail, "meta": map[string]any{}})
}

func (h *Handler) listTransactionHistory(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	q := listQuery(c)
	items, total, err := h.Operations.ListTransactionHistory(ctx, claims(c), q)
	if err != nil {
		return app.Internal(err)
	}
	return c.JSON(app.PageResult[operationsdto.TransactionHistoryEntry]{
		Data: items,
		Meta: app.PageMeta{
			PageIndex:  q.PageIndex,
			PageSize:   q.PageSize,
			Total:      total,
			TotalPages: (total + q.PageSize - 1) / q.PageSize,
		},
	})
}

func (h *Handler) getTransactionHistoryDetail(c fiber.Ctx) error {
	if err := h.requirePermission(c, "tenant.read"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	detail, err := h.Operations.GetTransactionHistoryDetail(ctx, claims(c), c.Params("id"))
	if err != nil {
		return noResource(err, "Transaction")
	}
	return c.JSON(map[string]any{"data": detail, "meta": map[string]any{}})
}

func (h *Handler) stockIn(c fiber.Ctx) error {
	var r operationsdto.StockInRequest
	return h.operationsCreateStatus(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.StockIn(ctx, claims(c), *r.(*operationsdto.StockInRequest))
	}, 201)
}

func (h *Handler) stockOut(c fiber.Ctx) error {
	var r operationsdto.StockOutRequest
	return h.operationsCreateStatus(c, &r, func(ctx context.Context, r any) (any, error) {
		return h.Operations.StockOut(ctx, claims(c), *r.(*operationsdto.StockOutRequest))
	}, 201)
}

func (h *Handler) operationsCreate(c fiber.Ctx, r any, fn func(context.Context, any) (any, error)) error {
	return h.operationsCreateStatus(c, r, fn, 201)
}

func (h *Handler) operationsCreateStatus(c fiber.Ctx, r any, fn func(context.Context, any) (any, error), status int) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	v, err := fn(ctx, r)
	if err != nil {
		return databaseError(err)
	}
	return c.Status(status).JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) operationsUpdate(c fiber.Ctx, r any, fn func(context.Context, any) (any, error), resource string) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	v, err := fn(ctx, r)
	if err != nil {
		return noResourceOrDatabase(err, resource)
	}
	return c.JSON(map[string]any{"data": v, "meta": map[string]any{}})
}

func (h *Handler) operationsDelete(c fiber.Ctx, fn func(context.Context) error, resource string) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	if err := fn(ctx); err != nil {
		return noResource(err, resource)
	}
	return c.Status(204).Send(nil)
}

func (h *Handler) operationsNoContent(c fiber.Ctx, r any, fn func(context.Context, any) error) error {
	if err := h.requirePermission(c, "tenant.write"); err != nil {
		return err
	}
	if err := c.Bind().JSON(r); err != nil {
		return app.NewError("VALIDATION_ERROR", "Request body must be valid JSON.", 400)
	}
	ctx, cancel := contextWithTimeout(c)
	defer cancel()
	ctx = app.WithIdempotencyKey(ctx, c.Get("Idempotency-Key"))
	if err := fn(ctx, r); err != nil {
		return databaseError(err)
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
