package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/services/application/dto"
	"business-central-backend/internal/services/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

type transactionContextKey struct{}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func nullableString(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return strings.TrimSpace(*value)
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func resolvePaymentType(ctx context.Context, tx pgx.Tx, merchantID, paymentTypeID, legacyMethod string) (string, string, string, error) {
	var id, name, category string
	if strings.TrimSpace(paymentTypeID) != "" {
		if err := tx.QueryRow(ctx, `SELECT id,name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, merchantID, paymentTypeID).Scan(&id, &name, &category); err != nil {
			return "", "", "", app.NewError("VALIDATION_ERROR", "The selected payment type is not available for this merchant.", 400)
		}
	} else if strings.EqualFold(strings.TrimSpace(legacyMethod), "CASH") || strings.TrimSpace(legacyMethod) == "" {
		if err := tx.QueryRow(ctx, `SELECT id,name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND category_code='CASH' AND is_active ORDER BY CASE WHEN name='Cash' THEN 0 ELSE 1 END,created_at LIMIT 1`, merchantID).Scan(&id, &name, &category); err != nil {
			return "", "", "", app.NewError("VALIDATION_ERROR", "Create an active cash payment type before recording payment.", 400)
		}
	} else {
		return "", "", "", app.NewError("VALIDATION_ERROR", "Select an active merchant payment type.", 400)
	}
	if category == "DIGITAL" {
		return "", "", "", app.NewError("FUTURE_IMPROVEMENT", "Digital payment types are reserved for a future improvement and cannot be used yet.", 409)
	}
	return id, name, category, nil
}

var _ outbound.Repository = (*Repository)(nil)

func contextPrefix() string {
	return "WITH ctx AS (SELECT set_config('app.user_id',$1,true), set_config('app.merchant_id',$2,true)) "
}
func scoped(claims *authdto.Claims, q app.ListQuery, alias, searchColumn string) (string, []any) {
	where := alias + ".merchant_id=$2::uuid"
	args := []any{claims.IdentityID, claims.MerchantID}
	if q.Search != "" && searchColumn != "" {
		args = append(args, "%"+q.Search+"%")
		where += fmt.Sprintf(" AND %s ILIKE $%d", searchColumn, len(args))
	}
	return where, args
}
func addFilter(where string, args []any, expr string, value any) (string, []any) {
	args = append(args, value)
	return where + fmt.Sprintf(" AND "+expr, len(args)), args
}
func listRows[T any](ctx context.Context, pool *pgxpool.Pool, prefix, countSQL, dataSQL string, args []any, q app.ListQuery, scan func(pgx.Rows) (T, error)) ([]T, int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)", args[0], args[1]); err != nil {
		return nil, 0, err
	}
	var total int
	if err := tx.QueryRow(ctx, prefix+countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	dataArgs := append([]any{}, args...)
	dataSQL += fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(dataArgs)+1, len(dataArgs)+2)
	dataArgs = append(dataArgs, q.PageSize, q.PageIndex*q.PageSize)
	rows, err := tx.Query(ctx, prefix+dataSQL, dataArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []T{}
	for rows.Next() {
		item, e := scan(rows)
		if e != nil {
			return nil, 0, e
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}
func write[T any](ctx context.Context, pool *pgxpool.Pool, claims *authdto.Claims, fn func(pgx.Tx) (T, error)) (T, error) {
	var zero T
	if tx, ok := ctx.Value(transactionContextKey{}).(pgx.Tx); ok {
		return fn(tx)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)", claims.IdentityID, claims.MerchantID); err != nil {
		return zero, err
	}
	result, err := fn(tx)
	if err != nil {
		return zero, err
	}
	if err = tx.Commit(ctx); err != nil {
		return zero, err
	}
	return result, nil
}

func writeIdempotent[T any](ctx context.Context, pool *pgxpool.Pool, claims *authdto.Claims, scope, key string, request any, fn func(pgx.Tx) (T, error)) (T, error) {
	// A parent command, such as repair-ticket intake, already owns the atomic
	// transaction and its idempotency record. Starting a second transaction for
	// a child command would not be able to see the parent's uncommitted repair
	// order, causing valid parts to be reported as unavailable.
	if tx, ok := ctx.Value(transactionContextKey{}).(pgx.Tx); ok {
		return fn(tx)
	}
	if strings.TrimSpace(key) == "" {
		return write(ctx, pool, claims, fn)
	}
	var zero T
	body, err := json.Marshal(request)
	if err != nil {
		return zero, err
	}
	hash := fmt.Sprintf("%x", sha256.Sum256(body))
	tx, err := pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)", claims.IdentityID, claims.MerchantID); err != nil {
		return zero, err
	}
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,$2,$3,'PROCESSING',jsonb_build_object('request_hash',$4::text),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, claims.MerchantID, scope, key, hash).Scan(&inserted)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return zero, err
	}
	if !inserted {
		var status string
		var sameRequest bool
		var stored json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT status,response_body->>'request_hash'=$4,response_body->'response' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope=$2 AND idempotency_key=$3 FOR UPDATE`, claims.MerchantID, scope, key, hash).Scan(&status, &sameRequest, &stored); err != nil {
			return zero, err
		}
		if !sameRequest {
			return zero, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for different content.", 409)
		}
		if status == "COMPLETED" && len(stored) > 0 {
			var result T
			if err = json.Unmarshal(stored, &result); err != nil {
				return zero, err
			}
			return result, nil
		}
		return zero, app.NewError("REQUEST_IN_PROGRESS", "This request is already being processed.", 409)
	}
	result, err := fn(tx)
	if err != nil {
		return zero, err
	}
	response, err := json.Marshal(result)
	if err != nil {
		return zero, err
	}
	if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=200,response_body=jsonb_build_object('request_hash',$4::text,'response',$5::jsonb) WHERE merchant_id=$1::uuid AND scope=$2 AND idempotency_key=$3`, claims.MerchantID, scope, key, hash, response); err != nil {
		return zero, err
	}
	if err = tx.Commit(ctx); err != nil {
		return zero, err
	}
	return result, nil
}
func required(values ...string) error {
	for _, v := range values {
		if strings.TrimSpace(v) == "" {
			return app.Validation("Required fields are missing.", nil)
		}
	}
	return nil
}

func serviceMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func validRepairStatus(status string) bool {
	switch status {
	case "RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "REFUNDED":
		return true
	default:
		return false
	}
}

// canonicalOrderStatusPath returns only transitions accepted by the canonical
// order state machine. Using an inventory-backed repair part confirms the
// canonical order and consumes stock independently from payment; final payment
// later advances that confirmed order through fulfillment.
func canonicalOrderStatusPath(current, target string) ([]string, error) {
	current = strings.ToUpper(strings.TrimSpace(current))
	target = strings.ToUpper(strings.TrimSpace(target))
	if target == "PENDING_PAYMENT" {
		switch current {
		case "DRAFT":
			return []string{"PENDING_PAYMENT"}, nil
		case "PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PARTIALLY_FULFILLED", "FULFILLED":
			return nil, nil
		default:
			return nil, app.Validation("A payment cannot be recorded for an order in its current status.", map[string]any{"order_status": current})
		}
	}
	if target == "CONFIRMED" {
		switch current {
		case "DRAFT":
			return []string{"PENDING_PAYMENT", "CONFIRMED"}, nil
		case "PENDING_PAYMENT":
			return []string{"CONFIRMED"}, nil
		case "CONFIRMED", "PROCESSING", "PARTIALLY_FULFILLED", "FULFILLED":
			return nil, nil
		default:
			return nil, app.Validation("A repair part cannot be consumed for an order in its current status.", map[string]any{"order_status": current})
		}
	}
	if target != "FULFILLED" {
		return nil, app.Validation("The requested canonical order status is not supported for a repair payment.", map[string]any{"order_status": target})
	}

	path := []string{}
	for current != "FULFILLED" {
		var next string
		switch current {
		case "DRAFT":
			next = "PENDING_PAYMENT"
		case "PENDING_PAYMENT":
			next = "CONFIRMED"
		case "CONFIRMED":
			next = "PROCESSING"
		case "PROCESSING", "PARTIALLY_FULFILLED":
			next = "FULFILLED"
		default:
			return nil, app.Validation("A payment cannot fulfill an order in its current status.", map[string]any{"order_status": current})
		}
		path = append(path, next)
		current = next
	}
	return path, nil
}

func advanceCanonicalOrderStatus(ctx context.Context, tx pgx.Tx, merchantID, orderID, target string) error {
	var current string
	if err := tx.QueryRow(ctx, `SELECT status FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, merchantID, orderID).Scan(&current); err != nil {
		return err
	}
	path, err := canonicalOrderStatusPath(current, target)
	if err != nil {
		return err
	}
	for _, status := range path {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status=$3::text,placed_at=COALESCE(placed_at,now()),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, orderID, status); err != nil {
			return err
		}
	}
	return nil
}

func servicePromotionDiscount(ctx context.Context, tx pgx.Tx, merchantID, promotionID string, gross float64) (float64, error) {
	promotionID = strings.TrimSpace(promotionID)
	if promotionID == "" {
		return 0, nil
	}
	var promotionType, valueText, minimumText string
	if err := tx.QueryRow(ctx, `SELECT promotion_type,value::text,minimum_subtotal::text FROM promotions WHERE merchant_id=$1::uuid AND id=$2 AND is_active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) AND (usage_limit IS NULL OR redemption_count<usage_limit) FOR UPDATE`, merchantID, promotionID).Scan(&promotionType, &valueText, &minimumText); err != nil {
		return 0, app.Validation("The selected promotion is not available for this service.", nil)
	}
	var productScope bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotion_products WHERE merchant_id=$1::uuid AND promotion_id=$2)`, merchantID, promotionID).Scan(&productScope); err != nil {
		return 0, err
	}
	if productScope {
		return 0, app.Validation("This promotion is scoped to products and cannot be applied to a service total.", nil)
	}
	minimum, _ := strconv.ParseFloat(minimumText, 64)
	if gross < minimum {
		return 0, app.Validation("The service total does not meet the promotion minimum.", nil)
	}
	value, _ := strconv.ParseFloat(valueText, 64)
	discount := value
	if promotionType == "PERCENTAGE" {
		discount = gross * value / 100
	}
	return serviceMoney(math.Min(discount, gross)), nil
}

func recordServicePromotion(ctx context.Context, tx pgx.Tx, merchantID, orderID, promotionID string, discount float64) error {
	promotionID = strings.TrimSpace(promotionID)
	if promotionID == "" {
		return nil
	}
	if _, err := tx.Exec(ctx, `INSERT INTO order_promotions(merchant_id,order_id,promotion_id,discount_amount) VALUES($1,$2,$3,$4)`, merchantID, orderID, promotionID, discount); err != nil {
		return app.Validation("This promotion is already applied to the service order.", nil)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO promotion_redemptions(merchant_id,promotion_id,order_id) VALUES($1,$2,$3)`, merchantID, promotionID, orderID); err != nil {
		return err
	}
	return nil
}
func timePtrUTC(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	normalized := value.UTC()
	return &normalized
}
func noID(err error) error {
	if err == nil {
		return nil
	}
	return err
}

func (r *Repository) ListServiceCategories(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.ServiceCategory, int, error) {
	w, a := scoped(c, q, "x", "x.name")
	if v := q.Filter("parent_id"); v != "" {
		w, a = addFilter(w, a, "x.parent_id=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_categories x WHERE "+w, "SELECT x.id,x.merchant_id,x.name,x.parent_id FROM service_categories x CROSS JOIN ctx WHERE "+w+" ORDER BY x.name", a, q, func(rows pgx.Rows) (dto.ServiceCategory, error) {
		var v dto.ServiceCategory
		err := rows.Scan(&v.ID, &v.MerchantID, &v.Name, &v.ParentID)
		return v, err
	})
}
func (r *Repository) CreateServiceCategory(ctx context.Context, c *authdto.Claims, x dto.ServiceCategoryRequest) (dto.ServiceCategory, error) {
	if err := required(x.Name); err != nil {
		return dto.ServiceCategory{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceCategory, error) {
		var v dto.ServiceCategory
		err := tx.QueryRow(ctx, "INSERT INTO service_categories(merchant_id,name,parent_id) VALUES($1,$2,$3) RETURNING id,merchant_id,name,parent_id", c.MerchantID, strings.TrimSpace(x.Name), x.ParentID).Scan(&v.ID, &v.MerchantID, &v.Name, &v.ParentID)
		return v, err
	})
}
func (r *Repository) UpdateServiceCategory(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceCategoryRequest) (dto.ServiceCategory, error) {
	if err := required(x.Name); err != nil {
		return dto.ServiceCategory{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceCategory, error) {
		var v dto.ServiceCategory
		err := tx.QueryRow(ctx, "UPDATE service_categories SET name=$3,parent_id=$4 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,name,parent_id", c.MerchantID, id, strings.TrimSpace(x.Name), x.ParentID).Scan(&v.ID, &v.MerchantID, &v.Name, &v.ParentID)
		return v, err
	})
}
func (r *Repository) DeleteServiceCategory(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_categories x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListServiceCatalog(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.ServiceDefinition, int, error) {
	w, a := scoped(c, q, "x", "x.name")
	if v := q.Filter("category_id"); v != "" {
		w, a = addFilter(w, a, "x.category_id=$%d", v)
	}
	if v := q.Filter("is_active"); v != "" {
		w, a = addFilter(w, a, "x.is_active=$%d", v == "true")
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_catalog x WHERE "+w, "SELECT x.id,x.merchant_id,x.category_id,x.code,x.name,x.description,x.duration_minutes,x.is_active,x.labor_fee::text FROM service_catalog x CROSS JOIN ctx WHERE "+w+" ORDER BY x.name", a, q, func(rows pgx.Rows) (dto.ServiceDefinition, error) {
		var v dto.ServiceDefinition
		err := rows.Scan(&v.ID, &v.MerchantID, &v.CategoryID, &v.Code, &v.Name, &v.Description, &v.DurationMinutes, &v.IsActive, &v.LaborFee)
		return v, err
	})
}
func (r *Repository) CreateServiceCatalog(ctx context.Context, c *authdto.Claims, x dto.ServiceDefinitionRequest) (dto.ServiceDefinition, error) {
	if err := required(x.Code, x.Name); err != nil {
		return dto.ServiceDefinition{}, err
	}
	active := true
	if x.IsActive != nil {
		active = *x.IsActive
	}
	return writeIdempotent(ctx, r.pool, c, "services.catalog", app.IdempotencyKey(ctx), x, func(tx pgx.Tx) (dto.ServiceDefinition, error) {
		var v dto.ServiceDefinition
		err := tx.QueryRow(ctx, "INSERT INTO service_catalog(merchant_id,category_id,code,name,description,duration_minutes,is_active,labor_fee) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,merchant_id,category_id,code,name,description,duration_minutes,is_active,labor_fee::text", c.MerchantID, x.CategoryID, strings.TrimSpace(x.Code), strings.TrimSpace(x.Name), x.Description, nil, active, x.LaborFee).Scan(&v.ID, &v.MerchantID, &v.CategoryID, &v.Code, &v.Name, &v.Description, &v.DurationMinutes, &v.IsActive, &v.LaborFee)
		return v, err
	})
}
func (r *Repository) UpdateServiceCatalog(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceDefinitionRequest) (dto.ServiceDefinition, error) {
	if err := required(x.Code, x.Name); err != nil {
		return dto.ServiceDefinition{}, err
	}
	return writeIdempotent(ctx, r.pool, c, "services.catalog", app.IdempotencyKey(ctx), struct {
		ID      string                       `json:"id"`
		Request dto.ServiceDefinitionRequest `json:"request"`
	}{ID: id, Request: x}, func(tx pgx.Tx) (dto.ServiceDefinition, error) {
		var v dto.ServiceDefinition
		err := tx.QueryRow(ctx, "UPDATE service_catalog SET category_id=$3,code=$4,name=$5,description=$6,duration_minutes=NULL,is_active=COALESCE($7,is_active),labor_fee=$8 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,category_id,code,name,description,duration_minutes,is_active,labor_fee::text", c.MerchantID, id, x.CategoryID, x.Code, x.Name, x.Description, x.IsActive, x.LaborFee).Scan(&v.ID, &v.MerchantID, &v.CategoryID, &v.Code, &v.Name, &v.Description, &v.DurationMinutes, &v.IsActive, &v.LaborFee)
		return v, err
	})
}
func (r *Repository) DeleteServiceCatalog(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeIdempotent(ctx, r.pool, c, "services.catalog", app.IdempotencyKey(ctx), struct {
		ID string `json:"id"`
	}{ID: id}, func(tx pgx.Tx) (struct{}, error) {
		result, e := tx.Exec(ctx, "DELETE FROM service_catalog WHERE merchant_id=$1::uuid AND id=$2", c.MerchantID, id)
		if e == nil && result.RowsAffected() == 0 {
			e = pgx.ErrNoRows
		}
		return struct{}{}, e
	})
	return err
}

func (r *Repository) ListServicePrices(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.ServicePrice, int, error) {
	w, a := scoped(c, q, "x", "x.service_id::text")
	for _, key := range []string{"service_id", "price_list_id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_prices x WHERE "+w, "SELECT x.merchant_id,x.service_id,x.price_list_id,x.amount,x.valid_from,x.valid_until FROM service_prices x CROSS JOIN ctx WHERE "+w+" ORDER BY x.valid_from DESC", a, q, func(rows pgx.Rows) (dto.ServicePrice, error) {
		var v dto.ServicePrice
		err := rows.Scan(&v.MerchantID, &v.ServiceID, &v.PriceListID, &v.Amount, &v.ValidFrom, &v.ValidUntil)
		return v, err
	})
}
func (r *Repository) UpsertServicePrice(ctx context.Context, c *authdto.Claims, x dto.ServicePriceRequest) (dto.ServicePrice, error) {
	if err := required(x.ServiceID, x.Amount); err != nil {
		return dto.ServicePrice{}, err
	}
	valid := time.Now().UTC()
	if x.ValidFrom != nil {
		valid = x.ValidFrom.UTC()
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServicePrice, error) {
		var v dto.ServicePrice
		err := tx.QueryRow(ctx, "INSERT INTO service_prices(merchant_id,service_id,price_list_id,amount,valid_from,valid_until) VALUES($1,$2,$3,$4,$5,$6) RETURNING merchant_id,service_id,price_list_id,amount,valid_from,valid_until", c.MerchantID, x.ServiceID, x.PriceListID, x.Amount, valid, x.ValidUntil).Scan(&v.MerchantID, &v.ServiceID, &v.PriceListID, &v.Amount, &v.ValidFrom, &v.ValidUntil)
		return v, err
	})
}
func (r *Repository) DeleteServicePrice(ctx context.Context, c *authdto.Claims, serviceID, validFrom string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_prices x USING ctx WHERE x.merchant_id=$2 AND x.service_id=$3 AND x.valid_from=$4", c.IdentityID, c.MerchantID, serviceID, validFrom)
	return err
}

func (r *Repository) ListServiceOrders(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.ServiceOrder, int, error) {
	w, a := scoped(c, q, "x", "x.order_number")
	for _, key := range []string{"status", "service_type", "priority", "shop_id", "customer_id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_orders x WHERE "+w, "SELECT x.id,x.merchant_id,x.customer_id,x.patient_id,x.shop_id,x.order_id,x.order_number,x.service_type,x.status,x.priority,x.opened_at,x.completed_at FROM service_orders x CROSS JOIN ctx WHERE "+w+" ORDER BY x.opened_at DESC", a, q, func(rows pgx.Rows) (dto.ServiceOrder, error) {
		var v dto.ServiceOrder
		err := rows.Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.PatientID, &v.ShopID, &v.OrderID, &v.OrderNumber, &v.ServiceType, &v.Status, &v.Priority, &v.OpenedAt, &v.CompletedAt)
		return v, err
	})
}
func (r *Repository) GetServiceOrder(ctx context.Context, c *authdto.Claims, id string) (dto.ServiceOrder, error) {
	var v dto.ServiceOrder
	err := r.pool.QueryRow(ctx, contextPrefix()+"SELECT x.id,x.merchant_id,x.customer_id,x.patient_id,x.shop_id,x.order_id,x.order_number,x.service_type,x.status,x.priority,x.opened_at,x.completed_at FROM service_orders x CROSS JOIN ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id).Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.PatientID, &v.ShopID, &v.OrderID, &v.OrderNumber, &v.ServiceType, &v.Status, &v.Priority, &v.OpenedAt, &v.CompletedAt)
	return v, err
}
func (r *Repository) CreateServiceOrder(ctx context.Context, c *authdto.Claims, x dto.ServiceOrderRequest) (dto.ServiceOrder, error) {
	if err := required(x.OrderNumber); err != nil {
		return dto.ServiceOrder{}, err
	}
	typ := x.ServiceType
	if typ == "" {
		typ = "GENERAL"
	}
	status := x.Status
	if status == "" {
		status = "OPEN"
	}
	priority := x.Priority
	if priority == "" {
		priority = "NORMAL"
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceOrder, error) {
		if typ == "REPAIR" && x.OrderID == nil {
			var assignedShopID *string
			if c.MembershipID != "" {
				if err := tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, c.MembershipID).Scan(&assignedShopID); err != nil {
					return dto.ServiceOrder{}, err
				}
			}
			if assignedShopID != nil {
				x.ShopID = assignedShopID
			}
			if x.ShopID == nil {
				return dto.ServiceOrder{}, app.Validation("A receiving shop is required for a repair order.", map[string]any{"shop_id": "required"})
			}
			var locationID, currency, orderID string
			if err := tx.QueryRow(ctx, `SELECT l.id FROM locations l JOIN shops s ON s.merchant_id=l.merchant_id AND s.id=l.shop_id WHERE l.merchant_id=$1::uuid AND l.shop_id=$2 AND l.is_active AND s.is_active ORDER BY CASE l.location_type WHEN 'SHOP' THEN 0 ELSE 1 END,l.id LIMIT 1`, c.MerchantID, *x.ShopID).Scan(&locationID); err != nil {
				return dto.ServiceOrder{}, app.Validation("The repair shop needs an active stock location.", nil)
			}
			if err := tx.QueryRow(ctx, `SELECT default_currency_code FROM merchants WHERE id=$1`, c.MerchantID).Scan(&currency); err != nil {
				return dto.ServiceOrder{}, err
			}
			if err := tx.QueryRow(ctx, `INSERT INTO orders(merchant_id,fulfillment_location_id,order_number,channel,status,currency_code,subtotal,discount_total,tax_total,shipping_total,grand_total) VALUES($1,$2,$3,'SERVICE','DRAFT',$4,0,0,0,0,0) RETURNING id`, c.MerchantID, locationID, x.OrderNumber, currency).Scan(&orderID); err != nil {
				return dto.ServiceOrder{}, err
			}
			x.OrderID = &orderID
		}
		var v dto.ServiceOrder
		err := tx.QueryRow(ctx, "INSERT INTO service_orders(merchant_id,customer_id,patient_id,shop_id,order_id,order_number,service_type,status,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,merchant_id,customer_id,patient_id,shop_id,order_id,order_number,service_type,status,priority,opened_at,completed_at", c.MerchantID, x.CustomerID, x.PatientID, x.ShopID, x.OrderID, x.OrderNumber, typ, status, priority).Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.PatientID, &v.ShopID, &v.OrderID, &v.OrderNumber, &v.ServiceType, &v.Status, &v.Priority, &v.OpenedAt, &v.CompletedAt)
		return v, err
	})
}
func (r *Repository) UpdateServiceOrder(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceOrderRequest) (dto.ServiceOrder, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceOrder, error) {
		var v dto.ServiceOrder
		err := tx.QueryRow(ctx, "UPDATE service_orders SET customer_id=$3,patient_id=$4,shop_id=$5,order_number=$6,service_type=$7,status=$8,priority=$9,completed_at=CASE WHEN $8='COMPLETED' THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,customer_id,patient_id,shop_id,order_id,order_number,service_type,status,priority,opened_at,completed_at", c.MerchantID, id, x.CustomerID, x.PatientID, x.ShopID, x.OrderNumber, x.ServiceType, x.Status, x.Priority).Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.PatientID, &v.ShopID, &v.OrderID, &v.OrderNumber, &v.ServiceType, &v.Status, &v.Priority, &v.OpenedAt, &v.CompletedAt)
		return v, err
	})
}
func (r *Repository) DeleteServiceOrder(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_orders x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListServiceOrderItems(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.ServiceOrderItem, int, error) {
	w, a := scoped(c, q, "x", "x.description")
	w, a = addFilter(w, a, "x.service_order_id=$%d", orderID)
	for _, key := range []string{"status", "service_id", "variant_id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_order_items x WHERE "+w, "SELECT x.id,x.merchant_id,x.service_order_id,x.work_item_id,x.service_id,x.variant_id,x.description,x.quantity,x.unit_price,x.status FROM service_order_items x CROSS JOIN ctx WHERE "+w+" ORDER BY x.id", a, q, func(rows pgx.Rows) (dto.ServiceOrderItem, error) {
		var v dto.ServiceOrderItem
		err := rows.Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.WorkItemID, &v.ServiceID, &v.VariantID, &v.Description, &v.Quantity, &v.UnitPrice, &v.Status)
		return v, err
	})
}
func (r *Repository) CreateServiceOrderItem(ctx context.Context, c *authdto.Claims, x dto.ServiceOrderItemRequest) (dto.ServiceOrderItem, error) {
	if err := required(x.Description, x.Quantity, x.UnitPrice); err != nil {
		return dto.ServiceOrderItem{}, err
	}
	if x.Status == "" {
		x.Status = "OPEN"
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceOrderItem, error) {
		if err := validateServiceOrderWorkItem(tx, ctx, c.MerchantID, x.ServiceOrderID, x.WorkItemID); err != nil {
			return dto.ServiceOrderItem{}, err
		}
		var v dto.ServiceOrderItem
		err := tx.QueryRow(ctx, "INSERT INTO service_order_items(merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity,unit_price,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity,unit_price,status", c.MerchantID, x.ServiceOrderID, x.WorkItemID, x.ServiceID, x.VariantID, x.Description, x.Quantity, x.UnitPrice, x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.WorkItemID, &v.ServiceID, &v.VariantID, &v.Description, &v.Quantity, &v.UnitPrice, &v.Status)
		return v, err
	})
}
func (r *Repository) UpdateServiceOrderItem(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceOrderItemRequest) (dto.ServiceOrderItem, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceOrderItem, error) {
		if err := validateServiceOrderWorkItem(tx, ctx, c.MerchantID, x.ServiceOrderID, x.WorkItemID); err != nil {
			return dto.ServiceOrderItem{}, err
		}
		var v dto.ServiceOrderItem
		err := tx.QueryRow(ctx, "UPDATE service_order_items SET work_item_id=$3,service_id=$4,variant_id=$5,description=$6,quantity=$7,unit_price=$8,status=COALESCE($9,status) WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity,unit_price,status", c.MerchantID, id, x.WorkItemID, x.ServiceID, x.VariantID, x.Description, x.Quantity, x.UnitPrice, x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.WorkItemID, &v.ServiceID, &v.VariantID, &v.Description, &v.Quantity, &v.UnitPrice, &v.Status)
		return v, err
	})
}
func (r *Repository) DeleteServiceOrderItem(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_order_items x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListAppointments(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.ServiceAppointment, int, error) {
	w, a := scoped(c, q, "x", "x.status")
	w, a = addFilter(w, a, "x.service_order_id=$%d", orderID)
	for _, key := range []string{"status", "shop_id", "assigned_membership_id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_appointments x WHERE "+w, "SELECT x.id,x.merchant_id,x.service_order_id,x.shop_id,x.assigned_membership_id,x.starts_at,x.ends_at,x.status FROM service_appointments x CROSS JOIN ctx WHERE "+w+" ORDER BY x.starts_at DESC", a, q, func(rows pgx.Rows) (dto.ServiceAppointment, error) {
		var v dto.ServiceAppointment
		err := rows.Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.AssignedMembershipID, &v.StartsAt, &v.EndsAt, &v.Status)
		return v, err
	})
}
func (r *Repository) CreateAppointment(ctx context.Context, c *authdto.Claims, x dto.ServiceAppointmentRequest) (dto.ServiceAppointment, error) {
	if x.Status == "" {
		x.Status = "REQUESTED"
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceAppointment, error) {
		var v dto.ServiceAppointment
		err := tx.QueryRow(ctx, "INSERT INTO service_appointments(merchant_id,service_order_id,shop_id,assigned_membership_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,merchant_id,service_order_id,shop_id,assigned_membership_id,starts_at,ends_at,status", c.MerchantID, x.ServiceOrderID, x.ShopID, x.AssignedMembershipID, x.StartsAt.UTC(), x.EndsAt.UTC(), x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.AssignedMembershipID, &v.StartsAt, &v.EndsAt, &v.Status)
		return v, err
	})
}
func (r *Repository) UpdateAppointment(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceAppointmentRequest) (dto.ServiceAppointment, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceAppointment, error) {
		var v dto.ServiceAppointment
		err := tx.QueryRow(ctx, "UPDATE service_appointments SET service_order_id=$3,shop_id=$4,assigned_membership_id=$5,starts_at=$6,ends_at=$7,status=COALESCE($8,status) WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,service_order_id,shop_id,assigned_membership_id,starts_at,ends_at,status", c.MerchantID, id, x.ServiceOrderID, x.ShopID, x.AssignedMembershipID, x.StartsAt.UTC(), x.EndsAt.UTC(), x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.AssignedMembershipID, &v.StartsAt, &v.EndsAt, &v.Status)
		return v, err
	})
}
func (r *Repository) DeleteAppointment(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_appointments x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListNotes(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.ServiceNote, int, error) {
	w, a := scoped(c, q, "x", "x.note")
	w, a = addFilter(w, a, "x.service_order_id=$%d", orderID)
	if v := q.Filter("author_membership_id"); v != "" {
		w, a = addFilter(w, a, "x.author_membership_id=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_order_notes x WHERE "+w, "SELECT x.id,x.merchant_id,x.service_order_id,x.author_membership_id,x.note,x.created_at FROM service_order_notes x CROSS JOIN ctx WHERE "+w+" ORDER BY x.created_at DESC", a, q, func(rows pgx.Rows) (dto.ServiceNote, error) {
		var v dto.ServiceNote
		err := rows.Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.AuthorMembershipID, &v.Note, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) CreateNote(ctx context.Context, c *authdto.Claims, x dto.ServiceNoteRequest) (dto.ServiceNote, error) {
	if err := required(x.ServiceOrderID, x.Note); err != nil {
		return dto.ServiceNote{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceNote, error) {
		var v dto.ServiceNote
		err := tx.QueryRow(ctx, "INSERT INTO service_order_notes(merchant_id,service_order_id,author_membership_id,note) VALUES($1,$2,$3,$4) RETURNING id,merchant_id,service_order_id,author_membership_id,note,created_at", c.MerchantID, x.ServiceOrderID, x.AuthorMembershipID, x.Note).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.AuthorMembershipID, &v.Note, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) DeleteNote(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_order_notes x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListBillings(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.ServiceBilling, int, error) {
	w, a := scoped(c, q, "x", "x.status")
	w, a = addFilter(w, a, "x.service_order_id=$%d", orderID)
	if v := q.Filter("status"); v != "" {
		w, a = addFilter(w, a, "x.status=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM service_order_billings x WHERE "+w, "SELECT x.id,x.merchant_id,x.service_order_id,x.ar_document_id,x.amount,x.status FROM service_order_billings x CROSS JOIN ctx WHERE "+w+" ORDER BY x.id", a, q, func(rows pgx.Rows) (dto.ServiceBilling, error) {
		var v dto.ServiceBilling
		err := rows.Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ARDocumentID, &v.Amount, &v.Status)
		return v, err
	})
}
func (r *Repository) CreateBilling(ctx context.Context, c *authdto.Claims, x dto.ServiceBillingRequest) (dto.ServiceBilling, error) {
	if err := required(x.ServiceOrderID, x.Amount); err != nil {
		return dto.ServiceBilling{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceBilling, error) {
		var v dto.ServiceBilling
		if x.Status == "" {
			x.Status = "PENDING"
		}
		var orderID, shopID, customerID, orderNumber, serviceType string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(so.order_id::text,''),COALESCE(so.shop_id::text,''),COALESCE(so.customer_id::text,''),so.order_number,so.service_type FROM service_orders so WHERE so.merchant_id=$1::uuid AND so.id=$2`, c.MerchantID, x.ServiceOrderID).Scan(&orderID, &shopID, &customerID, &orderNumber, &serviceType); err != nil {
			return dto.ServiceBilling{}, err
		}
		if serviceType == "REPAIR" {
			return dto.ServiceBilling{}, app.Validation("Repairs use deposits and final payments instead of service billings.", nil)
		}
		gross, parseErr := strconv.ParseFloat(x.Amount, 64)
		if parseErr != nil || gross < 0 {
			return dto.ServiceBilling{}, app.Validation("The service amount must be a valid non-negative amount.", nil)
		}
		if orderID == "" && shopID != "" {
			var locationID, currency string
			if err := tx.QueryRow(ctx, `SELECT l.id FROM locations l JOIN shops s ON s.merchant_id=l.merchant_id AND s.id=l.shop_id WHERE l.merchant_id=$1::uuid AND l.shop_id=$2::uuid AND l.is_active AND s.is_active ORDER BY CASE l.location_type WHEN 'SHOP' THEN 0 ELSE 1 END,l.id LIMIT 1`, c.MerchantID, shopID).Scan(&locationID); err != nil {
				return dto.ServiceBilling{}, app.Validation("The service shop needs an active stock location before checkout.", nil)
			}
			if err := tx.QueryRow(ctx, `SELECT default_currency_code FROM merchants WHERE id=$1::uuid`, c.MerchantID).Scan(&currency); err != nil {
				return dto.ServiceBilling{}, err
			}
			if err := tx.QueryRow(ctx, `INSERT INTO orders(merchant_id,customer_id,fulfillment_location_id,order_number,channel,status,currency_code,subtotal,discount_total,tax_total,shipping_total,grand_total) VALUES($1,NULLIF($2,'')::uuid,$3,$4,'SERVICE','DRAFT',$5,0,0,0,0,0) RETURNING id`, c.MerchantID, customerID, locationID, orderNumber, currency).Scan(&orderID); err != nil {
				return dto.ServiceBilling{}, err
			}
			if _, err := tx.Exec(ctx, `UPDATE service_orders SET order_id=$3 WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, x.ServiceOrderID, orderID); err != nil {
				return dto.ServiceBilling{}, err
			}
		}
		if orderID == "" && strings.TrimSpace(stringValue(x.PromotionID)) != "" {
			return dto.ServiceBilling{}, app.Validation("A shop is required before applying a promotion to a service.", map[string]any{"shop_id": "required"})
		}
		discount, err := servicePromotionDiscount(ctx, tx, c.MerchantID, stringValue(x.PromotionID), gross)
		if err != nil {
			return dto.ServiceBilling{}, err
		}
		net := serviceMoney(gross - discount)
		amount := fmt.Sprintf("%.2f", net)
		if orderID != "" {
			var currentSubtotalText, currentDiscountText string
			if err = tx.QueryRow(ctx, `SELECT subtotal::text,discount_total::text FROM orders WHERE merchant_id=$1::uuid AND id=$2 FOR UPDATE`, c.MerchantID, orderID).Scan(&currentSubtotalText, &currentDiscountText); err != nil {
				return dto.ServiceBilling{}, err
			}
			currentSubtotal, _ := strconv.ParseFloat(currentSubtotalText, 64)
			currentDiscount, _ := strconv.ParseFloat(currentDiscountText, 64)
			totalGross := serviceMoney(currentSubtotal + gross)
			totalDiscount := serviceMoney(currentDiscount + discount)
			totalNet := serviceMoney(totalGross - totalDiscount)
			var lineNumber int
			if err = tx.QueryRow(ctx, `SELECT COALESCE(max(line_number),0)+1 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2`, c.MerchantID, orderID).Scan(&lineNumber); err != nil {
				return dto.ServiceBilling{}, err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1,$2,$3,'Service billing',1,$4,$5,0,$6)`, c.MerchantID, orderID, lineNumber, gross, discount, net); err != nil {
				return dto.ServiceBilling{}, err
			}
			orderStatus := "PENDING_PAYMENT"
			if x.Status == "PAID" {
				orderStatus = "FULFILLED"
			} else if x.Status == "VOID" {
				orderStatus = "CANCELLED"
			}
			if _, err = tx.Exec(ctx, `UPDATE orders SET customer_id=COALESCE(NULLIF($3,'')::uuid,customer_id),status=$4,subtotal=$5,discount_total=$6,grand_total=$7,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID, customerID, orderStatus, totalGross, totalDiscount, totalNet); err != nil {
				return dto.ServiceBilling{}, err
			}
			if err = recordServicePromotion(ctx, tx, c.MerchantID, orderID, stringValue(x.PromotionID), discount); err != nil {
				return dto.ServiceBilling{}, err
			}
		}
		err = tx.QueryRow(ctx, "INSERT INTO service_order_billings(merchant_id,service_order_id,ar_document_id,amount,status) VALUES($1,$2,$3,$4,$5) RETURNING id,merchant_id,service_order_id,ar_document_id,amount,status", c.MerchantID, x.ServiceOrderID, x.ARDocumentID, amount, x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ARDocumentID, &v.Amount, &v.Status)
		return v, err
	})
}
func (r *Repository) UpdateBilling(ctx context.Context, c *authdto.Claims, id string, x dto.ServiceBillingRequest) (dto.ServiceBilling, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.ServiceBilling, error) {
		var v dto.ServiceBilling
		err := tx.QueryRow(ctx, "UPDATE service_order_billings SET service_order_id=$3,ar_document_id=$4,amount=$5,status=COALESCE($6,status) WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,service_order_id,ar_document_id,amount,status", c.MerchantID, id, x.ServiceOrderID, x.ARDocumentID, x.Amount, x.Status).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ARDocumentID, &v.Amount, &v.Status)
		return v, err
	})
}
func (r *Repository) DeleteBilling(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM service_order_billings x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListRepairDevices(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.RepairDevice, int, error) {
	w, a := scoped(c, q, "x", "x.device_type")
	if v := q.Filter("customer_id"); v != "" {
		w, a = addFilter(w, a, "x.customer_id=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_devices x WHERE "+w, "SELECT x.id,x.merchant_id,x.customer_id,x.device_type,x.manufacturer,x.model,x.serial_number,x.metadata,x.created_at FROM repair_devices x CROSS JOIN ctx WHERE "+w+" ORDER BY x.created_at DESC", a, q, func(rows pgx.Rows) (dto.RepairDevice, error) {
		var v dto.RepairDevice
		err := rows.Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.DeviceType, &v.Manufacturer, &v.Model, &v.SerialNumber, &v.Metadata, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) CreateRepairDevice(ctx context.Context, c *authdto.Claims, x dto.RepairDeviceRequest) (dto.RepairDevice, error) {
	if err := required(x.DeviceType); err != nil {
		return dto.RepairDevice{}, err
	}
	meta := x.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairDevice, error) {
		var v dto.RepairDevice
		err := tx.QueryRow(ctx, "INSERT INTO repair_devices(merchant_id,customer_id,device_type,manufacturer,model,serial_number,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,merchant_id,customer_id,device_type,manufacturer,model,serial_number,metadata,created_at", c.MerchantID, x.CustomerID, x.DeviceType, x.Manufacturer, x.Model, x.SerialNumber, meta).Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.DeviceType, &v.Manufacturer, &v.Model, &v.SerialNumber, &v.Metadata, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) UpdateRepairDevice(ctx context.Context, c *authdto.Claims, id string, x dto.RepairDeviceRequest) (dto.RepairDevice, error) {
	meta := x.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairDevice, error) {
		var v dto.RepairDevice
		err := tx.QueryRow(ctx, "UPDATE repair_devices SET customer_id=$3,device_type=$4,manufacturer=$5,model=$6,serial_number=$7,metadata=$8 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,customer_id,device_type,manufacturer,model,serial_number,metadata,created_at", c.MerchantID, id, x.CustomerID, x.DeviceType, x.Manufacturer, x.Model, x.SerialNumber, meta).Scan(&v.ID, &v.MerchantID, &v.CustomerID, &v.DeviceType, &v.Manufacturer, &v.Model, &v.SerialNumber, &v.Metadata, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) DeleteRepairDevice(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_devices x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListRepairOrders(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]dto.RepairOrder, int, error) {
	shopID := q.Filter("shop_id")
	w, a := scoped(c, q, "x", "x.order_number")
	w, a = addFilter(w, a, `EXISTS(SELECT 1 FROM (SELECT NULLIF($%d,'')::uuid AS mid) scope LEFT JOIN user_memberships um ON um.merchant_id=x.merchant_id AND um.id=scope.mid WHERE scope.mid IS NULL OR um.shop_id IS NULL OR EXISTS(SELECT 1 FROM service_orders so WHERE so.merchant_id=x.merchant_id AND so.id=x.service_order_id AND so.shop_id=um.shop_id))`, c.MembershipID)
	for _, key := range []string{"status", "device_id", "service_order_id", "id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	if shopID != "" {
		w, a = addFilter(w, a, `EXISTS(SELECT 1 FROM service_orders so WHERE so.merchant_id=x.merchant_id AND so.id=x.service_order_id AND so.shop_id=$%d)`, shopID)
	}
	items, total, err := listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_orders x WHERE "+w, "SELECT x.id,x.merchant_id,x.service_order_id,so.shop_id,x.device_id,x.order_number,x.status,x.issue_description,x.received_at,x.completed_at,x.customer_id,x.customer_name,x.customer_phone,COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text,x.deposit_paid::text,x.payment_status,x.service_id,x.promotion_id,x.labor_fee::text,x.additional_fee::text,x.tax_amount::text,x.total_cost::text,x.note,x.form_version FROM repair_orders x LEFT JOIN service_orders so ON so.merchant_id=x.merchant_id AND so.id=x.service_order_id LEFT JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id CROSS JOIN ctx WHERE "+w+" ORDER BY x.received_at DESC", a, q, func(rows pgx.Rows) (dto.RepairOrder, error) {
		var v dto.RepairOrder
		err := rows.Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.DeviceID, &v.OrderNumber, &v.Status, &v.IssueDescription, &v.ReceivedAt, &v.CompletedAt, &v.CustomerID, &v.CustomerName, &v.CustomerPhone, &v.Subtotal, &v.DiscountTotal, &v.DepositPaid, &v.PaymentStatus, &v.ServiceID, &v.PromotionID, &v.LaborFee, &v.AdditionalFee, &v.TaxAmount, &v.TotalCost, &v.Note, &v.FormVersion)
		return v, err
	})
	if err != nil {
		return nil, 0, err
	}
	workItemQuery := app.NewListQuery("", "", 0, 100)
	for index := range items {
		items[index].WorkItems, _, err = r.ListRepairWorkItems(ctx, c, items[index].ID, workItemQuery)
		if err != nil {
			return nil, 0, err
		}
		fieldMap, fieldVersion, fieldErr := r.customFieldMap(ctx, c, "REPAIR_TICKET", items[index].ID)
		items[index].Fields = fieldMap
		err = fieldErr
		if err != nil {
			return nil, 0, err
		}
		if fieldVersion > items[index].FormVersion {
			items[index].FormVersion = fieldVersion
		}
		applyRepairWaitingRange(&items[index])
	}
	return items, total, nil
}
func (r *Repository) GetRepairOrder(ctx context.Context, c *authdto.Claims, id string) (dto.RepairOrder, error) {
	var v dto.RepairOrder
	err := r.pool.QueryRow(ctx, contextPrefix()+`SELECT x.id,x.merchant_id,x.service_order_id,so.shop_id,x.device_id,x.order_number,x.status,x.issue_description,x.received_at,x.completed_at,x.customer_id,x.customer_name,x.customer_phone,COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text,x.deposit_paid::text,x.payment_status,x.service_id,x.promotion_id,x.labor_fee::text,x.additional_fee::text,x.tax_amount::text,x.total_cost::text,x.note,x.form_version
		FROM repair_orders x JOIN service_orders so ON so.merchant_id=x.merchant_id AND so.id=x.service_order_id LEFT JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id CROSS JOIN ctx
		WHERE x.merchant_id=$2::uuid AND x.id=$3::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=NULLIF($4,'')::uuid) IS NULL OR so.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=NULLIF($4,'')::uuid))`, c.IdentityID, c.MerchantID, id, c.MembershipID).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.DeviceID, &v.OrderNumber, &v.Status, &v.IssueDescription, &v.ReceivedAt, &v.CompletedAt, &v.CustomerID, &v.CustomerName, &v.CustomerPhone, &v.Subtotal, &v.DiscountTotal, &v.DepositPaid, &v.PaymentStatus, &v.ServiceID, &v.PromotionID, &v.LaborFee, &v.AdditionalFee, &v.TaxAmount, &v.TotalCost, &v.Note, &v.FormVersion)
	if err != nil {
		return v, err
	}
	v.WorkItems, _, err = r.ListRepairWorkItems(ctx, c, v.ID, app.NewListQuery("", "", 0, 100))
	if err != nil {
		return v, err
	}
	fieldMap, fieldVersion, fieldErr := r.customFieldMap(ctx, c, "REPAIR_TICKET", v.ID)
	v.Fields = fieldMap
	err = fieldErr
	if fieldVersion > v.FormVersion {
		v.FormVersion = fieldVersion
	}
	applyRepairWaitingRange(&v)
	return v, err
}

func (r *Repository) ListRepairWorkItems(ctx context.Context, c *authdto.Claims, repairOrderID string, q app.ListQuery) ([]dto.RepairWorkItem, int, error) {
	where, args := scoped(c, q, "ro", "")
	where, args = addFilter(where, args, "ro.id=$%d::uuid", repairOrderID)
	join := ` FROM repair_orders ro
		JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id
		JOIN repair_work_item_devices wid ON wid.merchant_id=wi.merchant_id AND wid.work_item_id=wi.id
		JOIN repair_devices d ON d.merchant_id=wid.merchant_id AND d.id=wid.repair_device_id
		JOIN LATERAL (` + workItemFinancialSQL + `) finance ON TRUE `
	dataSQL := `SELECT wi.id,wi.service_order_id,wi.sequence_number,wi.item_type,wi.status,wi.form_version,wi.summary,
		d.id,d.merchant_id,d.customer_id,d.device_type,d.manufacturer,d.model,d.serial_number,d.metadata,d.created_at,
		wid.issue_description,wid.issues,wid.conditions,wid.notes,wid.additional_fee::text,wid.waiting_start_date::text,wid.waiting_end_date::text,(wid.waiting_end_date-wid.waiting_start_date)::int,wid.custom_fields,
		finance.subtotal::text,finance.discount_total::text,finance.tax_amount::text,finance.total::text,finance.paid::text,GREATEST(finance.total-finance.paid,0)::text` + join + ` CROSS JOIN ctx WHERE ` + where + ` ORDER BY wi.sequence_number`
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*)"+join+" CROSS JOIN ctx WHERE "+where, dataSQL, args, q, func(rows pgx.Rows) (dto.RepairWorkItem, error) {
		var item dto.RepairWorkItem
		var fields, issues, conditions json.RawMessage
		if err := rows.Scan(&item.ID, &item.ServiceOrderID, &item.SequenceNumber, &item.Type, &item.Status, &item.FormVersion, &item.Summary,
			&item.Device.ID, &item.Device.MerchantID, &item.Device.CustomerID, &item.Device.DeviceType, &item.Device.Manufacturer,
			&item.Device.Model, &item.Device.SerialNumber, &item.Device.Metadata, &item.Device.CreatedAt,
			&item.IssueDescription, &issues, &conditions, &item.Note, &item.AdditionalFee, &item.WaitingStartDate, &item.WaitingEndDate, &item.WaitingDays, &fields,
			&item.Financials.Subtotal, &item.Financials.DiscountTotal, &item.Financials.TaxAmount, &item.Financials.Total, &item.Financials.Paid, &item.Financials.Balance); err != nil {
			return item, err
		}
		if err := decodeRepairLists(&item, issues, conditions); err != nil {
			return item, err
		}
		item.Fields = map[string]json.RawMessage{}
		if len(fields) > 0 && string(fields) != "null" {
			if err := json.Unmarshal(fields, &item.Fields); err != nil {
				return item, err
			}
		}
		return item, nil
	})
}
func (r *Repository) CreateRepairOrder(ctx context.Context, c *authdto.Claims, x dto.RepairOrderRequest) (dto.RepairOrder, error) {
	if err := required(x.ServiceOrderID, x.DeviceID, x.OrderNumber, x.IssueDescription); err != nil {
		return dto.RepairOrder{}, err
	}
	status := x.Status
	if status == "" {
		status = "RECEIVED"
	}
	if !validRepairStatus(status) {
		return dto.RepairOrder{}, app.Validation("Repair status must be Received, In progress, Ready for pickup, Complete and closed, or Refund.", map[string]any{"status": "invalid"})
	}
	received := time.Now().UTC()
	if x.ReceivedAt != nil {
		received = x.ReceivedAt.UTC()
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairOrder, error) {
		customerID := x.CustomerID
		if customerID == nil && strings.TrimSpace(stringValue(x.CustomerName)) != "" {
			var created string
			if err := tx.QueryRow(ctx, `INSERT INTO customers(merchant_id,customer_number,display_name,phone) VALUES($1,'REP-'||substring(uuid_generate_v4()::text,1,8),$2,$3) RETURNING id`, c.MerchantID, strings.TrimSpace(stringValue(x.CustomerName)), nullableString(x.CustomerPhone)).Scan(&created); err != nil {
				return dto.RepairOrder{}, err
			}
			customerID = &created
		}
		catalogLabor := x.LaborFee
		if x.ServiceID != nil && strings.TrimSpace(*x.ServiceID) != "" {
			if err := tx.QueryRow(ctx, `SELECT labor_fee::text FROM service_catalog WHERE merchant_id=$1::uuid AND id=$2 AND is_active`, c.MerchantID, *x.ServiceID).Scan(&catalogLabor); err != nil {
				return dto.RepairOrder{}, app.Validation("The selected service catalog item is unavailable.", nil)
			}
		}
		if catalogLabor == "" {
			catalogLabor = "0"
		}
		additionalFee := x.AdditionalFee
		if additionalFee == "" {
			additionalFee = "0"
		}
		catalogValue, catalogErr := strconv.ParseFloat(catalogLabor, 64)
		additionalValue, additionalErr := strconv.ParseFloat(additionalFee, 64)
		if catalogErr != nil || additionalErr != nil || catalogValue < 0 || additionalValue < 0 {
			return dto.RepairOrder{}, app.Validation("Service and price must be valid non-negative amounts.", nil)
		}
		grossCost := catalogValue + additionalValue
		if grossCost < 0 {
			return dto.RepairOrder{}, app.Validation("The repair total must be a valid non-negative amount.", nil)
		}
		discount, err := servicePromotionDiscount(ctx, tx, c.MerchantID, stringValue(x.PromotionID), grossCost)
		if err != nil {
			return dto.RepairOrder{}, err
		}
		netCost := serviceMoney(grossCost - discount)
		var taxRate float64
		var includeTax bool
		if err := tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0) FROM service_orders so LEFT JOIN payment_settings ps ON ps.merchant_id=so.merchant_id AND ps.shop_id=so.shop_id WHERE so.merchant_id=$1::uuid AND so.id=$2`, c.MerchantID, x.ServiceOrderID).Scan(&includeTax, &taxRate); err != nil {
			return dto.RepairOrder{}, err
		}
		tax := 0.0
		if includeTax {
			tax = serviceMoney(netCost * taxRate / 100)
		}
		total := serviceMoney(netCost + tax)
		var canonicalOrderID string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(order_id::text,'') FROM service_orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, x.ServiceOrderID).Scan(&canonicalOrderID); err != nil || canonicalOrderID == "" {
			return dto.RepairOrder{}, app.Validation("The repair must be linked to a canonical service order before pricing.", nil)
		}
		if customerID != nil {
			if _, err := tx.Exec(ctx, `UPDATE service_orders SET customer_id=$3 WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, x.ServiceOrderID, *customerID); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET customer_id=$3,subtotal=$4,discount_total=$5,tax_total=$6,grand_total=$7,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, canonicalOrderID, customerID, grossCost, discount, tax, total); err != nil {
			return dto.RepairOrder{}, err
		}
		var lineNumber int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(line_number),0)+1 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2`, c.MerchantID, canonicalOrderID).Scan(&lineNumber); err != nil {
			return dto.RepairOrder{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1,$2,$3,'Repair service',1,$4,$5,$6,$7)`, c.MerchantID, canonicalOrderID, lineNumber, grossCost, discount, tax, total); err != nil {
			return dto.RepairOrder{}, err
		}
		var v dto.RepairOrder
		paymentStatus := "UNPAID"
		deposit := x.DepositAmount
		if deposit == "" {
			deposit = "0"
		}
		if x.PaymentStatus == "PAID" {
			deposit = fmt.Sprintf("%.2f", total)
		}
		if x.PaymentStatus == "DEPOSIT_PAID" && deposit == "0" {
			return dto.RepairOrder{}, app.Validation("A deposit amount is required when payment status is Deposit Paid.", nil)
		}
		depositValue, _ := strconv.ParseFloat(deposit, 64)
		if depositValue > 0 {
			paymentStatus = "DEPOSIT_PAID"
			if depositValue >= total && total > 0 {
				paymentStatus = "PAID"
			}
		}
		if x.PaymentStatus == "UNPAID" {
			paymentStatus = "UNPAID"
		} else if x.PaymentStatus == "DEPOSIT_PAID" {
			paymentStatus = "DEPOSIT_PAID"
		} else if x.PaymentStatus == "PAID" {
			paymentStatus = "PAID"
		}
		err = tx.QueryRow(ctx, "INSERT INTO repair_orders(merchant_id,service_order_id,device_id,order_number,status,issue_description,received_at,completed_at,customer_id,customer_name,customer_phone,service_id,promotion_id,labor_fee,additional_fee,tax_amount,total_cost,note,deposit_paid,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id,merchant_id,service_order_id,device_id,order_number,status,issue_description,received_at,completed_at,customer_id,customer_name,customer_phone,deposit_paid::text,payment_status,service_id,promotion_id,labor_fee::text,additional_fee::text,tax_amount::text,total_cost::text,note,form_version", c.MerchantID, x.ServiceOrderID, x.DeviceID, x.OrderNumber, status, x.IssueDescription, received, x.CompletedAt, customerID, nullableString(x.CustomerName), nullableString(x.CustomerPhone), x.ServiceID, x.PromotionID, catalogValue, additionalValue, tax, total, x.Note, deposit, paymentStatus).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.DeviceID, &v.OrderNumber, &v.Status, &v.IssueDescription, &v.ReceivedAt, &v.CompletedAt, &v.CustomerID, &v.CustomerName, &v.CustomerPhone, &v.DepositPaid, &v.PaymentStatus, &v.ServiceID, &v.PromotionID, &v.LaborFee, &v.AdditionalFee, &v.TaxAmount, &v.TotalCost, &v.Note, &v.FormVersion)
		if err != nil {
			return dto.RepairOrder{}, err
		}
		v.Subtotal = fmt.Sprintf("%.2f", grossCost)
		v.DiscountTotal = fmt.Sprintf("%.2f", discount)
		if err = recordServicePromotion(ctx, tx, c.MerchantID, canonicalOrderID, stringValue(x.PromotionID), discount); err != nil {
			return dto.RepairOrder{}, err
		}
		if deposit != "0" {
			paymentTypeID, paymentTypeName, _, paymentTypeErr := resolvePaymentType(ctx, tx, c.MerchantID, x.DepositPaymentTypeID, x.DepositPaymentMethod)
			if paymentTypeErr != nil {
				return dto.RepairOrder{}, paymentTypeErr
			}
			key := x.DepositIdempotencyKey
			if key == "" {
				key = "repair:" + v.ID + ":deposit"
			}
			var paymentID string
			if err = tx.QueryRow(ctx, `INSERT INTO payments(merchant_id,order_id,payment_type_id,method,status,amount,idempotency_key,captured_at) SELECT $1,so.order_id,$3,$4,'CAPTURED',$5,$6,now() FROM service_orders so WHERE so.merchant_id=$1 AND so.id=$2 RETURNING id`, c.MerchantID, x.ServiceOrderID, paymentTypeID, paymentTypeName, deposit, key).Scan(&paymentID); err != nil {
				return dto.RepairOrder{}, err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO repair_payment_allocations(merchant_id,repair_order_id,payment_id,payment_kind) VALUES($1,$2,$3,'DEPOSIT')`, c.MerchantID, v.ID, paymentID); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		return v, nil
	})
}

func normalizeRepairWorkItems(x dto.CreateRepairTicketRequest) ([]dto.RepairWorkItemRequest, error) {
	if len(x.WorkItems) == 0 {
		if err := required(x.Device.DeviceType, x.IssueDescription); err != nil {
			return nil, err
		}
		device := x.Device
		if device.CustomerID == nil {
			device.CustomerID = x.CustomerID
		}
		return []dto.RepairWorkItemRequest{{
			Type:             "DEVICE",
			Device:           device,
			IssueDescription: x.IssueDescription,
			Issues:           []string{x.IssueDescription},
			Note:             x.Note,
			AdditionalFee:    "0",
		}}, nil
	}
	if len(x.WorkItems) > 100 {
		return nil, app.Validation("A service ticket cannot contain more than 100 work items.", map[string]any{"work_items": "maximum 100"})
	}
	items := make([]dto.RepairWorkItemRequest, len(x.WorkItems))
	copy(items, x.WorkItems)
	for i := range items {
		if items[i].Type == "" {
			items[i].Type = "DEVICE"
		}
		if items[i].Type != "DEVICE" && items[i].Type != "VEHICLE" && items[i].Type != "PATIENT" && items[i].Type != "OTHER" {
			return nil, app.Validation("Work item type is invalid.", map[string]any{"work_items": "unsupported type"})
		}
		issues := items[i].Issues
		if len(issues) == 0 && strings.TrimSpace(items[i].IssueDescription) != "" {
			issues = []string{items[i].IssueDescription}
		}
		var err error
		items[i].Issues, err = normalizeRepairTextList(issues, "issues")
		if err != nil {
			return nil, err
		}
		items[i].Conditions, err = normalizeRepairTextList(items[i].Conditions, "conditions")
		if err != nil {
			return nil, err
		}
		if len(items[i].Issues) > 0 {
			items[i].IssueDescription = items[i].Issues[0]
		}
		if err := required(items[i].Device.DeviceType, items[i].IssueDescription); err != nil {
			return nil, app.Validation("Every work item requires a device type and issue description.", map[string]any{"work_items": fmt.Sprintf("item %d is incomplete", i+1)})
		}
		if items[i].Device.CustomerID == nil {
			items[i].Device.CustomerID = x.CustomerID
		}
		if strings.TrimSpace(items[i].ID) != "" {
			for previous := 0; previous < i; previous++ {
				if strings.TrimSpace(items[previous].ID) == strings.TrimSpace(items[i].ID) {
					return nil, app.Validation("Work item ids must be unique.", map[string]any{"work_items": "duplicate id"})
				}
			}
		}
		if len(items) > 1 && strings.TrimSpace(items[i].ID) == "" {
			return nil, app.Validation("Every work item on a multi-device ticket requires a stable UUID.", map[string]any{"work_items": fmt.Sprintf("item %d has no id", i+1)})
		}
		if strings.TrimSpace(items[i].AdditionalFee) == "" {
			items[i].AdditionalFee = "0"
		}
		fee, feeErr := strconv.ParseFloat(items[i].AdditionalFee, 64)
		if feeErr != nil || fee < 0 {
			return nil, app.Validation("Work item prices must be zero or greater.", map[string]any{"work_items": fmt.Sprintf("item %d has an invalid price", i+1)})
		}
		if err := normalizeRepairWaiting(&items[i].WaitingDays, &items[i].WaitingEndDate); err != nil {
			return nil, app.Validation(err.Error(), map[string]any{"work_items": fmt.Sprintf("item %d has invalid waiting time", i+1)})
		}
	}
	return items, nil
}

func normalizeRepairWaiting(days **int, endDate **string) error {
	if *days != nil && **days < 0 {
		return fmt.Errorf("Waiting days must be zero or greater.")
	}
	if *endDate != nil {
		trimmed := strings.TrimSpace(**endDate)
		if trimmed == "" {
			*endDate = nil
		} else {
			if _, err := time.Parse(time.DateOnly, trimmed); err != nil {
				return fmt.Errorf("Waiting end date must use YYYY-MM-DD format.")
			}
			*endDate = &trimmed
		}
	}
	if *days == nil && *endDate == nil {
		zero := 0
		*days = &zero
	}
	return nil
}

func applyRepairWaitingRange(repair *dto.RepairOrder) {
	if len(repair.WorkItems) == 0 {
		return
	}
	start, end := repair.WorkItems[0].WaitingStartDate, repair.WorkItems[0].WaitingEndDate
	for _, item := range repair.WorkItems[1:] {
		if item.WaitingStartDate != "" && (start == "" || item.WaitingStartDate < start) {
			start = item.WaitingStartDate
		}
		if item.WaitingEndDate > end {
			end = item.WaitingEndDate
		}
	}
	repair.WaitingStartDate = start
	repair.WaitingEndDate = end
	startDate, startErr := time.Parse(time.DateOnly, start)
	endDate, endErr := time.Parse(time.DateOnly, end)
	if startErr == nil && endErr == nil {
		repair.WaitingDays = int(endDate.Sub(startDate).Hours() / 24)
	}
}

func normalizeRepairTextList(values []string, field string) ([]string, error) {
	if len(values) > 20 {
		return nil, app.Validation("A repair device cannot contain more than 20 "+field+".", map[string]any{field: "maximum 20"})
	}
	result := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if len([]rune(trimmed)) > 500 {
			return nil, app.Validation("Each repair "+strings.TrimSuffix(field, "s")+" must be 500 characters or fewer.", map[string]any{field: "value too long"})
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, trimmed)
	}
	return result, nil
}

// normalizeRepairTicketCustomer enforces the ticket-level customer boundary
// across every work item. A repair ticket is one customer-facing aggregate;
// device-specific customer ids are accepted only as a compatibility input
// when they all identify that same customer.
func normalizeRepairTicketCustomer(x dto.CreateRepairTicketRequest, items []dto.RepairWorkItemRequest) (*string, error) {
	var customerID string
	if x.CustomerID != nil {
		customerID = strings.TrimSpace(*x.CustomerID)
	}
	for index := range items {
		if items[index].Device.CustomerID == nil {
			continue
		}
		itemCustomerID := strings.TrimSpace(*items[index].Device.CustomerID)
		if itemCustomerID == "" {
			continue
		}
		if customerID == "" {
			customerID = itemCustomerID
			continue
		}
		if customerID != itemCustomerID {
			return nil, app.Validation("All work items on a repair ticket must belong to the same customer.", map[string]any{"customer_id": "work item customer differs from ticket customer", "work_item": index + 1})
		}
	}
	if customerID == "" {
		return nil, nil
	}
	normalized := customerID
	for index := range items {
		items[index].Device.CustomerID = &normalized
	}
	return &normalized, nil
}

func normalizeRepairServiceItems(x dto.CreateRepairTicketRequest) ([]dto.RepairServiceItemRequest, error) {
	items := append([]dto.RepairServiceItemRequest(nil), x.ServiceItems...)
	if len(items) == 0 && x.ServiceID != nil && strings.TrimSpace(*x.ServiceID) != "" {
		items = append(items, dto.RepairServiceItemRequest{ServiceID: x.ServiceID, Quantity: "1"})
	}
	if len(items) > 100 {
		return nil, app.Validation("A service ticket cannot contain more than 100 service items.", map[string]any{"service_items": "maximum 100"})
	}
	for index := range items {
		if (items[index].ServiceID == nil) == (items[index].VariantID == nil) {
			return nil, app.Validation("Each service item must reference exactly one service or product variant.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid reference", index+1)})
		}
		if strings.TrimSpace(items[index].Quantity) == "" {
			items[index].Quantity = "1"
		}
		quantity, err := strconv.ParseFloat(items[index].Quantity, 64)
		if err != nil || quantity <= 0 {
			return nil, app.Validation("Service item quantities must be greater than zero.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid quantity", index+1)})
		}
		if len(x.WorkItems) > 1 && (items[index].WorkItemID == nil || strings.TrimSpace(*items[index].WorkItemID) == "") {
			return nil, app.Validation("Every billable service line on a multi-device ticket must identify its work item.", map[string]any{"service_items": fmt.Sprintf("item %d has no work_item_id", index+1)})
		}
		if items[index].WorkItemID != nil && strings.TrimSpace(*items[index].WorkItemID) != "" {
			matched := false
			for _, workItem := range x.WorkItems {
				if strings.TrimSpace(workItem.ID) == strings.TrimSpace(*items[index].WorkItemID) {
					matched = true
					break
				}
			}
			if !matched {
				return nil, app.Validation("A service line references a work item outside this ticket.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid work_item_id", index+1)})
			}
		}
	}
	return items, nil
}

func resolveRepairServiceItems(ctx context.Context, tx pgx.Tx, merchantID string, requests []dto.RepairServiceItemRequest) ([]dto.ServiceOrderItem, float64, error) {
	items := make([]dto.ServiceOrderItem, 0, len(requests))
	var gross float64
	for _, request := range requests {
		quantity, _ := strconv.ParseFloat(request.Quantity, 64)
		item := dto.ServiceOrderItem{WorkItemID: request.WorkItemID, ServiceID: request.ServiceID, VariantID: request.VariantID, Quantity: request.Quantity, Status: "OPEN"}
		if request.ServiceID != nil {
			var code, name, unitPrice string
			if err := tx.QueryRow(ctx, `SELECT code,name,labor_fee::text FROM service_catalog WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, merchantID, *request.ServiceID).Scan(&code, &name, &unitPrice); err != nil {
				return nil, 0, app.Validation("The selected service catalog item is unavailable.", nil)
			}
			item.Description = code + " · " + name
			item.UnitPrice = unitPrice
		} else {
			var description, unitPrice string
			if err := tx.QueryRow(ctx, `SELECT p.name||' · '||pv.name,
				COALESCE((SELECT pp.amount::text FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id
					WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now())
					ORDER BY pp.valid_from DESC LIMIT 1),'0')
				FROM product_variants pv JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id
				WHERE pv.merchant_id=$1::uuid AND pv.id=$2::uuid`, merchantID, *request.VariantID).Scan(&description, &unitPrice); err != nil {
				return nil, 0, app.Validation("The selected service product is unavailable.", nil)
			}
			price, err := strconv.ParseFloat(unitPrice, 64)
			if err != nil || price < 0 {
				return nil, 0, app.Validation("The selected service product has an invalid price.", nil)
			}
			item.Description = description
			item.UnitPrice = fmt.Sprintf("%.2f", price)
		}
		unitPrice, err := strconv.ParseFloat(item.UnitPrice, 64)
		if err != nil || unitPrice < 0 {
			return nil, 0, app.Validation("A service item has an invalid price.", nil)
		}
		gross += quantity * unitPrice
		items = append(items, item)
	}
	return items, serviceMoney(gross), nil
}

func (r *Repository) createRepairWorkItem(ctx context.Context, tx pgx.Tx, c *authdto.Claims, serviceOrderID string, sequence int, item dto.RepairWorkItemRequest, device dto.RepairDevice) (dto.RepairWorkItem, error) {
	fields := item.Fields
	if fields == nil {
		fields = map[string]json.RawMessage{}
	}
	workItemID := uuid.New().String()
	if strings.TrimSpace(item.ID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(item.ID)); err != nil {
			return dto.RepairWorkItem{}, app.Validation("Work item id must be a valid UUID.", map[string]any{"work_items": "invalid id"})
		}
		workItemID = strings.TrimSpace(item.ID)
	}
	metadata, err := json.Marshal(fields)
	if err != nil {
		return dto.RepairWorkItem{}, err
	}
	var workItem dto.RepairWorkItem
	err = tx.QueryRow(ctx, `
		INSERT INTO service_order_work_items(id,merchant_id,service_order_id,sequence_number,item_type,status,summary,metadata)
		VALUES($1,$2,$3,$4,$5,'OPEN',$6,$7)
		RETURNING id,service_order_id,sequence_number,item_type,status,form_version,summary`,
		workItemID, c.MerchantID, serviceOrderID, sequence, item.Type, item.Device.DeviceType, metadata,
	).Scan(&workItem.ID, &workItem.ServiceOrderID, &workItem.SequenceNumber, &workItem.Type, &workItem.Status, &workItem.FormVersion, &workItem.Summary)
	if err != nil {
		return dto.RepairWorkItem{}, err
	}
	customFields, err := json.Marshal(fields)
	if err != nil {
		return dto.RepairWorkItem{}, err
	}
	issuesJSON, _ := json.Marshal(item.Issues)
	conditionsJSON, _ := json.Marshal(item.Conditions)
	if _, err = tx.Exec(ctx, `
		INSERT INTO repair_work_item_devices(merchant_id,work_item_id,repair_device_id,issue_description,issues,conditions,notes,additional_fee,waiting_end_date,custom_fields)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE(NULLIF($9::text,'')::date,CURRENT_DATE+COALESCE($10::int,0)),$11)`, c.MerchantID, workItem.ID, device.ID, item.IssueDescription, issuesJSON, conditionsJSON, item.Note, item.AdditionalFee, item.WaitingEndDate, item.WaitingDays, customFields); err != nil {
		return dto.RepairWorkItem{}, err
	}
	formVersion, err := validateAndStoreCustomFields(ctx, tx, c.MerchantID, "REPAIR_WORK_ITEM", "WORK_ITEM", "REPAIR", workItem.ID, fields)
	if err != nil {
		return dto.RepairWorkItem{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE service_order_work_items SET form_version=$3 WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, workItem.ID, formVersion); err != nil {
		return dto.RepairWorkItem{}, err
	}
	workItem.FormVersion = formVersion
	workItem.Device = device
	workItem.IssueDescription = item.IssueDescription
	workItem.Issues = item.Issues
	workItem.Conditions = item.Conditions
	workItem.Note = item.Note
	workItem.AdditionalFee = item.AdditionalFee
	workItem.Fields = fields
	return workItem, nil
}

func (r *Repository) CreateRepairTicket(ctx context.Context, c *authdto.Claims, x dto.CreateRepairTicketRequest) (dto.RepairTicket, error) {
	if err := required(x.IdempotencyKey, x.OrderNumber, x.ShopID); err != nil {
		return dto.RepairTicket{}, err
	}
	workItems, err := normalizeRepairWorkItems(x)
	if err != nil {
		return dto.RepairTicket{}, err
	}
	ticketCustomerID, err := normalizeRepairTicketCustomer(x, workItems)
	if err != nil {
		return dto.RepairTicket{}, err
	}
	x.CustomerID = ticketCustomerID
	legacyAdditionalFee := strings.TrimSpace(x.AdditionalFee)
	if legacyAdditionalFee == "" {
		legacyAdditionalFee = "0"
	}
	legacyFeeValue, feeErr := strconv.ParseFloat(legacyAdditionalFee, 64)
	if feeErr != nil || legacyFeeValue < 0 {
		return dto.RepairTicket{}, app.Validation("Price must be zero or greater.", nil)
	}
	childFeeTotal := 0.0
	for _, item := range workItems {
		value, _ := strconv.ParseFloat(item.AdditionalFee, 64)
		childFeeTotal += value
	}
	if childFeeTotal > 0 && legacyFeeValue > 0 {
		return dto.RepairTicket{}, app.Validation("Set prices per work item or at ticket level, not both.", nil)
	}
	if childFeeTotal == 0 && legacyFeeValue > 0 {
		workItems[0].AdditionalFee = fmt.Sprintf("%.2f", serviceMoney(legacyFeeValue))
		childFeeTotal = legacyFeeValue
	}
	x.AdditionalFee = fmt.Sprintf("%.2f", serviceMoney(childFeeTotal))
	serviceItemRequests, err := normalizeRepairServiceItems(x)
	if err != nil {
		return dto.RepairTicket{}, err
	}
	paymentStatus := strings.TrimSpace(x.PaymentStatus)
	if paymentStatus == "" {
		paymentStatus = "UNPAID"
	}
	if paymentStatus != "UNPAID" && paymentStatus != "DEPOSIT_PAID" && paymentStatus != "PAID" {
		return dto.RepairTicket{}, app.Validation("Payment status must be UNPAID, DEPOSIT_PAID, or PAID.", nil)
	}
	seenParts := map[string]bool{}
	for _, part := range x.Parts {
		if err := required(part.VariantID, part.Quantity); err != nil {
			return dto.RepairTicket{}, err
		}
		if len(workItems) > 1 && (part.WorkItemID == nil || strings.TrimSpace(*part.WorkItemID) == "") {
			return dto.RepairTicket{}, app.Validation("Every billable part on a multi-device ticket must identify its work item.", map[string]any{"parts": "missing work_item_id"})
		}
		key := part.VariantID + ":" + stringValue(part.WorkItemID)
		if seenParts[key] {
			return dto.RepairTicket{}, app.Validation("The same replacement product can appear only once per work item; set its quantity instead.", map[string]any{"parts": "duplicate variant for work item"})
		}
		seenParts[key] = true
	}
	requestBody, err := json.Marshal(x)
	if err != nil {
		return dto.RepairTicket{}, err
	}
	requestHash := fmt.Sprintf("%x", sha256.Sum256(requestBody))

	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairTicket, error) {
		var inserted bool
		err := tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'repair.ticket',$2,'PROCESSING',jsonb_build_object('request_hash',$3::text),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, x.IdempotencyKey, requestHash).Scan(&inserted)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return dto.RepairTicket{}, err
		}
		if !inserted {
			var status string
			var sameRequest bool
			var stored json.RawMessage
			if err = tx.QueryRow(ctx, `SELECT status,response_body->>'request_hash'=$3,response_body->'response' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='repair.ticket' AND idempotency_key=$2 FOR UPDATE`, c.MerchantID, x.IdempotencyKey, requestHash).Scan(&status, &sameRequest, &stored); err != nil {
				return dto.RepairTicket{}, err
			}
			if !sameRequest {
				return dto.RepairTicket{}, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different repair ticket.", 409)
			}
			if status == "COMPLETED" && len(stored) > 0 {
				var existing dto.RepairTicket
				if err = json.Unmarshal(stored, &existing); err != nil {
					return dto.RepairTicket{}, err
				}
				return existing, nil
			}
			return dto.RepairTicket{}, app.NewError("REQUEST_IN_PROGRESS", "This repair ticket request is already being processed.", 409)
		}

		txCtx := context.WithValue(ctx, transactionContextKey{}, tx)
		resolvedServiceItems, serviceGross, resolveErr := resolveRepairServiceItems(ctx, tx, c.MerchantID, serviceItemRequests)
		if resolveErr != nil {
			return dto.RepairTicket{}, resolveErr
		}
		var legacyServiceID *string
		if len(resolvedServiceItems) > 0 {
			legacyServiceID = resolvedServiceItems[0].ServiceID
		}
		serviceLaborFee := fmt.Sprintf("%.2f", serviceGross)
		firstDeviceRequest := workItems[0].Device
		if x.CustomerID != nil {
			firstDeviceRequest.CustomerID = x.CustomerID
		}
		device, err := r.CreateRepairDevice(txCtx, c, firstDeviceRequest)
		if err != nil {
			return dto.RepairTicket{}, err
		}
		shopID := x.ShopID
		serviceOrder, err := r.CreateServiceOrder(txCtx, c, dto.ServiceOrderRequest{
			CustomerID: x.CustomerID, ShopID: &shopID, OrderNumber: x.OrderNumber,
			ServiceType: "REPAIR", Status: "OPEN", Priority: x.Priority,
		})
		if err != nil {
			return dto.RepairTicket{}, err
		}
		repairOrder, err := r.CreateRepairOrder(txCtx, c, dto.RepairOrderRequest{
			ServiceOrderID: serviceOrder.ID, DeviceID: device.ID, OrderNumber: x.OrderNumber,
			Status: "RECEIVED", IssueDescription: workItems[0].IssueDescription,
			CustomerID: x.CustomerID, CustomerName: x.CustomerName, CustomerPhone: x.CustomerPhone,
			PromotionID: x.PromotionID, ServiceID: nil, LaborFee: serviceLaborFee, AdditionalFee: x.AdditionalFee,
			Note: x.Note, PaymentStatus: "UNPAID",
		})
		if err != nil {
			return dto.RepairTicket{}, err
		}
		if repairOrder.CustomerID != nil {
			device.CustomerID = repairOrder.CustomerID
			serviceOrder.CustomerID = repairOrder.CustomerID
			if _, err = tx.Exec(ctx, `UPDATE repair_devices SET customer_id=$3 WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, device.ID, *repairOrder.CustomerID); err != nil {
				return dto.RepairTicket{}, err
			}
		}
		if legacyServiceID != nil {
			if _, err = tx.Exec(ctx, `UPDATE repair_orders SET service_id=$3::uuid WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, repairOrder.ID, *legacyServiceID); err != nil {
				return dto.RepairTicket{}, err
			}
			repairOrder.ServiceID = legacyServiceID
		}
		repairOrder.ShopID = &shopID
		ticketFormVersion, fieldErr := validateAndStoreCustomFields(ctx, tx, c.MerchantID, "REPAIR_TICKET", "TICKET", "REPAIR", repairOrder.ID, x.Fields)
		if fieldErr != nil {
			return dto.RepairTicket{}, fieldErr
		}
		if _, err = tx.Exec(ctx, `UPDATE repair_orders SET form_version=$3 WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, repairOrder.ID, ticketFormVersion); err != nil {
			return dto.RepairTicket{}, err
		}
		repairOrder.FormVersion = ticketFormVersion
		if ticketFormVersion > 0 {
			// The repair order is the compatibility projection for ticket-level
			// fields; the values retain their own definition version.
			repairOrder.Note = x.Note
			repairOrder.Fields = x.Fields
			if repairOrder.Fields == nil {
				repairOrder.Fields = map[string]json.RawMessage{}
			}
			repairOrder.FormVersion = ticketFormVersion
		}

		customFields := x.Fields
		if customFields == nil {
			customFields = map[string]json.RawMessage{}
		}
		result := dto.RepairTicket{
			Device: device, ServiceOrder: serviceOrder, RepairOrder: repairOrder,
			Parts: []dto.RepairPart{}, Images: []dto.RepairImage{}, WorkItems: []dto.RepairWorkItem{},
			ServiceItems: []dto.ServiceOrderItem{}, Diagnostics: []dto.RepairDiagnostic{},
			Approvals: []dto.RepairApproval{}, Warranties: []dto.RepairWarranty{},
			CustomFields: customFields, FormVersion: ticketFormVersion,
		}
		for index, item := range workItems {
			itemDevice := device
			if index > 0 {
				itemDeviceRequest := item.Device
				if repairOrder.CustomerID != nil && itemDeviceRequest.CustomerID == nil {
					itemDeviceRequest.CustomerID = repairOrder.CustomerID
				}
				itemDevice, err = r.CreateRepairDevice(txCtx, c, itemDeviceRequest)
				if err != nil {
					return dto.RepairTicket{}, err
				}
			}
			workItem, workItemErr := r.createRepairWorkItem(ctx, tx, c, serviceOrder.ID, index+1, item, itemDevice)
			if workItemErr != nil {
				return dto.RepairTicket{}, workItemErr
			}
			result.WorkItems = append(result.WorkItems, workItem)
		}
		for _, resolved := range resolvedServiceItems {
			if resolved.WorkItemID == nil {
				resolved.WorkItemID = &result.WorkItems[0].ID
			}
			var serviceItem dto.ServiceOrderItem
			if err = tx.QueryRow(ctx, `INSERT INTO service_order_items(merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity,unit_price,status)
				VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,$8,'OPEN')
				RETURNING id,merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity::text,unit_price::text,status`,
				c.MerchantID, serviceOrder.ID, resolved.WorkItemID, resolved.ServiceID, resolved.VariantID, resolved.Description, resolved.Quantity, resolved.UnitPrice).
				Scan(&serviceItem.ID, &serviceItem.MerchantID, &serviceItem.ServiceOrderID, &serviceItem.WorkItemID, &serviceItem.ServiceID, &serviceItem.VariantID, &serviceItem.Description, &serviceItem.Quantity, &serviceItem.UnitPrice, &serviceItem.Status); err != nil {
				return dto.RepairTicket{}, err
			}
			result.ServiceItems = append(result.ServiceItems, serviceItem)
		}
		repairOrder.WorkItems = result.WorkItems
		result.RepairOrder = repairOrder
		for _, part := range x.Parts {
			variantID := part.VariantID
			workItemID := part.WorkItemID
			if workItemID != nil && strings.TrimSpace(*workItemID) == "" {
				workItemID = nil
			}
			created, createErr := r.CreateRepairPart(txCtx, c, dto.RepairPartRequest{
				RepairOrderID: repairOrder.ID, WorkItemID: workItemID, VariantID: &variantID, Quantity: part.Quantity,
				Status: "USED", PromotionID: part.PromotionID,
			})
			if createErr != nil {
				return dto.RepairTicket{}, createErr
			}
			created.WorkItemID = workItemID
			result.Parts = append(result.Parts, created)
		}
		result.ServiceItems = []dto.ServiceOrderItem{}
		serviceItemRows, serviceItemErr := tx.Query(ctx, `SELECT id,merchant_id,service_order_id,work_item_id,service_id,variant_id,description,quantity::text,unit_price::text,status FROM service_order_items WHERE merchant_id=$1::uuid AND service_order_id=$2::uuid ORDER BY id`, c.MerchantID, serviceOrder.ID)
		if serviceItemErr != nil {
			return dto.RepairTicket{}, serviceItemErr
		}
		for serviceItemRows.Next() {
			var serviceItem dto.ServiceOrderItem
			if serviceItemErr = serviceItemRows.Scan(&serviceItem.ID, &serviceItem.MerchantID, &serviceItem.ServiceOrderID, &serviceItem.WorkItemID, &serviceItem.ServiceID, &serviceItem.VariantID, &serviceItem.Description, &serviceItem.Quantity, &serviceItem.UnitPrice, &serviceItem.Status); serviceItemErr != nil {
				serviceItemRows.Close()
				return dto.RepairTicket{}, serviceItemErr
			}
			result.ServiceItems = append(result.ServiceItems, serviceItem)
		}
		serviceItemErr = serviceItemRows.Err()
		serviceItemRows.Close()
		if serviceItemErr != nil {
			return dto.RepairTicket{}, serviceItemErr
		}
		result.WorkItems, err = listRepairWorkItemsTx(ctx, tx, c.MerchantID, repairOrder.ID)
		if err != nil {
			return dto.RepairTicket{}, err
		}
		result.RepairOrder.WorkItems = result.WorkItems
		applyRepairWaitingRange(&result.RepairOrder)

		err = tx.QueryRow(ctx, `SELECT ro.deposit_paid::text,ro.payment_status,ro.labor_fee::text,ro.additional_fee::text,ro.tax_amount::text,ro.total_cost::text,COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text,ro.promotion_id FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2`, c.MerchantID, repairOrder.ID).Scan(
			&result.RepairOrder.DepositPaid, &result.RepairOrder.PaymentStatus, &result.RepairOrder.LaborFee,
			&result.RepairOrder.AdditionalFee, &result.RepairOrder.TaxAmount, &result.RepairOrder.TotalCost,
			&result.RepairOrder.Subtotal, &result.RepairOrder.DiscountTotal, &result.RepairOrder.PromotionID,
		)
		if err != nil {
			return dto.RepairTicket{}, err
		}

		if paymentStatus != "UNPAID" {
			amount := x.DepositAmount
			kind := "DEPOSIT"
			if paymentStatus == "PAID" {
				amount = result.RepairOrder.TotalCost
				kind = "FINAL"
			}
			method := x.PaymentMethod
			if method == "" {
				method = "CASH"
			}
			payment, paymentErr := r.CreateRepairPayment(txCtx, c, repairOrder.ID, dto.RepairPaymentRequest{
				Kind: kind, PaymentTypeID: x.PaymentTypeID, Method: method, Amount: amount, IdempotencyKey: x.IdempotencyKey + ":payment",
			})
			if paymentErr != nil {
				return dto.RepairTicket{}, paymentErr
			}
			result.Payment = &payment
			if err = tx.QueryRow(ctx, `SELECT status,completed_at,deposit_paid::text,payment_status FROM repair_orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, repairOrder.ID).Scan(
				&result.RepairOrder.Status, &result.RepairOrder.CompletedAt,
				&result.RepairOrder.DepositPaid, &result.RepairOrder.PaymentStatus,
			); err != nil {
				return dto.RepairTicket{}, err
			}
			if err = tx.QueryRow(ctx, `SELECT status,completed_at FROM service_orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, serviceOrder.ID).Scan(
				&result.ServiceOrder.Status, &result.ServiceOrder.CompletedAt,
			); err != nil {
				return dto.RepairTicket{}, err
			}
		}

		for _, image := range x.Images {
			if image.WorkItemID != nil && strings.TrimSpace(*image.WorkItemID) == "" {
				image.WorkItemID = nil
			}
			created, imageErr := r.CreateRepairImage(txCtx, c, repairOrder.ID, image)
			if imageErr != nil {
				return dto.RepairTicket{}, imageErr
			}
			created.DataBase64 = ""
			result.Images = append(result.Images, created)
		}
		responseBody, err := json.Marshal(result)
		if err != nil {
			return dto.RepairTicket{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=201,response_body=jsonb_build_object('request_hash',$3::text,'response',$4::jsonb) WHERE merchant_id=$1::uuid AND scope='repair.ticket' AND idempotency_key=$2`, c.MerchantID, x.IdempotencyKey, requestHash, responseBody); err != nil {
			return dto.RepairTicket{}, err
		}
		return result, nil
	})
}
func (r *Repository) UpdateRepairOrder(ctx context.Context, c *authdto.Claims, id string, x dto.RepairOrderRequest) (dto.RepairOrder, error) {
	if !validRepairStatus(x.Status) {
		return dto.RepairOrder{}, app.Validation("Repair status must be Received, In progress, Ready for pickup, Complete and closed, or Refund.", map[string]any{"status": "invalid"})
	}
	if x.Status == "REFUNDED" {
		return dto.RepairOrder{}, app.Validation("Record a repair payment refund to move the ticket to Refund status.", map[string]any{"status": "managed by refund"})
	}
	return writeIdempotent(ctx, r.pool, c, "repair.order", app.IdempotencyKey(ctx), struct {
		ID      string                 `json:"id"`
		Request dto.RepairOrderRequest `json:"request"`
	}{ID: id, Request: x}, func(tx pgx.Tx) (dto.RepairOrder, error) {
		var v dto.RepairOrder
		err := tx.QueryRow(ctx, "UPDATE repair_orders SET service_order_id=$3,device_id=$4,order_number=$5,status=$6,issue_description=$7,received_at=COALESCE($8,received_at),completed_at=$9,customer_id=COALESCE($10,customer_id),customer_name=COALESCE($11,customer_name),customer_phone=COALESCE($12,customer_phone) WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,service_order_id,device_id,order_number,status,issue_description,received_at,completed_at,customer_id,customer_name,customer_phone,deposit_paid::text,payment_status,form_version", c.MerchantID, id, x.ServiceOrderID, x.DeviceID, x.OrderNumber, x.Status, x.IssueDescription, timePtrUTC(x.ReceivedAt), timePtrUTC(x.CompletedAt), x.CustomerID, x.CustomerName, x.CustomerPhone).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.DeviceID, &v.OrderNumber, &v.Status, &v.IssueDescription, &v.ReceivedAt, &v.CompletedAt, &v.CustomerID, &v.CustomerName, &v.CustomerPhone, &v.DepositPaid, &v.PaymentStatus, &v.FormVersion)
		if err == nil {
			err = tx.QueryRow(ctx, `SELECT COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id LEFT JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2`, c.MerchantID, v.ID).Scan(&v.Subtotal, &v.DiscountTotal)
		}
		if err == nil && x.Status == "COMPLETED" {
			if _, err = tx.Exec(ctx, `UPDATE service_order_work_items SET status='COMPLETED',updated_at=now() WHERE merchant_id=$1::uuid AND service_order_id=$2::uuid`, c.MerchantID, x.ServiceOrderID); err != nil {
				return v, err
			}
			_, err = tx.Exec(ctx, `UPDATE service_orders SET status='COMPLETED',completed_at=COALESCE(completed_at,now()) WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, x.ServiceOrderID)
			if err == nil {
				// Completion is a repair lifecycle event, not proof of payment. A
				// draft canonical order must first enter PENDING_PAYMENT; the
				// existing payment command can then transition it to FULFILLED.
				_, err = tx.Exec(ctx, `UPDATE orders o SET status=CASE WHEN o.status='DRAFT' THEN 'PENDING_PAYMENT' ELSE o.status END,placed_at=COALESCE(o.placed_at,now()),updated_at=now() FROM service_orders so WHERE so.merchant_id=$1::uuid AND so.id=$2 AND o.merchant_id=so.merchant_id AND o.id=so.order_id`, c.MerchantID, x.ServiceOrderID)
			}
		}
		return v, err
	})
}
func (r *Repository) UpdateRepairTicketDetails(ctx context.Context, c *authdto.Claims, id string, x dto.RepairTicketDetailsRequest) (dto.RepairOrder, error) {
	issue, workItems, err := normalizeRepairTicketDetails(x)
	if err != nil {
		return dto.RepairOrder{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairOrder, error) {
		seen := map[string]struct{}{}
		for index := range workItems {
			if _, exists := seen[workItems[index].ID]; exists {
				return dto.RepairOrder{}, app.Validation("Work item ids must be unique.", map[string]any{"work_items": "duplicate id"})
			}
			seen[workItems[index].ID] = struct{}{}
			if workItems[index].WaitingDays != nil || workItems[index].WaitingEndDate != nil {
				if err := normalizeRepairWaiting(&workItems[index].WaitingDays, &workItems[index].WaitingEndDate); err != nil {
					return dto.RepairOrder{}, app.Validation(err.Error(), map[string]any{"work_items": workItems[index].ID})
				}
			}
			workItemID := workItems[index].ID
			if err := validateRepairWorkItem(tx, ctx, c.MerchantID, id, &workItemID); err != nil {
				return dto.RepairOrder{}, err
			}
		}

		var customerID *string
		if err := tx.QueryRow(ctx, `UPDATE repair_orders SET customer_name=$3,customer_phone=$4,issue_description=$5,note=$6 WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING customer_id`, c.MerchantID, id, nullableString(x.CustomerName), nullableString(x.CustomerPhone), issue, nullableString(x.Note)).Scan(&customerID); err != nil {
			return dto.RepairOrder{}, err
		}
		if len(workItems) > 0 {
			for _, workItem := range workItems {
				issues := workItem.Issues
				if len(issues) == 0 && strings.TrimSpace(workItem.IssueDescription) != "" {
					issues = []string{workItem.IssueDescription}
				}
				issues, err = normalizeRepairTextList(issues, "issues")
				if err != nil || len(issues) == 0 {
					return dto.RepairOrder{}, app.Validation("Every work item requires at least one issue.", map[string]any{"work_items": workItem.ID})
				}
				conditions, conditionErr := normalizeRepairTextList(workItem.Conditions, "conditions")
				if conditionErr != nil {
					return dto.RepairOrder{}, conditionErr
				}
				issuesJSON, _ := json.Marshal(issues)
				conditionsJSON, _ := json.Marshal(conditions)
				if _, err := tx.Exec(ctx, `UPDATE repair_work_item_devices SET issue_description=$3,issues=$4::jsonb,conditions=$5::jsonb,notes=$6,waiting_end_date=CASE WHEN $7::text IS NOT NULL THEN $7::date WHEN $8::int IS NOT NULL THEN waiting_start_date+$8::int ELSE waiting_end_date END WHERE merchant_id=$1::uuid AND work_item_id=$2::uuid`, c.MerchantID, workItem.ID, issues[0], issuesJSON, conditionsJSON, nullableString(workItem.Note), workItem.WaitingEndDate, workItem.WaitingDays); err != nil {
					return dto.RepairOrder{}, err
				}
				if workItem.Device != nil {
					if _, err := tx.Exec(ctx, `UPDATE repair_devices d SET device_type=$3,manufacturer=$4,model=$5,serial_number=$6 WHERE d.merchant_id=$1::uuid AND d.id=(SELECT repair_device_id FROM repair_work_item_devices WHERE merchant_id=$1::uuid AND work_item_id=$2::uuid)`, c.MerchantID, workItem.ID, strings.TrimSpace(workItem.Device.DeviceType), nullableString(workItem.Device.Manufacturer), nullableString(workItem.Device.Model), nullableString(workItem.Device.SerialNumber)); err != nil {
						return dto.RepairOrder{}, err
					}
				}
			}
		}
		if customerID != nil && strings.TrimSpace(stringValue(x.CustomerName)) != "" {
			if _, err := tx.Exec(ctx, `UPDATE customers SET display_name=$3,phone=$4,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, *customerID, strings.TrimSpace(stringValue(x.CustomerName)), nullableString(x.CustomerPhone)); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		var v dto.RepairOrder
		err := tx.QueryRow(ctx, `SELECT ro.id,ro.merchant_id,ro.service_order_id,so.shop_id,ro.device_id,ro.order_number,ro.status,ro.issue_description,ro.received_at,ro.completed_at,ro.customer_id,ro.customer_name,ro.customer_phone,COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text,ro.deposit_paid::text,ro.payment_status,ro.service_id,ro.promotion_id,ro.labor_fee::text,ro.additional_fee::text,ro.tax_amount::text,ro.total_cost::text,ro.note,ro.form_version FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id LEFT JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, c.MerchantID, id).Scan(&v.ID, &v.MerchantID, &v.ServiceOrderID, &v.ShopID, &v.DeviceID, &v.OrderNumber, &v.Status, &v.IssueDescription, &v.ReceivedAt, &v.CompletedAt, &v.CustomerID, &v.CustomerName, &v.CustomerPhone, &v.Subtotal, &v.DiscountTotal, &v.DepositPaid, &v.PaymentStatus, &v.ServiceID, &v.PromotionID, &v.LaborFee, &v.AdditionalFee, &v.TaxAmount, &v.TotalCost, &v.Note, &v.FormVersion)
		if err != nil {
			return v, err
		}
		if len(workItems) > 0 {
			v.WorkItems, err = listRepairWorkItemsTx(ctx, tx, c.MerchantID, id)
			if err != nil {
				return v, err
			}
		}
		applyRepairWaitingRange(&v)
		return v, nil
	})
}

func (r *Repository) UpdateRepairTicketBilling(ctx context.Context, c *authdto.Claims, id string, x dto.RepairTicketBillingRequest) (dto.RepairOrder, error) {
	return writeIdempotent(ctx, r.pool, c, "repair.billing", app.IdempotencyKey(ctx), struct {
		ID      string                         `json:"id"`
		Request dto.RepairTicketBillingRequest `json:"request"`
	}{ID: id, Request: x}, func(tx pgx.Tx) (dto.RepairOrder, error) {
		var serviceOrderID, canonicalOrderID, currentPromotionID, status string
		var currentPaid string
		if err := tx.QueryRow(ctx, `
			SELECT ro.service_order_id,so.order_id::text,COALESCE(ro.promotion_id::text,''),ro.status,
			COALESCE((SELECT SUM(p.amount-COALESCE((SELECT SUM(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status='SUCCEEDED'),0))
				FROM repair_payment_allocations allocation
				JOIN payments p ON p.merchant_id=allocation.merchant_id AND p.id=allocation.payment_id
				WHERE allocation.merchant_id=ro.merchant_id AND allocation.repair_order_id=ro.id
				  AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),0)::text
			FROM repair_orders ro
			JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id
			WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid
		FOR UPDATE OF ro,so`, c.MerchantID, id).Scan(&serviceOrderID, &canonicalOrderID, &currentPromotionID, &status, &currentPaid); err != nil {
			return dto.RepairOrder{}, err
		}
		if status == "REFUNDED" {
			return dto.RepairOrder{}, app.Validation("A refunded repair ticket cannot be repriced.", map[string]any{"status": "refunded"})
		}
		if status == "COMPLETED" {
			return dto.RepairOrder{}, app.Validation("Reopen the repair ticket before changing its billing.", map[string]any{"status": "completed"})
		}

		workItemIDs := map[string]bool{}
		firstWorkItemID := ""
		rows, err := tx.Query(ctx, `SELECT wi.id::text FROM service_order_work_items wi WHERE wi.merchant_id=$1::uuid AND wi.service_order_id=$2::uuid ORDER BY wi.sequence_number`, c.MerchantID, serviceOrderID)
		if err != nil {
			return dto.RepairOrder{}, err
		}
		for rows.Next() {
			var workItemID string
			if err := rows.Scan(&workItemID); err != nil {
				rows.Close()
				return dto.RepairOrder{}, err
			}
			if firstWorkItemID == "" {
				firstWorkItemID = workItemID
			}
			workItemIDs[workItemID] = true
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return dto.RepairOrder{}, err
		}
		rows.Close()
		if firstWorkItemID == "" {
			return dto.RepairOrder{}, app.Validation("The repair ticket has no editable work item.", nil)
		}

		feeUpdates := map[string]string{}
		for index, item := range x.WorkItems {
			item.ID = strings.TrimSpace(item.ID)
			if !workItemIDs[item.ID] {
				return dto.RepairOrder{}, app.Validation("Every billing work item must belong to this repair ticket.", map[string]any{"work_items": fmt.Sprintf("item %d has an invalid id", index+1)})
			}
			fee, parseErr := strconv.ParseFloat(strings.TrimSpace(item.AdditionalFee), 64)
			if parseErr != nil || fee < 0 {
				return dto.RepairOrder{}, app.Validation("Work item prices must be zero or greater.", map[string]any{"work_items": fmt.Sprintf("item %d has an invalid price", index+1)})
			}
			if _, exists := feeUpdates[item.ID]; exists {
				return dto.RepairOrder{}, app.Validation("Billing work item ids must be unique.", map[string]any{"work_items": "duplicate id"})
			}
			feeUpdates[item.ID] = fmt.Sprintf("%.2f", serviceMoney(fee))
		}
		if len(feeUpdates) == 0 {
			feeRows, feeErr := tx.Query(ctx, `SELECT wi.id::text,wid.additional_fee::text FROM service_order_work_items wi JOIN repair_work_item_devices wid ON wid.merchant_id=wi.merchant_id AND wid.work_item_id=wi.id WHERE wi.merchant_id=$1::uuid AND wi.service_order_id=$2::uuid`, c.MerchantID, serviceOrderID)
			if feeErr != nil {
				return dto.RepairOrder{}, feeErr
			}
			for feeRows.Next() {
				var workItemID, fee string
				if feeErr = feeRows.Scan(&workItemID, &fee); feeErr != nil {
					feeRows.Close()
					return dto.RepairOrder{}, feeErr
				}
				feeUpdates[workItemID] = fee
			}
			feeErr = feeRows.Err()
			feeRows.Close()
			if feeErr != nil {
				return dto.RepairOrder{}, feeErr
			}
		}
		feeTotal := 0.0
		for workItemID, fee := range feeUpdates {
			feeValue, _ := strconv.ParseFloat(fee, 64)
			feeTotal += feeValue
			if _, err := tx.Exec(ctx, `UPDATE repair_work_item_devices SET additional_fee=$3 WHERE merchant_id=$1::uuid AND work_item_id=$2::uuid`, c.MerchantID, workItemID, fee); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		feeTotal = serviceMoney(feeTotal)

		serviceRequests := append([]dto.RepairServiceItemRequest(nil), x.ServiceItems...)
		if len(serviceRequests) > 100 {
			return dto.RepairOrder{}, app.Validation("A repair ticket cannot contain more than 100 service items.", map[string]any{"service_items": "maximum 100"})
		}
		for index := range serviceRequests {
			request := &serviceRequests[index]
			if request.ServiceID == nil || strings.TrimSpace(stringValue(request.ServiceID)) == "" || request.VariantID != nil {
				return dto.RepairOrder{}, app.Validation("Repair billing edits can contain service catalog items only; replacement parts remain managed in the ticket workflow.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid reference", index+1)})
			}
			if strings.TrimSpace(request.Quantity) == "" {
				request.Quantity = "1"
			}
			quantity, parseErr := strconv.ParseFloat(request.Quantity, 64)
			if parseErr != nil || quantity <= 0 {
				return dto.RepairOrder{}, app.Validation("Service item quantities must be greater than zero.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid quantity", index+1)})
			}
			if request.WorkItemID != nil && strings.TrimSpace(*request.WorkItemID) != "" && !workItemIDs[strings.TrimSpace(*request.WorkItemID)] {
				return dto.RepairOrder{}, app.Validation("A service line references a work item outside this ticket.", map[string]any{"service_items": fmt.Sprintf("item %d has an invalid work_item_id", index+1)})
			}
		}
		resolved, catalogServiceGross, err := resolveRepairServiceItems(ctx, tx, c.MerchantID, serviceRequests)
		if err != nil {
			return dto.RepairOrder{}, err
		}
		for index := range resolved {
			if resolved[index].WorkItemID == nil || strings.TrimSpace(*resolved[index].WorkItemID) == "" {
				resolved[index].WorkItemID = &firstWorkItemID
			}
		}
		serviceGross := catalogServiceGross
		if strings.TrimSpace(x.LaborFee) != "" {
			laborFee, parseErr := strconv.ParseFloat(strings.TrimSpace(x.LaborFee), 64)
			if parseErr != nil || laborFee < 0 {
				return dto.RepairOrder{}, app.Validation("Labor fee must be zero or greater.", map[string]any{"labor_fee": "invalid amount"})
			}
			serviceGross = serviceMoney(laborFee)
			if len(resolved) > 0 {
				remainingGross := serviceGross
				for index := range resolved {
					quantity, _ := strconv.ParseFloat(resolved[index].Quantity, 64)
					unitPrice, _ := strconv.ParseFloat(resolved[index].UnitPrice, 64)
					lineGross := quantity * unitPrice
					allocated := 0.0
					if index == len(resolved)-1 {
						allocated = remainingGross
					} else if catalogServiceGross > 0 {
						allocated = serviceMoney(serviceGross * lineGross / catalogServiceGross)
					}
					if quantity > 0 {
						resolved[index].UnitPrice = fmt.Sprintf("%.2f", serviceMoney(allocated/quantity))
					}
					remainingGross = serviceMoney(remainingGross - allocated)
				}
			}
		}

		promotionID := strings.TrimSpace(stringValue(x.PromotionID))
		var serviceIDValue *string
		if len(resolved) > 0 && resolved[0].ServiceID != nil {
			serviceIDValue = resolved[0].ServiceID
		}
		serviceBase := serviceMoney(serviceGross + feeTotal)
		serviceDiscount := 0.0
		if currentPromotionID != "" && currentPromotionID != promotionID {
			if _, err := tx.Exec(ctx, `UPDATE order_promotions SET discount_amount=0 WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND promotion_id=$3::uuid`, c.MerchantID, canonicalOrderID, currentPromotionID); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		if promotionID != "" {
			if promotionID == currentPromotionID {
				var promotionType, valueText, minimumText string
				var productScope bool
				if err := tx.QueryRow(ctx, `SELECT promotion_type,value::text,minimum_subtotal::text FROM promotions WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, promotionID).Scan(&promotionType, &valueText, &minimumText); err != nil {
					return dto.RepairOrder{}, app.Validation("The selected promotion is no longer available.", nil)
				}
				if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM promotion_products WHERE merchant_id=$1::uuid AND promotion_id=$2)`, c.MerchantID, promotionID).Scan(&productScope); err != nil {
					return dto.RepairOrder{}, err
				}
				if productScope {
					return dto.RepairOrder{}, app.Validation("This promotion is scoped to products and cannot be applied to a service total.", nil)
				}
				minimum, _ := strconv.ParseFloat(minimumText, 64)
				if serviceBase < minimum {
					return dto.RepairOrder{}, app.Validation("The service total does not meet the promotion minimum.", nil)
				}
				value, _ := strconv.ParseFloat(valueText, 64)
				if promotionType == "PERCENTAGE" {
					serviceDiscount = serviceBase * value / 100
				} else {
					serviceDiscount = value
				}
				serviceDiscount = serviceMoney(math.Min(serviceDiscount, serviceBase))
				if _, err := tx.Exec(ctx, `UPDATE order_promotions SET discount_amount=$4 WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND promotion_id=$3::uuid`, c.MerchantID, canonicalOrderID, promotionID, serviceDiscount); err != nil {
					return dto.RepairOrder{}, err
				}
			} else {
				serviceDiscount, err = servicePromotionDiscount(ctx, tx, c.MerchantID, promotionID, serviceBase)
				if err != nil {
					return dto.RepairOrder{}, err
				}
				if err := recordServicePromotion(ctx, tx, c.MerchantID, canonicalOrderID, promotionID, serviceDiscount); err != nil {
					return dto.RepairOrder{}, err
				}
			}
		}
		serviceNet := serviceMoney(serviceBase - serviceDiscount)
		var includeTax bool
		var taxRate float64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0) FROM service_orders so LEFT JOIN payment_settings ps ON ps.merchant_id=so.merchant_id AND ps.shop_id=so.shop_id WHERE so.merchant_id=$1::uuid AND so.id=$2`, c.MerchantID, serviceOrderID).Scan(&includeTax, &taxRate); err != nil {
			return dto.RepairOrder{}, err
		}
		serviceTax := 0.0
		if includeTax {
			serviceTax = serviceMoney(serviceNet * taxRate / 100)
		}

		var partGross, partDiscount, partTax float64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(quantity*unit_price),0)::float8,COALESCE(SUM(discount_amount),0)::float8,COALESCE(SUM(tax_amount),0)::float8 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND variant_id IS NOT NULL`, c.MerchantID, canonicalOrderID).Scan(&partGross, &partDiscount, &partTax); err != nil {
			return dto.RepairOrder{}, err
		}
		subtotal := serviceMoney(serviceBase + partGross)
		discountTotal := serviceMoney(serviceDiscount + partDiscount)
		taxTotal := serviceMoney(serviceTax + partTax)
		total := serviceMoney(subtotal - discountTotal + taxTotal)
		paid, _ := strconv.ParseFloat(currentPaid, 64)
		if paid > total+0.005 {
			return dto.RepairOrder{}, app.Validation("The new total is below the captured payment balance. Refund the excess payment before lowering the price.", map[string]any{"payment": "captured balance exceeds new total"})
		}

		if _, err := tx.Exec(ctx, `DELETE FROM service_order_items WHERE merchant_id=$1::uuid AND service_order_id=$2::uuid AND service_id IS NOT NULL`, c.MerchantID, serviceOrderID); err != nil {
			return dto.RepairOrder{}, err
		}
		for _, item := range resolved {
			if _, err := tx.Exec(ctx, `INSERT INTO service_order_items(merchant_id,service_order_id,work_item_id,service_id,description,quantity,unit_price,status) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,'OPEN')`, c.MerchantID, serviceOrderID, item.WorkItemID, item.ServiceID, item.Description, item.Quantity, item.UnitPrice); err != nil {
				return dto.RepairOrder{}, err
			}
		}
		if _, err := tx.Exec(ctx, `DELETE FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND variant_id IS NULL AND asset_id IS NULL`, c.MerchantID, canonicalOrderID); err != nil {
			return dto.RepairOrder{}, err
		}
		var lineNumber int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(line_number),0)+1 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2::uuid`, c.MerchantID, canonicalOrderID).Scan(&lineNumber); err != nil {
			return dto.RepairOrder{}, err
		}
		serviceLineTotal := serviceMoney(serviceBase - serviceDiscount + serviceTax)
		if _, err := tx.Exec(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1::uuid,$2::uuid,$3,'Repair service',1,$4,$5,$6,$7)`, c.MerchantID, canonicalOrderID, lineNumber, serviceBase, serviceDiscount, serviceTax, serviceLineTotal); err != nil {
			return dto.RepairOrder{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET subtotal=$3,discount_total=$4,tax_total=$5,grand_total=$6,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, canonicalOrderID, subtotal, discountTotal, taxTotal, total); err != nil {
			return dto.RepairOrder{}, err
		}
		canonicalTarget := "PENDING_PAYMENT"
		if paid >= total && total > 0 {
			canonicalTarget = "FULFILLED"
		}
		if err := advanceCanonicalOrderStatus(ctx, tx, c.MerchantID, canonicalOrderID, canonicalTarget); err != nil {
			return dto.RepairOrder{}, err
		}
		paymentStatus := "UNPAID"
		if paid > 0 {
			paymentStatus = "DEPOSIT_PAID"
			if paid >= total && total > 0 {
				paymentStatus = "PAID"
			}
		}
		var promotionValue *string
		if promotionID != "" {
			promotionValue = &promotionID
		}
		if _, err := tx.Exec(ctx, `UPDATE repair_orders SET service_id=$3::uuid,promotion_id=$4::uuid,labor_fee=$5,additional_fee=$6,tax_amount=$7,total_cost=$8,deposit_paid=$9,payment_status=$10 WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id, serviceIDValue, promotionValue, serviceGross, feeTotal, taxTotal, total, paid, paymentStatus); err != nil {
			return dto.RepairOrder{}, err
		}

		var result dto.RepairOrder
		err = tx.QueryRow(ctx, `SELECT ro.id,ro.merchant_id,ro.service_order_id,so.shop_id,ro.device_id,ro.order_number,ro.status,ro.issue_description,ro.received_at,ro.completed_at,ro.customer_id,ro.customer_name,ro.customer_phone,COALESCE(o.subtotal,0)::text,COALESCE(o.discount_total,0)::text,ro.deposit_paid::text,ro.payment_status,ro.service_id,ro.promotion_id,ro.labor_fee::text,ro.additional_fee::text,ro.tax_amount::text,ro.total_cost::text,ro.note,ro.form_version FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id LEFT JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, c.MerchantID, id).Scan(&result.ID, &result.MerchantID, &result.ServiceOrderID, &result.ShopID, &result.DeviceID, &result.OrderNumber, &result.Status, &result.IssueDescription, &result.ReceivedAt, &result.CompletedAt, &result.CustomerID, &result.CustomerName, &result.CustomerPhone, &result.Subtotal, &result.DiscountTotal, &result.DepositPaid, &result.PaymentStatus, &result.ServiceID, &result.PromotionID, &result.LaborFee, &result.AdditionalFee, &result.TaxAmount, &result.TotalCost, &result.Note, &result.FormVersion)
		if err != nil {
			return result, err
		}
		result.WorkItems, err = listRepairWorkItemsTx(ctx, tx, c.MerchantID, id)
		applyRepairWaitingRange(&result)
		return result, err
	})
}

func normalizeRepairTicketDetails(x dto.RepairTicketDetailsRequest) (string, []dto.RepairTicketWorkItemDetailsRequest, error) {
	items := make([]dto.RepairTicketWorkItemDetailsRequest, len(x.WorkItems))
	seen := map[string]struct{}{}
	for index, item := range x.WorkItems {
		item.ID = strings.TrimSpace(item.ID)
		if len(item.Issues) == 0 && strings.TrimSpace(item.IssueDescription) != "" {
			item.Issues = []string{item.IssueDescription}
		}
		var err error
		item.Issues, err = normalizeRepairTextList(item.Issues, "issues")
		if err != nil {
			return "", nil, err
		}
		item.Conditions, err = normalizeRepairTextList(item.Conditions, "conditions")
		if err != nil {
			return "", nil, err
		}
		if len(item.Issues) > 0 {
			item.IssueDescription = item.Issues[0]
		}
		if _, err := uuid.Parse(item.ID); err != nil {
			return "", nil, app.Validation("Every work item must have a valid id.", map[string]any{"work_items": fmt.Sprintf("item %d has an invalid id", index+1)})
		}
		if item.IssueDescription == "" {
			return "", nil, app.Validation("Every work item requires an issue description.", map[string]any{"work_items": fmt.Sprintf("item %d is incomplete", index+1)})
		}
		if item.Device != nil && strings.TrimSpace(item.Device.DeviceType) == "" {
			return "", nil, app.Validation("Every edited work item device requires a device type.", map[string]any{"work_items": fmt.Sprintf("item %d has an incomplete device", index+1)})
		}
		if item.WaitingDays != nil || item.WaitingEndDate != nil {
			if err := normalizeRepairWaiting(&item.WaitingDays, &item.WaitingEndDate); err != nil {
				return "", nil, app.Validation(err.Error(), map[string]any{"work_items": fmt.Sprintf("item %d has invalid waiting time", index+1)})
			}
		}
		if _, exists := seen[item.ID]; exists {
			return "", nil, app.Validation("Work item ids must be unique.", map[string]any{"work_items": "duplicate id"})
		}
		seen[item.ID] = struct{}{}
		items[index] = item
	}
	issue := strings.TrimSpace(x.IssueDescription)
	if len(items) > 0 {
		issue = items[0].IssueDescription
	}
	if issue == "" {
		return "", nil, app.Validation("Issue description is required.", map[string]any{"issue_description": "required"})
	}
	return issue, items, nil
}
func (r *Repository) DeleteRepairOrder(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_orders x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListRepairPayments(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairPayment, int, error) {
	w, a := scoped(c, q, "a", "a.payment_id::text")
	w, a = addFilter(w, a, "a.repair_order_id=$%d", orderID)
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_payment_allocations a WHERE "+w, "SELECT p.id,a.repair_order_id,a.payment_kind,p.method,COALESCE(p.payment_type_id::text,''),COALESCE(pt.category_code,''),p.status,p.amount::text,p.created_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('work_item_id',allocation.work_item_id::text,'amount',allocation.amount::text) ORDER BY allocation.work_item_id) FROM service_work_item_payment_allocations allocation WHERE allocation.merchant_id=a.merchant_id AND allocation.payment_id=a.payment_id),'[]'::jsonb) FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id LEFT JOIN payment_types pt ON pt.merchant_id=p.merchant_id AND pt.id=p.payment_type_id CROSS JOIN ctx WHERE "+w+" ORDER BY p.created_at", a, q, func(rows pgx.Rows) (dto.RepairPayment, error) {
		var v dto.RepairPayment
		var allocations json.RawMessage
		err := rows.Scan(&v.ID, &v.RepairOrderID, &v.Kind, &v.Method, &v.PaymentTypeID, &v.CategoryCode, &v.Status, &v.Amount, &v.CreatedAt, &allocations)
		if err == nil {
			err = json.Unmarshal(allocations, &v.Allocations)
		}
		return v, err
	})
}

func (r *Repository) CreateRepairPayment(ctx context.Context, c *authdto.Claims, orderID string, x dto.RepairPaymentRequest) (dto.RepairPayment, error) {
	if err := required(orderID, x.Kind, x.Amount, x.IdempotencyKey); err != nil {
		return dto.RepairPayment{}, err
	}
	if strings.TrimSpace(x.PaymentTypeID) == "" && strings.TrimSpace(x.Method) == "" {
		return dto.RepairPayment{}, app.Validation("payment_type_id is required.", map[string]any{"payment_type_id": "required"})
	}
	return writeIdempotent(ctx, r.pool, c, "repair.payment", x.IdempotencyKey, x, func(tx pgx.Tx) (dto.RepairPayment, error) {
		paymentTypeID, paymentTypeName, categoryCode, paymentTypeErr := resolvePaymentType(ctx, tx, c.MerchantID, x.PaymentTypeID, x.Method)
		if paymentTypeErr != nil {
			return dto.RepairPayment{}, paymentTypeErr
		}
		var totalCost, paid string
		var serviceOrderID, orderIDCanonical string
		if err := tx.QueryRow(ctx, `SELECT ro.total_cost::text,COALESCE((SELECT SUM(p.amount-COALESCE((SELECT SUM(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status='SUCCEEDED'),0)) FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id WHERE a.merchant_id=ro.merchant_id AND a.repair_order_id=ro.id AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),0)::text,ro.service_order_id,so.order_id FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2 FOR UPDATE`, c.MerchantID, orderID).Scan(&totalCost, &paid, &serviceOrderID, &orderIDCanonical); err != nil {
			return dto.RepairPayment{}, err
		}
		if x.Kind == "FINAL" {
			estimatedValue, _ := strconv.ParseFloat(totalCost, 64)
			paidValue, _ := strconv.ParseFloat(paid, 64)
			amountValue, _ := strconv.ParseFloat(x.Amount, 64)
			if math.Abs(amountValue-(estimatedValue-paidValue)) > 0.005 {
				return dto.RepairPayment{}, app.Validation("The final payment must equal the outstanding repair balance.", map[string]any{"amount": "must equal the remaining balance"})
			}
		}
		if _, err := tx.Exec(ctx, `SELECT CASE WHEN $1::numeric <= 0 OR $2::numeric + $1::numeric > $3::numeric THEN 1/0 ELSE 1 END`, x.Amount, paid, totalCost); err != nil {
			return dto.RepairPayment{}, app.Validation("Payment exceeds the remaining repair balance.", map[string]any{"amount": "must not exceed the outstanding balance"})
		}
		var paymentID string
		if err := tx.QueryRow(ctx, `INSERT INTO payments(merchant_id,order_id,payment_type_id,method,status,amount,idempotency_key,captured_at) VALUES($1,$2,$3,$4,'CAPTURED',$5,$6,now()) ON CONFLICT (merchant_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id`, c.MerchantID, orderIDCanonical, paymentTypeID, paymentTypeName, x.Amount, x.IdempotencyKey).Scan(&paymentID); err != nil {
			return dto.RepairPayment{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO repair_payment_allocations(merchant_id,repair_order_id,payment_id,payment_kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, c.MerchantID, orderID, paymentID, x.Kind); err != nil {
			return dto.RepairPayment{}, err
		}
		paymentAllocations, allocationErr := allocateRepairPayment(ctx, tx, c.MerchantID, orderID, paymentID, x.Amount, x.Allocations)
		if allocationErr != nil {
			return dto.RepairPayment{}, allocationErr
		}
		var v dto.RepairPayment
		if err := tx.QueryRow(ctx, `SELECT p.id,a.repair_order_id,a.payment_kind,p.method,p.status,p.amount::text,p.created_at FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id WHERE a.merchant_id=$1 AND a.payment_id=$2`, c.MerchantID, paymentID).Scan(&v.ID, &v.RepairOrderID, &v.Kind, &v.Method, &v.Status, &v.Amount, &v.CreatedAt); err != nil {
			return dto.RepairPayment{}, err
		}
		v.PaymentTypeID = paymentTypeID
		v.CategoryCode = categoryCode
		v.Allocations = paymentAllocations
		var newPaid string
		if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(p.amount-COALESCE((SELECT SUM(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status='SUCCEEDED'),0)),0)::text FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id WHERE a.merchant_id=$1 AND a.repair_order_id=$2 AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')`, c.MerchantID, orderID).Scan(&newPaid); err != nil {
			return dto.RepairPayment{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE repair_orders SET deposit_paid=$3,payment_status=CASE WHEN $3::numeric >= total_cost AND total_cost > 0 THEN 'PAID' WHEN $3::numeric > 0 THEN 'DEPOSIT_PAID' ELSE 'UNPAID' END,status=CASE WHEN $3::numeric >= total_cost AND total_cost > 0 THEN 'COMPLETED' ELSE status END,completed_at=CASE WHEN $3::numeric >= total_cost AND total_cost > 0 THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID, newPaid); err != nil {
			return dto.RepairPayment{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE service_orders SET status=CASE WHEN $1::numeric >= $2::numeric AND $2::numeric > 0 THEN 'COMPLETED' ELSE status END,completed_at=CASE WHEN $1::numeric >= $2::numeric AND $2::numeric > 0 THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$3::uuid AND id=$4`, newPaid, totalCost, c.MerchantID, serviceOrderID); err != nil {
			return dto.RepairPayment{}, err
		}
		if _, err := tx.Exec(ctx, `UPDATE service_order_work_items SET status=CASE WHEN $1::numeric >= $2::numeric AND $2::numeric > 0 THEN 'COMPLETED' ELSE status END,updated_at=CASE WHEN $1::numeric >= $2::numeric AND $2::numeric > 0 THEN now() ELSE updated_at END WHERE merchant_id=$3::uuid AND service_order_id=$4::uuid`, newPaid, totalCost, c.MerchantID, serviceOrderID); err != nil {
			return dto.RepairPayment{}, err
		}
		paidValue, _ := strconv.ParseFloat(newPaid, 64)
		totalValue, _ := strconv.ParseFloat(totalCost, 64)
		canonicalTarget := "PENDING_PAYMENT"
		if paidValue >= totalValue && totalValue > 0 {
			canonicalTarget = "FULFILLED"
		}
		if err := advanceCanonicalOrderStatus(ctx, tx, c.MerchantID, orderIDCanonical, canonicalTarget); err != nil {
			return dto.RepairPayment{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,entered_quantity,order_line_id,event_key)
			SELECT ol.merchant_id,ol.variant_id,'SALE',o.fulfillment_location_id,
			       convert_unit_quantity(ol.merchant_id,ol.quantity,ol.unit_id,pv.base_unit_id),
			       ol.unit_id,ol.quantity,ol.id,'repair-order-line:'||ol.id
			  FROM order_lines ol
			  JOIN orders o ON o.merchant_id=ol.merchant_id AND o.id=ol.order_id
			  JOIN product_variants pv ON pv.merchant_id=ol.merchant_id AND pv.id=ol.variant_id
			 WHERE ol.merchant_id=$1 AND ol.order_id=$2 AND pv.is_stock_tracked
			   AND o.status='FULFILLED'
			   AND NOT EXISTS (SELECT 1 FROM inventory_movements im WHERE im.merchant_id=ol.merchant_id AND im.order_line_id=ol.id AND im.movement_type='SALE')`, c.MerchantID, orderIDCanonical); err != nil {
			return dto.RepairPayment{}, err
		}
		var parentStatus, paymentStatus, depositPaid string
		if err := tx.QueryRow(ctx, `SELECT status,payment_status,deposit_paid::text FROM repair_orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, orderID).Scan(&parentStatus, &paymentStatus, &depositPaid); err != nil {
			return dto.RepairPayment{}, err
		}
		if err := publishRepairChildChange(ctx, tx, c, "REPAIR_PAYMENT", v.ID, orderID, map[string]any{
			"id": v.ID, "repair_order_id": v.RepairOrderID, "kind": v.Kind, "method": v.Method,
			"status": v.Status, "amount": v.Amount, "created_at": v.CreatedAt,
			"payment_status": paymentStatus, "deposit_paid": depositPaid, "parent_status": parentStatus,
		}); err != nil {
			return dto.RepairPayment{}, err
		}
		return v, nil
	})
}

func (r *Repository) CreateRepairRefund(ctx context.Context, c *authdto.Claims, repairOrderID string, x dto.RepairRefundRequest) (dto.RepairRefund, error) {
	if err := required(repairOrderID, x.PaymentID, x.Amount, x.IdempotencyKey); err != nil {
		return dto.RepairRefund{}, err
	}
	requestBody, err := json.Marshal(x)
	if err != nil {
		return dto.RepairRefund{}, err
	}
	requestHash := fmt.Sprintf("%x", sha256.Sum256(requestBody))
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairRefund, error) {
		var inserted bool
		err := tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'repair.refund',$2,'PROCESSING',jsonb_build_object('request_hash',$3::text),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, x.IdempotencyKey, requestHash).Scan(&inserted)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return dto.RepairRefund{}, err
		}
		if !inserted {
			var status string
			var sameRequest bool
			var stored json.RawMessage
			if err = tx.QueryRow(ctx, `SELECT status,response_body->>'request_hash'=$3,response_body->'response' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='repair.refund' AND idempotency_key=$2 FOR UPDATE`, c.MerchantID, x.IdempotencyKey, requestHash).Scan(&status, &sameRequest, &stored); err != nil {
				return dto.RepairRefund{}, err
			}
			if !sameRequest {
				return dto.RepairRefund{}, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different repair refund.", 409)
			}
			if status == "COMPLETED" && len(stored) > 0 {
				var existing dto.RepairRefund
				if err = json.Unmarshal(stored, &existing); err != nil {
					return dto.RepairRefund{}, err
				}
				return existing, nil
			}
			return dto.RepairRefund{}, app.NewError("REQUEST_IN_PROGRESS", "This repair refund request is already being processed.", 409)
		}

		var currentRepairStatus, paymentAmount, paymentStatus, refundedAmount, canonicalOrderID string
		if err = tx.QueryRow(ctx, `SELECT ro.status,p.amount::text,p.status,COALESCE((SELECT sum(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status NOT IN ('FAILED','CANCELLED')),0)::text,so.order_id::text
			FROM repair_orders ro
			JOIN repair_payment_allocations rpa ON rpa.merchant_id=ro.merchant_id AND rpa.repair_order_id=ro.id AND rpa.payment_id=$3::uuid
			JOIN payments p ON p.merchant_id=rpa.merchant_id AND p.id=rpa.payment_id
			JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id
			JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id
			JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
			WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid
			  AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid) IS NULL OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid))
				FOR UPDATE OF ro,p`, c.MerchantID, repairOrderID, x.PaymentID, c.MembershipID).Scan(&currentRepairStatus, &paymentAmount, &paymentStatus, &refundedAmount, &canonicalOrderID); err != nil {
			return dto.RepairRefund{}, pgx.ErrNoRows
		}
		if paymentStatus != "CAPTURED" && paymentStatus != "PARTIALLY_REFUNDED" {
			return dto.RepairRefund{}, app.Validation("Only captured repair payments can be refunded.", nil)
		}
		amount, parseErr := strconv.ParseFloat(strings.TrimSpace(x.Amount), 64)
		if parseErr != nil || amount <= 0 {
			return dto.RepairRefund{}, app.Validation("Refund amount must be greater than zero.", nil)
		}
		paid, _ := strconv.ParseFloat(paymentAmount, 64)
		refunded, _ := strconv.ParseFloat(refundedAmount, 64)
		amount = serviceMoney(amount)
		if amount > serviceMoney(paid-refunded) {
			return dto.RepairRefund{}, app.Validation("Refund amount exceeds the remaining captured payment.", nil)
		}
		refundID := strings.TrimSpace(x.RefundID)
		if refundID == "" {
			refundID = uuid.NewString()
		}
		var result dto.RepairRefund
		if err = tx.QueryRow(ctx, `INSERT INTO refunds(id,merchant_id,payment_id,order_id,amount,status,reason) VALUES($1,$2,$3,$4,$5,'SUCCEEDED',NULLIF($6,'')) RETURNING id,payment_id,order_id,status,amount::text,reason,created_at`, refundID, c.MerchantID, x.PaymentID, canonicalOrderID, amount, strings.TrimSpace(x.Reason)).Scan(&result.ID, &result.PaymentID, &result.OrderID, &result.Status, &result.Amount, &result.Reason, &result.CreatedAt); err != nil {
			return dto.RepairRefund{}, err
		}
		result.RepairOrderID = repairOrderID
		if err = tx.QueryRow(ctx, `SELECT COALESCE(SUM(p.amount-COALESCE((SELECT SUM(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status='SUCCEEDED'),0)),0)::text
			FROM repair_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id
			WHERE a.merchant_id=$1::uuid AND a.repair_order_id=$2 AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')`, c.MerchantID, repairOrderID).Scan(&refundedAmount); err != nil {
			return dto.RepairRefund{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE repair_orders SET deposit_paid=$3,payment_status=CASE WHEN $3::numeric >= total_cost AND total_cost > 0 THEN 'PAID' WHEN $3::numeric > 0 THEN 'DEPOSIT_PAID' ELSE 'UNPAID' END,status=CASE WHEN $3::numeric <= 0 THEN 'REFUNDED' ELSE $4 END,completed_at=CASE WHEN $3::numeric <= 0 THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, repairOrderID, refundedAmount, currentRepairStatus); err != nil {
			return dto.RepairRefund{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE orders SET status=CASE WHEN status IN ('FULFILLED','CANCELLED') AND (SELECT COALESCE(sum(rf.amount),0) FROM refunds rf WHERE rf.merchant_id=orders.merchant_id AND rf.order_id=orders.id AND rf.status='SUCCEEDED') >= orders.grand_total THEN 'REFUNDED' ELSE status END,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, canonicalOrderID); err != nil {
			return dto.RepairRefund{}, err
		}
		responseBody, err := json.Marshal(result)
		if err != nil {
			return dto.RepairRefund{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=201,response_body=jsonb_build_object('request_hash',$3::text,'response',$4::jsonb) WHERE merchant_id=$1::uuid AND scope='repair.refund' AND idempotency_key=$2`, c.MerchantID, x.IdempotencyKey, requestHash, responseBody); err != nil {
			return dto.RepairRefund{}, err
		}
		return result, nil
	})
}

func (r *Repository) ListRepairRefunds(ctx context.Context, c *authdto.Claims, repairOrderID string, q app.ListQuery) ([]dto.RepairRefund, int, error) {
	w, a := scoped(c, q, "rf", "rf.id::text")
	w, a = addFilter(w, a, "rpa.repair_order_id=$%d", repairOrderID)
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM refunds rf JOIN repair_payment_allocations rpa ON rpa.merchant_id=rf.merchant_id AND rpa.payment_id=rf.payment_id WHERE "+w, "SELECT rf.id,rpa.repair_order_id,rf.payment_id,rf.order_id,rf.status,rf.amount::text,rf.reason,rf.created_at FROM refunds rf JOIN repair_payment_allocations rpa ON rpa.merchant_id=rf.merchant_id AND rpa.payment_id=rf.payment_id CROSS JOIN ctx WHERE "+w+" ORDER BY rf.created_at,rf.id", a, q, func(rows pgx.Rows) (dto.RepairRefund, error) {
		var v dto.RepairRefund
		err := rows.Scan(&v.ID, &v.RepairOrderID, &v.PaymentID, &v.OrderID, &v.Status, &v.Amount, &v.Reason, &v.CreatedAt)
		return v, err
	})
}

func (r *Repository) ListRepairImages(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairImage, int, error) {
	w, a := scoped(c, q, "x", "x.filename")
	w, a = addFilter(w, a, "x.repair_order_id=$%d", orderID)
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_order_images x WHERE "+w, "SELECT x.id,x.repair_order_id,x.work_item_id,x.filename,x.content_type,x.image_url,x.source_type,x.image_data,x.created_at FROM repair_order_images x CROSS JOIN ctx WHERE "+w+" ORDER BY x.created_at", a, q, func(rows pgx.Rows) (dto.RepairImage, error) {
		var v dto.RepairImage
		var data []byte
		err := rows.Scan(&v.ID, &v.RepairOrderID, &v.WorkItemID, &v.Filename, &v.ContentType, &v.ImageURL, &v.SourceType, &data, &v.CreatedAt)
		if len(data) > 0 {
			v.DataBase64 = base64.StdEncoding.EncodeToString(data)
		}
		return v, err
	})
}

func (r *Repository) CreateRepairImage(ctx context.Context, c *authdto.Claims, orderID string, x dto.RepairImageRequest) (dto.RepairImage, error) {
	if err := required(orderID, x.Filename, x.ContentType); err != nil {
		return dto.RepairImage{}, err
	}
	var data []byte
	if x.ImageURL == "" {
		if x.DataBase64 == "" {
			return dto.RepairImage{}, app.Validation("image_url or data_base64 is required.", nil)
		}
		var err error
		data, err = base64.StdEncoding.DecodeString(x.DataBase64)
		if err != nil {
			return dto.RepairImage{}, app.Validation("data_base64 must be valid base64.", nil)
		}
		x.SourceType = "LEGACY_BASE64"
	}
	return writeIdempotent(ctx, r.pool, c, "repair.image", app.IdempotencyKey(ctx), struct {
		OrderID string                 `json:"order_id"`
		Request dto.RepairImageRequest `json:"request"`
	}{OrderID: orderID, Request: x}, func(tx pgx.Tx) (dto.RepairImage, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, orderID, x.WorkItemID); err != nil {
			return dto.RepairImage{}, err
		}
		var v dto.RepairImage
		var raw []byte
		err := tx.QueryRow(ctx, `INSERT INTO repair_order_images(merchant_id,repair_order_id,work_item_id,filename,content_type,image_url,source_type,image_data) VALUES($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8) RETURNING id,repair_order_id,work_item_id,filename,content_type,COALESCE(image_url,''),source_type,image_data,created_at`, c.MerchantID, orderID, x.WorkItemID, x.Filename, x.ContentType, x.ImageURL, x.SourceType, data).Scan(&v.ID, &v.RepairOrderID, &v.WorkItemID, &v.Filename, &v.ContentType, &v.ImageURL, &v.SourceType, &raw, &v.CreatedAt)
		if len(raw) > 0 {
			v.DataBase64 = base64.StdEncoding.EncodeToString(raw)
		}
		if err == nil {
			err = publishRepairChildChange(ctx, tx, c, "REPAIR_IMAGE", v.ID, orderID, map[string]any{
				"id": v.ID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID,
				"filename": v.Filename, "content_type": v.ContentType, "image_url": v.ImageURL,
				"source_type": v.SourceType, "data_base64": v.DataBase64,
				"created_at": v.CreatedAt,
			})
		}
		return v, err
	})
}

func publishRepairChildChange(ctx context.Context, tx pgx.Tx, c *authdto.Claims, entityType, entityID, repairOrderID string, payload any) error {
	var shopID string
	if err := tx.QueryRow(ctx, `SELECT so.shop_id::text FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, c.MerchantID, repairOrderID).Scan(&shopID); err != nil {
		return err
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,$2,$3::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now()`, c.MerchantID, entityType, entityID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,$2::uuid,nextval('sync_server_sequence_seq'),$3,$4::uuid,1,'CREATE',$5::jsonb)`, c.MerchantID, shopID, entityType, entityID, encoded)
	return err
}

func (r *Repository) DeleteRepairImage(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+`DELETE FROM repair_order_images x USING ctx WHERE x.merchant_id=$2 AND x.id=$3`, c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListDiagnostics(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairDiagnostic, int, error) {
	w, a := scoped(c, q, "x", "x.diagnosis")
	w, a = addFilter(w, a, "x.repair_order_id=$%d", orderID)
	if v := q.Filter("performed_by_membership_id"); v != "" {
		w, a = addFilter(w, a, "x.performed_by_membership_id=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_diagnostics x WHERE "+w, "SELECT x.id,x.merchant_id,x.repair_order_id,x.work_item_id,x.performed_by_membership_id,x.diagnosis,x.estimated_cost,x.created_at FROM repair_diagnostics x CROSS JOIN ctx WHERE "+w+" ORDER BY x.created_at DESC", a, q, func(rows pgx.Rows) (dto.RepairDiagnostic, error) {
		var v dto.RepairDiagnostic
		err := rows.Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.PerformedByMembershipID, &v.Diagnosis, &v.EstimatedCost, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) CreateDiagnostic(ctx context.Context, c *authdto.Claims, x dto.RepairDiagnosticRequest) (dto.RepairDiagnostic, error) {
	if err := required(x.RepairOrderID, x.Diagnosis); err != nil {
		return dto.RepairDiagnostic{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairDiagnostic, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairDiagnostic{}, err
		}
		var v dto.RepairDiagnostic
		err := tx.QueryRow(ctx, "INSERT INTO repair_diagnostics(merchant_id,repair_order_id,work_item_id,performed_by_membership_id,diagnosis,estimated_cost) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,merchant_id,repair_order_id,work_item_id,performed_by_membership_id,diagnosis,estimated_cost,created_at", c.MerchantID, x.RepairOrderID, x.WorkItemID, x.PerformedByMembershipID, x.Diagnosis, x.EstimatedCost).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.PerformedByMembershipID, &v.Diagnosis, &v.EstimatedCost, &v.CreatedAt)
		if err != nil {
			return v, err
		}
		var shopID string
		if err = tx.QueryRow(ctx, `SELECT l.shop_id FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid`, c.MerchantID, v.RepairOrderID).Scan(&shopID); err != nil {
			return v, err
		}
		payload, err := json.Marshal(map[string]any{"id": v.ID, "shop_id": shopID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID, "diagnosis": v.Diagnosis, "estimated_cost": v.EstimatedCost, "performed_by_membership_id": v.PerformedByMembershipID, "created_at": v.CreatedAt})
		if err != nil {
			return v, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'REPAIR_DIAGNOSTIC',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now()`, c.MerchantID, v.ID); err != nil {
			return v, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,$2::uuid,nextval('sync_server_sequence_seq'),'REPAIR_DIAGNOSTIC',$3::uuid,1,'CREATE',$4::jsonb)`, c.MerchantID, shopID, v.ID, payload); err != nil {
			return v, err
		}
		return v, err
	})
}
func (r *Repository) UpdateDiagnostic(ctx context.Context, c *authdto.Claims, id string, x dto.RepairDiagnosticRequest) (dto.RepairDiagnostic, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairDiagnostic, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairDiagnostic{}, err
		}
		var v dto.RepairDiagnostic
		err := tx.QueryRow(ctx, "UPDATE repair_diagnostics SET repair_order_id=$3,work_item_id=$4,performed_by_membership_id=$5,diagnosis=$6,estimated_cost=$7 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,repair_order_id,work_item_id,performed_by_membership_id,diagnosis,estimated_cost,created_at", c.MerchantID, id, x.RepairOrderID, x.WorkItemID, x.PerformedByMembershipID, x.Diagnosis, x.EstimatedCost).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.PerformedByMembershipID, &v.Diagnosis, &v.EstimatedCost, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) DeleteDiagnostic(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_diagnostics x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListRepairParts(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairPart, int, error) {
	w, a := scoped(c, q, "x", "x.status")
	w, a = addFilter(w, a, "x.repair_order_id=$%d", orderID)
	for _, key := range []string{"status", "variant_id", "customer_supplied_part_id"} {
		if v := q.Filter(key); v != "" {
			w, a = addFilter(w, a, "x."+key+"=$%d", v)
		}
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_order_parts x WHERE "+w, "SELECT x.id,x.merchant_id,x.repair_order_id,x.work_item_id,x.variant_id,x.customer_supplied_part_id,x.quantity,x.unit_price,x.status FROM repair_order_parts x CROSS JOIN ctx WHERE "+w+" ORDER BY x.id", a, q, func(rows pgx.Rows) (dto.RepairPart, error) {
		var v dto.RepairPart
		err := rows.Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.VariantID, &v.CustomerSuppliedPartID, &v.Quantity, &v.UnitPrice, &v.Status)
		return v, err
	})
}
func (r *Repository) CreateRepairPart(ctx context.Context, c *authdto.Claims, x dto.RepairPartRequest) (dto.RepairPart, error) {
	if err := required(x.RepairOrderID, x.Quantity); err != nil {
		return dto.RepairPart{}, err
	}
	if (x.VariantID == nil) == (x.CustomerSuppliedPartID == nil) {
		return dto.RepairPart{}, app.Validation("Exactly one part source is required.", nil)
	}
	if x.Status == "" {
		x.Status = "REQUESTED"
	}
	return writeIdempotent(ctx, r.pool, c, "repair.part", app.IdempotencyKey(ctx), x, func(tx pgx.Tx) (dto.RepairPart, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairPart{}, err
		}
		if x.Status == "USED" && x.VariantID != nil {
			quantity, parseErr := strconv.ParseFloat(x.Quantity, 64)
			if parseErr != nil || quantity <= 0 {
				return dto.RepairPart{}, app.Validation("Part quantity must be greater than zero.", nil)
			}
			var serviceOrderID, orderID, locationID, description, unitID, priceText, orderStatus string
			var stockTracked bool
			err := tx.QueryRow(ctx, `SELECT so.id,so.order_id,o.fulfillment_location_id,o.status,p.name||' · '||pv.name,pv.base_unit_id,pv.is_stock_tracked,COALESCE((SELECT pp.amount FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now()) ORDER BY pp.valid_from DESC LIMIT 1),0)::text FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id JOIN product_variants pv ON pv.merchant_id=ro.merchant_id AND pv.id=$3 JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2 FOR UPDATE OF o`, c.MerchantID, x.RepairOrderID, *x.VariantID).Scan(&serviceOrderID, &orderID, &locationID, &orderStatus, &description, &unitID, &stockTracked, &priceText)
			if err != nil {
				return dto.RepairPart{}, app.Validation("The repair, stock location, or product price is unavailable.", nil)
			}
			price, parseErr := strconv.ParseFloat(priceText, 64)
			if parseErr != nil || price < 0 {
				return dto.RepairPart{}, app.Validation("The part has an invalid price.", nil)
			}
			gross := math.Round(quantity*price*100) / 100
			if gross <= 0 {
				return dto.RepairPart{}, app.Validation("Set a price for this part in the default price list before using it.", nil)
			}
			var currentSubtotalText string
			if err = tx.QueryRow(ctx, `SELECT subtotal::text FROM orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID).Scan(&currentSubtotalText); err != nil {
				return dto.RepairPart{}, err
			}
			currentSubtotal, _ := strconv.ParseFloat(currentSubtotalText, 64)
			var includeTax bool
			var taxRate float64
			if err = tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0) FROM orders o JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id LEFT JOIN payment_settings ps ON ps.merchant_id=l.merchant_id AND ps.shop_id=l.shop_id WHERE o.merchant_id=$1::uuid AND o.id=$2`, c.MerchantID, orderID).Scan(&includeTax, &taxRate); err != nil {
				return dto.RepairPart{}, err
			}
			discount := 0.0
			if x.PromotionID != nil && strings.TrimSpace(*x.PromotionID) != "" {
				var promotionType, valueText, minimumText string
				var eligible bool
				if err = tx.QueryRow(ctx, `SELECT promotion_type,value::text,minimum_subtotal::text FROM promotions WHERE merchant_id=$1::uuid AND id=$2 AND is_active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) AND (usage_limit IS NULL OR redemption_count<usage_limit) FOR UPDATE`, c.MerchantID, *x.PromotionID).Scan(&promotionType, &valueText, &minimumText); err != nil {
					return dto.RepairPart{}, app.Validation("The selected promotion is not available.", nil)
				}
				if err = tx.QueryRow(ctx, `SELECT promotion_applies_to_variant($1,$2,$3)`, c.MerchantID, *x.PromotionID, *x.VariantID).Scan(&eligible); err != nil || !eligible {
					return dto.RepairPart{}, app.Validation("The promotion does not apply to this repair part.", nil)
				}
				minimum, _ := strconv.ParseFloat(minimumText, 64)
				if currentSubtotal+gross < minimum {
					return dto.RepairPart{}, app.Validation("The repair total does not meet the promotion minimum.", nil)
				}
				value, _ := strconv.ParseFloat(valueText, 64)
				if promotionType == "PERCENTAGE" {
					discount = math.Round(gross*value) / 100
				} else {
					discount = math.Min(value, gross)
				}
				discount = math.Round(discount*100) / 100
			}
			var v dto.RepairPart
			if err = tx.QueryRow(ctx, "INSERT INTO repair_order_parts(merchant_id,repair_order_id,work_item_id,variant_id,quantity,unit_price,status) VALUES($1,$2,$3,$4,$5,$6,'USED') RETURNING id,merchant_id,repair_order_id,work_item_id,variant_id,customer_supplied_part_id,quantity,unit_price,status", c.MerchantID, x.RepairOrderID, x.WorkItemID, x.VariantID, x.Quantity, priceText).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.VariantID, &v.CustomerSuppliedPartID, &v.Quantity, &v.UnitPrice, &v.Status); err != nil {
				return dto.RepairPart{}, err
			}
			var lineNumber int
			if err = tx.QueryRow(ctx, `SELECT COALESCE(max(line_number),0)+1 FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2`, c.MerchantID, orderID).Scan(&lineNumber); err != nil {
				return dto.RepairPart{}, err
			}
			var lineID string
			partTax := 0.0
			if includeTax {
				partTax = serviceMoney((gross - discount) * taxRate / 100)
			}
			if err = tx.QueryRow(ctx, `INSERT INTO order_lines(merchant_id,order_id,line_number,variant_id,unit_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, c.MerchantID, orderID, lineNumber, x.VariantID, unitID, description, x.Quantity, priceText, discount, partTax, gross-discount+partTax).Scan(&lineID); err != nil {
				return dto.RepairPart{}, err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO service_order_items(merchant_id,service_order_id,work_item_id,variant_id,description,quantity,unit_price,status) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,'OPEN')`, c.MerchantID, serviceOrderID, x.WorkItemID, x.VariantID, description, x.Quantity, priceText); err != nil {
				return dto.RepairPart{}, err
			}
			if _, err = tx.Exec(ctx, `UPDATE orders SET subtotal=subtotal+$3,discount_total=discount_total+$4,tax_total=tax_total+$5,grand_total=grand_total+$3-$4+$5,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID, gross, discount, partTax); err != nil {
				return dto.RepairPart{}, err
			}
			if _, err = tx.Exec(ctx, `UPDATE repair_orders ro SET total_cost=o.grand_total,tax_amount=o.tax_total FROM service_orders so JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2 AND so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id`, c.MerchantID, x.RepairOrderID); err != nil {
				return dto.RepairPart{}, err
			}
			if err = tx.QueryRow(ctx, `SELECT total_cost::text FROM repair_orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, x.RepairOrderID).Scan(&v.RepairTotal); err != nil {
				return dto.RepairPart{}, err
			}
			if x.PromotionID != nil && strings.TrimSpace(*x.PromotionID) != "" {
				if _, err = tx.Exec(ctx, `INSERT INTO order_promotions(merchant_id,order_id,promotion_id,discount_amount) VALUES($1,$2,$3,$4)`, c.MerchantID, orderID, *x.PromotionID, discount); err != nil {
					return dto.RepairPart{}, app.Validation("This promotion is already applied to the repair.", nil)
				}
				if _, err = tx.Exec(ctx, `INSERT INTO promotion_redemptions(merchant_id,promotion_id,order_id) VALUES($1,$2,$3)`, c.MerchantID, *x.PromotionID, orderID); err != nil {
					return dto.RepairPart{}, err
				}
			}
			if stockTracked {
				if err = advanceCanonicalOrderStatus(ctx, tx, c.MerchantID, orderID, "CONFIRMED"); err != nil {
					return dto.RepairPart{}, err
				}
				if _, err = tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,entered_quantity,order_line_id,event_key) VALUES($1,$2,'SALE',$3,$4,$5,$4,$6,$7)`, c.MerchantID, *x.VariantID, locationID, x.Quantity, unitID, lineID, "repair-part:"+v.ID); err != nil {
					return dto.RepairPart{}, err
				}
			}
			if err := publishRepairChildChange(ctx, tx, c, "REPAIR_PART", v.ID, x.RepairOrderID, map[string]any{
				"id": v.ID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID,
				"variant_id": v.VariantID, "customer_supplied_part_id": v.CustomerSuppliedPartID,
				"quantity": v.Quantity, "unit_price": v.UnitPrice, "status": v.Status, "repair_total": v.RepairTotal,
			}); err != nil {
				return dto.RepairPart{}, err
			}
			return v, nil
		}
		var v dto.RepairPart
		err := tx.QueryRow(ctx, "INSERT INTO repair_order_parts(merchant_id,repair_order_id,work_item_id,variant_id,customer_supplied_part_id,quantity,unit_price,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,merchant_id,repair_order_id,work_item_id,variant_id,customer_supplied_part_id,quantity,unit_price,status", c.MerchantID, x.RepairOrderID, x.WorkItemID, x.VariantID, x.CustomerSuppliedPartID, x.Quantity, x.UnitPrice, x.Status).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.VariantID, &v.CustomerSuppliedPartID, &v.Quantity, &v.UnitPrice, &v.Status)
		if err == nil {
			err = publishRepairChildChange(ctx, tx, c, "REPAIR_PART", v.ID, x.RepairOrderID, map[string]any{
				"id": v.ID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID,
				"variant_id": v.VariantID, "customer_supplied_part_id": v.CustomerSuppliedPartID,
				"quantity": v.Quantity, "unit_price": v.UnitPrice, "status": v.Status,
			})
		}
		return v, err
	})
}
func (r *Repository) UpdateRepairPart(ctx context.Context, c *authdto.Claims, id string, x dto.RepairPartRequest) (dto.RepairPart, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairPart, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairPart{}, err
		}
		var currentStatus string
		if err := tx.QueryRow(ctx, `SELECT status FROM repair_order_parts WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, id).Scan(&currentStatus); err != nil {
			return dto.RepairPart{}, err
		}
		if currentStatus == "USED" {
			return dto.RepairPart{}, app.Validation("Used repair parts are immutable; record a stock return instead.", nil)
		}
		var v dto.RepairPart
		err := tx.QueryRow(ctx, "UPDATE repair_order_parts SET repair_order_id=$3,work_item_id=$4,variant_id=$5,customer_supplied_part_id=$6,quantity=$7,unit_price=$8,status=$9 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,repair_order_id,work_item_id,variant_id,customer_supplied_part_id,quantity,unit_price,status", c.MerchantID, id, x.RepairOrderID, x.WorkItemID, x.VariantID, x.CustomerSuppliedPartID, x.Quantity, x.UnitPrice, x.Status).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.VariantID, &v.CustomerSuppliedPartID, &v.Quantity, &v.UnitPrice, &v.Status)
		return v, err
	})
}
func (r *Repository) DeleteRepairPart(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_order_parts x USING ctx WHERE x.merchant_id=$2 AND x.id=$3 AND x.status<>'USED'", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListApprovals(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairApproval, int, error) {
	w, a := scoped(c, q, "x", "x.status")
	w, a = addFilter(w, a, "x.repair_order_id=$%d", orderID)
	if v := q.Filter("status"); v != "" {
		w, a = addFilter(w, a, "x.status=$%d", v)
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_approvals x WHERE "+w, "SELECT x.id,x.merchant_id,x.repair_order_id,x.work_item_id,x.approval_version,x.status,x.approved_amount,x.approved_at,x.created_at FROM repair_approvals x CROSS JOIN ctx WHERE "+w+" ORDER BY x.approval_version DESC", a, q, func(rows pgx.Rows) (dto.RepairApproval, error) {
		var v dto.RepairApproval
		err := rows.Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.ApprovalVersion, &v.Status, &v.ApprovedAmount, &v.ApprovedAt, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) CreateApproval(ctx context.Context, c *authdto.Claims, x dto.RepairApprovalRequest) (dto.RepairApproval, error) {
	if err := required(x.RepairOrderID, x.Status); err != nil {
		return dto.RepairApproval{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairApproval, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairApproval{}, err
		}
		var v dto.RepairApproval
		err := tx.QueryRow(ctx, "INSERT INTO repair_approvals(merchant_id,repair_order_id,work_item_id,approval_version,status,approved_amount,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,merchant_id,repair_order_id,work_item_id,approval_version,status,approved_amount,approved_at,created_at", c.MerchantID, x.RepairOrderID, x.WorkItemID, x.ApprovalVersion, x.Status, x.ApprovedAmount, timePtrUTC(x.ApprovedAt)).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.ApprovalVersion, &v.Status, &v.ApprovedAmount, &v.ApprovedAt, &v.CreatedAt)
		if err == nil {
			err = publishRepairChildChange(ctx, tx, c, "REPAIR_APPROVAL", v.ID, x.RepairOrderID, map[string]any{
				"id": v.ID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID,
				"approval_version": v.ApprovalVersion, "status": v.Status, "approved_amount": v.ApprovedAmount,
				"approved_at": v.ApprovedAt, "created_at": v.CreatedAt,
			})
		}
		return v, err
	})
}
func (r *Repository) UpdateApproval(ctx context.Context, c *authdto.Claims, id string, x dto.RepairApprovalRequest) (dto.RepairApproval, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairApproval, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairApproval{}, err
		}
		var v dto.RepairApproval
		err := tx.QueryRow(ctx, "UPDATE repair_approvals SET repair_order_id=$3,work_item_id=$4,approval_version=$5,status=$6,approved_amount=$7,approved_at=$8 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,repair_order_id,work_item_id,approval_version,status,approved_amount,approved_at,created_at", c.MerchantID, id, x.RepairOrderID, x.WorkItemID, x.ApprovalVersion, x.Status, x.ApprovedAmount, timePtrUTC(x.ApprovedAt)).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.ApprovalVersion, &v.Status, &v.ApprovedAmount, &v.ApprovedAt, &v.CreatedAt)
		return v, err
	})
}
func (r *Repository) DeleteApproval(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_approvals x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}

func (r *Repository) ListWarranties(ctx context.Context, c *authdto.Claims, orderID string, q app.ListQuery) ([]dto.RepairWarranty, int, error) {
	w, a := scoped(c, q, "x", "x.terms")
	w, a = addFilter(w, a, "x.repair_order_id=$%d", orderID)
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_warranties x WHERE "+w, "SELECT x.id,x.merchant_id,x.repair_order_id,x.work_item_id,x.starts_at,x.ends_at,x.terms FROM repair_warranties x CROSS JOIN ctx WHERE "+w+" ORDER BY x.ends_at DESC", a, q, func(rows pgx.Rows) (dto.RepairWarranty, error) {
		var v dto.RepairWarranty
		err := rows.Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.StartsAt, &v.EndsAt, &v.Terms)
		return v, err
	})
}
func (r *Repository) CreateWarranty(ctx context.Context, c *authdto.Claims, x dto.RepairWarrantyRequest) (dto.RepairWarranty, error) {
	if err := required(x.RepairOrderID); err != nil {
		return dto.RepairWarranty{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairWarranty, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairWarranty{}, err
		}
		var v dto.RepairWarranty
		err := tx.QueryRow(ctx, "INSERT INTO repair_warranties(merchant_id,repair_order_id,work_item_id,starts_at,ends_at,terms) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,merchant_id,repair_order_id,work_item_id,starts_at,ends_at,terms", c.MerchantID, x.RepairOrderID, x.WorkItemID, x.StartsAt.UTC(), x.EndsAt.UTC(), x.Terms).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.StartsAt, &v.EndsAt, &v.Terms)
		if err == nil {
			err = publishRepairChildChange(ctx, tx, c, "REPAIR_WARRANTY", v.ID, x.RepairOrderID, map[string]any{
				"id": v.ID, "repair_order_id": v.RepairOrderID, "work_item_id": v.WorkItemID,
				"starts_at": v.StartsAt, "ends_at": v.EndsAt, "terms": v.Terms,
			})
		}
		return v, err
	})
}
func (r *Repository) UpdateWarranty(ctx context.Context, c *authdto.Claims, id string, x dto.RepairWarrantyRequest) (dto.RepairWarranty, error) {
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairWarranty, error) {
		if err := validateRepairWorkItem(tx, ctx, c.MerchantID, x.RepairOrderID, x.WorkItemID); err != nil {
			return dto.RepairWarranty{}, err
		}
		var v dto.RepairWarranty
		err := tx.QueryRow(ctx, "UPDATE repair_warranties SET repair_order_id=$3,work_item_id=$4,starts_at=$5,ends_at=$6,terms=$7 WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,repair_order_id,work_item_id,starts_at,ends_at,terms", c.MerchantID, id, x.RepairOrderID, x.WorkItemID, x.StartsAt.UTC(), x.EndsAt.UTC(), x.Terms).Scan(&v.ID, &v.MerchantID, &v.RepairOrderID, &v.WorkItemID, &v.StartsAt, &v.EndsAt, &v.Terms)
		return v, err
	})
}
func (r *Repository) DeleteWarranty(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_warranties x USING ctx WHERE x.merchant_id=$2 AND x.id=$3", c.IdentityID, c.MerchantID, id)
	return err
}
