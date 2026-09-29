package postgres

import (
	"context"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	tdto "business-central-backend/internal/telegram/application/dto"
	"github.com/jackc/pgx/v5"
)

const orderItemsLateral = ` JOIN LATERAL (
	SELECT COALESCE(jsonb_agg(jsonb_build_object('line_number',ol.line_number,'variant_id',ol.variant_id,'sku',COALESCE(pv.sku,''),'description',ol.description,'quantity',ol.quantity::text,'unit_price',ol.unit_price::text,'line_total',ol.line_total::text) ORDER BY ol.line_number),'[]'::jsonb) AS items
	FROM order_lines ol LEFT JOIN product_variants pv ON pv.merchant_id=ol.merchant_id AND pv.id=ol.variant_id
	WHERE ol.merchant_id=o.merchant_id AND ol.order_id=o.id
) lines ON true `

const orderPaymentStatusSQL = `CASE WHEN o.status='CANCELLED' THEN 'Cancelled' WHEN o.status='REFUNDED' THEN 'Refunded' WHEN EXISTS(SELECT 1 FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id AND p.status='CAPTURED') OR (o.grand_total=0 AND o.status<>'DRAFT') THEN 'Paid' ELSE 'Pending' END`

func (r *Repository) TransitionOrder(ctx context.Context, c *authdto.Claims, orderID, action, source string, telegramUserID int64, admin bool) (tdto.Order, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	order, err := r.transitionOrder(ctx, tx, c, orderID, action, source, telegramUserID, admin)
	if err != nil {
		return tdto.Order{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	return order, nil
}

func (r *Repository) transitionOrder(ctx context.Context, tx pgx.Tx, c *authdto.Claims, orderID, action, source string, telegramUserID int64, admin bool) (tdto.Order, error) {
	if action != "CONFIRM" && action != "CANCEL" {
		return tdto.Order{}, app.NewError("VALIDATION_ERROR", "Action must be CONFIRM or CANCEL.", 400)
	}
	var err error
	if c != nil {
		err = setClaims(ctx, tx, c)
	} else {
		err = setService(ctx, tx, "", "")
	}
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	var order tdto.Order
	var locationID string
	query := `SELECT o.id,o.merchant_id,o.status,o.fulfillment_location_id,o.order_number,o.currency_code,o.grand_total::text,s.telegram_group_connection_id,g.group_title,s.shop_id,s.telegram_chat_id,COALESCE(s.bot_response_message_id,0),NULLIF(o.billing_address->>'name',''),lines.items,s.telegram_user_id,o.created_at,s.expires_at,s.auto_confirmed,` + orderPaymentStatusSQL + ` FROM orders o JOIN telegram_order_sources s ON s.merchant_id=o.merchant_id AND s.order_id=o.id JOIN telegram_group_connections g ON g.merchant_id=s.merchant_id AND g.id=s.telegram_group_connection_id` + orderItemsLateral + ` WHERE o.id=$1::uuid`
	args := []any{orderID}
	if c != nil && !admin {
		query += ` AND o.merchant_id=$2::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid) IS NULL OR s.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$2::uuid AND id=$3::uuid))`
		args = append(args, c.MerchantID, c.MembershipID)
	}
	query += ` FOR UPDATE OF o`
	err = tx.QueryRow(ctx, query, args...).Scan(&order.ID, &order.MerchantID, &order.Status, &locationID, &order.OrderNumber, &order.CurrencyCode, &order.GrandTotal, &order.ConnectionID, &order.GroupTitle, &order.ShopID, &order.TelegramChatID, &order.BotResponseMessageID, &order.CustomerName, &order.Items, &order.TelegramUserID, &order.CreatedAt, &order.ExpiresAt, &order.AutoConfirmed, &order.PaymentStatus)
	if err != nil {
		return tdto.Order{}, noRows(err, "Telegram order")
	}
	if c == nil {
		if err = setService(ctx, tx, order.MerchantID, ""); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	}
	if order.Status != "DRAFT" {
		return tdto.Order{}, app.NewError("ORDER_ALREADY_PROCESSED", "This order has already been confirmed or cancelled by another administrator.", 409)
	}
	newStatus, eventType := "CONFIRMED", "TELEGRAM_ORDER_CONFIRMED"
	if action == "CANCEL" {
		newStatus, eventType = "CANCELLED", "TELEGRAM_ORDER_CANCELLED"
	}
	if action == "CONFIRM" {
		// Merchant confirmation also acknowledges payment. Capture the canonical
		// pending payment atomically; never infer payment from an order label.
		_, err = tx.Exec(ctx, `INSERT INTO payments(merchant_id,order_id,method,status,amount,idempotency_key)
		SELECT o.merchant_id,o.id,'Telegram','PENDING',o.grand_total-paid.amount,'telegram-payment:'||o.id::text
		FROM orders o CROSS JOIN LATERAL (SELECT COALESCE(sum(p.amount),0) AS amount FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')) paid
		WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid AND o.grand_total>paid.amount
		ON CONFLICT(merchant_id,idempotency_key) DO NOTHING`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status='CAPTURED',captured_at=now() WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND idempotency_key='telegram-payment:'||$2::uuid::text AND status='PENDING'`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		var fullyPaid bool
		err = tx.QueryRow(ctx, `SELECT o.grand_total<=COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id AND p.status='CAPTURED'),0) FROM orders o WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid`, order.MerchantID, orderID).Scan(&fullyPaid)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		if !fullyPaid {
			return tdto.Order{}, app.NewError("PAYMENT_NOT_CAPTURED", "The order payment could not be captured. The order was not confirmed.", 409)
		}
		_, err = tx.Exec(ctx, `INSERT INTO accounting_events(merchant_id,event_type,source_payment_id,event_key) SELECT merchant_id,'PAYMENT_CAPTURED',id,'telegram-payment-captured:'||id::text FROM payments WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND idempotency_key='telegram-payment:'||$2::uuid::text AND status='CAPTURED' ON CONFLICT(merchant_id,event_key) DO NOTHING`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		// The stock movement trigger requires the order to be confirmed. Every
		// line's reservation and FIFO movement still commit with this transition.
		if _, err = tx.Exec(ctx, `UPDATE orders SET status='CONFIRMED' WHERE merchant_id=$1::uuid AND id=$2::uuid`, order.MerchantID, orderID); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		type reservation struct{ id, lineID, variantID, status, quantity string }
		rows, err := tx.Query(ctx, `SELECT r.id,r.order_line_id,r.variant_id,r.status,r.quantity::text FROM inventory_reservations r JOIN order_lines ol ON ol.merchant_id=r.merchant_id AND ol.id=r.order_line_id WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid ORDER BY r.variant_id,r.id FOR UPDATE OF r`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		reservations := []reservation{}
		for rows.Next() {
			var res reservation
			if err = rows.Scan(&res.id, &res.lineID, &res.variantID, &res.status, &res.quantity); err != nil {
				rows.Close()
				return tdto.Order{}, app.Internal(err)
			}
			reservations = append(reservations, res)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		for _, res := range reservations {
			if res.status != "ACTIVE" {
				return tdto.Order{}, app.NewError("RESERVATION_INACTIVE", "An inventory reservation is no longer active. The order was not confirmed.", 409)
			}
			if _, err = tx.Exec(ctx, `UPDATE inventory_reservations SET status='CONSUMED',released_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, order.MerchantID, res.id); err != nil {
				return tdto.Order{}, app.Internal(err)
			}
			if _, err = tx.Exec(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,order_line_id,event_key) VALUES($1,$2,'SALE',$3,$4::numeric,$5,$6)`, order.MerchantID, res.variantID, locationID, res.quantity, res.lineID, "telegram-sale:"+orderID+":"+res.lineID); err != nil {
				return tdto.Order{}, app.Internal(err)
			}
		}
		_, err = tx.Exec(ctx, `INSERT INTO accounting_events(merchant_id,event_type,source_order_id,event_key) VALUES($1::uuid,'ORDER_CONFIRMED',$2::uuid,'telegram-order-confirmed:'||($2::uuid)::text) ON CONFLICT(merchant_id,event_key) DO NOTHING`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	} else {
		if _, err = tx.Exec(ctx, `UPDATE payments SET status='VOIDED' WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND status='PENDING' AND idempotency_key='telegram-payment:'||$2::uuid::text`, order.MerchantID, orderID); err != nil {
			return tdto.Order{}, app.Internal(err)
		}
		_, err = tx.Exec(ctx, `UPDATE inventory_reservations r SET status='RELEASED',released_at=now() FROM order_lines ol WHERE ol.merchant_id=$1::uuid AND ol.order_id=$2::uuid AND r.merchant_id=ol.merchant_id AND r.order_line_id=ol.id AND r.status='ACTIVE'`, order.MerchantID, orderID)
		if err != nil {
			return tdto.Order{}, app.Internal(err)
		}
	}
	_, err = tx.Exec(ctx, `UPDATE orders SET status=$3 WHERE merchant_id=$1::uuid AND id=$2::uuid`, order.MerchantID, orderID, newStatus)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_order_sources SET confirmed_at=CASE WHEN $3::text='CONFIRMED' THEN now() ELSE confirmed_at END,cancelled_at=CASE WHEN $3::text='CANCELLED' THEN now() ELSE cancelled_at END WHERE merchant_id=$1::uuid AND order_id=$2::uuid`, order.MerchantID, orderID, newStatus)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `UPDATE telegram_callback_tokens SET consumed_at=now(),consumed_by_telegram_user_id=NULLIF($3::bigint,0) WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND consumed_at IS NULL`, order.MerchantID, orderID, telegramUserID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	actor := any(nil)
	if c != nil && c.MembershipID != "" {
		actor = c.MembershipID
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,$2::uuid,$3::text,'ORDER',$4::uuid,jsonb_build_object('source',$5::text,'telegram_user_id',NULLIF($6::bigint,0)))`, order.MerchantID, actor, eventType, orderID, source, telegramUserID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,$2::text,'ORDER',$3::uuid,lower($2::text)||':'||($3::uuid)::text,jsonb_build_object('connection_id',$4::text,'chat_id',$5::bigint)) ON CONFLICT(merchant_id,event_key) DO NOTHING`, order.MerchantID, eventType, orderID, order.ConnectionID, order.TelegramChatID)
	if err != nil {
		return tdto.Order{}, app.Internal(err)
	}
	order.Status = newStatus
	order.PaymentStatus = "Paid"
	if action == "CANCEL" {
		order.PaymentStatus = "Cancelled"
	}
	setLegacyItem(&order)
	return order, nil
}
