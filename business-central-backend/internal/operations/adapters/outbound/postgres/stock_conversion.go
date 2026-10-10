package postgres

import (
	"context"
	"errors"
	"fmt"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	operationsdomain "business-central-backend/internal/operations/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const stockConversionRuleColumns = `r.id::text,r.merchant_id::text,p.id::text,p.name,
    r.source_variant_id::text,source.name,source.sku,
    r.destination_variant_id::text,destination.name,destination.sku,
    r.destination_quantity,r.is_active,r.created_at,r.updated_at`

func scanStockConversionRule(row pgx.Row) (operationsdto.StockConversionRule, error) {
	var rule operationsdto.StockConversionRule
	err := row.Scan(&rule.ID, &rule.MerchantID, &rule.ProductID, &rule.ProductName,
		&rule.SourceVariantID, &rule.SourceVariantName, &rule.SourceSKU,
		&rule.DestinationVariantID, &rule.DestinationVariantName, &rule.DestinationSKU,
		&rule.DestinationQuantity, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt)
	return rule, err
}

func (s *Service) ListStockConversionRules(ctx context.Context, claims *authdto.Claims) ([]operationsdto.StockConversionRule, error) {
	rows, err := s.pool.Query(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT `+stockConversionRuleColumns+` FROM stock_conversion_rules r
		JOIN product_variants source ON source.merchant_id=r.merchant_id AND source.id=r.source_variant_id
		JOIN product_variants destination ON destination.merchant_id=r.merchant_id AND destination.id=r.destination_variant_id
		JOIN products p ON p.merchant_id=source.merchant_id AND p.id=source.product_id
		CROSS JOIN scope WHERE r.merchant_id=$1::uuid ORDER BY p.name,source.name,destination.name`, claims.MerchantID, claims.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	rules := []operationsdto.StockConversionRule{}
	for rows.Next() {
		rule, scanErr := scanStockConversionRule(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

func (s *Service) SaveStockConversionRule(ctx context.Context, claims *authdto.Claims, request operationsdto.StockConversionRuleRequest) (operationsdto.StockConversionRule, error) {
	return writeOperation(ctx, s.pool, claims, func(tx pgx.Tx) (operationsdto.StockConversionRule, error) {
		var rule operationsdto.StockConversionRule
		var sameProduct, tracked, active, restricted bool
		err := tx.QueryRow(ctx, `SELECT source.product_id=destination.product_id,
			source.is_stock_tracked AND destination.is_stock_tracked,
			p.is_active,
			EXISTS(SELECT 1 FROM variant_inventory_policies vip WHERE vip.merchant_id=source.merchant_id
				AND vip.variant_id IN (source.id,destination.id)
				AND (vip.track_batches OR vip.track_expiry OR vip.track_serials OR vip.track_unique_assets))
			FROM product_variants source
			JOIN product_variants destination ON destination.merchant_id=source.merchant_id AND destination.id=$3::uuid
			JOIN products p ON p.merchant_id=source.merchant_id AND p.id=source.product_id
			WHERE source.merchant_id=$1::uuid AND source.id=$2::uuid`, claims.MerchantID, request.SourceVariantID, request.DestinationVariantID).Scan(&sameProduct, &tracked, &active, &restricted)
		if errors.Is(err, pgx.ErrNoRows) {
			return rule, app.Validation("Choose two active, stock-tracked variants of the same product.", nil)
		}
		if err != nil {
			return rule, err
		}
		if !sameProduct || !tracked || !active || restricted {
			return rule, app.Validation("Choose two active, stock-tracked variants of the same product without batch, serial, or asset tracking.", nil)
		}
		// The existing transformation-line guard requires pack breaking to be enabled on both variants.
		for _, variantID := range []string{request.SourceVariantID, request.DestinationVariantID} {
			_, err = tx.Exec(ctx, `INSERT INTO variant_inventory_policies(merchant_id,variant_id,allow_unit_conversions,allow_pack_breaking)
				VALUES($1::uuid,$2::uuid,true,true)
				ON CONFLICT(merchant_id,variant_id) DO UPDATE SET allow_unit_conversions=true,allow_pack_breaking=true,updated_at=now()`, claims.MerchantID, variantID)
			if err != nil {
				return rule, err
			}
		}
		activeValue := true
		if request.IsActive != nil {
			activeValue = *request.IsActive
		}
		row := tx.QueryRow(ctx, `WITH changed AS (
			INSERT INTO stock_conversion_rules(merchant_id,source_variant_id,destination_variant_id,destination_quantity,is_active)
			VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5)
			ON CONFLICT(merchant_id,source_variant_id,destination_variant_id) DO UPDATE
			SET destination_quantity=EXCLUDED.destination_quantity,is_active=EXCLUDED.is_active,updated_at=now()
			RETURNING *) SELECT `+stockConversionRuleColumns+` FROM changed r
			JOIN product_variants source ON source.merchant_id=r.merchant_id AND source.id=r.source_variant_id
			JOIN product_variants destination ON destination.merchant_id=r.merchant_id AND destination.id=r.destination_variant_id
			JOIN products p ON p.merchant_id=source.merchant_id AND p.id=source.product_id`, claims.MerchantID, request.SourceVariantID, request.DestinationVariantID, request.DestinationQuantity, activeValue)
		return scanStockConversionRule(row)
	})
}

func (s *Service) ApplyStockConversion(ctx context.Context, claims *authdto.Claims, request operationsdto.StockConversionRequest) (operationsdto.StockConversion, error) {
	key := app.IdempotencyKey(ctx)
	if key == "" {
		return operationsdto.StockConversion{}, app.Validation("Idempotency-Key is required for stock conversion.", nil)
	}
	return writeIdempotent(ctx, s.pool, claims, "stock.conversion", key, request, func(tx pgx.Tx) (operationsdto.StockConversion, error) {
		var result operationsdto.StockConversion
		result.RuleID = request.RuleID
		result.LocationID = request.LocationID
		result.SourceQuantity = request.Quantity
		result.CreatedByMembershipID = claims.MembershipID
		var ratio int
		var active, sourceTracked, destinationTracked bool
		var sourceProduct, destinationProduct string
		err := tx.QueryRow(ctx, `SELECT r.source_variant_id::text,r.destination_variant_id::text,r.destination_quantity,r.is_active,
			source.product_id::text,destination.product_id::text,source.is_stock_tracked,destination.is_stock_tracked
			FROM stock_conversion_rules r
			JOIN product_variants source ON source.merchant_id=r.merchant_id AND source.id=r.source_variant_id
			JOIN product_variants destination ON destination.merchant_id=r.merchant_id AND destination.id=r.destination_variant_id
			JOIN products product ON product.merchant_id=source.merchant_id AND product.id=source.product_id AND product.is_active
			WHERE r.merchant_id=$1::uuid AND r.id=$2::uuid FOR SHARE OF r`, claims.MerchantID, request.RuleID).Scan(&result.SourceVariantID, &result.DestinationVariantID, &ratio, &active, &sourceProduct, &destinationProduct, &sourceTracked, &destinationTracked)
		if errors.Is(err, pgx.ErrNoRows) {
			return result, app.Validation("Stock conversion rule was not found.", nil)
		}
		if err != nil {
			return result, err
		}
		if !active || !sourceTracked || !destinationTracked || sourceProduct != destinationProduct {
			return result, app.Validation("The stock conversion rule is inactive or its variants are no longer eligible.", nil)
		}
		if int64(request.Quantity)*int64(ratio) > 1000000 {
			return result, app.Validation("Conversion output exceeds 1000000 units.", nil)
		}
		result.DestinationQuantity = request.Quantity * ratio
		var allowed bool
		err = tx.QueryRow(ctx, `SELECT l.is_active AND s.is_active AND (um.shop_id IS NULL OR um.shop_id=l.shop_id)
			FROM locations l JOIN shops s ON s.merchant_id=l.merchant_id AND s.id=l.shop_id
			JOIN user_memberships um ON um.merchant_id=l.merchant_id AND um.id=$3::uuid AND um.is_active
			WHERE l.merchant_id=$1::uuid AND l.id=$2::uuid`, claims.MerchantID, request.LocationID, claims.MembershipID).Scan(&allowed)
		if errors.Is(err, pgx.ErrNoRows) {
			return result, app.Validation("Select an active inventory location in your assigned shop.", nil)
		}
		if err != nil {
			return result, err
		}
		if !allowed {
			return result, app.Validation("Select an active inventory location in your assigned shop.", nil)
		}
		var enoughStock bool
		err = tx.QueryRow(ctx, `SELECT quantity_on_hand-quantity_reserved >= $4::numeric FROM inventory_balances
			WHERE merchant_id=$1::uuid AND location_id=$2::uuid AND variant_id=$3::uuid FOR UPDATE`, claims.MerchantID, request.LocationID, result.SourceVariantID, request.Quantity).Scan(&enoughStock)
		if errors.Is(err, pgx.ErrNoRows) {
			return result, app.Validation("There is not enough unreserved source stock to convert.", nil)
		}
		if err != nil {
			return result, err
		}
		if !enoughStock {
			return result, app.Validation("There is not enough unreserved source stock to convert.", nil)
		}
		var sourceBase, destinationBase string
		err = tx.QueryRow(ctx, `SELECT source.base_unit_id::text,destination.base_unit_id::text
			FROM product_variants source JOIN product_variants destination ON destination.merchant_id=source.merchant_id AND destination.id=$3::uuid
			WHERE source.merchant_id=$1::uuid AND source.id=$2::uuid`, claims.MerchantID, result.SourceVariantID, result.DestinationVariantID).Scan(&sourceBase, &destinationBase)
		if err != nil {
			return result, err
		}
		var eligible bool
		err = tx.QueryRow(ctx, `SELECT COUNT(*)=2 AND COALESCE(bool_and(allow_pack_breaking AND NOT
			(track_batches OR track_expiry OR track_serials OR track_unique_assets)),false)
			FROM variant_inventory_policies WHERE merchant_id=$1::uuid AND variant_id IN ($2::uuid,$3::uuid)`, claims.MerchantID, result.SourceVariantID, result.DestinationVariantID).Scan(&eligible)
		if err != nil {
			return result, err
		}
		if !eligible {
			return result, app.Validation("Pack breaking is disabled or requires a traceable batch, serial, or asset workflow.", nil)
		}
		operationID := uuid.NewString()
		result.ID = uuid.NewString()
		_, err = tx.Exec(ctx, `INSERT INTO inventory_operations(id,merchant_id,client_operation_id,operation_type,actor_membership_id,location_id)
			VALUES($1::uuid,$2::uuid,$3,'PACK_BREAK',$4::uuid,$5::uuid)`, operationID, claims.MerchantID, key, claims.MembershipID, request.LocationID)
		if err != nil {
			return result, err
		}
		err = tx.QueryRow(ctx, `INSERT INTO inventory_transformations(id,merchant_id,location_id,operation_id,stock_conversion_rule_id,transformation_type,status,notes,created_by_membership_id)
			VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'PACK_BREAK','DRAFT',$6,$7::uuid) RETURNING created_at`, result.ID, claims.MerchantID, request.LocationID, operationID, request.RuleID, request.Notes, claims.MembershipID).Scan(&result.AppliedAt)
		if err != nil {
			return result, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO inventory_transformation_lines(merchant_id,transformation_id,variant_id,unit_id,direction,quantity)
			VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'OUT',$5),($1::uuid,$2::uuid,$6::uuid,$7::uuid,'IN',$8)`, claims.MerchantID, result.ID, result.SourceVariantID, sourceBase, request.Quantity, result.DestinationVariantID, destinationBase, result.DestinationQuantity)
		if err != nil {
			return result, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,event_key)
			VALUES($1::uuid,$2::uuid,'ADJUSTMENT',$3::uuid,$4,$5::uuid,$6)`, claims.MerchantID, result.SourceVariantID, request.LocationID, request.Quantity, sourceBase, "stock-conversion:"+result.ID+":out")
		if err != nil {
			return result, err
		}
		var totalCents int64
		err = tx.QueryRow(ctx, `SELECT COALESCE(SUM(a.total_cost)*100,0)::bigint FROM inventory_cost_allocations a
			JOIN inventory_movements m ON m.merchant_id=a.merchant_id AND m.id=a.consumption_movement_id
			WHERE m.merchant_id=$1::uuid AND m.event_key=$2`, claims.MerchantID, "stock-conversion:"+result.ID+":out").Scan(&totalCents)
		if err != nil {
			return result, err
		}
		if totalCents < 0 {
			return result, fmt.Errorf("negative source stock value")
		}
		extraUnits, higherCents, baseUnits, baseCents, err := operationsdomain.SplitPackCost(totalCents, int64(result.DestinationQuantity))
		if err != nil {
			return result, err
		}
		addOutput := func(quantity int64, cents int64, suffix string) error {
			if quantity == 0 {
				return nil
			}
			_, insertErr := tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,destination_location_id,quantity,unit_id,unit_cost,event_key)
				VALUES($1::uuid,$2::uuid,'ADJUSTMENT',$3::uuid,$4,$5::uuid,$6::numeric/100,$7)`, claims.MerchantID, result.DestinationVariantID, request.LocationID, quantity, destinationBase, cents, "stock-conversion:"+result.ID+":in:"+suffix)
			return insertErr
		}
		if err = addOutput(extraUnits, higherCents, "remainder"); err != nil {
			return result, err
		}
		if err = addOutput(baseUnits, baseCents, "base"); err != nil {
			return result, err
		}
		err = tx.QueryRow(ctx, `UPDATE inventory_transformations SET status='APPLIED',applied_at=now(),total_cost=$3::numeric/100
			WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING applied_at,total_cost::text`, claims.MerchantID, result.ID, totalCents).Scan(&result.AppliedAt, &result.TotalCost)
		if err != nil {
			return result, err
		}
		var canSeeCost bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM membership_roles mr JOIN roles role ON role.merchant_id=mr.merchant_id AND role.id=mr.role_id
			WHERE mr.merchant_id=$1::uuid AND mr.membership_id=$2::uuid AND role.code='merchant')`, claims.MerchantID, claims.MembershipID).Scan(&canSeeCost)
		if err != nil {
			return result, err
		}
		if !canSeeCost {
			result.TotalCost = ""
		}
		return result, err
	})
}

func (s *Service) PreviewStockConversion(ctx context.Context, claims *authdto.Claims, request operationsdto.StockConversionRequest) (operationsdto.StockConversionPreview, error) {
	var preview operationsdto.StockConversionPreview
	var enough bool
	err := s.pool.QueryRow(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT r.id::text,l.id::text,$5::integer,($5::bigint*r.destination_quantity)::integer,
			COALESCE(source_balance.quantity_on_hand,0)::text,
			(COALESCE(source_balance.quantity_on_hand,0)-$5::numeric)::text,
			COALESCE(destination_balance.quantity_on_hand,0)::text,
			(COALESCE(destination_balance.quantity_on_hand,0)+$5::numeric*r.destination_quantity)::text,
			COALESCE(source_balance.quantity_on_hand-source_balance.quantity_reserved,0)>=$5::numeric
		FROM stock_conversion_rules r
		JOIN product_variants source ON source.merchant_id=r.merchant_id AND source.id=r.source_variant_id
		JOIN product_variants destination ON destination.merchant_id=r.merchant_id AND destination.id=r.destination_variant_id AND destination.product_id=source.product_id
		JOIN locations l ON l.merchant_id=r.merchant_id AND l.id=$4::uuid AND l.is_active
		JOIN shops shop ON shop.merchant_id=l.merchant_id AND shop.id=l.shop_id AND shop.is_active
		JOIN user_memberships member ON member.merchant_id=l.merchant_id AND member.id=$3::uuid AND member.is_active
			AND (member.shop_id IS NULL OR member.shop_id=l.shop_id)
		LEFT JOIN inventory_balances source_balance ON source_balance.merchant_id=r.merchant_id AND source_balance.location_id=l.id AND source_balance.variant_id=r.source_variant_id
		LEFT JOIN inventory_balances destination_balance ON destination_balance.merchant_id=r.merchant_id AND destination_balance.location_id=l.id AND destination_balance.variant_id=r.destination_variant_id
		CROSS JOIN scope WHERE r.merchant_id=$1::uuid AND r.id=$6::uuid AND r.is_active AND $5::bigint*r.destination_quantity<=1000000`, claims.MerchantID, claims.IdentityID, claims.MembershipID, request.LocationID, request.Quantity, request.RuleID).Scan(&preview.RuleID, &preview.LocationID, &preview.SourceQuantity, &preview.DestinationQuantity, &preview.SourceBefore, &preview.SourceAfter, &preview.DestinationBefore, &preview.DestinationAfter, &enough)
	if errors.Is(err, pgx.ErrNoRows) {
		return preview, app.Validation("Choose an active pack rule and location in your assigned shop.", nil)
	}
	if err != nil {
		return preview, err
	}
	if !enough {
		return preview, app.Validation("There is not enough unreserved source stock to convert.", nil)
	}
	return preview, nil
}

func (s *Service) ListStockConversions(ctx context.Context, claims *authdto.Claims) ([]operationsdto.StockConversion, error) {
	rows, err := s.pool.Query(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT t.id::text,t.stock_conversion_rule_id::text,t.location_id::text,
			source.variant_id::text,destination.variant_id::text,source.quantity::integer,destination.quantity::integer,
			CASE WHEN EXISTS(SELECT 1 FROM membership_roles mr JOIN roles role ON role.merchant_id=mr.merchant_id AND role.id=mr.role_id
				WHERE mr.merchant_id=t.merchant_id AND mr.membership_id=NULLIF($3,'')::uuid AND role.code='merchant')
			THEN COALESCE(t.total_cost,0)::text ELSE '' END,t.created_by_membership_id::text,t.applied_at
			FROM inventory_transformations t
			JOIN inventory_transformation_lines source ON source.merchant_id=t.merchant_id AND source.transformation_id=t.id AND source.direction='OUT'
			JOIN inventory_transformation_lines destination ON destination.merchant_id=t.merchant_id AND destination.transformation_id=t.id AND destination.direction='IN'
			JOIN locations l ON l.merchant_id=t.merchant_id AND l.id=t.location_id
			LEFT JOIN user_memberships um ON um.merchant_id=t.merchant_id AND um.id=NULLIF($3,'')::uuid
			CROSS JOIN scope WHERE t.merchant_id=$1::uuid AND t.transformation_type='PACK_BREAK' AND t.status='APPLIED'
			AND t.stock_conversion_rule_id IS NOT NULL AND (um.id IS NULL OR um.shop_id IS NULL OR um.shop_id=l.shop_id)
			ORDER BY t.applied_at DESC LIMIT 100`, claims.MerchantID, claims.IdentityID, claims.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []operationsdto.StockConversion{}
	for rows.Next() {
		var item operationsdto.StockConversion
		if err = rows.Scan(&item.ID, &item.RuleID, &item.LocationID, &item.SourceVariantID, &item.DestinationVariantID, &item.SourceQuantity, &item.DestinationQuantity, &item.TotalCost, &item.CreatedByMembershipID, &item.AppliedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
