package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func setClaims(ctx context.Context, tx pgx.Tx, c *authdto.Claims) error {
	if c == nil {
		return nil
	}
	serviceFlag := "off"
	if c.PlatformAdmin {
		serviceFlag = "on"
	}
	_, err := tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true),set_config('app.telegram_service',$3,true)`, c.IdentityID, c.MerchantID, serviceFlag)
	return err
}
func setService(ctx context.Context, tx pgx.Tx, merchantID, identityID string) error {
	_, err := tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)`, identityID, merchantID)
	return err
}
func noRows(err error, resource string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return app.NewError("NOT_FOUND", resource+" was not found.", 404)
	}
	return app.Internal(err)
}

func (r *Repository) CreatePairingCode(ctx context.Context, c *authdto.Claims, shopID, codeHash string, expires time.Time) (tdto.PairingCode, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.PairingCode{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setClaims(ctx, tx, c); err != nil {
		return tdto.PairingCode{}, app.Internal(err)
	}
	var result tdto.PairingCode
	err = tx.QueryRow(ctx, `WITH valid_shop AS (SELECT s.id FROM shops s WHERE s.merchant_id=$1::uuid AND s.id=$2::uuid AND s.is_active AND EXISTS(SELECT 1 FROM merchant_modules mm WHERE mm.merchant_id=s.merchant_id AND mm.module_code='telegram_automation' AND mm.status IN ('ENABLED','TRIAL')) AND EXISTS(SELECT 1 FROM shop_modules sm WHERE sm.merchant_id=s.merchant_id AND sm.shop_id=s.id AND sm.module_code='telegram_automation') AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$3::uuid) IS NULL OR s.id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$3::uuid))), revoked AS (UPDATE telegram_pairing_codes SET status='REVOKED' WHERE merchant_id=$1::uuid AND shop_id=$2::uuid AND status='ACTIVE') INSERT INTO telegram_pairing_codes(merchant_id,shop_id,code_hash,created_by,expires_at) SELECT $1::uuid,id,$4,$3::uuid,$5 FROM valid_shop RETURNING id,shop_id,status,expires_at`, c.MerchantID, shopID, c.MembershipID, codeHash, expires).Scan(&result.ID, &result.ShopID, &result.Status, &result.ExpiresAt)
	if err != nil {
		return result, noRows(err, "Shop")
	}
	_, _ = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'TELEGRAM_PAIRING_CODE_CREATED','TELEGRAM_PAIRING_CODE',$3,jsonb_build_object('shop_id',$4::text,'expires_at',$5::text))`, c.MerchantID, c.MembershipID, result.ID, result.ShopID, result.ExpiresAt)
	if err = tx.Commit(ctx); err != nil {
		return result, app.Internal(err)
	}
	return result, nil
}

const groupSelect = `SELECT g.id,g.merchant_id,COALESCE(m.name,''),g.shop_id,COALESCE(s.name,''),g.telegram_chat_id,g.group_title,g.group_type,g.group_username,g.creator_telegram_user_id,g.creator_display_name_snapshot,g.creator_username_snapshot,COALESCE(um.display_name,g.connected_by::text),g.connection_status,g.bot_membership_status,g.bot_admin_status,g.bot_permission_snapshot,g.member_count,g.first_seen_at,g.connected_at,g.last_seen_at,g.last_webhook_at,g.last_refreshed_at,g.last_successful_api_call_at,g.last_error,g.disconnected_at FROM telegram_group_connections g JOIN merchants m ON m.id=g.merchant_id JOIN shops s ON s.merchant_id=g.merchant_id AND s.id=g.shop_id LEFT JOIN user_memberships um ON um.merchant_id=g.merchant_id AND um.id=g.connected_by`

func scanGroup(row pgx.Row) (g tdto.Group, err error) {
	err = row.Scan(&g.ID, &g.MerchantID, &g.MerchantName, &g.ShopID, &g.ShopName, &g.TelegramChatID, &g.GroupTitle, &g.GroupType, &g.GroupUsername, &g.CreatorTelegramUserID, &g.CreatorDisplayName, &g.CreatorUsername, &g.ConnectedBy, &g.ConnectionStatus, &g.BotMembershipStatus, &g.BotAdminStatus, &g.BotPermissions, &g.MemberCount, &g.FirstSeenAt, &g.ConnectedAt, &g.LastSeenAt, &g.LastWebhookAt, &g.LastRefreshedAt, &g.LastSuccessfulAPICallAt, &g.LastError, &g.DisconnectedAt)
	return
}
func scanGroups(rows pgx.Rows) ([]tdto.Group, error) {
	defer rows.Close()
	out := []tdto.Group{}
	for rows.Next() {
		g, e := scanGroup(rows)
		if e != nil {
			return nil, e
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *Repository) ListGroups(ctx context.Context, c *authdto.Claims, shopID string, admin bool) ([]tdto.Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setClaims(ctx, tx, c); err != nil {
		return nil, app.Internal(err)
	}
	where := ` WHERE ($1='' OR g.shop_id=$1::uuid)`
	args := []any{shopID}
	if !admin {
		where += ` AND g.merchant_id=$2::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid) IS NULL OR g.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid))`
		args = append(args, c.MerchantID, c.MembershipID)
	}
	rows, err := tx.Query(ctx, groupSelect+where+` ORDER BY g.last_seen_at DESC`, args...)
	if err != nil {
		return nil, app.Internal(err)
	}
	items, err := scanGroups(rows)
	if err != nil {
		return nil, app.Internal(err)
	}
	return items, nil
}
func (r *Repository) GetGroup(ctx context.Context, c *authdto.Claims, id string, admin bool) (tdto.Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setClaims(ctx, tx, c); err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	query := groupSelect + ` WHERE g.id=$1::uuid`
	args := []any{id}
	if !admin {
		query += ` AND g.merchant_id=$2::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid) IS NULL OR g.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid))`
		args = append(args, c.MerchantID, c.MembershipID)
	}
	g, err := scanGroup(tx.QueryRow(ctx, query, args...))
	if err != nil {
		return g, noRows(err, "Telegram group")
	}
	return g, nil
}
func (r *Repository) UpdateGroupStatus(ctx context.Context, c *authdto.Claims, id, status string, admin bool) (tdto.Group, error) {
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
	_, err = tx.Exec(ctx, `UPDATE telegram_group_connections SET connection_status=$2,last_error=NULL WHERE id=$1::uuid`, id, status)
	if err != nil {
		return g, app.Internal(err)
	}
	action := "TELEGRAM_GROUP_PAUSED"
	if status == "ACTIVE" {
		action = "TELEGRAM_GROUP_RESUMED"
	}
	_, _ = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1,NULLIF($2,'')::uuid,$3,'TELEGRAM_GROUP',$4,jsonb_build_object('status',$5))`, g.MerchantID, c.MembershipID, action, id, status)
	if err = tx.Commit(ctx); err != nil {
		return g, app.Internal(err)
	}
	g.ConnectionStatus = status
	return g, nil
}
func (r *Repository) DisconnectGroup(ctx context.Context, c *authdto.Claims, id string, admin bool) error {
	g, err := r.UpdateGroupStatus(ctx, c, id, "PAUSED", admin)
	if err != nil {
		return err
	}
	tx, e := r.pool.Begin(ctx)
	if e != nil {
		return app.Internal(e)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	tag, e := tx.Exec(ctx, `UPDATE telegram_group_connections SET connection_status='REVOKED',disconnected_at=now() WHERE id=$1::uuid`, id)
	if e != nil {
		return app.Internal(e)
	}
	if tag.RowsAffected() == 0 {
		return app.NewError("NOT_FOUND", "Telegram group was not found.", 404)
	}
	_, _ = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id) VALUES($1,NULLIF($2,'')::uuid,'TELEGRAM_GROUP_DISCONNECTED','TELEGRAM_GROUP',$3); INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1,'TELEGRAM_GROUP_DISCONNECTED','TELEGRAM_GROUP',$3,'telegram-group-disconnected:'||$3::text,'{}') ON CONFLICT(merchant_id,event_key) DO NOTHING`, g.MerchantID, c.MembershipID, id)
	return tx.Commit(ctx)
}

func (r *Repository) ListUsers(ctx context.Context, c *authdto.Claims, id string, admin bool) ([]tdto.GroupUser, error) {
	if _, err := r.GetGroup(ctx, c, id, admin); err != nil {
		return nil, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	rows, err := tx.Query(ctx, `SELECT telegram_user_id,display_name_snapshot,username_snapshot,telegram_role,can_create_orders,first_seen_at,last_seen_at FROM telegram_group_users WHERE connection_id=$1::uuid ORDER BY last_seen_at DESC`, id)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer rows.Close()
	out := []tdto.GroupUser{}
	for rows.Next() {
		var u tdto.GroupUser
		if e := rows.Scan(&u.TelegramUserID, &u.DisplayName, &u.Username, &u.TelegramRole, &u.CanCreateOrders, &u.FirstSeenAt, &u.LastSeenAt); e != nil {
			return nil, app.Internal(e)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
func (r *Repository) RevokeSeller(ctx context.Context, c *authdto.Claims, id string, userID int64, admin bool) error {
	g, err := r.GetGroup(ctx, c, id, admin)
	if err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	tag, err := tx.Exec(ctx, `UPDATE telegram_group_users SET can_create_orders=FALSE,permission_revoked_at=now() WHERE merchant_id=$1::uuid AND connection_id=$2::uuid AND telegram_user_id=$3`, g.MerchantID, id, userID)
	if err != nil {
		return app.Internal(err)
	}
	if tag.RowsAffected() == 0 {
		return app.NewError("NOT_FOUND", "Telegram user was not found.", 404)
	}
	_, _ = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1,NULLIF($2,'')::uuid,'TELEGRAM_SELLER_PERMISSION_REVOKED','TELEGRAM_GROUP',$3,jsonb_build_object('telegram_user_id',$4))`, g.MerchantID, c.MembershipID, id, userID)
	return tx.Commit(ctx)
}

func (r *Repository) BeginUpdate(ctx context.Context, id int64, kind string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `INSERT INTO telegram_webhook_updates(update_id,update_kind) VALUES($1,$2) ON CONFLICT DO NOTHING`, id, kind)
	if err != nil {
		return false, app.Internal(err)
	}
	return tag.RowsAffected() == 1, nil
}
func (r *Repository) CompleteUpdate(ctx context.Context, id int64, processingErr error) error {
	var msg *string
	if processingErr != nil {
		s := processingErr.Error()
		if len(s) > 1000 {
			s = s[:1000]
		}
		msg = &s
	}
	_, err := r.pool.Exec(ctx, `UPDATE telegram_webhook_updates SET processed_at=now(),last_error=$2 WHERE update_id=$1`, id, msg)
	return err
}

func (r *Repository) ExpireDrafts(ctx context.Context) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	_, err = tx.Exec(ctx, `WITH due AS (SELECT s.merchant_id,s.order_id FROM telegram_order_sources s JOIN orders o ON o.merchant_id=s.merchant_id AND o.id=s.order_id WHERE s.expires_at<=now() AND s.expired_at IS NULL AND o.status='DRAFT' FOR UPDATE OF o), released AS (UPDATE inventory_reservations r SET status='RELEASED',released_at=now() FROM order_lines l,due d WHERE l.merchant_id=d.merchant_id AND l.order_id=d.order_id AND r.merchant_id=l.merchant_id AND r.order_line_id=l.id AND r.status='ACTIVE') UPDATE orders o SET status='CANCELLED' FROM due d WHERE o.merchant_id=d.merchant_id AND o.id=d.order_id;
	WITH expired AS (UPDATE telegram_order_sources s SET expired_at=now() FROM orders o WHERE o.merchant_id=s.merchant_id AND o.id=s.order_id AND s.expires_at<=now() AND s.expired_at IS NULL AND o.status='CANCELLED' RETURNING s.merchant_id,s.order_id,s.telegram_group_connection_id) INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) SELECT merchant_id,'TELEGRAM_ORDER_EXPIRED','ORDER',order_id,'telegram-order-expired:'||order_id::text,jsonb_build_object('connection_id',telegram_group_connection_id::text) FROM expired ON CONFLICT(merchant_id,event_key) DO NOTHING`)
	if err != nil {
		return app.Internal(err)
	}
	return tx.Commit(ctx)
}

func (r *Repository) ConnectGroup(ctx context.Context, in outbound.ConnectionInput) (tdto.Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setService(ctx, tx, "", ""); err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	var codeID, merchantID, shopID, membershipID, identityID string
	err = tx.QueryRow(ctx, `SELECT pc.id,pc.merchant_id,pc.shop_id,pc.created_by,um.identity_id FROM telegram_pairing_codes pc JOIN user_memberships um ON um.merchant_id=pc.merchant_id AND um.id=pc.created_by WHERE pc.code_hash=$1 AND pc.status='ACTIVE' AND pc.expires_at>now() AND um.is_active FOR UPDATE OF pc`, in.CodeHash).Scan(&codeID, &merchantID, &shopID, &membershipID, &identityID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tdto.Group{}, app.NewError("INVALID_PAIRING_CODE", "The pairing code is invalid, expired, or already used.", 400)
		}
		return tdto.Group{}, app.Internal(err)
	}
	if err = setService(ctx, tx, merchantID, identityID); err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	permissions, _ := json.Marshal(in.BotPermissions)
	var connectionID string
	err = tx.QueryRow(ctx, `INSERT INTO telegram_group_connections(merchant_id,shop_id,telegram_chat_id,group_title,group_type,group_username,creator_telegram_user_id,creator_display_name_snapshot,creator_username_snapshot,connected_by,connection_status,bot_membership_status,bot_admin_status,bot_permission_snapshot,member_count,connected_at,last_refreshed_at,last_successful_api_call_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),NULLIF($9,''),$10,'ACTIVE',$11,$12,$13,$14,now(),now(),now()) RETURNING id`, merchantID, shopID, in.ChatID, in.Title, in.Type, in.Username, in.CreatorUserID, in.CreatorDisplayName, in.CreatorUsername, membershipID, in.BotStatus, in.BotIsAdmin, permissions, in.MemberCount).Scan(&connectionID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "telegram_group_connections_telegram_chat_id_key" {
			return tdto.Group{}, app.NewError("GROUP_ALREADY_CONNECTED", "This Telegram group is already connected to a shop.", 409)
		}
		return tdto.Group{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_pairing_codes SET status='CONSUMED',consumed_at=now(),consumed_by_connection_id=$2 WHERE id=$1`, codeID, connectionID)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO telegram_group_users(merchant_id,connection_id,telegram_user_id,display_name_snapshot,username_snapshot,telegram_role,can_create_orders) VALUES($1,$2,$3,NULLIF($4,''),NULLIF($5,''),'ADMINISTRATOR',TRUE) ON CONFLICT(merchant_id,connection_id,telegram_user_id) DO UPDATE SET last_seen_at=now(),telegram_role='ADMINISTRATOR'`, merchantID, connectionID, in.CreatorUserID, in.CreatorDisplayName, in.CreatorUsername)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,'TELEGRAM_GROUP_CONNECTED','TELEGRAM_GROUP',$2::uuid,'telegram-group-connected:'||($2::uuid)::text,jsonb_build_object('shop_id',$3::text,'chat_id',$4::bigint))`, merchantID, connectionID, shopID, in.ChatID)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,$2::uuid,'TELEGRAM_GROUP_CONNECTED','TELEGRAM_GROUP',$3::uuid,jsonb_build_object('shop_id',$4::text,'chat_id',$5::bigint))`, merchantID, membershipID, connectionID, shopID, in.ChatID)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	return r.groupService(ctx, connectionID)
}

func (r *Repository) groupService(ctx context.Context, id string) (tdto.Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Group{}, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	g, err := scanGroup(tx.QueryRow(ctx, groupSelect+` WHERE g.id=$1::uuid`, id))
	return g, err
}
func (r *Repository) FindConnectionByChat(ctx context.Context, chatID int64) (tdto.Group, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Group{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	g, err := scanGroup(tx.QueryRow(ctx, groupSelect+` WHERE g.telegram_chat_id=$1 AND g.connection_status<>'REVOKED' AND EXISTS(SELECT 1 FROM merchant_modules mm WHERE mm.merchant_id=g.merchant_id AND mm.module_code='telegram_automation' AND mm.status IN ('ENABLED','TRIAL')) AND EXISTS(SELECT 1 FROM shop_modules sm WHERE sm.merchant_id=g.merchant_id AND sm.shop_id=g.shop_id AND sm.module_code='telegram_automation')`, chatID))
	if err != nil {
		return g, noRows(err, "Telegram group")
	}
	return g, nil
}
func (r *Repository) ObserveUser(ctx context.Context, connectionID string, user tdto.User, role string) (bool, error) {
	g, err := r.groupService(ctx, connectionID)
	if err != nil {
		return false, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setService(ctx, tx, g.MerchantID, ""); err != nil {
		return false, app.Internal(err)
	}
	var allowed bool
	err = tx.QueryRow(ctx, `INSERT INTO telegram_group_users(merchant_id,connection_id,telegram_user_id,display_name_snapshot,username_snapshot,telegram_role) VALUES($1,$2,$3,NULLIF($4,''),NULLIF($5,''),$6) ON CONFLICT(merchant_id,connection_id,telegram_user_id) DO UPDATE SET display_name_snapshot=EXCLUDED.display_name_snapshot,username_snapshot=EXCLUDED.username_snapshot,last_seen_at=now() RETURNING can_create_orders`, g.MerchantID, connectionID, user.ID, user.DisplayName(), user.Username, role).Scan(&allowed)
	if err != nil {
		return false, app.Internal(err)
	}
	_, _ = tx.Exec(ctx, `UPDATE telegram_group_connections SET last_seen_at=now(),last_webhook_at=now() WHERE id=$1`, connectionID)
	if err = tx.Commit(ctx); err != nil {
		return false, app.Internal(err)
	}
	return allowed, nil
}

func (r *Repository) CreateDraft(ctx context.Context, in outbound.DraftInput) (outbound.DraftResult, error) {
	g, err := r.groupService(ctx, in.ConnectionID)
	if err != nil {
		return outbound.DraftResult{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setService(ctx, tx, g.MerchantID, ""); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	var locationID string
	err = tx.QueryRow(ctx, `SELECT id FROM locations WHERE merchant_id=$1::uuid AND shop_id=$2::uuid AND is_active ORDER BY CASE location_type WHEN 'SHOP' THEN 0 ELSE 1 END,id LIMIT 1`, g.MerchantID, g.ShopID).Scan(&locationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return outbound.DraftResult{}, app.NewError("NO_LOCATION", "The shop has no active inventory location.", 409)
		}
		return outbound.DraftResult{}, app.Internal(err)
	}
	type match struct {
		id, productName, variantName, sku, unitID, currency, price string
		stockTracked                                               bool
		onHand, reserved                                           float64
	}
	query := `SELECT pv.id,p.name,pv.name,pv.sku,pv.base_unit_id,pv.is_stock_tracked,pl.currency_code,pp.amount::text,COALESCE(ib.quantity_on_hand,0)::float8,COALESCE(ib.quantity_reserved,0)::float8
		FROM telegram_group_connections g
		JOIN product_variants pv ON pv.merchant_id=g.merchant_id
		JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id AND p.is_active
		JOIN price_lists pl ON pl.merchant_id=pv.merchant_id AND pl.is_default
		JOIN product_prices pp ON pp.merchant_id=pv.merchant_id AND pp.price_list_id=pl.id AND pp.variant_id=pv.id AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now())
		LEFT JOIN inventory_balances ib ON ib.merchant_id=pv.merchant_id AND ib.location_id=$4::uuid AND ib.variant_id=pv.id
		WHERE g.id=$1::uuid AND ($2<>'' OR $3<>'')
		AND ($2='' OR lower(regexp_replace(trim(p.name),'\s+',' ','g'))=$2 OR lower(regexp_replace(trim(pv.name),'\s+',' ','g'))=$2)
		AND ($3='' OR lower(pv.sku)=lower($3))
		ORDER BY pv.id LIMIT 3`
	rows, err := tx.Query(ctx, query, in.ConnectionID, in.ProductName, in.SKU, locationID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	matches := []match{}
	for rows.Next() {
		var m match
		if e := rows.Scan(&m.id, &m.productName, &m.variantName, &m.sku, &m.unitID, &m.stockTracked, &m.currency, &m.price, &m.onHand, &m.reserved); e != nil {
			rows.Close()
			return outbound.DraftResult{}, app.Internal(e)
		}
		matches = append(matches, m)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	if len(matches) == 0 {
		return outbound.DraftResult{}, app.NewError("PRODUCT_NOT_FOUND", "The product was not found.", 404)
	}
	if len(matches) > 1 {
		return outbound.DraftResult{}, app.NewError("AMBIGUOUS_PRODUCT", "Multiple products were found.", 409)
	}
	m := matches[0]
	available := m.onHand - m.reserved
	if m.stockTracked && available <= 0 {
		return outbound.DraftResult{}, app.NewError("NO_STOCK", "There is no more stock for this product.", 409)
	}
	if m.stockTracked && in.Quantity > available {
		return outbound.DraftResult{}, app.NewError("INSUFFICIENT_STOCK", fmt.Sprintf("Only %g is available for this product.", available), 409)
	}
	priceFloat := 0.0
	fmt.Sscan(m.price, &priceFloat)
	total := priceFloat * in.Quantity
	orderID, lineID := uuid.NewString(), uuid.NewString()
	var orderNumber string
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, g.MerchantID+":telegram-order-number"); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	err = tx.QueryRow(ctx, `SELECT 'TG-'||to_char(now(),'YYYYMMDD')||'-'||lpad((count(*)+1)::text,4,'0') FROM orders WHERE merchant_id=$1::uuid AND channel='TELEGRAM' AND created_at::date=current_date`, g.MerchantID).Scan(&orderNumber)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,fulfillment_location_id,order_number,channel,status,currency_code,subtotal,grand_total,placed_at) VALUES($1,$2,$3,$4,'TELEGRAM','DRAFT',$5,$6,$6,now())`, orderID, g.MerchantID, locationID, orderNumber, m.currency, total)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO order_lines(id,merchant_id,order_id,line_number,variant_id,unit_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9)`, lineID, g.MerchantID, orderID, m.id, m.unitID, m.productName, in.Quantity, priceFloat, total)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	if m.stockTracked {
		_, err = tx.Exec(ctx, `INSERT INTO inventory_reservations(merchant_id,order_line_id,location_id,variant_id,quantity,reservation_key) VALUES($1,$2,$3,$4,$5,'telegram-order:'||$6)`, g.MerchantID, lineID, locationID, m.id, in.Quantity, orderID)
		if err != nil {
			return outbound.DraftResult{}, app.NewError("INSUFFICIENT_STOCK", "Available stock changed. Please send the order again.", 409)
		}
	}
	confirmID, cancelID := uuid.NewString(), uuid.NewString()
	_, err = tx.Exec(ctx, `INSERT INTO telegram_order_sources(merchant_id,shop_id,order_id,telegram_group_connection_id,telegram_chat_id,telegram_message_id,telegram_user_id,telegram_update_id,confirmation_callback_id,cancellation_callback_id,original_command,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, g.MerchantID, g.ShopID, orderID, g.ID, in.ChatID, in.MessageID, in.UserID, in.UpdateID, confirmID, cancelID, in.OriginalCommand, in.ExpiresAt)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO telegram_callback_tokens(id,merchant_id,connection_id,order_id,action,token_hash,expires_at) VALUES($1,$2,$3,$4,'CONFIRM',$5,$6),($7,$2,$3,$4,'CANCEL',$8,$6)`, confirmID, g.MerchantID, g.ID, orderID, in.ConfirmTokenHash, in.ExpiresAt, cancelID, in.CancelTokenHash)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,'TELEGRAM_ORDER_CREATED','ORDER',$2::uuid,'telegram-order-created:'||($2::uuid)::text,jsonb_build_object('connection_id',$3::text))`, g.MerchantID, orderID, g.ID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'TELEGRAM_DRAFT_ORDER_CREATED','ORDER',$2::uuid,jsonb_build_object('connection_id',$3::text,'telegram_user_id',$4::bigint))`, g.MerchantID, orderID, g.ID, in.UserID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	return outbound.DraftResult{Order: tdto.Order{ID: orderID, MerchantID: g.MerchantID, ShopID: g.ShopID, ConnectionID: g.ID, GroupTitle: g.GroupTitle, OrderNumber: orderNumber, Status: "DRAFT", CurrencyCode: m.currency, GrandTotal: fmt.Sprintf("%.2f", total), Description: m.productName, Quantity: fmt.Sprintf("%g", in.Quantity), UnitPrice: m.price, TelegramUserID: in.UserID, CreatedAt: time.Now().UTC(), ExpiresAt: in.ExpiresAt}, ConfirmCallbackID: confirmID, CancelCallbackID: cancelID}, nil
}

func (r *Repository) StoreBotResponse(ctx context.Context, orderID string, messageID int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	var merchantID string
	if err = tx.QueryRow(ctx, `SELECT merchant_id FROM telegram_order_sources WHERE order_id=$1::uuid`, orderID).Scan(&merchantID); err != nil {
		return err
	}
	_ = setService(ctx, tx, merchantID, "")
	_, err = tx.Exec(ctx, `UPDATE telegram_order_sources SET bot_response_message_id=$2 WHERE order_id=$1::uuid`, orderID, messageID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (r *Repository) ResolveCallback(ctx context.Context, tokenHash string, chatID, userID int64) (outbound.CallbackResolution, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return outbound.CallbackResolution{}, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	var x outbound.CallbackResolution
	err = tx.QueryRow(ctx, `SELECT t.merchant_id,t.connection_id,t.order_id,t.action,o.status,s.telegram_chat_id,COALESCE(s.bot_response_message_id,0) FROM telegram_callback_tokens t JOIN orders o ON o.merchant_id=t.merchant_id AND o.id=t.order_id JOIN telegram_order_sources s ON s.merchant_id=t.merchant_id AND s.order_id=t.order_id WHERE t.token_hash=$1 AND t.expires_at>now() AND t.consumed_at IS NULL AND s.telegram_chat_id=$2`, tokenHash, chatID).Scan(&x.MerchantID, &x.ConnectionID, &x.OrderID, &x.Action, &x.CurrentStatus, &x.ChatID, &x.BotResponseMessageID)
	if err != nil {
		return x, noRows(err, "Callback")
	}
	return x, nil
}

func (r *Repository) FindOrderForCancellation(ctx context.Context, chatID int64, orderNumber string, userID int64, isAdmin bool) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	var id string
	err = tx.QueryRow(ctx, `SELECT s.order_id FROM telegram_order_sources s JOIN orders o ON o.merchant_id=s.merchant_id AND o.id=s.order_id WHERE s.telegram_chat_id=$1 AND lower(o.order_number)=lower($2) AND o.status='DRAFT' AND ($4 OR s.telegram_user_id=$3)`, chatID, strings.TrimSpace(orderNumber), userID, isAdmin).Scan(&id)
	if err != nil {
		return "", noRows(err, "Telegram draft order")
	}
	return id, nil
}

func (r *Repository) TransitionOrder(ctx context.Context, c *authdto.Claims, orderID, action, source string, telegramUserID int64, admin bool) (tdto.Order, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if c != nil {
		_ = setClaims(ctx, tx, c)
	} else {
		_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	}
	var merchantID, status, locationID, lineID, variantID, orderNumber, currency, connectionID, groupTitle, description, quantity, unitPrice, total string
	var shopID string
	var chatID, botResponseMessageID int64
	query := `SELECT o.merchant_id,o.status,o.fulfillment_location_id,ol.id,ol.variant_id,o.order_number,o.currency_code,s.telegram_group_connection_id,g.group_title,ol.description,ol.quantity::text,ol.unit_price::text,o.grand_total::text,s.shop_id,s.telegram_chat_id,COALESCE(s.bot_response_message_id,0) FROM orders o JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id JOIN telegram_order_sources s ON s.merchant_id=o.merchant_id AND s.order_id=o.id JOIN telegram_group_connections g ON g.merchant_id=s.merchant_id AND g.id=s.telegram_group_connection_id WHERE o.id=$1::uuid FOR UPDATE OF o`
	err = tx.QueryRow(ctx, query, orderID).Scan(&merchantID, &status, &locationID, &lineID, &variantID, &orderNumber, &currency, &connectionID, &groupTitle, &description, &quantity, &unitPrice, &total, &shopID, &chatID, &botResponseMessageID)
	if err != nil {
		return tdto.Order{}, noRows(err, "Telegram order")
	}
	if c == nil {
		if err = setService(ctx, tx, merchantID, ""); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	} else if !admin && merchantID != c.MerchantID {
		return tdto.Order{}, app.NewError("FORBIDDEN", "The order belongs to another merchant.", 403)
	}
	if status != "DRAFT" {
		return tdto.Order{}, app.NewError("ORDER_ALREADY_PROCESSED", "This order has already been confirmed or cancelled by another administrator.", 409)
	}
	newStatus, eventType, auditAction := "CONFIRMED", "TELEGRAM_ORDER_CONFIRMED", "TELEGRAM_ORDER_CONFIRMED"
	if action == "CANCEL" {
		newStatus, eventType, auditAction = "CANCELLED", "TELEGRAM_ORDER_CANCELLED", "TELEGRAM_ORDER_CANCELLED"
	}
	if action == "CONFIRM" {
		// The movement integrity trigger accepts sales only for confirmed orders.
		// This remains inside the same transaction, so any reservation, FIFO, or
		// accounting failure rolls the status change back as well.
		if _, err = tx.Exec(ctx, `UPDATE orders SET status='CONFIRMED' WHERE id=$1::uuid`, orderID); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		var reservationID, reservationStatus string
		var reservationQuantity float64
		err = tx.QueryRow(ctx, `SELECT id,status,quantity::float8 FROM inventory_reservations WHERE merchant_id=$1::uuid AND order_line_id=$2::uuid FOR UPDATE`, merchantID, lineID).Scan(&reservationID, &reservationStatus, &reservationQuantity)
		if err == nil {
			if reservationStatus != "ACTIVE" {
				return tdto.Order{}, app.NewError("RESERVATION_INACTIVE", "The inventory reservation is no longer active.", 409)
			}
			_, err = tx.Exec(ctx, `UPDATE inventory_reservations SET status='CONSUMED',released_at=now() WHERE id=$1::uuid`, reservationID)
			if err != nil {
				return tdto.Order{}, app.Internal(err)
			}
			_, err = tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,order_line_id,event_key) VALUES($1,$2,'SALE',$3,$4,$5,'telegram-sale:'||$6::text)`, merchantID, variantID, locationID, reservationQuantity, lineID, orderID)
			if err != nil {
				return tdto.Order{}, app.NewError("INSUFFICIENT_STOCK", "Stock could not be confirmed for this order.", 409)
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return tdto.Order{}, app.Internal(err)
		}
		_, err = tx.Exec(ctx, `INSERT INTO accounting_events(merchant_id,event_type,source_order_id,event_key) VALUES($1::uuid,'ORDER_CONFIRMED',$2::uuid,'telegram-order-confirmed:'||($2::uuid)::text) ON CONFLICT(merchant_id,event_key) DO NOTHING`, merchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	} else {
		_, err = tx.Exec(ctx, `UPDATE inventory_reservations SET status='RELEASED',released_at=now() WHERE merchant_id=$1::uuid AND order_line_id=$2::uuid AND status='ACTIVE'`, merchantID, lineID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	}
	_, err = tx.Exec(ctx, `UPDATE orders SET status=$2 WHERE id=$1::uuid`, orderID, newStatus)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_order_sources SET confirmed_at=CASE WHEN $2::text='CONFIRMED' THEN now() ELSE confirmed_at END,cancelled_at=CASE WHEN $2::text='CANCELLED' THEN now() ELSE cancelled_at END WHERE order_id=$1::uuid`, orderID, newStatus)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_callback_tokens SET consumed_at=now(),consumed_by_telegram_user_id=NULLIF($2::bigint,0) WHERE order_id=$1::uuid AND consumed_at IS NULL`, orderID, telegramUserID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	actor := any(nil)
	if c != nil && c.MembershipID != "" {
		actor = c.MembershipID
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,$2::uuid,$3::text,'ORDER',$4::uuid,jsonb_build_object('source',$5::text,'telegram_user_id',NULLIF($6::bigint,0)))`, merchantID, actor, auditAction, orderID, source, telegramUserID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,$2::text,'ORDER',$3::uuid,lower($2::text)||':'||($3::uuid)::text,jsonb_build_object('connection_id',$4::text,'chat_id',$5::bigint)) ON CONFLICT(merchant_id,event_key) DO NOTHING`, merchantID, eventType, orderID, connectionID, chatID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	return tdto.Order{ID: orderID, MerchantID: merchantID, ShopID: shopID, ConnectionID: connectionID, GroupTitle: groupTitle, OrderNumber: orderNumber, Status: newStatus, CurrencyCode: currency, GrandTotal: total, Description: description, Quantity: quantity, UnitPrice: unitPrice, TelegramChatID: chatID, BotResponseMessageID: botResponseMessageID}, nil
}

func (r *Repository) ListOrders(ctx context.Context, c *authdto.Claims, connectionID string, admin bool) ([]tdto.Order, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	query := `SELECT o.id,o.merchant_id,s.shop_id,s.telegram_group_connection_id,g.group_title,o.order_number,CASE WHEN s.expired_at IS NOT NULL THEN 'EXPIRED' ELSE o.status END,o.currency_code,o.grand_total::text,ol.description,ol.quantity::text,ol.unit_price::text,s.telegram_user_id,o.created_at,s.expires_at,g.last_error FROM telegram_order_sources s JOIN orders o ON o.merchant_id=s.merchant_id AND o.id=s.order_id JOIN telegram_group_connections g ON g.merchant_id=s.merchant_id AND g.id=s.telegram_group_connection_id JOIN LATERAL(SELECT description,quantity,unit_price FROM order_lines WHERE merchant_id=o.merchant_id AND order_id=o.id ORDER BY line_number LIMIT 1) ol ON true WHERE ($1='' OR s.telegram_group_connection_id=$1::uuid)`
	args := []any{connectionID}
	if !admin {
		query += ` AND o.merchant_id=$2::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid) IS NULL OR s.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid))`
		args = append(args, c.MerchantID, c.MembershipID)
	}
	query += ` ORDER BY o.created_at DESC LIMIT 500`
	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer rows.Close()
	out := []tdto.Order{}
	for rows.Next() {
		var o tdto.Order
		if e := rows.Scan(&o.ID, &o.MerchantID, &o.ShopID, &o.ConnectionID, &o.GroupTitle, &o.OrderNumber, &o.Status, &o.CurrencyCode, &o.GrandTotal, &o.Description, &o.Quantity, &o.UnitPrice, &o.TelegramUserID, &o.CreatedAt, &o.ExpiresAt, &o.LastError); e != nil {
			return nil, app.Internal(e)
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (r *Repository) UpdateConnectionHealth(ctx context.Context, chatID int64, status string, admin bool, permissions map[string]any, lastError string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = setService(ctx, tx, "", ""); err != nil {
		return app.Internal(err)
	}
	payload, _ := json.Marshal(permissions)
	var merchantID, connectionID string
	err = tx.QueryRow(ctx, `UPDATE telegram_group_connections SET bot_membership_status=$2::text,bot_admin_status=$3,bot_permission_snapshot=$4,last_webhook_at=now(),last_seen_at=now(),last_error=NULLIF($5,''),connection_status=CASE WHEN lower($2::text) IN ('left','kicked') THEN 'ERROR' WHEN NOT $3 THEN 'ERROR' ELSE connection_status END WHERE telegram_chat_id=$1 RETURNING merchant_id,id`, chatID, status, admin, payload, lastError).Scan(&merchantID, &connectionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	event := "TELEGRAM_GROUP_HEALTH_CHANGED"
	audit := "TELEGRAM_BOT_DEMOTED"
	if strings.EqualFold(status, "left") || strings.EqualFold(status, "kicked") {
		audit = "TELEGRAM_BOT_REMOVED"
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,$2::text,'TELEGRAM_GROUP',$3::uuid,$6::text,jsonb_build_object('bot_status',$4::text,'bot_admin',$5::boolean))`, merchantID, event, connectionID, status, admin, "telegram-group-health:"+uuid.NewString())
	if err != nil {
		return app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,$2::text,'TELEGRAM_GROUP',$3::uuid,jsonb_build_object('bot_status',$4::text,'bot_admin',$5::boolean))`, merchantID, audit, connectionID, status, admin)
	if err != nil {
		return app.Internal(err)
	}
	return tx.Commit(ctx)
}
func (r *Repository) RefreshConnection(ctx context.Context, c *authdto.Claims, id string, adminAccess bool, title, status string, admin bool, permissions map[string]any, count *int, refreshErr error) (tdto.Group, error) {
	g, err := r.GetGroup(ctx, c, id, adminAccess)
	if err != nil {
		return g, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return g, err
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	payload, _ := json.Marshal(permissions)
	var errText *string
	if refreshErr != nil {
		x := refreshErr.Error()
		errText = &x
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_group_connections SET group_title=COALESCE(NULLIF($2,''),group_title),bot_membership_status=COALESCE(NULLIF($3,''),bot_membership_status),bot_admin_status=$4,bot_permission_snapshot=$5,member_count=COALESCE($6,member_count),last_refreshed_at=now(),last_successful_api_call_at=CASE WHEN $7::text IS NULL THEN now() ELSE last_successful_api_call_at END,last_error=$7 WHERE id=$1::uuid`, id, title, status, admin, payload, count, errText)
	if err != nil {
		return g, app.Internal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return g, app.Internal(err)
	}
	return r.GetGroup(ctx, c, id, adminAccess)
}

func (r *Repository) ClaimOutboxDeliveries(ctx context.Context, limit int) ([]outbound.OutboxDelivery, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	rows, err := tx.Query(ctx, `WITH claimed AS (SELECT e.id FROM outbox_events e WHERE e.event_type IN ('TELEGRAM_ORDER_CONFIRMED','TELEGRAM_ORDER_CANCELLED','TELEGRAM_ORDER_EXPIRED') AND e.status IN ('PENDING','FAILED') AND e.next_attempt_at<=now() ORDER BY e.created_at FOR UPDATE SKIP LOCKED LIMIT $1), marked AS (UPDATE outbox_events e SET status='PROCESSING',attempts=attempts+1 FROM claimed c WHERE e.id=c.id RETURNING e.id,e.merchant_id,e.aggregate_id) SELECT m.id,o.order_number,CASE e.event_type WHEN 'TELEGRAM_ORDER_EXPIRED' THEN 'EXPIRED' ELSE o.status END,s.telegram_chat_id,COALESCE(s.bot_response_message_id,0) FROM marked m JOIN outbox_events e ON e.id=m.id JOIN orders o ON o.merchant_id=m.merchant_id AND o.id=m.aggregate_id JOIN telegram_order_sources s ON s.merchant_id=m.merchant_id AND s.order_id=m.aggregate_id`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []outbound.OutboxDelivery{}
	for rows.Next() {
		var d outbound.OutboxDelivery
		if err = rows.Scan(&d.EventID, &d.OrderNumber, &d.Status, &d.ChatID, &d.MessageID); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}
func (r *Repository) FinishOutboxDelivery(ctx context.Context, id string, deliveryErr error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT set_config('app.telegram_service','on',true)`)
	status, lastError := "PUBLISHED", any(nil)
	if deliveryErr != nil {
		status = "FAILED"
		message := deliveryErr.Error()
		if len(message) > 1000 {
			message = message[:1000]
		}
		lastError = message
	}
	_, err = tx.Exec(ctx, `UPDATE outbox_events SET status=$2::text,last_error=$3,published_at=CASE WHEN $2::text='PUBLISHED' THEN now() ELSE published_at END,next_attempt_at=CASE WHEN $2::text='FAILED' THEN now()+(LEAST(attempts,10)||' minutes')::interval ELSE next_attempt_at END WHERE id=$1::uuid`, id, status, lastError)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_group_connections g SET last_error=$3,last_successful_api_call_at=CASE WHEN $2::text='PUBLISHED' THEN now() ELSE last_successful_api_call_at END FROM outbox_events e JOIN telegram_order_sources s ON s.merchant_id=e.merchant_id AND s.order_id=e.aggregate_id WHERE e.id=$1::uuid AND g.merchant_id=s.merchant_id AND g.id=s.telegram_group_connection_id`, id, status, lastError)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) ListAudit(ctx context.Context, c *authdto.Claims, connectionID string) ([]tdto.AuditEvent, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	rows, err := tx.Query(ctx, `SELECT a.id,a.action,a.entity_type,a.entity_id,a.actor_membership_id,COALESCE(a.after_data,'{}'::jsonb),a.occurred_at FROM audit_events a JOIN telegram_group_connections g ON g.merchant_id=a.merchant_id AND g.id=$1::uuid WHERE a.merchant_id=g.merchant_id AND (a.entity_id=g.id OR a.entity_id IN (SELECT s.order_id FROM telegram_order_sources s WHERE s.merchant_id=g.merchant_id AND s.telegram_group_connection_id=g.id)) ORDER BY a.occurred_at DESC LIMIT 250`, connectionID)
	if err != nil {
		return nil, app.Internal(err)
	}
	defer rows.Close()
	out := []tdto.AuditEvent{}
	for rows.Next() {
		var a tdto.AuditEvent
		if err = rows.Scan(&a.ID, &a.Action, &a.EntityType, &a.EntityID, &a.ActorMembershipID, &a.AfterData, &a.OccurredAt); err != nil {
			return nil, app.Internal(err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func (r *Repository) RetrySynchronization(ctx context.Context, c *authdto.Claims, connectionID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return app.Internal(err)
	}
	defer tx.Rollback(ctx)
	_ = setClaims(ctx, tx, c)
	_, err = tx.Exec(ctx, `UPDATE outbox_events e SET status='PENDING',next_attempt_at=now(),last_error=NULL FROM telegram_order_sources s WHERE s.merchant_id=e.merchant_id AND s.order_id=e.aggregate_id AND s.telegram_group_connection_id=$1::uuid AND e.event_type IN ('TELEGRAM_ORDER_CONFIRMED','TELEGRAM_ORDER_CANCELLED','TELEGRAM_ORDER_EXPIRED') AND e.status='FAILED'; UPDATE telegram_group_connections SET last_error=NULL WHERE id=$1::uuid; INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id) SELECT merchant_id,NULLIF($2,'')::uuid,'TELEGRAM_SYNCHRONIZATION_RETRIED','TELEGRAM_GROUP',id FROM telegram_group_connections WHERE id=$1::uuid`, connectionID, c.MembershipID)
	if err != nil {
		return app.Internal(err)
	}
	return tx.Commit(ctx)
}

var _ = strings.TrimSpace
