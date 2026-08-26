package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	operationsoutbound "business-central-backend/internal/operations/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(p *pgxpool.Pool) *Service { return &Service{pool: p} }
func set(ctx context.Context, tx pgx.Tx, c *authdto.Claims) error {
	_, e := tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)`, c.IdentityID, c.MerchantID)
	return e
}
func nonempty(v ...string) bool {
	for _, x := range v {
		if strings.TrimSpace(x) == "" {
			return false
		}
	}
	return true
}

func writeOperation[T any](ctx context.Context, pool *pgxpool.Pool, c *authdto.Claims, fn func(pgx.Tx) (T, error)) (T, error) {
	var zero T
	tx, err := pool.Begin(ctx)
	if err != nil {
		return zero, err
	}
	defer tx.Rollback(ctx)
	if err = set(ctx, tx, c); err != nil {
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

func writeIdempotent[T any](ctx context.Context, pool *pgxpool.Pool, c *authdto.Claims, scope, key string, request any, fn func(pgx.Tx) (T, error)) (T, error) {
	if strings.TrimSpace(key) == "" {
		return writeOperation(ctx, pool, c, fn)
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
	if err = set(ctx, tx, c); err != nil {
		return zero, err
	}
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,$2,$3,'PROCESSING',jsonb_build_object('request_hash',$4::text),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, scope, key, hash).Scan(&inserted)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return zero, err
	}
	if !inserted {
		var status string
		var sameRequest bool
		var stored json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT status,response_body->>'request_hash'=$4,response_body->'response' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope=$2 AND idempotency_key=$3 FOR UPDATE`, c.MerchantID, scope, key, hash).Scan(&status, &sameRequest, &stored); err != nil {
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
	if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=200,response_body=jsonb_build_object('request_hash',$4::text,'response',$5::jsonb) WHERE merchant_id=$1::uuid AND scope=$2 AND idempotency_key=$3`, c.MerchantID, scope, key, hash, response); err != nil {
		return zero, err
	}
	if err = tx.Commit(ctx); err != nil {
		return zero, err
	}
	return result, nil
}

func (s *Service) ListPriceLists(ctx context.Context, c *authdto.Claims) ([]PriceList, error) {
	rows, e := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.code,p.currency_code,p.is_default,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=p.merchant_id AND entity_type='PRICE_LIST' AND entity_id=p.id),0) FROM price_lists p CROSS JOIN x WHERE p.merchant_id=$1::uuid ORDER BY p.code`, c.MerchantID, c.IdentityID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	o := []PriceList{}
	for rows.Next() {
		var v PriceList
		if e = rows.Scan(&v.ID, &v.MerchantID, &v.Code, &v.CurrencyCode, &v.IsDefault, &v.SyncVersion); e != nil {
			return nil, e
		}
		o = append(o, v)
	}
	return o, rows.Err()
}
func (s *Service) CreatePriceList(ctx context.Context, c *authdto.Claims, r PriceListRequest) (PriceList, error) {
	if !nonempty(r.Code, r.CurrencyCode) {
		return PriceList{}, pgx.ErrNoRows
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return PriceList{}, e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return PriceList{}, e
	}
	v := PriceList{ID: uuid.NewString(), MerchantID: c.MerchantID, Code: r.Code, CurrencyCode: strings.ToUpper(r.CurrencyCode)}
	if r.IsDefault != nil {
		v.IsDefault = *r.IsDefault
	}
	_, e = tx.Exec(ctx, `INSERT INTO price_lists(id,merchant_id,code,currency_code,is_default) VALUES($1,$2,$3,$4,$5)`, v.ID, c.MerchantID, v.Code, v.CurrencyCode, v.IsDefault)
	if e != nil {
		return PriceList{}, e
	}
	if e = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRICE_LIST',$2::uuid,1,now()) RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); e != nil {
		return PriceList{}, e
	}
	if e = publishPriceListChange(ctx, tx, c.MerchantID, v, "CREATE"); e != nil {
		return PriceList{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return PriceList{}, e
	}
	return v, nil
}
func (s *Service) UpdatePriceList(ctx context.Context, c *authdto.Claims, id string, r PriceListRequest) (PriceList, error) {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return PriceList{}, e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return PriceList{}, e
	}
	var v PriceList
	e = tx.QueryRow(ctx, `UPDATE price_lists SET code=$3,currency_code=$4,is_default=COALESCE($5,is_default) WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,code,currency_code,is_default`, c.MerchantID, id, r.Code, strings.ToUpper(r.CurrencyCode), r.IsDefault).Scan(&v.ID, &v.MerchantID, &v.Code, &v.CurrencyCode, &v.IsDefault)
	if e != nil {
		return PriceList{}, e
	}
	if e = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRICE_LIST',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); e != nil {
		return PriceList{}, e
	}
	if e = publishPriceListChange(ctx, tx, c.MerchantID, v, "UPDATE"); e != nil {
		return PriceList{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return PriceList{}, e
	}
	return v, nil
}
func (s *Service) DeletePriceList(ctx context.Context, c *authdto.Claims, id string) error {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return e
	}
	var priceCount int
	if e = tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_prices WHERE merchant_id=$1::uuid AND price_list_id=$2::uuid`, c.MerchantID, id).Scan(&priceCount); e != nil {
		return e
	}
	if priceCount > 0 {
		return fmt.Errorf("price list has product prices and cannot be deleted")
	}
	var version int64
	if e = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='PRICE_LIST' AND entity_id=$2::uuid),0)`, c.MerchantID, id).Scan(&version); e != nil {
		return e
	}
	r, e := tx.Exec(ctx, `DELETE FROM price_lists WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if e != nil {
		return e
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	version++
	if _, e = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRICE_LIST',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); e != nil {
		return e
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if e = publishPriceListPayload(ctx, tx, c.MerchantID, id, version, "DELETE", payload); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

func (s *Service) ListPrices(ctx context.Context, c *authdto.Claims, priceListID string) ([]ProductPrice, error) {
	rows, e := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT p.merchant_id,p.price_list_id,p.variant_id,p.amount::text,p.valid_from,p.valid_until,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=p.merchant_id AND entity_type='PRODUCT_PRICE' AND entity_id=uuid_generate_v5(uuid_ns_url(),($1||':'||p.price_list_id::text||':'||p.variant_id::text||':'||to_char(p.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::uuid),0) FROM product_prices p CROSS JOIN x WHERE p.merchant_id=$1::uuid AND p.price_list_id=$3 ORDER BY p.variant_id,p.valid_from`, c.MerchantID, c.IdentityID, priceListID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	o := []ProductPrice{}
	for rows.Next() {
		var v ProductPrice
		if e = rows.Scan(&v.MerchantID, &v.PriceListID, &v.VariantID, &v.Amount, &v.ValidFrom, &v.ValidUntil, &v.SyncVersion); e != nil {
			return nil, e
		}
		v.SyncID = priceSyncID(v.MerchantID, v.PriceListID, v.VariantID, v.ValidFrom)
		o = append(o, v)
	}
	return o, rows.Err()
}
func (s *Service) UpsertPrice(ctx context.Context, c *authdto.Claims, r ProductPriceRequest) (ProductPrice, error) {
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return ProductPrice{}, e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return ProductPrice{}, e
	}
	var v ProductPrice
	e = tx.QueryRow(ctx, `INSERT INTO product_prices(merchant_id,price_list_id,variant_id,amount,valid_from,valid_until) VALUES($1::uuid,$2::uuid,$3::uuid,$4,COALESCE($5,now()),$6) ON CONFLICT(merchant_id,price_list_id,variant_id) DO UPDATE SET amount=EXCLUDED.amount,valid_until=EXCLUDED.valid_until RETURNING merchant_id,price_list_id,variant_id,amount::text,valid_from,valid_until`, c.MerchantID, r.PriceListID, r.VariantID, r.Amount, r.ValidFrom, r.ValidUntil).Scan(&v.MerchantID, &v.PriceListID, &v.VariantID, &v.Amount, &v.ValidFrom, &v.ValidUntil)
	if e != nil {
		return ProductPrice{}, e
	}
	v.SyncID = priceSyncID(v.MerchantID, v.PriceListID, v.VariantID, v.ValidFrom)
	if e = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRODUCT_PRICE',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, v.SyncID).Scan(&v.SyncVersion); e != nil {
		return ProductPrice{}, e
	}
	if e = publishPriceChange(ctx, tx, c.MerchantID, v, "UPDATE"); e != nil {
		return ProductPrice{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return ProductPrice{}, e
	}
	return v, nil
}
func (s *Service) DeletePrice(ctx context.Context, c *authdto.Claims, r ProductPriceRequest) error {
	if r.ValidFrom == nil {
		return pgx.ErrNoRows
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return e
	}
	res, e := tx.Exec(ctx, `DELETE FROM product_prices WHERE merchant_id=$1::uuid AND price_list_id=$2 AND variant_id=$3 AND valid_from=$4`, c.MerchantID, r.PriceListID, r.VariantID, r.ValidFrom)
	if e != nil {
		return e
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	syncID := priceSyncID(c.MerchantID, r.PriceListID, r.VariantID, *r.ValidFrom)
	var version int64
	if e = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'PRODUCT_PRICE',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, syncID).Scan(&version); e != nil {
		return e
	}
	payload, _ := json.Marshal(map[string]any{"sync_id": syncID, "price_list_id": r.PriceListID, "variant_id": r.VariantID, "valid_from": r.ValidFrom, "is_deleted": true})
	if e = publishPricePayload(ctx, tx, c.MerchantID, syncID, version, "DELETE", payload); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

func priceSyncID(merchantID, priceListID, variantID string, validFrom time.Time) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(strings.Join([]string{merchantID, priceListID, variantID, validFrom.UTC().Format("2006-01-02T15:04:05.000000Z")}, ":"))).String()
}

func publishPriceChange(ctx context.Context, tx pgx.Tx, merchantID string, price ProductPrice, operationType string) error {
	payload, err := json.Marshal(price)
	if err != nil {
		return err
	}
	return publishPricePayload(ctx, tx, merchantID, price.SyncID, price.SyncVersion, operationType, payload)
}

func publishPricePayload(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'PRODUCT_PRICE',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishPriceListChange(ctx context.Context, tx pgx.Tx, merchantID string, list PriceList, operationType string) error {
	payload, err := json.Marshal(list)
	if err != nil {
		return err
	}
	return publishPriceListPayload(ctx, tx, merchantID, list.ID, list.SyncVersion, operationType, payload)
}

func publishPriceListPayload(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'PRICE_LIST',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func (s *Service) ListMovements(ctx context.Context, c *authdto.Claims) ([]Movement, error) {
	rows, e := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT m.id,m.merchant_id,m.variant_id,m.movement_type,m.source_location_id,m.destination_location_id,m.unit_id,m.receipt_line_id,m.order_line_id,m.reverses_movement_id,m.quantity::text,m.entered_quantity::text,m.unit_cost::text,m.event_key,m.occurred_at,m.created_at FROM inventory_movements m CROSS JOIN x WHERE m.merchant_id=$1::uuid AND (NULLIF($3,'')::uuid IS NULL OR EXISTS(SELECT 1 FROM user_memberships um JOIN locations l ON l.merchant_id=um.merchant_id AND (l.id=m.source_location_id OR l.id=m.destination_location_id) WHERE um.merchant_id=m.merchant_id AND um.id=NULLIF($3,'')::uuid AND (um.shop_id IS NULL OR l.shop_id=um.shop_id))) ORDER BY m.occurred_at DESC`, c.MerchantID, c.IdentityID, c.MembershipID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	o := []Movement{}
	for rows.Next() {
		var v Movement
		if e = rows.Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.MovementType, &v.SourceLocationID, &v.DestinationLocationID, &v.UnitID, &v.ReceiptLineID, &v.OrderLineID, &v.ReversesMovementID, &v.Quantity, &v.EnteredQuantity, &v.UnitCost, &v.EventKey, &v.OccurredAt, &v.CreatedAt); e != nil {
			return nil, e
		}
		o = append(o, v)
	}
	return o, rows.Err()
}

func (s *Service) ListStockAssets(ctx context.Context, c *authdto.Claims) ([]StockAsset, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS (
		SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)
	) SELECT a.id,a.merchant_id,a.variant_id,p.name,pv.name,pv.sku,a.location_id,l.name,a.asset_tag,a.status,
		br.id,br.code
		FROM inventory_assets a
		JOIN product_variants pv ON pv.merchant_id=a.merchant_id AND pv.id=a.variant_id
		JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id
		LEFT JOIN locations l ON l.merchant_id=a.merchant_id AND l.id=a.location_id
		LEFT JOIN LATERAL (
			SELECT id,code FROM barcode_registry
			WHERE merchant_id=a.merchant_id AND asset_id=a.id AND is_active
			ORDER BY is_primary DESC,created_at LIMIT 1
		) br ON true
		CROSS JOIN x
		WHERE a.merchant_id=$1::uuid
		AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL
			 OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid))
		ORDER BY p.name,pv.name,a.asset_tag`, c.MerchantID, c.IdentityID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []StockAsset{}
	for rows.Next() {
		var item StockAsset
		if err := rows.Scan(&item.ID, &item.MerchantID, &item.VariantID, &item.ProductName, &item.VariantName, &item.SKU, &item.LocationID, &item.LocationName, &item.AssetTag, &item.Status, &item.BarcodeID, &item.Barcode); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) ListStorage(ctx context.Context, c *authdto.Claims) ([]StorageItem, error) {
	rows, err := s.pool.Query(ctx, `WITH RECURSIVE ctx AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)), financial_access AS (
		SELECT EXISTS (SELECT 1 FROM user_memberships um JOIN membership_roles mr ON mr.merchant_id=um.merchant_id AND mr.membership_id=um.id JOIN roles role ON role.merchant_id=mr.merchant_id AND role.id=mr.role_id WHERE um.merchant_id=$1::uuid AND um.identity_id=$2::uuid AND role.code='merchant' AND um.is_active) AS allowed
	), membership_scope AS (
		SELECT um.shop_id FROM user_memberships um WHERE um.merchant_id=$1::uuid AND um.id=NULLIF($3,'')::uuid AND um.is_active LIMIT 1
	), category_paths AS (
		SELECT c.id,c.merchant_id,c.name::text AS path FROM catalog_categories c WHERE c.parent_category_id IS NULL
		UNION ALL SELECT child.id,child.merchant_id,parent.path || ' → ' || child.name FROM catalog_categories child JOIN category_paths parent ON parent.merchant_id=child.merchant_id AND parent.id=child.parent_category_id
	), catalog AS (SELECT pc.product_id,string_agg(DISTINCT cp.path,' / ' ORDER BY cp.path) AS path FROM catalog_product_categories pc JOIN category_paths cp ON cp.merchant_id=pc.merchant_id AND cp.id=pc.category_id GROUP BY pc.product_id)
	SELECT v.id,COALESCE(catalog.path,''),p.name,v.name,COALESCE(b.name,''),COALESCE(u.symbol,u.name,v.unit_of_measure),COALESCE((SELECT sum(ib.quantity_on_hand) FROM inventory_balances ib JOIN locations stock_location ON stock_location.merchant_id=ib.merchant_id AND stock_location.id=ib.location_id WHERE ib.merchant_id=v.merchant_id AND ib.variant_id=v.id AND (membership_scope.shop_id IS NULL OR stock_location.shop_id=membership_scope.shop_id)),0)::text,
		COALESCE(price.amount::text,''),CASE WHEN financial_access.allowed THEN COALESCE(cost.amount::text,'') ELSE '' END,CASE WHEN financial_access.allowed AND price.amount IS NOT NULL AND cost.amount IS NOT NULL THEN (price.amount-cost.amount)::text ELSE '' END,p.expired_date,p.manufacture_date
	FROM product_variants v JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id LEFT JOIN catalog_brands b ON b.merchant_id=p.merchant_id AND b.id=p.brand_id LEFT JOIN unit_definitions u ON u.merchant_id=v.merchant_id AND u.id=v.base_unit_id LEFT JOIN catalog ON catalog.product_id=p.id CROSS JOIN membership_scope
	LEFT JOIN LATERAL (SELECT pp.amount FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=v.merchant_id AND pp.variant_id=v.id AND pl.code='RETAIL' AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>=now()) ORDER BY pp.valid_from DESC LIMIT 1) price ON true
	LEFT JOIN LATERAL (SELECT CASE WHEN sum(cl.quantity_remaining)>0 THEN sum(cl.quantity_remaining*cl.unit_cost)/sum(cl.quantity_remaining) END AS amount FROM inventory_cost_layers cl JOIN locations cost_location ON cost_location.merchant_id=cl.merchant_id AND cost_location.id=cl.location_id WHERE cl.merchant_id=v.merchant_id AND cl.variant_id=v.id AND cl.quantity_remaining>0 AND (membership_scope.shop_id IS NULL OR cost_location.shop_id=membership_scope.shop_id)) cost ON true
	CROSS JOIN ctx CROSS JOIN financial_access WHERE v.merchant_id=$1::uuid ORDER BY p.name,v.name`, c.MerchantID, c.IdentityID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StorageItem{}
	for rows.Next() {
		var item StorageItem
		if err := rows.Scan(&item.ID, &item.Catalog, &item.ProductName, &item.VariantName, &item.Brand, &item.Unit, &item.StockCount, &item.SellPrice, &item.OriginalPrice, &item.Profit, &item.ExpiredDate, &item.ManufactureDate); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) GetMovementDetail(ctx context.Context, c *authdto.Claims, id string) (operationsdto.StockMovementDetail, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return operationsdto.StockMovementDetail{}, err
	}
	defer tx.Rollback(ctx)
	if err = set(ctx, tx, c); err != nil {
		return operationsdto.StockMovementDetail{}, err
	}

	var detail operationsdto.StockMovementDetail
	m := &detail.Movement
	err = tx.QueryRow(ctx, `
		SELECT m.id,m.merchant_id,m.variant_id,m.movement_type,m.source_location_id,m.destination_location_id,
		       m.unit_id,m.receipt_line_id,m.order_line_id,m.reverses_movement_id,m.quantity::text,
		       m.entered_quantity::text,m.unit_cost::text,m.event_key,m.occurred_at,m.created_at,
		       p.name,COALESCE(p.description,''),v.name,v.sku,COALESCE(v.barcode,''),
		       COALESCE(u.name,''),COALESCE(u.symbol,''),
		       COALESCE(src.name,''),COALESCE(src.code,''),COALESCE(dst.name,''),COALESCE(dst.code,''),
		       COALESCE((SELECT SUM(a.total_cost) FROM inventory_cost_allocations a WHERE a.merchant_id=m.merchant_id AND a.consumption_movement_id=m.id),m.unit_cost*m.quantity,0)::text,
		       src_balance.quantity_on_hand::text,src_balance.quantity_reserved::text,
		       dst_balance.quantity_on_hand::text,dst_balance.quantity_reserved::text
		  FROM inventory_movements m
		  JOIN product_variants v ON v.merchant_id=m.merchant_id AND v.id=m.variant_id
		  JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id
		  LEFT JOIN unit_definitions u ON u.merchant_id=m.merchant_id AND u.id=COALESCE(m.unit_id,v.base_unit_id)
		  LEFT JOIN locations src ON src.merchant_id=m.merchant_id AND src.id=m.source_location_id
		  LEFT JOIN locations dst ON dst.merchant_id=m.merchant_id AND dst.id=m.destination_location_id
		  LEFT JOIN inventory_balances src_balance ON src_balance.merchant_id=m.merchant_id AND src_balance.location_id=m.source_location_id AND src_balance.variant_id=m.variant_id
		  LEFT JOIN inventory_balances dst_balance ON dst_balance.merchant_id=m.merchant_id AND dst_balance.location_id=m.destination_location_id AND dst_balance.variant_id=m.variant_id
		 WHERE m.merchant_id=$1::uuid AND m.id=$2::uuid
		   AND ($3='' OR EXISTS(
		       SELECT 1 FROM user_memberships um
		       JOIN locations scope_location ON scope_location.merchant_id=m.merchant_id AND scope_location.id IN (m.source_location_id,m.destination_location_id)
		       WHERE um.merchant_id=m.merchant_id AND um.id=NULLIF($3,'')::uuid
		         AND (um.shop_id IS NULL OR scope_location.shop_id=um.shop_id)
		   ))`, c.MerchantID, id, c.MembershipID).Scan(
		&m.ID, &m.MerchantID, &m.VariantID, &m.MovementType, &m.SourceLocationID, &m.DestinationLocationID,
		&m.UnitID, &m.ReceiptLineID, &m.OrderLineID, &m.ReversesMovementID, &m.Quantity,
		&m.EnteredQuantity, &m.UnitCost, &m.EventKey, &m.OccurredAt, &m.CreatedAt,
		&detail.ProductName, &detail.ProductDescription, &detail.VariantName, &detail.SKU, &detail.Barcode,
		&detail.UnitName, &detail.UnitSymbol,
		&detail.SourceLocationName, &detail.SourceLocationCode, &detail.DestinationLocationName, &detail.DestinationLocationCode,
		&detail.TotalCost, &detail.SourceQuantityOnHand, &detail.SourceQuantityReserved,
		&detail.DestinationQuantityOnHand, &detail.DestinationQuantityReserved,
	)
	if err != nil {
		return operationsdto.StockMovementDetail{}, err
	}

	if m.ReceiptLineID != nil {
		var receipt operationsdto.StockMovementReceipt
		err = tx.QueryRow(ctx, `
			SELECT gr.id::text,gr.receipt_number,gr.received_at,po.id::text,po.order_number,po.status,
			       s.name,po.currency_code::text,COALESCE(grl.batch_number,''),grl.expires_at,
			       grl.quantity_received::text,grl.unit_cost::text
			  FROM goods_receipt_lines grl
			  JOIN goods_receipts gr ON gr.merchant_id=grl.merchant_id AND gr.id=grl.receipt_id
			  JOIN purchase_orders po ON po.merchant_id=gr.merchant_id AND po.id=gr.purchase_order_id
			  JOIN suppliers s ON s.merchant_id=po.merchant_id AND s.id=po.supplier_id
			 WHERE grl.merchant_id=$1::uuid AND grl.id=$2::uuid`, c.MerchantID, *m.ReceiptLineID).Scan(
			&receipt.ReceiptID, &receipt.ReceiptNumber, &receipt.ReceivedAt, &receipt.PurchaseOrderID,
			&receipt.PurchaseOrderNumber, &receipt.PurchaseOrderStatus, &receipt.SupplierName,
			&receipt.CurrencyCode, &receipt.BatchNumber, &receipt.ExpiresAt,
			&receipt.QuantityReceived, &receipt.UnitCost,
		)
		if err != nil {
			return operationsdto.StockMovementDetail{}, err
		}
		detail.Receipt = &receipt
	}

	if m.OrderLineID != nil {
		var order operationsdto.StockMovementOrder
		err = tx.QueryRow(ctx, `
			SELECT o.id::text,o.order_number,o.channel,o.status,o.currency_code::text,
			       COALESCE(cu.display_name,''),COALESCE(cu.phone,''),ol.id::text,ol.description,
			       ol.quantity::text,ol.unit_price::text,ol.discount_amount::text,ol.tax_amount::text,ol.line_total::text
			  FROM order_lines ol
			  JOIN orders o ON o.merchant_id=ol.merchant_id AND o.id=ol.order_id
			  LEFT JOIN customers cu ON cu.merchant_id=o.merchant_id AND cu.id=o.customer_id
			 WHERE ol.merchant_id=$1::uuid AND ol.id=$2::uuid`, c.MerchantID, *m.OrderLineID).Scan(
			&order.OrderID, &order.OrderNumber, &order.Channel, &order.Status, &order.CurrencyCode,
			&order.CustomerName, &order.CustomerPhone, &order.LineID, &order.Description,
			&order.OrderedQuantity, &order.UnitPrice, &order.DiscountAmount, &order.TaxAmount, &order.LineTotal,
		)
		if err != nil {
			return operationsdto.StockMovementDetail{}, err
		}
		detail.Order = &order
	}

	detail.CostAllocations = []operationsdto.StockMovementCostAllocation{}
	rows, err := tx.Query(ctx, `
		SELECT a.id::text,a.cost_layer_id::text,a.quantity::text,a.unit_cost::text,a.total_cost::text,
		       l.quantity_received::text,l.quantity_remaining::text,COALESCE(gr.receipt_number,'')
		  FROM inventory_cost_allocations a
		  JOIN inventory_cost_layers l ON l.merchant_id=a.merchant_id AND l.id=a.cost_layer_id
		  LEFT JOIN goods_receipt_lines grl ON grl.merchant_id=l.merchant_id AND grl.id=l.receipt_line_id
		  LEFT JOIN goods_receipts gr ON gr.merchant_id=grl.merchant_id AND gr.id=grl.receipt_id
		 WHERE a.merchant_id=$1::uuid AND a.consumption_movement_id=$2::uuid
		 ORDER BY a.created_at,a.id`, c.MerchantID, id)
	if err != nil {
		return operationsdto.StockMovementDetail{}, err
	}
	for rows.Next() {
		var allocation operationsdto.StockMovementCostAllocation
		if err = rows.Scan(&allocation.ID, &allocation.CostLayerID, &allocation.Quantity, &allocation.UnitCost,
			&allocation.TotalCost, &allocation.LayerQuantityReceived, &allocation.LayerQuantityRemaining,
			&allocation.SourceReceiptNumber); err != nil {
			rows.Close()
			return operationsdto.StockMovementDetail{}, err
		}
		detail.CostAllocations = append(detail.CostAllocations, allocation)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return operationsdto.StockMovementDetail{}, err
	}
	rows.Close()
	if err = tx.Commit(ctx); err != nil {
		return operationsdto.StockMovementDetail{}, err
	}
	return detail, nil
}

const transactionHistoryBase = `WITH ctx AS(
        SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)
    ), history AS (
        SELECT CASE m.movement_type
                   WHEN 'RECEIPT' THEN 'STOCK_IN'
                   WHEN 'SALE' THEN 'STOCK_OUT'
                   WHEN 'RETURN' THEN 'STOCK_RETURN'
                   WHEN 'TRANSFER' THEN 'STOCK_TRANSFER'
                   ELSE 'STOCK_ADJUSTMENT'
               END AS event_type,
               m.id::text,
               COALESCE(gr.receipt_number,m.event_key) AS reference,
               m.occurred_at AS occurred_at,
               m.movement_type AS status,
               ''::text AS channel,
               NULL::text AS customer_name,
               NULL::text AS customer_phone,
               ''::text AS payment_method,
               CASE WHEN m.movement_type='RECEIPT'
                    THEN COALESCE(m.unit_cost,0)
                    ELSE COALESCE((SELECT SUM(a.total_cost)
                                     FROM inventory_cost_allocations a
                                    WHERE a.merchant_id=m.merchant_id
                                      AND a.consumption_movement_id=m.id),0)
                END::text AS amount,
               ''::text AS currency_code,
               COALESCE(COALESCE(dst.shop_id,src.shop_id)::text,'') AS shop_id,
               COALESCE(dst.name,src.name,'') AS shop_name,
               m.quantity::text AS quantity,
               p.name AS product_name,
               v.name AS variant_name,
               v.sku AS sku,
               CASE m.movement_type
                   WHEN 'RECEIPT' THEN 'Stock received into '||COALESCE(dst.name,'location')
                   WHEN 'SALE' THEN 'Stock checked out from '||COALESCE(src.name,'location')
                   ELSE initcap(lower(m.movement_type))||' at '||COALESCE(dst.name,src.name,'location')
               END AS details
          FROM inventory_movements m
          JOIN product_variants v ON v.merchant_id=m.merchant_id AND v.id=m.variant_id
          JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id
          LEFT JOIN goods_receipt_lines grl ON grl.merchant_id=m.merchant_id AND grl.id=m.receipt_line_id
          LEFT JOIN goods_receipts gr ON gr.merchant_id=grl.merchant_id AND gr.id=grl.receipt_id
          LEFT JOIN locations src ON src.merchant_id=m.merchant_id AND src.id=m.source_location_id
          LEFT JOIN locations dst ON dst.merchant_id=m.merchant_id AND dst.id=m.destination_location_id
          CROSS JOIN ctx
         WHERE m.merchant_id=$1::uuid
           AND ($3='' OR EXISTS(
               SELECT 1 FROM user_memberships um
               JOIN locations scope_location ON scope_location.merchant_id=m.merchant_id
                AND scope_location.id IN (m.source_location_id,m.destination_location_id)
              WHERE um.merchant_id=m.merchant_id AND um.id=NULLIF($3,'')::uuid
                AND (um.shop_id IS NULL OR scope_location.shop_id=um.shop_id)
           ))
        UNION ALL
        SELECT 'TRANSACTION',
               o.id::text,
               o.order_number,
               COALESCE(o.placed_at,o.created_at),
               o.status,
               o.channel,
               cu.display_name,
               cu.phone,
               COALESCE((SELECT string_agg(DISTINCT py.method, ', ' ORDER BY py.method)
                           FROM payments py
                          WHERE py.merchant_id=o.merchant_id AND py.order_id=o.id
                            AND py.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),''),
               o.grand_total::text,
               o.currency_code::text,
               COALESCE(COALESCE(service_scope.shop_id,l.shop_id)::text,''),
               COALESCE(sh.name,''),
               COALESCE((SELECT SUM(ol.quantity) FROM order_lines ol
                          WHERE ol.merchant_id=o.merchant_id AND ol.order_id=o.id),0)::text,
               ''::text,
               ''::text,
               ''::text,
               'Canonical '||o.channel||' order: '||COALESCE((SELECT string_agg(ol.description, ', ' ORDER BY ol.line_number)
                           FROM order_lines ol
                          WHERE ol.merchant_id=o.merchant_id AND ol.order_id=o.id),'')
          FROM orders o
          LEFT JOIN customers cu ON cu.merchant_id=o.merchant_id AND cu.id=o.customer_id
          LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
          LEFT JOIN service_orders service_scope ON service_scope.merchant_id=o.merchant_id AND service_scope.order_id=o.id
          LEFT JOIN shops sh ON sh.merchant_id=o.merchant_id AND sh.id=COALESCE(service_scope.shop_id,l.shop_id)
          CROSS JOIN ctx
         WHERE o.merchant_id=$1::uuid
           AND o.status NOT IN ('DRAFT','CANCELLED')
           AND ($3='' OR EXISTS(
               SELECT 1 FROM user_memberships um
              WHERE um.merchant_id=o.merchant_id AND um.id=NULLIF($3,'')::uuid
                AND (um.shop_id IS NULL OR COALESCE(service_scope.shop_id,l.shop_id)=um.shop_id)
           ))
        UNION ALL
        SELECT 'REFUND',
               rf.id::text,
               o.order_number||' · refund',
               rf.created_at,
               rf.status,
               o.channel,
               cu.display_name,
               cu.phone,
               py.method,
               rf.amount::text,
               o.currency_code::text,
               COALESCE(COALESCE(service_scope.shop_id,l.shop_id)::text,''),
               COALESCE(sh.name,''),
               ''::text,
               ''::text,
               ''::text,
               ''::text,
               COALESCE(rf.reason,'Refund')||' against order '||o.order_number
          FROM refunds rf
          JOIN payments py ON py.merchant_id=rf.merchant_id AND py.id=rf.payment_id
          JOIN orders o ON o.merchant_id=rf.merchant_id AND o.id=rf.order_id
          LEFT JOIN customers cu ON cu.merchant_id=o.merchant_id AND cu.id=o.customer_id
          LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
          LEFT JOIN service_orders service_scope ON service_scope.merchant_id=o.merchant_id AND service_scope.order_id=o.id
          LEFT JOIN shops sh ON sh.merchant_id=o.merchant_id AND sh.id=COALESCE(service_scope.shop_id,l.shop_id)
          CROSS JOIN ctx
         WHERE rf.merchant_id=$1::uuid
           AND rf.status='SUCCEEDED'
           AND ($3='' OR EXISTS(
              SELECT 1 FROM user_memberships um
              WHERE um.merchant_id=o.merchant_id AND um.id=NULLIF($3,'')::uuid
                AND (um.shop_id IS NULL OR COALESCE(service_scope.shop_id,l.shop_id)=um.shop_id)
           ))
        UNION ALL
        SELECT 'REPAIR_CHECKOUT',
               py.id::text,
               ro.order_number,
               py.created_at,
               py.status,
               'SERVICE',
               COALESCE(ro.customer_name,cu.display_name),
               COALESCE(ro.customer_phone,cu.phone),
               py.method,
               py.amount::text,
               o.currency_code::text,
               COALESCE(so.shop_id::text,''),
               COALESCE(sh.name,''),
               ''::text,
               ''::text,
               ''::text,
               ''::text,
               'Repair '||rpa.payment_kind||' payment for '||ro.order_number
          FROM repair_payment_allocations rpa
          JOIN payments py ON py.merchant_id=rpa.merchant_id AND py.id=rpa.payment_id
          JOIN repair_orders ro ON ro.merchant_id=rpa.merchant_id AND ro.id=rpa.repair_order_id
          JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id
          JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id
          LEFT JOIN customers cu ON cu.merchant_id=ro.merchant_id AND cu.id=ro.customer_id
          LEFT JOIN shops sh ON sh.merchant_id=so.merchant_id AND sh.id=so.shop_id
          CROSS JOIN ctx
         WHERE rpa.merchant_id=$1::uuid
           AND py.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')
           AND rpa.payment_kind IN ('DEPOSIT','FINAL')
           AND ($3='' OR EXISTS(
               SELECT 1 FROM user_memberships um
              WHERE um.merchant_id=so.merchant_id AND um.id=NULLIF($3,'')::uuid
                AND (um.shop_id IS NULL OR so.shop_id=um.shop_id)
           ))
    )`

func (s *Service) ListTransactionHistory(ctx context.Context, c *authdto.Claims, q app.ListQuery) ([]TransactionHistoryEntry, int, error) {
	where := []string{`($4='' OR concat_ws(' ',event_type,reference,status,channel,payment_method,product_name,variant_name,sku,details,customer_name,customer_phone) ILIKE '%'||$4||'%')`}
	args := []any{c.MerchantID, c.IdentityID, c.MembershipID, q.Search}
	add := func(expression string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(expression, len(args)))
	}
	if value := q.Filter("event_type"); value != "" {
		add("event_type=$%d", value)
	}
	if value := q.Filter("status"); value != "" {
		add("status=$%d", value)
	}
	if value := q.Filter("shop_id"); value != "" {
		add("shop_id=$%d", value)
	}
	if value := q.Filter("id"); value != "" {
		add("id=$%d", value)
	}
	if value := q.Filter("from"); value != "" {
		if parsed, err := time.Parse(time.RFC3339, value); err == nil {
			add("occurred_at >= $%d", parsed)
		}
	}
	if value := q.Filter("to"); value != "" {
		if parsed, err := time.Parse(time.RFC3339, value); err == nil {
			add("occurred_at < $%d", parsed)
		}
	}

	filter := strings.Join(where, " AND ")
	countArgs := append([]any(nil), args...)
	var total int
	if err := s.pool.QueryRow(ctx, transactionHistoryBase+" SELECT COUNT(*) FROM history WHERE "+filter, countArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}
	limitPosition := len(args) + 1
	offsetPosition := len(args) + 2
	args = append(args, q.PageSize, q.PageIndex*q.PageSize)
	statement := transactionHistoryBase + fmt.Sprintf(` SELECT event_type,id,reference,occurred_at,status,channel,customer_name,customer_phone,payment_method,amount,currency_code,shop_id,shop_name,quantity,product_name,variant_name,sku,details
          FROM history
         WHERE %s
         ORDER BY occurred_at DESC,id DESC
         LIMIT $%d OFFSET $%d`, filter, limitPosition, offsetPosition)
	rows, err := s.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := []TransactionHistoryEntry{}
	for rows.Next() {
		var item TransactionHistoryEntry
		if err := rows.Scan(&item.EventType, &item.ID, &item.Reference, &item.OccurredAt, &item.Status, &item.Channel, &item.CustomerName, &item.CustomerPhone, &item.PaymentMethod, &item.Amount, &item.CurrencyCode, &item.ShopID, &item.ShopName, &item.Quantity, &item.ProductName, &item.VariantName, &item.SKU, &item.Details); err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (s *Service) GetTransactionHistoryDetail(ctx context.Context, c *authdto.Claims, id string) (operationsdto.TransactionHistoryDetail, error) {
	query := app.ListQuery{PageIndex: 0, PageSize: 1, Filters: map[string]string{"id": id}}
	entries, total, err := s.ListTransactionHistory(ctx, c, query)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	if total == 0 || len(entries) == 0 {
		return operationsdto.TransactionHistoryDetail{}, pgx.ErrNoRows
	}
	detail := operationsdto.TransactionHistoryDetail{
		Entry: entries[0], Lines: []operationsdto.TransactionOrderLine{},
		Payments: []operationsdto.TransactionPayment{}, Refunds: []operationsdto.TransactionRefund{},
		TotalCost: "0", GrossProfit: "0", GrossMargin: "0",
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	defer tx.Rollback(ctx)
	if err = set(ctx, tx, c); err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}

	var orderID string
	switch detail.Entry.EventType {
	case "TRANSACTION":
		orderID = detail.Entry.ID
	case "REFUND":
		err = tx.QueryRow(ctx, `SELECT order_id::text FROM refunds WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id).Scan(&orderID)
	case "REPAIR_CHECKOUT":
		err = tx.QueryRow(ctx, `SELECT order_id::text FROM payments WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id).Scan(&orderID)
	default:
		err = tx.QueryRow(ctx, `SELECT ol.order_id::text FROM inventory_movements m JOIN order_lines ol ON ol.merchant_id=m.merchant_id AND ol.id=m.order_line_id WHERE m.merchant_id=$1::uuid AND m.id=$2::uuid`, c.MerchantID, id).Scan(&orderID)
	}
	if err != nil {
		if err == pgx.ErrNoRows {
			if err = tx.Commit(ctx); err != nil {
				return operationsdto.TransactionHistoryDetail{}, err
			}
			return detail, nil
		}
		return operationsdto.TransactionHistoryDetail{}, err
	}

	var order operationsdto.TransactionOrderDetail
	err = tx.QueryRow(ctx, `
		SELECT o.id::text,o.order_number,o.channel,o.status,o.currency_code::text,
		       o.subtotal::text,o.discount_total::text,o.tax_total::text,o.shipping_total::text,o.grand_total::text,
		       COALESCE(cu.display_name,''),COALESCE(cu.phone,''),
		       COALESCE(COALESCE(so.shop_id,l.shop_id)::text,''),COALESCE(sh.name,''),
		       COALESCE(o.delivery_name,''),COALESCE(o.delivery_contact,''),COALESCE(o.note,''),COALESCE(o.payment_type,''),
		       o.created_at,o.placed_at
		  FROM orders o
		  LEFT JOIN customers cu ON cu.merchant_id=o.merchant_id AND cu.id=o.customer_id
		  LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
		  LEFT JOIN service_orders so ON so.merchant_id=o.merchant_id AND so.order_id=o.id
		  LEFT JOIN shops sh ON sh.merchant_id=o.merchant_id AND sh.id=COALESCE(so.shop_id,l.shop_id)
		 WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, c.MerchantID, orderID).Scan(
		&order.ID, &order.OrderNumber, &order.Channel, &order.Status, &order.CurrencyCode,
		&order.Subtotal, &order.DiscountTotal, &order.TaxTotal, &order.ShippingTotal, &order.GrandTotal,
		&order.CustomerName, &order.CustomerPhone, &order.ShopID, &order.ShopName,
		&order.DeliveryName, &order.DeliveryContact, &order.Note, &order.PaymentType,
		&order.CreatedAt, &order.PlacedAt,
	)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	detail.Order = &order

	rows, err := tx.Query(ctx, `
		WITH line_costs AS (
			SELECT m.order_line_id,COALESCE(SUM(a.total_cost),0) AS total_cost
			  FROM inventory_movements m
			  JOIN inventory_cost_allocations a ON a.merchant_id=m.merchant_id AND a.consumption_movement_id=m.id
			 WHERE m.merchant_id=$1::uuid AND m.order_line_id IS NOT NULL
			 GROUP BY m.order_line_id
		)
		SELECT ol.id::text,ol.description,COALESCE(p.name,''),COALESCE(v.name,''),COALESCE(v.sku,''),
		       ol.quantity::text,ol.unit_price::text,
		       ROUND(COALESCE(lc.total_cost,0)/ol.quantity,2)::text,COALESCE(lc.total_cost,0)::text,
		       CASE WHEN ol.variant_id IS NULL OR NOT COALESCE(v.is_stock_tracked,FALSE) OR lc.order_line_id IS NOT NULL THEN TRUE ELSE FALSE END,
		       ol.discount_amount::text,ol.tax_amount::text,ol.line_total::text,
		       (ol.line_total-COALESCE(lc.total_cost,0))::text,
		       CASE WHEN ol.line_total=0 THEN '0' ELSE ROUND(((ol.line_total-COALESCE(lc.total_cost,0))/ol.line_total)*100,2)::text END
		  FROM order_lines ol
		  LEFT JOIN product_variants v ON v.merchant_id=ol.merchant_id AND v.id=ol.variant_id
		  LEFT JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id
		  LEFT JOIN line_costs lc ON lc.order_line_id=ol.id
		 WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid
		 ORDER BY ol.line_number`, c.MerchantID, orderID)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	for rows.Next() {
		var line operationsdto.TransactionOrderLine
		if err = rows.Scan(&line.ID, &line.Description, &line.ProductName, &line.VariantName, &line.SKU,
			&line.Quantity, &line.UnitPrice, &line.OriginalUnitCost, &line.OriginalCost,
			&line.CostPosted,
			&line.DiscountAmount, &line.TaxAmount, &line.LineTotal, &line.GrossProfit, &line.GrossMargin); err != nil {
			rows.Close()
			return operationsdto.TransactionHistoryDetail{}, err
		}
		detail.Lines = append(detail.Lines, line)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return operationsdto.TransactionHistoryDetail{}, err
	}
	rows.Close()

	rows, err = tx.Query(ctx, `SELECT id::text,method,status,amount::text,captured_at,created_at FROM payments WHERE merchant_id=$1::uuid AND order_id=$2::uuid ORDER BY created_at,id`, c.MerchantID, orderID)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	for rows.Next() {
		var payment operationsdto.TransactionPayment
		if err = rows.Scan(&payment.ID, &payment.Method, &payment.Status, &payment.Amount, &payment.CapturedAt, &payment.CreatedAt); err != nil {
			rows.Close()
			return operationsdto.TransactionHistoryDetail{}, err
		}
		detail.Payments = append(detail.Payments, payment)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return operationsdto.TransactionHistoryDetail{}, err
	}
	rows.Close()

	rows, err = tx.Query(ctx, `SELECT id::text,payment_id::text,status,amount::text,COALESCE(reason,''),created_at FROM refunds WHERE merchant_id=$1::uuid AND order_id=$2::uuid ORDER BY created_at,id`, c.MerchantID, orderID)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	for rows.Next() {
		var refund operationsdto.TransactionRefund
		if err = rows.Scan(&refund.ID, &refund.PaymentID, &refund.Status, &refund.Amount, &refund.Reason, &refund.CreatedAt); err != nil {
			rows.Close()
			return operationsdto.TransactionHistoryDetail{}, err
		}
		detail.Refunds = append(detail.Refunds, refund)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return operationsdto.TransactionHistoryDetail{}, err
	}
	rows.Close()

	err = tx.QueryRow(ctx, `
		WITH costs AS (
			SELECT COALESCE(SUM(a.total_cost),0) AS total
			  FROM inventory_cost_allocations a
			  JOIN inventory_movements m ON m.merchant_id=a.merchant_id AND m.id=a.consumption_movement_id
			  JOIN order_lines ol ON ol.merchant_id=m.merchant_id AND ol.id=m.order_line_id
			 WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid
		)
		SELECT costs.total::text,(o.grand_total-costs.total)::text,
		       CASE WHEN o.grand_total=0 THEN '0' ELSE ROUND(((o.grand_total-costs.total)/o.grand_total)*100,2)::text END
		  FROM orders o CROSS JOIN costs WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, c.MerchantID, orderID).Scan(&detail.TotalCost, &detail.GrossProfit, &detail.GrossMargin)
	if err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return operationsdto.TransactionHistoryDetail{}, err
	}
	return detail, nil
}

func (s *Service) ListReceivableLines(ctx context.Context, c *authdto.Claims) ([]ReceivableLine, error) {
	rows, e := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT po.id,pol.id,po.order_number,s.name,pol.variant_id,p.name||' · '||pv.name,pv.sku,po.destination_location_id,l.name,pol.unit_id,(pol.quantity_ordered-pol.quantity_received)::text,pol.unit_cost::text
		FROM purchase_order_lines pol
		JOIN purchase_orders po ON po.merchant_id=pol.merchant_id AND po.id=pol.purchase_order_id
		JOIN suppliers s ON s.merchant_id=po.merchant_id AND s.id=po.supplier_id
		JOIN product_variants pv ON pv.merchant_id=pol.merchant_id AND pv.id=pol.variant_id
		JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id
		JOIN locations l ON l.merchant_id=po.merchant_id AND l.id=po.destination_location_id
		CROSS JOIN x
		WHERE po.merchant_id=$1::uuid AND po.status IN ('ISSUED','PARTIALLY_RECEIVED') AND pol.quantity_received<pol.quantity_ordered
		AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid))
		ORDER BY po.ordered_at NULLS LAST,po.order_number,pol.id`, c.MerchantID, c.IdentityID, c.MembershipID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	o := []ReceivableLine{}
	for rows.Next() {
		var v ReceivableLine
		if e = rows.Scan(&v.PurchaseOrderID, &v.PurchaseOrderLineID, &v.OrderNumber, &v.SupplierName, &v.VariantID, &v.VariantName, &v.SKU, &v.DestinationLocationID, &v.DestinationName, &v.UnitID, &v.QuantityRemaining, &v.UnitCost); e != nil {
			return nil, e
		}
		o = append(o, v)
	}
	return o, rows.Err()
}
func (s *Service) StockIn(ctx context.Context, c *authdto.Claims, r StockInRequest) (Movement, error) {
	hasPurchaseOrder := strings.TrimSpace(r.PurchaseOrderID) != ""
	hasPurchaseOrderLine := strings.TrimSpace(r.PurchaseOrderLineID) != ""
	if !nonempty(r.VariantID, r.DestinationLocationID, r.Quantity, r.EventKey) || hasPurchaseOrder != hasPurchaseOrderLine || (hasPurchaseOrder && strings.TrimSpace(r.ReceiptNumber) == "") {
		return Movement{}, pgx.ErrNoRows
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return Movement{}, e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return Movement{}, e
	}
	var existing Movement
	var sameRequest bool
	e = tx.QueryRow(ctx, `SELECT m.id,m.merchant_id,m.variant_id,m.movement_type,m.source_location_id,m.destination_location_id,m.unit_id,m.receipt_line_id,m.order_line_id,m.reverses_movement_id,m.quantity::text,m.entered_quantity::text,m.unit_cost::text,m.event_key,m.occurred_at,m.created_at,
		COALESCE(m.variant_id=$3::uuid AND m.destination_location_id=$4::uuid AND m.entered_quantity=$5::numeric AND (NULLIF($6,'')::numeric IS NULL OR m.unit_cost=NULLIF($6,'')::numeric) AND
			((NOT $7::boolean AND m.receipt_line_id IS NULL) OR ($7::boolean AND EXISTS(
				SELECT 1 FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.merchant_id=grl.merchant_id AND gr.id=grl.receipt_id
				WHERE grl.merchant_id=m.merchant_id AND grl.id=m.receipt_line_id AND gr.purchase_order_id=NULLIF($8,'')::uuid AND grl.purchase_order_line_id=NULLIF($9,'')::uuid
			))),false)
		FROM inventory_movements m WHERE m.merchant_id=$1::uuid AND m.event_key=$2`, c.MerchantID, r.EventKey, r.VariantID, r.DestinationLocationID, r.Quantity, r.UnitCost, hasPurchaseOrder, r.PurchaseOrderID, r.PurchaseOrderLineID).Scan(&existing.ID, &existing.MerchantID, &existing.VariantID, &existing.MovementType, &existing.SourceLocationID, &existing.DestinationLocationID, &existing.UnitID, &existing.ReceiptLineID, &existing.OrderLineID, &existing.ReversesMovementID, &existing.Quantity, &existing.EnteredQuantity, &existing.UnitCost, &existing.EventKey, &existing.OccurredAt, &existing.CreatedAt, &sameRequest)
	if e == nil {
		if !sameRequest {
			return Movement{}, app.Validation("event_key has already been used for a different stock-in request.", nil)
		}
		return existing, nil
	}
	if e != pgx.ErrNoRows {
		return Movement{}, e
	}
	var destinationActive bool
	if e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM locations WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active)`, c.MerchantID, r.DestinationLocationID).Scan(&destinationActive); e != nil || !destinationActive {
		return Movement{}, app.Validation("Select an active inventory location for this merchant.", nil)
	}
	if c.MembershipID != "" {
		var allowed bool
		if e = tx.QueryRow(ctx, `SELECT COALESCE(um.shop_id IS NULL OR l.shop_id=um.shop_id,false) FROM user_memberships um JOIN locations l ON l.merchant_id=um.merchant_id AND l.id=$3::uuid WHERE um.merchant_id=$1::uuid AND um.id=$2::uuid`, c.MerchantID, c.MembershipID, r.DestinationLocationID).Scan(&allowed); e != nil || !allowed {
			return Movement{}, app.Validation("Stock can only be received into the assigned shop.", nil)
		}
	}
	var stockTracked, batchTracked bool
	if e = tx.QueryRow(ctx, `SELECT pv.is_stock_tracked,COALESCE(vip.track_batches,false) FROM product_variants pv JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id LEFT JOIN variant_inventory_policies vip ON vip.merchant_id=pv.merchant_id AND vip.variant_id=pv.id WHERE pv.merchant_id=$1::uuid AND pv.id=$2::uuid AND p.is_active`, c.MerchantID, r.VariantID).Scan(&stockTracked, &batchTracked); e != nil {
		if e == pgx.ErrNoRows {
			return Movement{}, app.Validation("Select an active product variant for this merchant.", nil)
		}
		return Movement{}, e
	}
	if !stockTracked {
		return Movement{}, app.Validation("Stock-in is only available for variants with Track inventory enabled.", nil)
	}
	if strings.TrimSpace(r.UnitCost) == "" {
		e = tx.QueryRow(ctx, `SELECT unit_cost::text
			FROM inventory_movements
			WHERE merchant_id=$1::uuid AND variant_id=$2::uuid AND movement_type='RECEIPT' AND unit_cost IS NOT NULL
			ORDER BY occurred_at DESC, created_at DESC, id DESC
			LIMIT 1`, c.MerchantID, r.VariantID).Scan(&r.UnitCost)
		if errors.Is(e, pgx.ErrNoRows) {
			return Movement{}, app.Validation("unit_cost is required for the first stock-in of this product variant.", map[string]any{"unit_cost": "Enter the original price for the first stock-in."})
		}
		if e != nil {
			return Movement{}, e
		}
	}
	if !hasPurchaseOrder {
		if batchTracked {
			return Movement{}, app.Validation("This variant tracks batches. Receive it from a purchase order so its batch details remain traceable.", nil)
		}
		var v Movement
		e = tx.QueryRow(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_id,unit_cost,event_key) VALUES($1::uuid,$2::uuid,'RECEIPT',$3::uuid,$4,NULLIF($5,'')::uuid,$6,$7) RETURNING id,merchant_id,variant_id,movement_type,destination_location_id,quantity::text,unit_id,unit_cost::text,receipt_line_id,event_key,occurred_at,created_at`, c.MerchantID, r.VariantID, r.DestinationLocationID, r.Quantity, r.UnitID, r.UnitCost, r.EventKey).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.MovementType, &v.DestinationLocationID, &v.Quantity, &v.UnitID, &v.UnitCost, &v.ReceiptLineID, &v.EventKey, &v.OccurredAt, &v.CreatedAt)
		if e != nil {
			return Movement{}, e
		}
		payload, marshalErr := json.Marshal(v)
		if marshalErr != nil {
			return Movement{}, marshalErr
		}
		if _, e = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'STOCK_RECEIPT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now()`, c.MerchantID, v.ID); e != nil {
			return Movement{}, e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'STOCK_RECEIPT',$2::uuid,1,'CREATE',$3::jsonb)`, c.MerchantID, v.ID, payload); e != nil {
			return Movement{}, e
		}
		if e = tx.Commit(ctx); e != nil {
			return Movement{}, e
		}
		return v, nil
	}
	var receiptID, lineID string
	e = tx.QueryRow(ctx, `INSERT INTO goods_receipts(merchant_id,purchase_order_id,receipt_number,received_by_membership_id) VALUES($1,$2,$3,$4) RETURNING id`, c.MerchantID, r.PurchaseOrderID, r.ReceiptNumber, c.MembershipID).Scan(&receiptID)
	if e != nil {
		return Movement{}, e
	}
	e = tx.QueryRow(ctx, `INSERT INTO goods_receipt_lines(merchant_id,receipt_id,purchase_order_line_id,unit_id,batch_number,expires_at,quantity_received,unit_cost) VALUES($1::uuid,$2::uuid,$3::uuid,NULLIF($4,'')::uuid,NULLIF($5,''),$6,$7,$8) RETURNING id`, c.MerchantID, receiptID, r.PurchaseOrderLineID, r.UnitID, r.BatchNumber, r.ExpiresAt, r.Quantity, r.UnitCost).Scan(&lineID)
	if e != nil {
		return Movement{}, e
	}
	var v Movement
	e = tx.QueryRow(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_id,unit_cost,receipt_line_id,event_key) VALUES($1,$2,'RECEIPT',$3,$4,$5,$6,$7,$8) RETURNING id,merchant_id,variant_id,movement_type,destination_location_id,quantity::text,unit_id,unit_cost::text,receipt_line_id,event_key,occurred_at,created_at`, c.MerchantID, r.VariantID, r.DestinationLocationID, r.Quantity, r.UnitID, r.UnitCost, lineID, r.EventKey).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.MovementType, &v.DestinationLocationID, &v.Quantity, &v.UnitID, &v.UnitCost, &v.ReceiptLineID, &v.EventKey, &v.OccurredAt, &v.CreatedAt)
	if e != nil {
		return Movement{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Movement{}, e
	}
	return v, nil
}
func (s *Service) StockOut(ctx context.Context, c *authdto.Claims, r StockOutRequest) (Movement, error) {
	if !nonempty(r.OrderLineID, r.VariantID, r.SourceLocationID, r.Quantity, r.EventKey) {
		return Movement{}, pgx.ErrNoRows
	}
	tx, e := s.pool.Begin(ctx)
	if e != nil {
		return Movement{}, e
	}
	defer tx.Rollback(ctx)
	if e = set(ctx, tx, c); e != nil {
		return Movement{}, e
	}
	if c.MembershipID != "" {
		var allowed bool
		if e = tx.QueryRow(ctx, `SELECT COALESCE(um.shop_id IS NULL OR l.shop_id=um.shop_id,false) FROM user_memberships um JOIN locations l ON l.merchant_id=um.merchant_id AND l.id=$3 WHERE um.merchant_id=$1::uuid AND um.id=$2`, c.MerchantID, c.MembershipID, r.SourceLocationID).Scan(&allowed); e != nil || !allowed {
			return Movement{}, app.Validation("Stock can only be checked out from the assigned shop.", nil)
		}
	}
	var v Movement
	e = tx.QueryRow(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,order_line_id,event_key) VALUES($1,$2,'SALE',$3,$4,$5,$6,$7) RETURNING id,merchant_id,variant_id,movement_type,source_location_id,quantity::text,unit_id,order_line_id,event_key,occurred_at,created_at`, c.MerchantID, r.VariantID, r.SourceLocationID, r.Quantity, r.UnitID, r.OrderLineID, r.EventKey).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.MovementType, &v.SourceLocationID, &v.Quantity, &v.UnitID, &v.OrderLineID, &v.EventKey, &v.OccurredAt, &v.CreatedAt)
	if e != nil {
		return Movement{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		return Movement{}, e
	}
	return v, nil
}

func (s *Service) ListPromotions(ctx context.Context, c *authdto.Claims) ([]Promotion, error) {
	rows, e := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.name,p.promotion_type,p.value::text,p.minimum_subtotal::text,p.usage_limit,p.redemption_count,p.starts_at,p.ends_at,p.is_active,p.created_at,p.updated_at FROM promotions p CROSS JOIN x WHERE p.merchant_id=$1::uuid ORDER BY p.created_at DESC`, c.MerchantID, c.IdentityID)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	o := []Promotion{}
	for rows.Next() {
		var v Promotion
		if e = rows.Scan(&v.ID, &v.MerchantID, &v.Name, &v.PromotionType, &v.Value, &v.MinimumSubtotal, &v.UsageLimit, &v.RedemptionCount, &v.StartsAt, &v.EndsAt, &v.IsActive, &v.CreatedAt, &v.UpdatedAt); e != nil {
			return nil, e
		}
		o = append(o, v)
	}
	return o, rows.Err()
}
func (s *Service) CreatePromotion(ctx context.Context, c *authdto.Claims, r PromotionRequest) (Promotion, error) {
	if !nonempty(r.Name, r.PromotionType, r.Value) {
		return Promotion{}, pgx.ErrNoRows
	}
	return writeIdempotent(ctx, s.pool, c, "operations.promotion", app.IdempotencyKey(ctx), r, func(tx pgx.Tx) (Promotion, error) {
		var v Promotion
		e := tx.QueryRow(ctx, `INSERT INTO promotions(merchant_id,name,promotion_type,value,minimum_subtotal,usage_limit,starts_at,ends_at,is_active) VALUES($1::uuid,$2,$3,$4,COALESCE($5,0),$6,$7,$8,COALESCE($9,true)) RETURNING id,merchant_id,name,promotion_type,value::text,minimum_subtotal::text,usage_limit,redemption_count,starts_at,ends_at,is_active,created_at,updated_at`, c.MerchantID, r.Name, r.PromotionType, r.Value, r.MinimumSubtotal, r.UsageLimit, r.StartsAt, r.EndsAt, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.Name, &v.PromotionType, &v.Value, &v.MinimumSubtotal, &v.UsageLimit, &v.RedemptionCount, &v.StartsAt, &v.EndsAt, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
		return v, e
	})
}
func (s *Service) UpdatePromotion(ctx context.Context, c *authdto.Claims, id string, r PromotionRequest) (Promotion, error) {
	return writeIdempotent(ctx, s.pool, c, "operations.promotion", app.IdempotencyKey(ctx), struct {
		ID      string           `json:"id"`
		Request PromotionRequest `json:"request"`
	}{ID: id, Request: r}, func(tx pgx.Tx) (Promotion, error) {
		var v Promotion
		e := tx.QueryRow(ctx, `UPDATE promotions SET name=$3,promotion_type=$4,value=$5,minimum_subtotal=COALESCE($6,minimum_subtotal),usage_limit=$7,starts_at=$8,ends_at=$9,is_active=COALESCE($10,is_active),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,name,promotion_type,value::text,minimum_subtotal::text,usage_limit,redemption_count,starts_at,ends_at,is_active,created_at,updated_at`, c.MerchantID, id, r.Name, r.PromotionType, r.Value, r.MinimumSubtotal, r.UsageLimit, r.StartsAt, r.EndsAt, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.Name, &v.PromotionType, &v.Value, &v.MinimumSubtotal, &v.UsageLimit, &v.RedemptionCount, &v.StartsAt, &v.EndsAt, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
		return v, e
	})
}
func (s *Service) DeletePromotion(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeIdempotent(ctx, s.pool, c, "operations.promotion", app.IdempotencyKey(ctx), struct {
		ID string `json:"id"`
	}{ID: id}, func(tx pgx.Tx) (struct{}, error) {
		result, e := tx.Exec(ctx, `DELETE FROM promotions WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, id)
		if e == nil && result.RowsAffected() == 0 {
			e = pgx.ErrNoRows
		}
		return struct{}{}, e
	})
	return err
}
func (s *Service) CreatePromotionCode(ctx context.Context, c *authdto.Claims, r PromotionCodeRequest) (PromotionCode, error) {
	return writeIdempotent(ctx, s.pool, c, "operations.promotion_code", app.IdempotencyKey(ctx), r, func(tx pgx.Tx) (PromotionCode, error) {
		var v PromotionCode
		e := tx.QueryRow(ctx, `INSERT INTO promotion_codes(merchant_id,promotion_id,code,is_active,usage_limit) VALUES($1::uuid,$2,$3,COALESCE($4,true),$5) RETURNING id,merchant_id,promotion_id,code,is_active,usage_limit,redemption_count`, c.MerchantID, r.PromotionID, r.Code, r.IsActive, r.UsageLimit).Scan(&v.ID, &v.MerchantID, &v.PromotionID, &v.Code, &v.IsActive, &v.UsageLimit, &v.RedemptionCount)
		return v, e
	})
}
func (s *Service) ListPromotionCodes(ctx context.Context, c *authdto.Claims, promotionID string) ([]PromotionCode, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT pc.id,pc.merchant_id,pc.promotion_id,pc.code,pc.is_active,pc.usage_limit,pc.redemption_count FROM promotion_codes pc CROSS JOIN x WHERE pc.merchant_id=$1::uuid AND pc.promotion_id=$2 ORDER BY pc.code`, c.MerchantID, promotionID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PromotionCode{}
	for rows.Next() {
		var item PromotionCode
		if err = rows.Scan(&item.ID, &item.MerchantID, &item.PromotionID, &item.Code, &item.IsActive, &item.UsageLimit, &item.RedemptionCount); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) DeletePromotionCode(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeIdempotent(ctx, s.pool, c, "operations.promotion_code", app.IdempotencyKey(ctx), struct {
		ID string `json:"id"`
	}{ID: id}, func(tx pgx.Tx) (struct{}, error) {
		result, e := tx.Exec(ctx, `DELETE FROM promotion_codes WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, id)
		if e == nil && result.RowsAffected() == 0 {
			e = pgx.ErrNoRows
		}
		return struct{}{}, e
	})
	return err
}
func (s *Service) AssignPromotionProduct(ctx context.Context, c *authdto.Claims, r PromotionProductRequest) error {
	_, err := writeIdempotent(ctx, s.pool, c, "operations.promotion_product", app.IdempotencyKey(ctx), r, func(tx pgx.Tx) (struct{}, error) {
		_, e := tx.Exec(ctx, `INSERT INTO promotion_products(merchant_id,promotion_id,product_id,variant_id) VALUES($1::uuid,$2,$3,$4)`, c.MerchantID, r.PromotionID, r.ProductID, r.VariantID)
		return struct{}{}, e
	})
	return err
}
func (s *Service) ListPromotionProducts(ctx context.Context, c *authdto.Claims, promotionID string) ([]PromotionProduct, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT pp.id,pp.promotion_id,pp.product_id,pp.variant_id,p.name,pv.name FROM promotion_products pp JOIN products p ON p.merchant_id=pp.merchant_id AND p.id=pp.product_id LEFT JOIN product_variants pv ON pv.merchant_id=pp.merchant_id AND pv.id=pp.variant_id CROSS JOIN x WHERE pp.merchant_id=$1::uuid AND pp.promotion_id=$2 ORDER BY p.name,pv.name`, c.MerchantID, promotionID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PromotionProduct{}
	for rows.Next() {
		var item PromotionProduct
		if err = rows.Scan(&item.ID, &item.PromotionID, &item.ProductID, &item.VariantID, &item.ProductName, &item.VariantName); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) RemovePromotionProduct(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeIdempotent(ctx, s.pool, c, "operations.promotion_product", app.IdempotencyKey(ctx), struct {
		ID string `json:"id"`
	}{ID: id}, func(tx pgx.Tx) (struct{}, error) {
		result, e := tx.Exec(ctx, `DELETE FROM promotion_products WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, id)
		if e == nil && result.RowsAffected() == 0 {
			e = pgx.ErrNoRows
		}
		return struct{}{}, e
	})
	return err
}

// Repository adapts PostgreSQL persistence to the bounded context's outbound port.
type Repository = Service

func NewRepository(pool *pgxpool.Pool) *Service {
	return NewService(pool)
}

var _ operationsoutbound.Repository = (*Service)(nil)
