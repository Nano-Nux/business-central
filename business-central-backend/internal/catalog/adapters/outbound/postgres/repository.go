package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	catalogoutbound "business-central-backend/internal/catalog/ports/outbound"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }

func setContext(ctx context.Context, tx pgx.Tx, claims *authdto.Claims) error {
	_, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode', '', true), set_config('app.user_id', $1, true), set_config('app.merchant_id', $2, true)`, claims.IdentityID, claims.MerchantID)
	return err
}
func required(value, field string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", field)
	}
	return nil
}

var attributeCodePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_-]{0,99}$`)

var attributeValueTypes = map[string]struct{}{
	"TEXT": {}, "NUMBER": {}, "BOOLEAN": {}, "SELECT": {}, "DATE": {}, "JSON": {},
}

func normalizeAttributeDefinition(r AttributeDefinitionRequest) (string, string, string, error) {
	code := strings.ToUpper(strings.TrimSpace(r.Code))
	name := strings.TrimSpace(r.Name)
	valueType := strings.ToUpper(strings.TrimSpace(r.ValueType))
	if !attributeCodePattern.MatchString(code) {
		return "", "", "", app.Validation("Attribute code must start with a letter and contain only letters, numbers, underscores, or hyphens.", nil)
	}
	if name == "" {
		return "", "", "", app.Validation("Attribute name is required.", nil)
	}
	if _, ok := attributeValueTypes[valueType]; !ok {
		return "", "", "", app.Validation("Attribute value_type must be TEXT, NUMBER, BOOLEAN, SELECT, DATE, or JSON.", nil)
	}
	return code, name, valueType, nil
}

func normalizeAttributeOption(r AttributeOptionRequest) (string, string, int, error) {
	value := strings.TrimSpace(r.Value)
	label := strings.TrimSpace(r.Label)
	if value == "" || label == "" {
		return "", "", 0, app.Validation("Attribute option value and label are required.", nil)
	}
	if r.Position < 0 {
		return "", "", 0, app.Validation("Attribute option position cannot be negative.", nil)
	}
	return value, label, r.Position, nil
}

func attributeOptionJSONValue(valueType, value string) (json.RawMessage, error) {
	switch valueType {
	case "NUMBER":
		var number json.Number
		if err := json.Unmarshal([]byte(value), &number); err != nil {
			return nil, app.Validation("A number attribute value must contain a valid JSON number.", nil)
		}
		return json.RawMessage(value), nil
	case "BOOLEAN":
		var boolean bool
		if err := json.Unmarshal([]byte(value), &boolean); err != nil {
			return nil, app.Validation("A boolean attribute value must be true or false.", nil)
		}
		return json.RawMessage(value), nil
	case "JSON":
		if !json.Valid([]byte(value)) {
			return nil, app.Validation("A JSON attribute value must contain valid JSON.", nil)
		}
		return json.RawMessage(value), nil
	default:
		return json.Marshal(value)
	}
}

func replaceProductCategories(ctx context.Context, tx pgx.Tx, merchantID, productID string, categoryIDs []string, replace bool) error {
	if replace {
		if _, err := tx.Exec(ctx, `DELETE FROM catalog_product_categories WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, merchantID, productID); err != nil {
			return err
		}
	}
	seen := make(map[string]struct{}, len(categoryIDs))
	for _, categoryID := range categoryIDs {
		categoryID = strings.TrimSpace(categoryID)
		if categoryID == "" {
			continue
		}
		if _, exists := seen[categoryID]; exists {
			continue
		}
		seen[categoryID] = struct{}{}
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_product_categories(merchant_id,product_id,category_id) VALUES($1::uuid,$2::uuid,$3::uuid)`, merchantID, productID, categoryID); err != nil {
			return err
		}
	}
	return nil
}

func loadProductCategories(ctx context.Context, tx pgx.Tx, merchantID, productID string) ([]string, []string, error) {
	var categoryIDs, categoryNames []string
	err := tx.QueryRow(ctx, `SELECT
		COALESCE(array_agg(c.id::text ORDER BY c.sort_order,c.name),ARRAY[]::text[]),
		COALESCE(array_agg(c.name ORDER BY c.sort_order,c.name),ARRAY[]::text[])
		FROM catalog_product_categories pc
		JOIN catalog_categories c ON c.merchant_id=pc.merchant_id AND c.id=pc.category_id
		WHERE pc.merchant_id=$1::uuid AND pc.product_id=$2::uuid`, merchantID, productID).Scan(&categoryIDs, &categoryNames)
	return categoryIDs, categoryNames, err
}

func replaceProductBarcode(ctx context.Context, tx pgx.Tx, merchantID, productID string, barcode *string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM barcode_registry WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, merchantID, productID); err != nil {
		return err
	}
	if barcode == nil || strings.TrimSpace(*barcode) == "" {
		return nil
	}
	code := strings.TrimSpace(*barcode)
	_, err := tx.Exec(ctx, `INSERT INTO barcode_registry(merchant_id,code,normalized_code,product_id,is_primary) VALUES($1::uuid,$2,$3,$4::uuid,true)`, merchantID, code, strings.ToUpper(code), productID)
	return err
}

func (s *Service) ListProducts(ctx context.Context, claims *authdto.Claims) ([]Product, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true), set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.brand_id,p.name,(SELECT br.code FROM barcode_registry br WHERE br.merchant_id=p.merchant_id AND br.product_id=p.id AND br.is_active ORDER BY br.is_primary DESC,br.created_at LIMIT 1),p.description,p.product_type,p.is_active,
		COALESCE((SELECT array_agg(pc.category_id::text ORDER BY c.sort_order,c.name) FROM catalog_product_categories pc JOIN catalog_categories c ON c.merchant_id=pc.merchant_id AND c.id=pc.category_id WHERE pc.merchant_id=p.merchant_id AND pc.product_id=p.id),ARRAY[]::text[]),
		COALESCE((SELECT array_agg(c.name ORDER BY c.sort_order,c.name) FROM catalog_product_categories pc JOIN catalog_categories c ON c.merchant_id=pc.merchant_id AND c.id=pc.category_id WHERE pc.merchant_id=p.merchant_id AND pc.product_id=p.id),ARRAY[]::text[]),
		p.manufacture_date,p.expired_date,p.created_at,p.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=p.merchant_id AND entity_type='CATALOG_PRODUCT' AND entity_id=p.id),0) FROM products p CROSS JOIN ctx WHERE p.merchant_id=$1::uuid ORDER BY p.name`, claims.MerchantID, claims.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		var v Product
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.BrandID, &v.Name, &v.Barcode, &v.Description, &v.ProductType, &v.IsActive, &v.CategoryIDs, &v.CategoryNames, &v.ManufactureDate, &v.ExpiredDate, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	for index := range out {
		out[index].Images, err = s.ListImages(ctx, claims, out[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Service) CreateBarcode(ctx context.Context, claims *authdto.Claims, r BarcodeRequest) (Barcode, error) {
	target := strings.ToUpper(strings.TrimSpace(r.TargetType))
	code := strings.TrimSpace(r.Code)
	if code == "" || r.TargetID == "" || (target != "PRODUCT" && target != "VARIANT" && target != "ASSET" && target != "BATCH") {
		return Barcode{}, app.Validation("code, target_id, and target_type PRODUCT, VARIANT, ASSET, or BATCH are required.", nil)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Barcode{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, claims); err != nil {
		return Barcode{}, err
	}
	var item Barcode
	var query string
	switch target {
	case "PRODUCT":
		query = `INSERT INTO barcode_registry(merchant_id,code,normalized_code,product_id,is_primary) VALUES($1,$2,lower(trim($2)),$3::uuid,COALESCE($4,true)) RETURNING id,code,is_primary,is_active`
	case "VARIANT":
		query = `INSERT INTO barcode_registry(merchant_id,code,normalized_code,variant_id,is_primary) VALUES($1,$2,lower(trim($2)),$3::uuid,COALESCE($4,true)) RETURNING id,code,is_primary,is_active`
	case "ASSET":
		query = `INSERT INTO barcode_registry(merchant_id,code,normalized_code,asset_id,is_primary) VALUES($1,$2,lower(trim($2)),$3::uuid,COALESCE($4,true)) RETURNING id,code,is_primary,is_active`
	case "BATCH":
		query = `INSERT INTO barcode_registry(merchant_id,code,normalized_code,batch_id,is_primary) VALUES($1,$2,lower(trim($2)),$3::uuid,COALESCE($4,true)) RETURNING id,code,is_primary,is_active`
	}
	if err = tx.QueryRow(ctx, query, claims.MerchantID, code, r.TargetID, r.IsPrimary).Scan(&item.ID, &item.Code, &item.IsPrimary, &item.IsActive); err != nil {
		return Barcode{}, err
	}
	item.TargetType = target
	item.TargetID = r.TargetID
	if err = tx.Commit(ctx); err != nil {
		return Barcode{}, err
	}
	return item, nil
}
func (s *Service) DeleteBarcode(ctx context.Context, claims *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, claims); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM barcode_registry WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return app.NewError("NOT_FOUND", "Barcode not found.", 404)
	}
	return tx.Commit(ctx)
}
func (s *Service) GetProduct(ctx context.Context, claims *authdto.Claims, id string) (Product, error) {
	var v Product
	err := s.pool.QueryRow(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$3,true), set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.brand_id,p.name,(SELECT br.code FROM barcode_registry br WHERE br.merchant_id=p.merchant_id AND br.product_id=p.id AND br.is_active ORDER BY br.is_primary DESC,br.created_at LIMIT 1),p.description,p.product_type,p.is_active,
		COALESCE((SELECT array_agg(pc.category_id::text ORDER BY c.sort_order,c.name) FROM catalog_product_categories pc JOIN catalog_categories c ON c.merchant_id=pc.merchant_id AND c.id=pc.category_id WHERE pc.merchant_id=p.merchant_id AND pc.product_id=p.id),ARRAY[]::text[]),
		COALESCE((SELECT array_agg(c.name ORDER BY c.sort_order,c.name) FROM catalog_product_categories pc JOIN catalog_categories c ON c.merchant_id=pc.merchant_id AND c.id=pc.category_id WHERE pc.merchant_id=p.merchant_id AND pc.product_id=p.id),ARRAY[]::text[]),
		p.manufacture_date,p.expired_date,p.created_at,p.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=p.merchant_id AND entity_type='CATALOG_PRODUCT' AND entity_id=p.id),0) FROM products p CROSS JOIN ctx WHERE p.merchant_id=$1::uuid AND p.id=$2::uuid`, claims.MerchantID, id, claims.IdentityID).Scan(&v.ID, &v.MerchantID, &v.BrandID, &v.Name, &v.Barcode, &v.Description, &v.ProductType, &v.IsActive, &v.CategoryIDs, &v.CategoryNames, &v.ManufactureDate, &v.ExpiredDate, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion)
	if err != nil {
		return v, err
	}
	v.Images, err = s.ListImages(ctx, claims, v.ID)
	return v, err
}
func (s *Service) CreateProduct(ctx context.Context, claims *authdto.Claims, r ProductRequest) (Product, error) {
	if err := required(r.Name, "name"); err != nil {
		return Product{}, err
	}
	typ := strings.ToUpper(strings.TrimSpace(r.ProductType))
	if typ == "" {
		typ = "PHYSICAL"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, claims); err != nil {
		return Product{}, err
	}
	var complexityLevel string
	if err = tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, claims.MerchantID).Scan(&complexityLevel); err != nil {
		return Product{}, err
	}
	if complexityLevel == "SIMPLE" && r.StandardVariant == nil {
		return Product{}, app.Validation("standard_variant is required for POS simple products.", nil)
	}
	var v Product
	err = tx.QueryRow(ctx, `INSERT INTO products(merchant_id,brand_id,name,description,product_type,is_active,manufacture_date,expired_date) VALUES($1::uuid,$2::uuid,$3,$4,$5,COALESCE($6::boolean,true),$7,$8) RETURNING id,merchant_id,brand_id,name,description,product_type,is_active,manufacture_date,expired_date,created_at,updated_at`, claims.MerchantID, r.BrandID, strings.TrimSpace(r.Name), r.Description, typ, r.IsActive, r.ManufactureDate, r.ExpiredDate).Scan(&v.ID, &v.MerchantID, &v.BrandID, &v.Name, &v.Description, &v.ProductType, &v.IsActive, &v.ManufactureDate, &v.ExpiredDate, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Product{}, err
	}
	if err = replaceProductBarcode(ctx, tx, claims.MerchantID, v.ID, r.Barcode); err != nil {
		return Product{}, err
	}
	if err = tx.QueryRow(ctx, `SELECT code FROM barcode_registry WHERE merchant_id=$1::uuid AND product_id=$2::uuid AND is_active ORDER BY is_primary DESC,created_at LIMIT 1`, claims.MerchantID, v.ID).Scan(&v.Barcode); err != nil && err != pgx.ErrNoRows {
		return Product{}, err
	}
	if r.CategoryIDs != nil {
		if err = replaceProductCategories(ctx, tx, claims.MerchantID, v.ID, *r.CategoryIDs, false); err != nil {
			return Product{}, err
		}
	}
	if complexityLevel == "SIMPLE" {
		standard := r.StandardVariant
		attrs := standard.Attributes
		if len(attrs) == 0 {
			attrs = json.RawMessage(`{}`)
		}
		if strings.TrimSpace(standard.BaseUnitID) == "" {
			return Product{}, app.Validation("standard_variant.base_unit_id is required for POS simple products.", nil)
		}
		var unitCode string
		if err = tx.QueryRow(ctx, `SELECT code FROM unit_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, claims.MerchantID, standard.BaseUnitID).Scan(&unitCode); err != nil {
			return Product{}, app.Validation("standard_variant.base_unit_id must reference an active merchant unit.", nil)
		}
		var variant Variant
		err = tx.QueryRow(ctx, `INSERT INTO product_variants(merchant_id,product_id,sku,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked) VALUES($1::uuid,$2::uuid,'STD-' || replace($2::uuid::text,'-',''),$3,$4,$5,$6::uuid,COALESCE($7::boolean,true)) RETURNING id,merchant_id,product_id,sku,barcode,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked,created_at,updated_at`, claims.MerchantID, v.ID, v.Name, string(attrs), unitCode, standard.BaseUnitID, standard.IsStockTracked).Scan(&variant.ID, &variant.MerchantID, &variant.ProductID, &variant.SKU, &variant.Barcode, &variant.Name, &variant.Attributes, &variant.UnitOfMeasure, &variant.BaseUnitID, &variant.IsStockTracked, &variant.CreatedAt, &variant.UpdatedAt)
		if err != nil {
			return Product{}, err
		}
		if err = validateAndStoreVariantAttributes(ctx, tx, claims.MerchantID, v.ID, variant.ID, attrs); err != nil {
			return Product{}, err
		}
		if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_VARIANT',$2::uuid,1,now()) RETURNING version`, claims.MerchantID, variant.ID).Scan(&variant.SyncVersion); err != nil {
			return Product{}, err
		}
		if err = publishVariantChange(ctx, tx, claims.MerchantID, variant, "CREATE"); err != nil {
			return Product{}, err
		}
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_PRODUCT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, claims.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Product{}, err
	}
	v.CategoryIDs, v.CategoryNames, err = loadProductCategories(ctx, tx, claims.MerchantID, v.ID)
	if err != nil {
		return Product{}, err
	}
	if err = publishProductChange(ctx, tx, claims.MerchantID, v, "CREATE"); err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	v.Images, err = s.ListImages(ctx, claims, v.ID)
	return v, err
}
func (s *Service) UpdateProduct(ctx context.Context, claims *authdto.Claims, id string, r ProductRequest) (Product, error) {
	if err := required(r.Name, "name"); err != nil {
		return Product{}, err
	}
	typ := strings.ToUpper(strings.TrimSpace(r.ProductType))
	if typ == "" {
		typ = "PHYSICAL"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, claims); err != nil {
		return Product{}, err
	}
	var complexityLevel string
	if err = tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, claims.MerchantID).Scan(&complexityLevel); err != nil {
		return Product{}, err
	}
	var v Product
	err = tx.QueryRow(ctx, `UPDATE products SET brand_id=$3::uuid,name=$4,description=$5,product_type=$6,is_active=COALESCE($7::boolean,is_active),manufacture_date=$8,expired_date=$9,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,merchant_id,brand_id,name,description,product_type,is_active,manufacture_date,expired_date,created_at,updated_at`, claims.MerchantID, id, r.BrandID, strings.TrimSpace(r.Name), r.Description, typ, r.IsActive, r.ManufactureDate, r.ExpiredDate).Scan(&v.ID, &v.MerchantID, &v.BrandID, &v.Name, &v.Description, &v.ProductType, &v.IsActive, &v.ManufactureDate, &v.ExpiredDate, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Product{}, err
	}
	if err = replaceProductBarcode(ctx, tx, claims.MerchantID, v.ID, r.Barcode); err != nil {
		return Product{}, err
	}
	if err = tx.QueryRow(ctx, `SELECT code FROM barcode_registry WHERE merchant_id=$1::uuid AND product_id=$2::uuid AND is_active ORDER BY is_primary DESC,created_at LIMIT 1`, claims.MerchantID, v.ID).Scan(&v.Barcode); err != nil && err != pgx.ErrNoRows {
		return Product{}, err
	}
	if r.CategoryIDs != nil {
		if err = replaceProductCategories(ctx, tx, claims.MerchantID, v.ID, *r.CategoryIDs, true); err != nil {
			return Product{}, err
		}
	}
	if complexityLevel == "SIMPLE" {
		if _, err = tx.Exec(ctx, `UPDATE product_variants SET name=$3,updated_at=now() WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, claims.MerchantID, v.ID, v.Name); err != nil {
			return Product{}, err
		}
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_PRODUCT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, claims.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Product{}, err
	}
	v.CategoryIDs, v.CategoryNames, err = loadProductCategories(ctx, tx, claims.MerchantID, v.ID)
	if err != nil {
		return Product{}, err
	}
	if err = publishProductChange(ctx, tx, claims.MerchantID, v, "UPDATE"); err != nil {
		return Product{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Product{}, err
	}
	v.Images, err = s.ListImages(ctx, claims, v.ID)
	return v, err
}
func (s *Service) DeleteProduct(ctx context.Context, claims *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, claims); err != nil {
		return err
	}
	var version int64
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_PRODUCT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, claims.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	// Variants are part of the product aggregate. Removing them first allows an
	// unused product (including a POS-simple product's managed standard variant)
	// to be deleted. PostgreSQL still rejects this statement atomically when a
	// variant is referenced by stock or immutable business history.
	if _, err = tx.Exec(ctx, `DELETE FROM product_variants WHERE merchant_id=$1::uuid AND product_id=$2::uuid`, claims.MerchantID, id); err != nil {
		return app.NewError("DELETE_REJECTED", "This product has stock or business history and cannot be deleted. Deactivate it instead.", 409)
	}
	r, err := tx.Exec(ctx, `DELETE FROM products WHERE merchant_id=$1::uuid AND id=$2::uuid`, claims.MerchantID, id)
	if err != nil {
		return app.NewError("DELETE_REJECTED", "This product is referenced by business records and cannot be deleted. Deactivate it instead.", 409)
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if err = publishCatalogChange(ctx, tx, claims.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func publishProductChange(ctx context.Context, tx pgx.Tx, merchantID string, product Product, operationType string) error {
	payload, err := json.Marshal(product)
	if err != nil {
		return err
	}
	return publishCatalogChange(ctx, tx, merchantID, product.ID, product.SyncVersion, operationType, payload)
}

func publishCatalogChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'CATALOG_PRODUCT',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishCategoryChange(ctx context.Context, tx pgx.Tx, merchantID string, category Category, operationType string) error {
	payload, err := json.Marshal(category)
	if err != nil {
		return err
	}
	return publishCatalogCategoryChange(ctx, tx, merchantID, category.ID, category.SyncVersion, operationType, payload)
}

func publishCatalogCategoryChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'CATALOG_CATEGORY',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishVariantChange(ctx context.Context, tx pgx.Tx, merchantID string, variant Variant, operationType string) error {
	payload, err := json.Marshal(variant)
	if err != nil {
		return err
	}
	return publishCatalogVariantChange(ctx, tx, merchantID, variant.ID, variant.SyncVersion, operationType, payload)
}

func publishCatalogVariantChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'CATALOG_VARIANT',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishUnitChange(ctx context.Context, tx pgx.Tx, merchantID string, unit Unit, operationType string) error {
	payload, err := json.Marshal(unit)
	if err != nil {
		return err
	}
	return publishCatalogUnitChange(ctx, tx, merchantID, unit.ID, unit.SyncVersion, operationType, payload)
}

func publishCatalogUnitChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'CATALOG_UNIT',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishConversionChange(ctx context.Context, tx pgx.Tx, merchantID string, conversion Conversion, operationType string) error {
	payload, err := json.Marshal(conversion)
	if err != nil {
		return err
	}
	return publishCatalogConversionChange(ctx, tx, merchantID, conversion.ID, conversion.SyncVersion, operationType, payload)
}

func publishCatalogConversionChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),'CATALOG_CONVERSION',$2::uuid,$3,$4,$5::jsonb)`, merchantID, entityID, version, operationType, payload)
	return err
}

func publishCatalogAttributeDefinitionChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	return publishCatalogEntityChange(ctx, tx, merchantID, "CATALOG_ATTRIBUTE_DEFINITION", entityID, version, operationType, payload)
}

func publishCatalogAttributeOptionChange(ctx context.Context, tx pgx.Tx, merchantID, entityID string, version int64, operationType string, payload []byte) error {
	return publishCatalogEntityChange(ctx, tx, merchantID, "CATALOG_ATTRIBUTE_OPTION", entityID, version, operationType, payload)
}

func publishCatalogEntityChange(ctx context.Context, tx pgx.Tx, merchantID, entityType, entityID string, version int64, operationType string, payload []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,nextval('sync_server_sequence_seq'),$2,$3::uuid,$4,$5,$6::jsonb)`, merchantID, entityType, entityID, version, operationType, payload)
	return err
}

func scanAttributeOptions(rows pgx.Rows, out *[]AttributeOption) error {
	defer rows.Close()
	for rows.Next() {
		var option AttributeOption
		if err := rows.Scan(&option.ID, &option.MerchantID, &option.DefinitionID, &option.Value, &option.Label, &option.Position, &option.SyncVersion); err != nil {
			return err
		}
		*out = append(*out, option)
	}
	return rows.Err()
}

func loadAttributeOptions(ctx context.Context, tx pgx.Tx, merchantID, definitionID string) ([]AttributeOption, error) {
	rows, err := tx.Query(ctx, `SELECT o.id::text,o.merchant_id::text,o.definition_id::text,o.value,o.label,o.position,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=o.merchant_id AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=o.id),0) FROM catalog_attribute_options o WHERE o.merchant_id=$1::uuid AND o.definition_id=$2::uuid ORDER BY o.position,o.label`, merchantID, definitionID)
	if err != nil {
		return nil, err
	}
	options := []AttributeOption{}
	return options, scanAttributeOptions(rows, &options)
}

func loadAttributeDefinition(ctx context.Context, tx pgx.Tx, merchantID, definitionID string) (AttributeDefinition, error) {
	var definition AttributeDefinition
	if err := tx.QueryRow(ctx, `SELECT d.id::text,d.merchant_id::text,d.code,d.name,d.value_type,d.created_at,d.created_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='CATALOG_ATTRIBUTE_DEFINITION' AND entity_id=d.id),0) FROM catalog_attribute_definitions d WHERE d.merchant_id=$1::uuid AND d.id=$2::uuid`, merchantID, definitionID).Scan(&definition.ID, &definition.MerchantID, &definition.Code, &definition.Name, &definition.ValueType, &definition.CreatedAt, &definition.UpdatedAt, &definition.SyncVersion); err != nil {
		return AttributeDefinition{}, err
	}
	options, err := loadAttributeOptions(ctx, tx, merchantID, definitionID)
	if err != nil {
		return AttributeDefinition{}, err
	}
	definition.Options = options
	return definition, nil
}

func (s *Service) ListAttributeDefinitions(ctx context.Context, c *authdto.Claims) ([]AttributeDefinition, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT d.id::text,d.merchant_id::text,d.code,d.name,d.value_type,d.created_at,d.created_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='CATALOG_ATTRIBUTE_DEFINITION' AND entity_id=d.id),0) FROM catalog_attribute_definitions d CROSS JOIN ctx WHERE d.merchant_id=$1::uuid ORDER BY d.name,d.code`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	definitions := []AttributeDefinition{}
	ids := []string{}
	for rows.Next() {
		var definition AttributeDefinition
		if err := rows.Scan(&definition.ID, &definition.MerchantID, &definition.Code, &definition.Name, &definition.ValueType, &definition.CreatedAt, &definition.UpdatedAt, &definition.SyncVersion); err != nil {
			return nil, err
		}
		definition.Options = []AttributeOption{}
		definitions = append(definitions, definition)
		ids = append(ids, definition.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return definitions, nil
	}
	optionRows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT o.id::text,o.merchant_id::text,o.definition_id::text,o.value,o.label,o.position,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=o.merchant_id AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=o.id),0) FROM catalog_attribute_options o CROSS JOIN ctx WHERE o.merchant_id=$1::uuid AND o.definition_id = ANY($3::uuid[]) ORDER BY o.position,o.label`, c.MerchantID, c.IdentityID, ids)
	if err != nil {
		return nil, err
	}
	options := []AttributeOption{}
	if err := scanAttributeOptions(optionRows, &options); err != nil {
		return nil, err
	}
	byDefinition := make(map[string][]AttributeOption, len(definitions))
	for _, option := range options {
		byDefinition[option.DefinitionID] = append(byDefinition[option.DefinitionID], option)
	}
	for index := range definitions {
		definitions[index].Options = byDefinition[definitions[index].ID]
		if definitions[index].Options == nil {
			definitions[index].Options = []AttributeOption{}
		}
	}
	return definitions, nil
}

func (s *Service) GetAttributeDefinition(ctx context.Context, c *authdto.Claims, id string) (AttributeDefinition, error) {
	var definition AttributeDefinition
	if err := s.pool.QueryRow(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT d.id::text,d.merchant_id::text,d.code,d.name,d.value_type,d.created_at,d.created_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='CATALOG_ATTRIBUTE_DEFINITION' AND entity_id=d.id),0) FROM catalog_attribute_definitions d CROSS JOIN ctx WHERE d.merchant_id=$1::uuid AND d.id=$2::uuid`, c.MerchantID, id, c.IdentityID).Scan(&definition.ID, &definition.MerchantID, &definition.Code, &definition.Name, &definition.ValueType, &definition.CreatedAt, &definition.UpdatedAt, &definition.SyncVersion); err != nil {
		return AttributeDefinition{}, err
	}
	options, err := s.ListAttributeOptions(ctx, c, id)
	if err != nil {
		return AttributeDefinition{}, err
	}
	definition.Options = options
	return definition, nil
}

func (s *Service) CreateAttributeDefinition(ctx context.Context, c *authdto.Claims, r AttributeDefinitionRequest) (AttributeDefinition, error) {
	code, name, valueType, err := normalizeAttributeDefinition(r)
	if err != nil {
		return AttributeDefinition{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AttributeDefinition{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return AttributeDefinition{}, err
	}
	var id string
	if err = tx.QueryRow(ctx, `INSERT INTO catalog_attribute_definitions(merchant_id,code,name,value_type) VALUES($1::uuid,$2,$3,$4) RETURNING id::text`, c.MerchantID, code, name, valueType).Scan(&id); err != nil {
		return AttributeDefinition{}, err
	}
	var version int64
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_DEFINITION',$2::uuid,1,now()) RETURNING version`, c.MerchantID, id).Scan(&version); err != nil {
		return AttributeDefinition{}, err
	}
	definition, err := loadAttributeDefinition(ctx, tx, c.MerchantID, id)
	if err != nil {
		return AttributeDefinition{}, err
	}
	if payload, marshalErr := json.Marshal(definition); marshalErr != nil {
		return AttributeDefinition{}, marshalErr
	} else if err = publishCatalogAttributeDefinitionChange(ctx, tx, c.MerchantID, id, version, "CREATE", payload); err != nil {
		return AttributeDefinition{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AttributeDefinition{}, err
	}
	return definition, nil
}

func (s *Service) UpdateAttributeDefinition(ctx context.Context, c *authdto.Claims, id string, r AttributeDefinitionRequest) (AttributeDefinition, error) {
	code, name, valueType, err := normalizeAttributeDefinition(r)
	if err != nil {
		return AttributeDefinition{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AttributeDefinition{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return AttributeDefinition{}, err
	}
	var oldCode, oldType string
	if err = tx.QueryRow(ctx, `SELECT code,value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, c.MerchantID, id).Scan(&oldCode, &oldType); err != nil {
		return AttributeDefinition{}, err
	}
	var assigned bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, c.MerchantID, id).Scan(&assigned); err != nil {
		return AttributeDefinition{}, err
	}
	if assigned && (oldCode != code || oldType != valueType) {
		return AttributeDefinition{}, app.Validation("An attribute code or value type cannot change after it has been assigned to a variant.", nil)
	}
	if oldType != valueType {
		var hasOptions bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, c.MerchantID, id).Scan(&hasOptions); err != nil {
			return AttributeDefinition{}, err
		}
		if hasOptions {
			return AttributeDefinition{}, app.Validation("Remove the attribute values before changing its value type.", nil)
		}
	}
	if err = tx.QueryRow(ctx, `UPDATE catalog_attribute_definitions SET code=$3,name=$4,value_type=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id::text`, c.MerchantID, id, code, name, valueType).Scan(&id); err != nil {
		return AttributeDefinition{}, err
	}
	var version int64
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_DEFINITION',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, id).Scan(&version); err != nil {
		return AttributeDefinition{}, err
	}
	definition, err := loadAttributeDefinition(ctx, tx, c.MerchantID, id)
	if err != nil {
		return AttributeDefinition{}, err
	}
	payload, err := json.Marshal(definition)
	if err != nil {
		return AttributeDefinition{}, err
	}
	if err = publishCatalogAttributeDefinitionChange(ctx, tx, c.MerchantID, id, version, "UPDATE", payload); err != nil {
		return AttributeDefinition{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AttributeDefinition{}, err
	}
	return definition, nil
}

func (s *Service) DeleteAttributeDefinition(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var assigned, hasOptions bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid),EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, c.MerchantID, id).Scan(&assigned, &hasOptions); err != nil {
		return err
	}
	if assigned || hasOptions {
		return app.Validation("Remove attribute options and assignments before deleting this definition.", nil)
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_ATTRIBUTE_DEFINITION' AND entity_id=$2::uuid),0)+1`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_DEFINITION',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if err = publishCatalogAttributeDefinitionChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ListAttributeOptions(ctx context.Context, c *authdto.Claims, definitionID string) ([]AttributeOption, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT o.id::text,o.merchant_id::text,o.definition_id::text,o.value,o.label,o.position,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=o.merchant_id AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=o.id),0) FROM catalog_attribute_options o CROSS JOIN ctx WHERE o.merchant_id=$1::uuid AND o.definition_id=$3::uuid ORDER BY o.position,o.label`, c.MerchantID, c.IdentityID, definitionID)
	if err != nil {
		return nil, err
	}
	options := []AttributeOption{}
	return options, scanAttributeOptions(rows, &options)
}

func (s *Service) CreateAttributeOption(ctx context.Context, c *authdto.Claims, definitionID string, r AttributeOptionRequest) (AttributeOption, error) {
	value, label, position, err := normalizeAttributeOption(r)
	if err != nil {
		return AttributeOption{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AttributeOption{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return AttributeOption{}, err
	}
	var valueType string
	if err = tx.QueryRow(ctx, `SELECT value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, definitionID).Scan(&valueType); err != nil {
		return AttributeOption{}, err
	}
	if _, err = attributeOptionJSONValue(valueType, value); err != nil {
		return AttributeOption{}, err
	}
	var option AttributeOption
	if err = tx.QueryRow(ctx, `INSERT INTO catalog_attribute_options(merchant_id,definition_id,value,label,position) VALUES($1::uuid,$2::uuid,$3,$4,$5) RETURNING id::text,merchant_id::text,definition_id::text,value,label,position`, c.MerchantID, definitionID, value, label, position).Scan(&option.ID, &option.MerchantID, &option.DefinitionID, &option.Value, &option.Label, &option.Position); err != nil {
		return AttributeOption{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_OPTION',$2::uuid,1,now()) RETURNING version`, c.MerchantID, option.ID).Scan(&option.SyncVersion); err != nil {
		return AttributeOption{}, err
	}
	payload, err := json.Marshal(option)
	if err != nil {
		return AttributeOption{}, err
	}
	if err = publishCatalogAttributeOptionChange(ctx, tx, c.MerchantID, option.ID, option.SyncVersion, "CREATE", payload); err != nil {
		return AttributeOption{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AttributeOption{}, err
	}
	return option, nil
}

func (s *Service) UpdateAttributeOption(ctx context.Context, c *authdto.Claims, id string, r AttributeOptionRequest) (AttributeOption, error) {
	value, label, position, err := normalizeAttributeOption(r)
	if err != nil {
		return AttributeOption{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AttributeOption{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return AttributeOption{}, err
	}
	var definitionID, oldValue, valueType string
	if err = tx.QueryRow(ctx, `SELECT o.definition_id::text,o.value,d.value_type FROM catalog_attribute_options o JOIN catalog_attribute_definitions d ON d.merchant_id=o.merchant_id AND d.id=o.definition_id WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid FOR UPDATE`, c.MerchantID, id).Scan(&definitionID, &oldValue, &valueType); err != nil {
		return AttributeOption{}, err
	}
	oldJSON, err := attributeOptionJSONValue(valueType, oldValue)
	if err != nil {
		return AttributeOption{}, err
	}
	if _, err = attributeOptionJSONValue(valueType, value); err != nil {
		return AttributeOption{}, err
	}
	if oldValue != value {
		var assigned bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3::jsonb)`, c.MerchantID, definitionID, oldJSON).Scan(&assigned); err != nil {
			return AttributeOption{}, err
		}
		if assigned {
			return AttributeOption{}, app.Validation("An option value cannot change while it is assigned to a variant.", nil)
		}
	}
	var option AttributeOption
	if err = tx.QueryRow(ctx, `UPDATE catalog_attribute_options SET value=$3,label=$4,position=$5 WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id::text,merchant_id::text,definition_id::text,value,label,position`, c.MerchantID, id, value, label, position).Scan(&option.ID, &option.MerchantID, &option.DefinitionID, &option.Value, &option.Label, &option.Position); err != nil {
		return AttributeOption{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_OPTION',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, id).Scan(&option.SyncVersion); err != nil {
		return AttributeOption{}, err
	}
	payload, err := json.Marshal(option)
	if err != nil {
		return AttributeOption{}, err
	}
	if err = publishCatalogAttributeOptionChange(ctx, tx, c.MerchantID, id, option.SyncVersion, "UPDATE", payload); err != nil {
		return AttributeOption{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AttributeOption{}, err
	}
	return option, nil
}

func (s *Service) DeleteAttributeOption(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var definitionID, value, valueType string
	if err = tx.QueryRow(ctx, `SELECT o.definition_id::text,o.value,d.value_type FROM catalog_attribute_options o JOIN catalog_attribute_definitions d ON d.merchant_id=o.merchant_id AND d.id=o.definition_id WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid FOR UPDATE`, c.MerchantID, id).Scan(&definitionID, &value, &valueType); err != nil {
		return err
	}
	valueJSON, err := attributeOptionJSONValue(valueType, value)
	if err != nil {
		return err
	}
	var assigned bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3::jsonb)`, c.MerchantID, definitionID, valueJSON).Scan(&assigned); err != nil {
		return err
	}
	if assigned {
		return app.Validation("This option cannot be deleted while it is assigned to a variant.", nil)
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_ATTRIBUTE_OPTION' AND entity_id=$2::uuid),0)+1`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_ATTRIBUTE_OPTION',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "definition_id": definitionID, "is_deleted": true})
	if err = publishCatalogAttributeOptionChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type variantAttributeDefinition struct {
	ID        string
	Code      string
	ValueType string
}

func variantAttributeOptionValue(valueType string, raw json.RawMessage) (string, bool) {
	switch valueType {
	case "NUMBER":
		var value json.Number
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return value.String(), true
	case "BOOLEAN":
		var value bool
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return fmt.Sprintf("%t", value), true
	case "JSON":
		return string(raw), true
	default:
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return "", false
		}
		return value, true
	}
}

func validateAndStoreVariantAttributes(ctx context.Context, tx pgx.Tx, merchantID, productID, variantID string, attrs json.RawMessage) error {
	if len(attrs) == 0 {
		attrs = json.RawMessage(`{}`)
	}
	values := map[string]json.RawMessage{}
	if !json.Valid(attrs) || json.Unmarshal(attrs, &values) != nil || values == nil {
		return app.Validation("Variant attributes must be a JSON object.", nil)
	}
	rows, err := tx.Query(ctx, `SELECT id::text,code,value_type FROM catalog_attribute_definitions WHERE merchant_id=$1::uuid`, merchantID)
	if err != nil {
		return err
	}
	definitions := map[string]variantAttributeDefinition{}
	for rows.Next() {
		var definition variantAttributeDefinition
		if err := rows.Scan(&definition.ID, &definition.Code, &definition.ValueType); err != nil {
			rows.Close()
			return err
		}
		definitions[definition.Code] = definition
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for code, raw := range values {
		definition, ok := definitions[code]
		if !ok {
			return app.Validation(fmt.Sprintf("Variant attribute %q is not configured for this merchant.", code), nil)
		}
		if string(raw) == "null" {
			return app.Validation(fmt.Sprintf("Variant attribute %q cannot be null.", code), nil)
		}
		switch definition.ValueType {
		case "TEXT", "DATE":
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
				return app.Validation(fmt.Sprintf("Variant attribute %q must be text.", code), nil)
			}
		case "NUMBER":
			var value json.Number
			if err := json.Unmarshal(raw, &value); err != nil {
				return app.Validation(fmt.Sprintf("Variant attribute %q must be a number.", code), nil)
			}
		case "BOOLEAN":
			var value bool
			if err := json.Unmarshal(raw, &value); err != nil {
				return app.Validation(fmt.Sprintf("Variant attribute %q must be true or false.", code), nil)
			}
		case "SELECT":
			var value string
			if err := json.Unmarshal(raw, &value); err != nil || strings.TrimSpace(value) == "" {
				return app.Validation(fmt.Sprintf("Variant attribute %q must use one configured option.", code), nil)
			}
		case "JSON":
			// Any valid JSON value is allowed for JSON attributes.
		}
		optionValue, ok := variantAttributeOptionValue(definition.ValueType, raw)
		if !ok {
			continue
		}
		var hasOptions bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid)`, merchantID, definition.ID).Scan(&hasOptions); err != nil {
			return err
		}
		if definition.ValueType == "SELECT" && !hasOptions {
			return app.Validation(fmt.Sprintf("Variant attribute %q must use one configured option.", code), nil)
		}
		if hasOptions {
			var allowed bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM catalog_attribute_options WHERE merchant_id=$1::uuid AND definition_id=$2::uuid AND value=$3)`, merchantID, definition.ID, optionValue).Scan(&allowed); err != nil {
				return err
			}
			if !allowed {
				return app.Validation(fmt.Sprintf("Variant attribute %q uses a value that is not configured.", code), nil)
			}
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM catalog_attribute_values WHERE merchant_id=$1::uuid AND product_id=$2::uuid AND variant_id=$3::uuid`, merchantID, productID, variantID); err != nil {
		return err
	}
	for code, raw := range values {
		definition := definitions[code]
		if _, err := tx.Exec(ctx, `INSERT INTO catalog_attribute_values(merchant_id,definition_id,product_id,variant_id,value) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb)`, merchantID, definition.ID, productID, variantID, raw); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ListVariants(ctx context.Context, c *authdto.Claims, productID string) ([]Variant, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true), set_config('app.merchant_id',$1,true)) SELECT v.id,v.merchant_id,v.product_id,v.sku,v.barcode,v.name,v.attributes,v.unit_of_measure,v.base_unit_id,v.is_stock_tracked,v.created_at,v.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=v.merchant_id AND entity_type='CATALOG_VARIANT' AND entity_id=v.id),0) FROM product_variants v CROSS JOIN ctx WHERE v.merchant_id=$1::uuid AND v.product_id=$3 ORDER BY v.name`, c.MerchantID, c.IdentityID, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Variant{}
	for rows.Next() {
		var v Variant
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.SKU, &v.Barcode, &v.Name, &v.Attributes, &v.UnitOfMeasure, &v.BaseUnitID, &v.IsStockTracked, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	for index := range out {
		out[index].Images, err = s.ListVariantImages(ctx, c, out[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return out, nil
}

func (s *Service) CreateVariant(ctx context.Context, c *authdto.Claims, productID string, r VariantRequest) (Variant, error) {
	if err := required(r.SKU, "sku"); err != nil {
		return Variant{}, err
	}
	if err := required(r.Name, "name"); err != nil {
		return Variant{}, err
	}
	if err := required(r.BaseUnitID, "base_unit_id"); err != nil {
		return Variant{}, err
	}
	attrs := r.Attributes
	if len(attrs) == 0 {
		attrs = json.RawMessage(`{}`)
	}
	uom := r.UnitOfMeasure
	if strings.TrimSpace(uom) == "" {
		uom = "EA"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Variant{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Variant{}, err
	}
	var complexityLevel string
	if err = tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, c.MerchantID).Scan(&complexityLevel); err != nil {
		return Variant{}, err
	}
	if complexityLevel == "SIMPLE" {
		return Variant{}, app.NewError("POS_SIMPLE_VARIANT_MANAGED", "POS simple products use the standard variant created with the product.", 409)
	}
	var v Variant
	err = tx.QueryRow(ctx, `INSERT INTO product_variants(merchant_id,product_id,sku,barcode,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true)) RETURNING id,merchant_id,product_id,sku,barcode,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked,created_at,updated_at`, c.MerchantID, productID, strings.TrimSpace(r.SKU), r.Barcode, strings.TrimSpace(r.Name), string(attrs), uom, r.BaseUnitID, r.IsStockTracked).Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.SKU, &v.Barcode, &v.Name, &v.Attributes, &v.UnitOfMeasure, &v.BaseUnitID, &v.IsStockTracked, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Variant{}, err
	}
	if err = validateAndStoreVariantAttributes(ctx, tx, c.MerchantID, productID, v.ID, attrs); err != nil {
		return Variant{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_VARIANT',$2::uuid,1,now()) RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Variant{}, err
	}
	if err = publishVariantChange(ctx, tx, c.MerchantID, v, "CREATE"); err != nil {
		return Variant{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Variant{}, err
	}
	v.Images, err = s.ListVariantImages(ctx, c, v.ID)
	return v, err
}

func (s *Service) GetVariant(ctx context.Context, c *authdto.Claims, id string) (Variant, error) {
	var v Variant
	err := s.pool.QueryRow(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$3,true), set_config('app.merchant_id',$1,true)) SELECT v.id,v.merchant_id,v.product_id,v.sku,v.barcode,v.name,v.attributes,v.unit_of_measure,v.base_unit_id,v.is_stock_tracked,v.created_at,v.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=v.merchant_id AND entity_type='CATALOG_VARIANT' AND entity_id=v.id),0) FROM product_variants v CROSS JOIN ctx WHERE v.merchant_id=$1::uuid AND v.id=$2`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.SKU, &v.Barcode, &v.Name, &v.Attributes, &v.UnitOfMeasure, &v.BaseUnitID, &v.IsStockTracked, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion)
	if err != nil {
		return v, err
	}
	v.Images, err = s.ListVariantImages(ctx, c, v.ID)
	return v, err
}
func (s *Service) UpdateVariant(ctx context.Context, c *authdto.Claims, id string, r VariantRequest) (Variant, error) {
	if err := required(r.SKU, "sku"); err != nil {
		return Variant{}, err
	}
	if err := required(r.Name, "name"); err != nil {
		return Variant{}, err
	}
	if err := required(r.BaseUnitID, "base_unit_id"); err != nil {
		return Variant{}, err
	}
	attrs := r.Attributes
	if len(attrs) == 0 {
		attrs = json.RawMessage(`{}`)
	}
	uom := r.UnitOfMeasure
	if strings.TrimSpace(uom) == "" {
		uom = "EA"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Variant{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Variant{}, err
	}
	var v Variant
	err = tx.QueryRow(ctx, `UPDATE product_variants SET sku=$3,barcode=$4,name=$5,attributes=$6,unit_of_measure=$7,base_unit_id=$8,is_stock_tracked=COALESCE($9,is_stock_tracked),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,product_id,sku,barcode,name,attributes,unit_of_measure,base_unit_id,is_stock_tracked,created_at,updated_at`, c.MerchantID, id, strings.TrimSpace(r.SKU), r.Barcode, strings.TrimSpace(r.Name), string(attrs), uom, r.BaseUnitID, r.IsStockTracked).Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.SKU, &v.Barcode, &v.Name, &v.Attributes, &v.UnitOfMeasure, &v.BaseUnitID, &v.IsStockTracked, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Variant{}, err
	}
	if err = validateAndStoreVariantAttributes(ctx, tx, c.MerchantID, v.ProductID, v.ID, attrs); err != nil {
		return Variant{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_VARIANT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Variant{}, err
	}
	if err = publishVariantChange(ctx, tx, c.MerchantID, v, "UPDATE"); err != nil {
		return Variant{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Variant{}, err
	}
	v.Images, err = s.ListVariantImages(ctx, c, v.ID)
	return v, err
}
func (s *Service) DeleteVariant(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var complexityLevel string
	if err = tx.QueryRow(ctx, `SELECT pos_complexity_level FROM merchants WHERE id=$1::uuid`, c.MerchantID).Scan(&complexityLevel); err != nil {
		return err
	}
	if complexityLevel == "SIMPLE" {
		return app.NewError("POS_SIMPLE_VARIANT_MANAGED", "The standard variant belongs to its POS simple product and cannot be removed separately.", 409)
	}
	var productID string
	if err = tx.QueryRow(ctx, `SELECT product_id::text FROM product_variants WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id).Scan(&productID); err != nil {
		return err
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_VARIANT' AND entity_id=$2::uuid),0)`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM product_variants WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id); err != nil {
		return err
	}
	version++
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_VARIANT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "product_id": productID, "is_deleted": true})
	if err = publishCatalogVariantChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ListUnits(ctx context.Context, c *authdto.Claims) ([]Unit, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true), set_config('app.merchant_id',$1,true)) SELECT u.id,u.merchant_id,u.measurement_group_id,u.code,u.name,u.symbol,u.dimension_code,u.allows_decimal,u.is_active,u.created_at,u.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=u.merchant_id AND entity_type='CATALOG_UNIT' AND entity_id=u.id),0) FROM unit_definitions u CROSS JOIN ctx WHERE u.merchant_id=$1::uuid ORDER BY u.name`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Unit{}
	for rows.Next() {
		var v Unit
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.MeasurementGroupID, &v.Code, &v.Name, &v.Symbol, &v.DimensionCode, &v.AllowsDecimal, &v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) GetUnit(ctx context.Context, c *authdto.Claims, id string) (Unit, error) {
	var v Unit
	err := s.pool.QueryRow(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$3,true), set_config('app.merchant_id',$1,true)) SELECT u.id,u.merchant_id,u.measurement_group_id,u.code,u.name,u.symbol,u.dimension_code,u.allows_decimal,u.is_active,u.created_at,u.updated_at FROM unit_definitions u CROSS JOIN ctx WHERE u.merchant_id=$1::uuid AND u.id=$2`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.MeasurementGroupID, &v.Code, &v.Name, &v.Symbol, &v.DimensionCode, &v.AllowsDecimal, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) CreateUnit(ctx context.Context, c *authdto.Claims, r UnitRequest) (Unit, error) {
	if err := required(r.Code, "code"); err != nil {
		return Unit{}, err
	}
	if err := required(r.Name, "name"); err != nil {
		return Unit{}, err
	}
	dim := r.DimensionCode
	if strings.TrimSpace(dim) == "" {
		dim = "CUSTOM"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Unit{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Unit{}, err
	}
	var v Unit
	err = tx.QueryRow(ctx, `INSERT INTO unit_definitions(merchant_id,measurement_group_id,code,name,symbol,dimension_code,allows_decimal,is_active) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,true),COALESCE($8,true)) RETURNING id,merchant_id,measurement_group_id,code,name,symbol,dimension_code,allows_decimal,is_active,created_at,updated_at`, c.MerchantID, r.MeasurementGroupID, strings.TrimSpace(r.Code), strings.TrimSpace(r.Name), r.Symbol, dim, r.AllowsDecimal, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.MeasurementGroupID, &v.Code, &v.Name, &v.Symbol, &v.DimensionCode, &v.AllowsDecimal, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Unit{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_UNIT',$2::uuid,1,now()) RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Unit{}, err
	}
	if err = publishUnitChange(ctx, tx, c.MerchantID, v, "CREATE"); err != nil {
		return Unit{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Unit{}, err
	}
	return v, nil
}
func (s *Service) UpdateUnit(ctx context.Context, c *authdto.Claims, id string, r UnitRequest) (Unit, error) {
	if err := required(r.Code, "code"); err != nil {
		return Unit{}, err
	}
	if err := required(r.Name, "name"); err != nil {
		return Unit{}, err
	}
	dim := r.DimensionCode
	if strings.TrimSpace(dim) == "" {
		dim = "CUSTOM"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Unit{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Unit{}, err
	}
	var v Unit
	err = tx.QueryRow(ctx, `UPDATE unit_definitions SET measurement_group_id=$3,code=$4,name=$5,symbol=$6,dimension_code=$7,allows_decimal=COALESCE($8,allows_decimal),is_active=COALESCE($9,is_active),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,merchant_id,measurement_group_id,code,name,symbol,dimension_code,allows_decimal,is_active,created_at,updated_at`, c.MerchantID, id, r.MeasurementGroupID, strings.TrimSpace(r.Code), strings.TrimSpace(r.Name), r.Symbol, dim, r.AllowsDecimal, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.MeasurementGroupID, &v.Code, &v.Name, &v.Symbol, &v.DimensionCode, &v.AllowsDecimal, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Unit{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_UNIT',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, id).Scan(&v.SyncVersion); err != nil {
		return Unit{}, err
	}
	if err = publishUnitChange(ctx, tx, c.MerchantID, v, "UPDATE"); err != nil {
		return Unit{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Unit{}, err
	}
	return v, nil
}
func (s *Service) DeleteUnit(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_UNIT' AND entity_id=$2::uuid),0)`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM unit_definitions WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	version++
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_UNIT',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if err = publishCatalogUnitChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ListConversions(ctx context.Context, c *authdto.Claims) ([]Conversion, error) {
	rows, err := s.pool.Query(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$2,true), set_config('app.merchant_id',$1,true)) SELECT u.id,u.merchant_id,u.from_unit_id,u.to_unit_id,u.multiplier::text,u.additive_offset::text,u.is_active,u.created_at,u.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=u.merchant_id AND entity_type='CATALOG_CONVERSION' AND entity_id=u.id),0) FROM unit_conversions u CROSS JOIN ctx WHERE u.merchant_id=$1::uuid ORDER BY u.created_at DESC`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Conversion{}
	for rows.Next() {
		var v Conversion
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.FromUnitID, &v.ToUnitID, &v.Multiplier, &v.AdditiveOffset, &v.IsActive, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) GetConversion(ctx context.Context, c *authdto.Claims, id string) (Conversion, error) {
	var v Conversion
	err := s.pool.QueryRow(ctx, `WITH ctx AS (SELECT set_config('app.user_id',$3,true), set_config('app.merchant_id',$1,true)) SELECT u.id,u.merchant_id,u.from_unit_id,u.to_unit_id,u.multiplier::text,u.additive_offset::text,u.is_active,u.created_at,u.updated_at FROM unit_conversions u CROSS JOIN ctx WHERE u.merchant_id=$1::uuid AND u.id=$2`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.FromUnitID, &v.ToUnitID, &v.Multiplier, &v.AdditiveOffset, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) CreateConversion(ctx context.Context, c *authdto.Claims, r ConversionRequest) (Conversion, error) {
	if err := required(r.FromUnitID, "from_unit_id"); err != nil {
		return Conversion{}, err
	}
	if err := required(r.ToUnitID, "to_unit_id"); err != nil {
		return Conversion{}, err
	}
	if err := required(r.Multiplier, "multiplier"); err != nil {
		return Conversion{}, err
	}
	offset := r.AdditiveOffset
	if strings.TrimSpace(offset) == "" {
		offset = "0"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Conversion{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Conversion{}, err
	}
	var v Conversion
	err = tx.QueryRow(ctx, `INSERT INTO unit_conversions(merchant_id,from_unit_id,to_unit_id,multiplier,additive_offset,is_active) VALUES($1,$2,$3,$4,$5,COALESCE($6,true)) RETURNING id,merchant_id,from_unit_id,to_unit_id,multiplier::text,additive_offset::text,is_active,created_at,updated_at`, c.MerchantID, r.FromUnitID, r.ToUnitID, r.Multiplier, offset, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.FromUnitID, &v.ToUnitID, &v.Multiplier, &v.AdditiveOffset, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Conversion{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CONVERSION',$2::uuid,1,now()) RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Conversion{}, err
	}
	if err = publishConversionChange(ctx, tx, c.MerchantID, v, "CREATE"); err != nil {
		return Conversion{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Conversion{}, err
	}
	return v, nil
}
func (s *Service) UpdateConversion(ctx context.Context, c *authdto.Claims, id string, r ConversionRequest) (Conversion, error) {
	if err := required(r.FromUnitID, "from_unit_id"); err != nil {
		return Conversion{}, err
	}
	if err := required(r.ToUnitID, "to_unit_id"); err != nil {
		return Conversion{}, err
	}
	if err := required(r.Multiplier, "multiplier"); err != nil {
		return Conversion{}, err
	}
	offset := r.AdditiveOffset
	if strings.TrimSpace(offset) == "" {
		offset = "0"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Conversion{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Conversion{}, err
	}
	var v Conversion
	err = tx.QueryRow(ctx, `UPDATE unit_conversions SET from_unit_id=$3,to_unit_id=$4,multiplier=$5,additive_offset=$6,is_active=COALESCE($7,is_active),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,merchant_id,from_unit_id,to_unit_id,multiplier::text,additive_offset::text,is_active,created_at,updated_at`, c.MerchantID, id, r.FromUnitID, r.ToUnitID, r.Multiplier, offset, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.FromUnitID, &v.ToUnitID, &v.Multiplier, &v.AdditiveOffset, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Conversion{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CONVERSION',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, id).Scan(&v.SyncVersion); err != nil {
		return Conversion{}, err
	}
	if err = publishConversionChange(ctx, tx, c.MerchantID, v, "UPDATE"); err != nil {
		return Conversion{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Conversion{}, err
	}
	return v, nil
}
func (s *Service) DeleteConversion(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_CONVERSION' AND entity_id=$2::uuid),0)`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `DELETE FROM unit_conversions WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	version++
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CONVERSION',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if err = publishCatalogConversionChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ListBrands(ctx context.Context, c *authdto.Claims) ([]Brand, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT b.id,b.merchant_id,b.name,b.slug,b.description,b.image_url,b.is_active,b.created_at,b.updated_at FROM catalog_brands b CROSS JOIN x WHERE b.merchant_id=$1::uuid ORDER BY b.name`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Brand{}
	for rows.Next() {
		var v Brand
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.IsActive, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) CreateBrand(ctx context.Context, c *authdto.Claims, r BrandRequest) (Brand, error) {
	if !valid(r.Name) || !validSlug(r.Slug) {
		return Brand{}, pgx.ErrNoRows
	}
	var v Brand
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) INSERT INTO catalog_brands(merchant_id,name,slug,description,image_url,is_active) SELECT $1::uuid,$2,$3,$4,$5,COALESCE($6,true) FROM x RETURNING id,merchant_id,name,slug,description,image_url,is_active,created_at,updated_at`, c.MerchantID, strings.TrimSpace(r.Name), strings.ToLower(strings.TrimSpace(r.Slug)), r.Description, r.ImageURL, r.IsActive, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) UpdateBrand(ctx context.Context, c *authdto.Claims, id string, r BrandRequest) (Brand, error) {
	var v Brand
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$8,true),set_config('app.merchant_id',$1,true)) UPDATE catalog_brands b SET name=$3,slug=$4,description=$5,image_url=$6,is_active=COALESCE($7,b.is_active) FROM x WHERE b.merchant_id=$1::uuid AND b.id=$2 RETURNING b.id,b.merchant_id,b.name,b.slug,b.description,b.image_url,b.is_active,b.created_at,b.updated_at`, c.MerchantID, id, strings.TrimSpace(r.Name), strings.ToLower(strings.TrimSpace(r.Slug)), r.Description, r.ImageURL, r.IsActive, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.IsActive, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) DeleteBrand(ctx context.Context, c *authdto.Claims, id string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM catalog_brands b USING x WHERE b.merchant_id=$1::uuid AND b.id=$2`, c.MerchantID, id, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func validSlug(v string) bool { return strings.TrimSpace(v) != "" }
func valid(v string) bool     { return strings.TrimSpace(v) != "" }
func (s *Service) ListCategories(ctx context.Context, c *authdto.Claims) ([]Category, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT k.id,k.merchant_id,k.parent_category_id,k.name,k.slug,k.description,k.image_url,k.sort_order,k.created_at,k.updated_at,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=k.merchant_id AND entity_type='CATALOG_CATEGORY' AND entity_id=k.id),0) FROM catalog_categories k CROSS JOIN x WHERE k.merchant_id=$1::uuid ORDER BY k.sort_order,k.name`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var v Category
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.ParentCategoryID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) CreateCategory(ctx context.Context, c *authdto.Claims, r CategoryRequest) (Category, error) {
	if !valid(r.Name) || !valid(r.Slug) {
		return Category{}, pgx.ErrNoRows
	}
	order := 0
	if r.SortOrder != nil {
		order = *r.SortOrder
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Category{}, err
	}
	var v Category
	err = tx.QueryRow(ctx, `INSERT INTO catalog_categories(merchant_id,parent_category_id,name,slug,description,image_url,sort_order) VALUES($1::uuid,$2,$3,$4,$5,$6,$7) RETURNING id,merchant_id,parent_category_id,name,slug,description,image_url,sort_order,created_at,updated_at`, c.MerchantID, r.ParentCategoryID, strings.TrimSpace(r.Name), strings.ToLower(strings.TrimSpace(r.Slug)), r.Description, r.ImageURL, order).Scan(&v.ID, &v.MerchantID, &v.ParentCategoryID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Category{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CATEGORY',$2::uuid,1,now()) RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Category{}, err
	}
	if err = publishCategoryChange(ctx, tx, c.MerchantID, v, "CREATE"); err != nil {
		return Category{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Category{}, err
	}
	return v, nil
}
func (s *Service) UpdateCategory(ctx context.Context, c *authdto.Claims, id string, r CategoryRequest) (Category, error) {
	order := 0
	if r.SortOrder != nil {
		order = *r.SortOrder
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Category{}, err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return Category{}, err
	}
	var v Category
	err = tx.QueryRow(ctx, `UPDATE catalog_categories SET parent_category_id=$3,name=$4,slug=$5,description=$6,image_url=$7,sort_order=$8,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2 RETURNING id,merchant_id,parent_category_id,name,slug,description,image_url,sort_order,created_at,updated_at`, c.MerchantID, id, r.ParentCategoryID, strings.TrimSpace(r.Name), strings.ToLower(strings.TrimSpace(r.Slug)), r.Description, r.ImageURL, order).Scan(&v.ID, &v.MerchantID, &v.ParentCategoryID, &v.Name, &v.Slug, &v.Description, &v.ImageURL, &v.SortOrder, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		return Category{}, err
	}
	if err = tx.QueryRow(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CATEGORY',$2::uuid,1,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now() RETURNING version`, c.MerchantID, v.ID).Scan(&v.SyncVersion); err != nil {
		return Category{}, err
	}
	if err = publishCategoryChange(ctx, tx, c.MerchantID, v, "UPDATE"); err != nil {
		return Category{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Category{}, err
	}
	return v, nil
}
func (s *Service) DeleteCategory(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setContext(ctx, tx, c); err != nil {
		return err
	}
	var version int64
	if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='CATALOG_CATEGORY' AND entity_id=$2::uuid),0)`, c.MerchantID, id).Scan(&version); err != nil {
		return err
	}
	r, err := tx.Exec(ctx, `DELETE FROM catalog_categories WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	version++
	if _, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at) VALUES($1::uuid,'CATALOG_CATEGORY',$2::uuid,$3,now()) ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, c.MerchantID, id, version); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": id, "is_deleted": true})
	if err = publishCatalogCategoryChange(ctx, tx, c.MerchantID, id, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) ListImages(ctx context.Context, c *authdto.Claims, productID string) ([]Image, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT i.id,i.merchant_id,i.product_id,i.image_url,i.source_type,i.alt_text,i.position,i.created_at FROM catalog_product_images i CROSS JOIN x WHERE i.merchant_id=$1::uuid AND i.product_id=$3 ORDER BY i.position,i.created_at`, c.MerchantID, c.IdentityID, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Image{}
	for rows.Next() {
		var v Image
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) CreateImage(ctx context.Context, c *authdto.Claims, productID string, r ImageRequest) (Image, error) {
	if !valid(r.ImageURL) {
		return Image{}, pgx.ErrNoRows
	}
	p := 0
	if r.Position != nil {
		p = *r.Position
	}
	var v Image
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) INSERT INTO catalog_product_images(merchant_id,product_id,image_url,source_type,alt_text,position) SELECT $1::uuid,$2,$3,$4,$5,$6 FROM x RETURNING id,merchant_id,product_id,image_url,source_type,alt_text,position,created_at`, c.MerchantID, productID, r.ImageURL, r.SourceType, r.AltText, p, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt)
	return v, err
}
func (s *Service) UpdateImage(ctx context.Context, c *authdto.Claims, id string, r ImageRequest) (Image, error) {
	var v Image
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) UPDATE catalog_product_images i SET image_url=$3,source_type=$4,alt_text=$5,position=COALESCE($6,i.position) FROM x WHERE i.merchant_id=$1::uuid AND i.id=$2 RETURNING i.id,i.merchant_id,i.product_id,i.image_url,i.source_type,i.alt_text,i.position,i.created_at`, c.MerchantID, id, r.ImageURL, r.SourceType, r.AltText, r.Position, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ProductID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt)
	if err == pgx.ErrNoRows {
		err = s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) UPDATE catalog_variant_images i SET image_url=$3,source_type=$4,alt_text=$5,position=COALESCE($6,i.position) FROM x WHERE i.merchant_id=$1::uuid AND i.id=$2 RETURNING i.id,i.merchant_id,i.variant_id,i.image_url,i.source_type,i.alt_text,i.position,i.created_at`, c.MerchantID, id, r.ImageURL, r.SourceType, r.AltText, r.Position, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt)
	}
	return v, err
}
func (s *Service) DeleteImage(ctx context.Context, c *authdto.Claims, id string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM catalog_product_images i USING x WHERE i.merchant_id=$1::uuid AND i.id=$2`, c.MerchantID, id, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		r, err = s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM catalog_variant_images i USING x WHERE i.merchant_id=$1::uuid AND i.id=$2`, c.MerchantID, id, c.IdentityID)
		if err != nil {
			return err
		}
		if r.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
	}
	return nil
}

func (s *Service) ListVariantImages(ctx context.Context, c *authdto.Claims, variantID string) ([]Image, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT i.id,i.merchant_id,i.variant_id,i.image_url,i.source_type,i.alt_text,i.position,i.created_at FROM catalog_variant_images i CROSS JOIN x WHERE i.merchant_id=$1::uuid AND i.variant_id=$3 ORDER BY i.position,i.created_at`, c.MerchantID, c.IdentityID, variantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Image{}
	for rows.Next() {
		var v Image
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Service) CreateVariantImage(ctx context.Context, c *authdto.Claims, variantID string, r ImageRequest) (Image, error) {
	p := 0
	if r.Position != nil {
		p = *r.Position
	}
	var v Image
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) INSERT INTO catalog_variant_images(merchant_id,variant_id,image_url,source_type,alt_text,position) SELECT $1::uuid,$2,$3,$4,$5,$6 FROM x RETURNING id,merchant_id,variant_id,image_url,source_type,alt_text,position,created_at`, c.MerchantID, variantID, r.ImageURL, r.SourceType, r.AltText, p, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.ImageURL, &v.SourceType, &v.AltText, &v.Position, &v.CreatedAt)
	return v, err
}

func (s *Service) AssignCategory(ctx context.Context, c *authdto.Claims, productID, categoryID string) error {
	_, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$4,true),set_config('app.merchant_id',$1,true)) INSERT INTO catalog_product_categories(merchant_id,product_id,category_id) SELECT $1::uuid,$2,$3 FROM x ON CONFLICT DO NOTHING`, c.MerchantID, productID, categoryID, c.IdentityID)
	return err
}
func (s *Service) RemoveCategory(ctx context.Context, c *authdto.Claims, productID, categoryID string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$4,true),set_config('app.merchant_id',$1,true)) DELETE FROM catalog_product_categories pc USING x WHERE pc.merchant_id=$1::uuid AND pc.product_id=$2 AND pc.category_id=$3`, c.MerchantID, productID, categoryID, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Service) GetPolicy(ctx context.Context, c *authdto.Claims, variantID string) (InventoryPolicy, error) {
	var v InventoryPolicy
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.variant_id,p.track_batches,p.track_expiry,p.track_serials,p.track_unique_assets,p.track_reservations,p.allow_unit_conversions,p.allow_pack_breaking,p.allow_multiple_barcodes,p.created_at,p.updated_at FROM variant_inventory_policies p CROSS JOIN x WHERE p.merchant_id=$1::uuid AND p.variant_id=$2`, c.MerchantID, variantID, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.TrackBatches, &v.TrackExpiry, &v.TrackSerials, &v.TrackUniqueAssets, &v.TrackReservations, &v.AllowUnitConversions, &v.AllowPackBreaking, &v.AllowMultipleBarcodes, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) UpsertPolicy(ctx context.Context, c *authdto.Claims, variantID string, r InventoryPolicyRequest) (InventoryPolicy, error) {
	var v InventoryPolicy
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$11,true),set_config('app.merchant_id',$1,true)) INSERT INTO variant_inventory_policies(merchant_id,variant_id,track_batches,track_expiry,track_serials,track_unique_assets,track_reservations,allow_unit_conversions,allow_pack_breaking,allow_multiple_barcodes) SELECT $1::uuid,$2,COALESCE($3,false),COALESCE($4,false),COALESCE($5,false),COALESCE($6,false),COALESCE($7,false),COALESCE($8,false),COALESCE($9,false),COALESCE($10,false) FROM x ON CONFLICT(merchant_id,variant_id) DO UPDATE SET track_batches=EXCLUDED.track_batches,track_expiry=EXCLUDED.track_expiry,track_serials=EXCLUDED.track_serials,track_unique_assets=EXCLUDED.track_unique_assets,track_reservations=EXCLUDED.track_reservations,allow_unit_conversions=EXCLUDED.allow_unit_conversions,allow_pack_breaking=EXCLUDED.allow_pack_breaking,allow_multiple_barcodes=EXCLUDED.allow_multiple_barcodes,updated_at=now() RETURNING id,merchant_id,variant_id,track_batches,track_expiry,track_serials,track_unique_assets,track_reservations,allow_unit_conversions,allow_pack_breaking,allow_multiple_barcodes,created_at,updated_at`, c.MerchantID, variantID, r.TrackBatches, r.TrackExpiry, r.TrackSerials, r.TrackUniqueAssets, r.TrackReservations, r.AllowUnitConversions, r.AllowPackBreaking, r.AllowMultipleBarcodes, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.VariantID, &v.TrackBatches, &v.TrackExpiry, &v.TrackSerials, &v.TrackUniqueAssets, &v.TrackReservations, &v.AllowUnitConversions, &v.AllowPackBreaking, &v.AllowMultipleBarcodes, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}
func (s *Service) DeletePolicy(ctx context.Context, c *authdto.Claims, variantID string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM variant_inventory_policies p USING x WHERE p.merchant_id=$1::uuid AND p.variant_id=$2`, c.MerchantID, variantID, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// Repository adapts PostgreSQL persistence to the bounded context's outbound port.
type Repository = Service

func NewRepository(pool *pgxpool.Pool) *Service {
	return NewService(pool)
}

var _ catalogoutbound.Repository = (*Service)(nil)
