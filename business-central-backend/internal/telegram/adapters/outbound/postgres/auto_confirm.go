package postgres

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"context"
)

func (r *Repository) SetAutoConfirm(ctx context.Context, c *authdto.Claims, id string, enabled, admin bool) (tdto.Group, error) {
	g, err := r.GetGroup(ctx, c, id, admin)
	if err != nil {
		return g, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return g, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setClaims(ctx, tx, c); err != nil {
		return g, app.Internal(err)
	}
	var previous bool
	err = tx.QueryRow(ctx, `SELECT auto_confirm_orders FROM telegram_group_connections WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, g.MerchantID, id).Scan(&previous)
	if err != nil {
		return g, noRows(err, "Telegram group")
	}
	if _, err = tx.Exec(ctx, `UPDATE telegram_group_connections SET auto_confirm_orders=$3 WHERE merchant_id=$1::uuid AND id=$2::uuid`, g.MerchantID, id, enabled); err != nil {
		return g, app.Internal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,NULLIF($2,'')::uuid,'TELEGRAM_AUTO_CONFIRM_CHANGED','TELEGRAM_GROUP',$3::uuid,jsonb_build_object('auto_confirm_orders',$4::boolean),jsonb_build_object('auto_confirm_orders',$5::boolean))`, g.MerchantID, c.MembershipID, id, previous, enabled); err != nil {
		return g, app.Internal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return g, app.Internal(err)
	}
	g.AutoConfirmOrders = enabled
	return g, nil
}
