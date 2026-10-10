package postgres

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	posdto "business-central-backend/internal/pos/application/dto"
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// UpdateDeliveryPayment serializes changes on the order, so retries and parallel
// collections never capture the same fee twice. Reopening collection appends a
// refund, preserving the captured receipt and the commercial totals.
func (s *Service) UpdateDeliveryPayment(ctx context.Context, c *authdto.Claims, id string, r posdto.DeliveryPaymentRequest) (posdto.DeliveryPaymentResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return posdto.DeliveryPaymentResult{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return posdto.DeliveryPaymentResult{}, err
	}
	var old, shopID, fee, orderStatus string
	var paymentTypeID *string
	var method string
	err = tx.QueryRow(ctx, `SELECT o.delivery_payment_status,l.shop_id::text,o.shipping_total::text,o.status,o.payment_type_id,COALESCE(o.payment_type,'Cash')
 FROM orders o JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
 WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid AND o.channel='POS'
 AND (NULLIF($3,'')::uuid IS NULL OR EXISTS(SELECT 1 FROM user_memberships um WHERE um.merchant_id=o.merchant_id AND um.id=$3::uuid AND (um.shop_id IS NULL OR um.shop_id=l.shop_id))) FOR UPDATE OF o`, c.MerchantID, id, c.MembershipID).Scan(&old, &shopID, &fee, &orderStatus, &paymentTypeID, &method)
	if err != nil {
		return posdto.DeliveryPaymentResult{}, err
	}
	result := posdto.DeliveryPaymentResult{DeliveryPaymentStatus: old}
	requestBody, _ := json.Marshal(map[string]any{"order_id": id, "request": r})
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'pos.delivery-payment',$2,'PROCESSING',jsonb_build_object('request',$3::jsonb),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, r.IdempotencyKey, requestBody).Scan(&inserted)
	if err == pgx.ErrNoRows {
		var same bool
		var stored posdto.DeliveryPaymentResult
		var raw json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT response_body->'request'=$3::jsonb,response_body->'result' FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='pos.delivery-payment' AND idempotency_key=$2 FOR UPDATE`, c.MerchantID, r.IdempotencyKey, requestBody).Scan(&same, &raw); err != nil {
			return result, err
		}
		if !same {
			return result, app.NewError("IDEMPOTENCY_CONFLICT", "This key was used for a different delivery payment update.", 409)
		}
		if err = json.Unmarshal(raw, &stored); err != nil {
			return result, err
		}
		return stored, tx.Commit(ctx)
	}
	if err != nil {
		return result, err
	}
	if r.ExpectedStatus != old {
		return result, app.NewError("CONFLICT", "Delivery payment changed. Refresh the transaction before updating it.", 409)
	}
	finish := func() (posdto.DeliveryPaymentResult, error) {
		body, _ := json.Marshal(map[string]any{"request": json.RawMessage(requestBody), "result": result})
		if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=200,response_body=$3 WHERE merchant_id=$1::uuid AND scope='pos.delivery-payment' AND idempotency_key=$2`, c.MerchantID, r.IdempotencyKey, body); err != nil {
			return result, err
		}
		return result, tx.Commit(ctx)
	}
	if old == r.DeliveryPaymentStatus {
		return finish()
	}
	if orderStatus == "CANCELLED" || orderStatus == "REFUNDED" {
		return result, app.Validation("Cancelled or refunded orders cannot collect delivery payment.", nil)
	}
	var pendingRefund bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM refunds WHERE merchant_id=$1::uuid AND order_id=$2::uuid AND status NOT IN ('SUCCEEDED','FAILED','CANCELLED'))`, c.MerchantID, id).Scan(&pendingRefund); err != nil {
		return result, err
	}
	if pendingRefund {
		return result, app.NewError("CONFLICT", "Wait for the pending refund before changing delivery payment.", 409)
	}
	if r.DeliveryPaymentStatus == "UN_PAID" {
		// Reopening collection reverses the delivery receipt through the immutable
		// refund ledger. Never erase captured money or mutate commercial totals.
		rows, readErr := tx.Query(ctx, `SELECT p.id::text,(p.amount-COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.merchant_id=p.merchant_id AND r.payment_id=p.id AND r.status NOT IN ('FAILED','CANCELLED')),0))::text FROM payments p WHERE p.merchant_id=$1::uuid AND p.order_id=$2::uuid AND p.purpose='DELIVERY' AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED') FOR UPDATE`, c.MerchantID, id)
		if readErr != nil {
			return result, readErr
		}
		type receipt struct{ id, amount string }
		receipts := []receipt{}
		for rows.Next() {
			var item receipt
			if err = rows.Scan(&item.id, &item.amount); err != nil {
				rows.Close()
				return result, err
			}
			if item.amount != "0.00" {
				receipts = append(receipts, item)
			}
		}
		readErr = rows.Err()
		rows.Close()
		if readErr != nil {
			return result, readErr
		}
		if len(receipts) == 0 && fee != "0.00" {
			var item receipt
			err = tx.QueryRow(ctx, `SELECT p.id::text,o.shipping_total::text FROM payments p JOIN orders o ON o.merchant_id=p.merchant_id AND o.id=p.order_id WHERE p.merchant_id=$1::uuid AND p.order_id=$2::uuid AND p.purpose='ORDER' AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED') AND NOT EXISTS(SELECT 1 FROM payments d WHERE d.merchant_id=o.merchant_id AND d.order_id=o.id AND d.purpose='DELIVERY') AND p.amount-COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.merchant_id=p.merchant_id AND r.payment_id=p.id AND r.status NOT IN ('FAILED','CANCELLED')),0)>=o.shipping_total AND COALESCE((SELECT sum(py.amount) FROM payments py WHERE py.merchant_id=o.merchant_id AND py.order_id=o.id AND py.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),0)-COALESCE((SELECT sum(r.amount) FROM refunds r WHERE r.merchant_id=o.merchant_id AND r.order_id=o.id AND r.status='SUCCEEDED'),0)>=o.grand_total ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE OF p`, c.MerchantID, id).Scan(&item.id, &item.amount)
			if err == pgx.ErrNoRows {
				return result, app.Validation("No collected delivery amount is available to reverse.", nil)
			}
			if err != nil {
				return result, err
			}
			receipts = append(receipts, item)
		}
		for _, item := range receipts {
			if _, err = tx.Exec(ctx, `INSERT INTO refunds(id,merchant_id,payment_id,order_id,status,amount,reason) VALUES($1,$2,$3,$4,'SUCCEEDED',$5,'Delivery payment status correction')`, uuid.NewString(), c.MerchantID, item.id, id, item.amount); err != nil {
				return result, err
			}
		}

	} else {
		if _, err = tx.Exec(ctx, `INSERT INTO payments(merchant_id,order_id,payment_type_id,method,status,amount,idempotency_key,captured_at,purpose)
 SELECT $1::uuid,$2::uuid,$3::uuid,$4,'CAPTURED',due.amount,$5,now(),'DELIVERY' FROM orders o CROSS JOIN LATERAL (SELECT o.shipping_total-COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id AND p.purpose='DELIVERY' AND p.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),0)+COALESCE((SELECT sum(r.amount) FROM refunds r JOIN payments p ON p.merchant_id=r.merchant_id AND p.id=r.payment_id WHERE r.merchant_id=o.merchant_id AND r.order_id=o.id AND r.status='SUCCEEDED' AND p.purpose='DELIVERY'),0) AS amount) due WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid AND due.amount>0`, c.MerchantID, id, paymentTypeID, method, "delivery:"+r.IdempotencyKey); err != nil {
			return result, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET delivery_payment_status=$3,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id, r.DeliveryPaymentStatus); err != nil {
		return result, err
	}
	result.DeliveryPaymentStatus = r.DeliveryPaymentStatus
	payload, _ := json.Marshal(map[string]any{"id": id, "shop_id": shopID, "delivery_payment_status": result.DeliveryPaymentStatus, "shipping_total": fee})
	if _, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,before_data,after_data) VALUES($1::uuid,NULLIF($2,'')::uuid,'DELIVERY_PAYMENT_UPDATED','orders',$3::uuid,jsonb_build_object('delivery_payment_status',$4::text),$5::jsonb)`, c.MerchantID, c.MembershipID, id, old, payload); err != nil {
		return result, err
	}
	if _, err = publishSyncChange(ctx, tx, c.MerchantID, shopID, "ORDER", id, "UPDATE", payload); err != nil {
		return result, err
	}
	return finish()
}
