package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	operationsdomain "business-central-backend/internal/operations/domain"
	"github.com/jackc/pgx/v5"
)

type stockRoleQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func requireStockMerchant(ctx context.Context, q stockRoleQuerier, c *authdto.Claims) error {
	if c == nil || c.PlatformAdmin {
		return app.NewError("FORBIDDEN", "Only the merchant owner can modify stock.", 403)
	}
	var allowed bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM user_memberships um
  JOIN membership_roles mr ON mr.merchant_id=um.merchant_id AND mr.membership_id=um.id
  JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id
  WHERE um.merchant_id=$1::uuid AND um.id=$2::uuid AND um.identity_id=$3::uuid
	  AND um.is_active AND (mr.valid_until IS NULL OR mr.valid_until>=now()) AND r.code IN ('merchant','owner'))`, c.MerchantID, c.MembershipID, c.IdentityID).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return app.NewError("FORBIDDEN", "Only the merchant owner can modify stock.", 403)
	}
	return nil
}

func (s *Service) ReduceStock(ctx context.Context, c *authdto.Claims, r operationsdto.StockReductionRequest) (operationsdto.Movement, error) {
	if c == nil || c.PlatformAdmin {
		return operationsdto.Movement{}, app.NewError("FORBIDDEN", "Only the merchant owner can modify stock.", 403)
	}
	if err := operationsdomain.ValidateStockReduction(r.Quantity, r.Reason, r.EventKey); err != nil {
		return operationsdto.Movement{}, app.Validation(err.Error(), nil)
	}
	// Authorization precedes even an idempotency replay.
	_, err := writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (bool, error) { return true, requireStockMerchant(ctx, tx, c) })
	if err != nil {
		return operationsdto.Movement{}, err
	}
	return writeIdempotent(ctx, s.pool, c, "inventory.stock-reduction", r.EventKey, r, func(tx pgx.Tx) (operationsdto.Movement, error) {
		var movement operationsdto.Movement
		if err := requireStockMerchant(ctx, tx, c); err != nil {
			return movement, err
		}
		// A permanent ledger key also protects retries after idempotency cleanup.
		var same bool
		err := tx.QueryRow(ctx, `SELECT m.id,m.merchant_id,m.variant_id,m.movement_type,m.source_location_id,
	   m.quantity::text,m.entered_quantity::text,m.unit_id,m.event_key,m.occurred_at,m.created_at,
	   COALESCE(m.movement_type='ADJUSTMENT' AND m.source_location_id=$3::uuid AND m.variant_id=$4::uuid
   AND m.entered_quantity=$5::numeric AND EXISTS(SELECT 1 FROM audit_events a WHERE a.merchant_id=m.merchant_id
	    AND a.entity_id=m.id AND a.action='inventory.stock.reduce' AND a.after_data->>'reason'=$6),false)
   FROM inventory_movements m WHERE m.merchant_id=$1::uuid AND m.event_key=$2`, c.MerchantID, r.EventKey, r.SourceLocationID, r.VariantID, r.Quantity, r.Reason).
			Scan(&movement.ID, &movement.MerchantID, &movement.VariantID, &movement.MovementType, &movement.SourceLocationID, &movement.Quantity, &movement.EnteredQuantity, &movement.UnitID, &movement.EventKey, &movement.OccurredAt, &movement.CreatedAt, &same)
		if err == nil {
			if !same {
				return movement, app.NewError("IDEMPOTENCY_CONFLICT", "This event key was already used for different stock content.", 409)
			}
			return movement, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return movement, err
		}
		var locationAllowed bool
		var shopID string
		err = tx.QueryRow(ctx, `SELECT l.is_active AND s.is_active AND (um.shop_id IS NULL OR um.shop_id=l.shop_id),l.shop_id::text
   FROM locations l JOIN shops s ON s.merchant_id=l.merchant_id AND s.id=l.shop_id
   JOIN user_memberships um ON um.merchant_id=l.merchant_id AND um.id=$3::uuid AND um.is_active
   WHERE l.merchant_id=$1::uuid AND l.id=$2::uuid FOR SHARE OF l`, c.MerchantID, r.SourceLocationID, c.MembershipID).Scan(&locationAllowed, &shopID)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !locationAllowed {
			return movement, app.Validation("Choose an active stock location within your merchant and shop scope.", nil)
		}
		if err != nil {
			return movement, err
		}
		var unitID *string
		var tracked, allowsDecimal, traceable bool
		err = tx.QueryRow(ctx, `SELECT v.base_unit_id::text,v.is_stock_tracked,COALESCE(u.allows_decimal,true),
   COALESCE(p.track_batches OR p.track_expiry OR p.track_serials OR p.track_unique_assets,false)
   FROM product_variants v JOIN products product ON product.merchant_id=v.merchant_id AND product.id=v.product_id AND product.is_active
   LEFT JOIN unit_definitions u ON u.merchant_id=v.merchant_id AND u.id=v.base_unit_id
   LEFT JOIN variant_inventory_policies p ON p.merchant_id=v.merchant_id AND p.variant_id=v.id
   WHERE v.merchant_id=$1::uuid AND v.id=$2::uuid FOR SHARE OF v`, c.MerchantID, r.VariantID).Scan(&unitID, &tracked, &allowsDecimal, &traceable)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !tracked {
			return movement, app.Validation("Choose an active product with inventory tracking enabled.", nil)
		}
		if err != nil {
			return movement, err
		}
		if traceable {
			return movement, app.Validation("Batch, expiry, serial and unique-asset stock requires a traceable reduction workflow.", nil)
		}
		quantity, _ := new(big.Rat).SetString(r.Quantity)
		if !allowsDecimal && !quantity.IsInt() {
			return movement, app.Validation("This unit only allows whole quantities.", nil)
		}
		var before string
		var enough bool
		err = tx.QueryRow(ctx, `SELECT quantity_on_hand::text,quantity_on_hand-quantity_reserved >= $4::numeric
   FROM inventory_balances WHERE merchant_id=$1::uuid AND variant_id=$2::uuid AND location_id=$3::uuid FOR UPDATE`, c.MerchantID, r.VariantID, r.SourceLocationID, r.Quantity).Scan(&before, &enough)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !enough {
			return movement, app.NewError("INSUFFICIENT_STOCK", "There is not enough unreserved stock at this location.", 409)
		}
		if err != nil {
			return movement, err
		}
		err = tx.QueryRow(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,event_key)
   VALUES($1::uuid,$2::uuid,'ADJUSTMENT',$3::uuid,$4::numeric,$5::uuid,$6)
   RETURNING id,merchant_id,variant_id,movement_type,source_location_id,quantity::text,entered_quantity::text,unit_id,event_key,occurred_at,created_at`, c.MerchantID, r.VariantID, r.SourceLocationID, r.Quantity, unitID, r.EventKey).
			Scan(&movement.ID, &movement.MerchantID, &movement.VariantID, &movement.MovementType, &movement.SourceLocationID, &movement.Quantity, &movement.EnteredQuantity, &movement.UnitID, &movement.EventKey, &movement.OccurredAt, &movement.CreatedAt)
		if err != nil {
			return movement, err
		}
		payload, err := json.Marshal(movement)
		if err != nil {
			return movement, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,before_data,after_data)
   VALUES($1::uuid,$2::uuid,'inventory.stock.reduce','inventory_movement',$3::uuid,
    jsonb_build_object('quantity_on_hand',$4::text),jsonb_build_object('reason',$5::text,'movement',$6::jsonb))`, c.MerchantID, c.MembershipID, movement.ID, before, r.Reason, payload)
		if err != nil {
			return movement, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version) VALUES($1::uuid,'STOCK_REDUCTION',$2::uuid,1)`, c.MerchantID, movement.ID)
		if err != nil {
			return movement, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload)
   VALUES($1::uuid,$2::uuid,nextval('sync_server_sequence_seq'),'STOCK_REDUCTION',$3::uuid,1,'CREATE',$4::jsonb)`, c.MerchantID, shopID, movement.ID, payload)
		return movement, err
	})
}
