package postgres

import (
	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	posdto "business-central-backend/internal/pos/application/dto"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

// Corrections lock the complete aggregate and commit stock/history changes together.
func (s *Service) correctTransaction(ctx context.Context, c *authdto.Claims, id, key, shop, expected string, edit *posdto.TransactionEditRequest) (posdto.SaleOrder, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return posdto.SaleOrder{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return posdto.SaleOrder{}, err
	}
	scope := "pos.transaction.delete"
	if edit != nil {
		scope = "pos.transaction.edit"
	}
	request, _ := json.Marshal(map[string]any{"id": id, "shop_id": shop, "expected_updated_at": expected, "edit": edit})
	digest := sha256.Sum256(request)
	requestHash := hex.EncodeToString(digest[:])
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,$2,$3,'PROCESSING',jsonb_build_object('request_hash',$4::text,'order_id',$5::text),now()+interval '24 hours') ON CONFLICT DO NOTHING RETURNING true`, c.MerchantID, scope, key, requestHash, id).Scan(&inserted)
	if err == pgx.ErrNoRows {
		var same bool
		var result posdto.SaleOrder
		var raw json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT response_body->>'request_hash'=$4::text,response_body->'result' FROM idempotency_keys WHERE merchant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`, c.MerchantID, scope, key, requestHash).Scan(&same, &raw); err != nil {
			return result, err
		}
		if !same {
			return result, app.NewError("IDEMPOTENCY_CONFLICT", "This key was already used for another correction.", 409)
		}
		if err = json.Unmarshal(raw, &result); err != nil {
			return result, err
		}
		return result, tx.Commit(ctx)
	}
	if err != nil {
		return posdto.SaleOrder{}, err
	}
	var location, number, channel, currency, customer string
	var created time.Time
	var placed *time.Time
	var updated time.Time
	var source json.RawMessage
	err = tx.QueryRow(ctx, `SELECT o.fulfillment_location_id::text,o.order_number,o.channel,o.currency_code,o.created_at,o.placed_at,o.updated_at,COALESCE(o.customer_id::text,''),COALESCE((SELECT to_jsonb(t) FROM telegram_order_sources t WHERE t.merchant_id=o.merchant_id AND t.order_id=o.id),'null'::jsonb) FROM orders o JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id WHERE o.merchant_id=$1::uuid AND o.id=$2::uuid AND l.shop_id=$3::uuid AND (NULLIF($4,'')::uuid IS NULL OR EXISTS(SELECT 1 FROM user_memberships um WHERE um.merchant_id=o.merchant_id AND um.id=$4::uuid AND (um.shop_id IS NULL OR um.shop_id=l.shop_id))) FOR UPDATE OF o`, c.MerchantID, id, shop, c.MembershipID).Scan(&location, &number, &channel, &currency, &created, &placed, &updated, &customer, &source)
	if err != nil {
		return posdto.SaleOrder{}, err
	}
	parsed, e := time.Parse(time.RFC3339Nano, expected)
	if e != nil || !parsed.Equal(updated) {
		return posdto.SaleOrder{}, app.NewError("CONFLICT", "Transaction changed. Refresh before editing or deleting it.", 409)
	}
	if channel != "POS" && channel != "TELEGRAM" {
		return posdto.SaleOrder{}, app.Validation("Manage linked service orders in their originating workflow.", nil)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id); err != nil {
		return posdto.SaleOrder{}, err
	}
	result := posdto.SaleOrder{ID: id}
	operation := "DELETE"
	if edit != nil {
		r := posdto.CreateSaleRequest{CorrectionID: id, CorrectionNumber: number, CorrectionCurrency: currency, ShopID: shop, LocationID: location, CustomerName: edit.CustomerName, CustomerPhone: edit.CustomerPhone, Note: edit.Note, DeliveryFee: edit.DeliveryFee, DeliveryPaymentStatus: edit.DeliveryPaymentStatus, PaymentMethod: edit.PaymentMethod, IdempotencyKey: key + ":replacement"}
		r.CustomerID = customer
		for _, l := range edit.Lines {
			r.Lines = append(r.Lines, posdto.SaleLineRequest{VariantID: l.VariantID, AssetID: l.AssetID, Quantity: l.Quantity, CorrectionPrice: l.UnitPrice, CorrectionDiscount: l.DiscountAmount, CorrectionTax: l.TaxAmount})
		}
		result, err = CreateSaleWithTx(ctx, tx, c, r)
		if err != nil {
			return result, err
		}
		if _, err = tx.Exec(ctx, `UPDATE orders SET channel=$3,created_at=$4,placed_at=$5,delivery_name=NULLIF($6,''),delivery_contact=NULLIF($7,''),billing_address=jsonb_build_object('name',$8::text,'phone',$9::text) WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id, channel, created, placed, edit.DeliveryName, edit.DeliveryContact, edit.CustomerName, edit.CustomerPhone); err != nil {
			return result, err
		}
		if string(source) != "null" {
			if _, err = tx.Exec(ctx, `INSERT INTO telegram_order_sources SELECT * FROM jsonb_populate_record(NULL::telegram_order_sources,$1::jsonb)`, source); err != nil {
				return result, err
			}
		}
		operation = "UPDATE"
	}
	body, _ := json.Marshal(map[string]any{"request_hash": requestHash, "order_id": id, "result": result})
	if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=200,response_body=$4 WHERE merchant_id=$1 AND scope=$2 AND idempotency_key=$3`, c.MerchantID, scope, key, body); err != nil {
		return result, err
	}
	// Minimal tombstones invalidate other clients without retaining deleted content.
	if _, err = publishSyncChange(ctx, tx, c.MerchantID, shop, "ORDER", id, operation, json.RawMessage(`{"id":"`+id+`"}`)); err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}
func (s *Service) UpdateTransaction(ctx context.Context, c *authdto.Claims, id string, r posdto.TransactionEditRequest) (posdto.SaleOrder, error) {
	result, err := s.correctTransaction(ctx, c, id, r.IdempotencyKey, r.ShopID, r.ExpectedUpdatedAt, &r)
	return result, transactionCorrectionError(err)
}
func (s *Service) DeleteTransaction(ctx context.Context, c *authdto.Claims, id string, r posdto.TransactionDeleteRequest) error {
	_, err := s.correctTransaction(ctx, c, id, r.IdempotencyKey, r.ShopID, r.ExpectedUpdatedAt, nil)
	return transactionCorrectionError(err)
}

func transactionCorrectionError(err error) error {
	var pgError *pgconn.PgError
	if !errors.As(err, &pgError) {
		return err
	}
	switch pgError.Code {
	case "42501":
		return app.NewError("FORBIDDEN", "Only a merchant owner with tenant.write can correct transactions.", 403)
	case "P0001":
		return app.Validation(pgError.Message, nil)
	case "23503", "23001":
		return app.NewError("CONFLICT", "This transaction has dependent records. Correct the dependent workflow first.", 409)
	case "23514", "22003", "22P02":
		return app.Validation("Correction values do not satisfy the order or stock constraints.", nil)
	}
	return err
}
