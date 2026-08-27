package postgres

import (
	"context"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) ListPaymentTypeCategories(ctx context.Context) ([]PaymentTypeCategory, error) {
	rows, err := s.pool.Query(ctx, `SELECT code,name,is_available FROM payment_type_categories ORDER BY CASE code WHEN 'CASH' THEN 1 WHEN 'ONLINE' THEN 2 ELSE 3 END`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PaymentTypeCategory{}
	for rows.Next() {
		var item PaymentTypeCategory
		if err = rows.Scan(&item.Code, &item.Name, &item.IsAvailable); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) ListPaymentTypes(ctx context.Context, c *authdto.Claims, activeOnly bool) ([]PaymentType, error) {
	rows, err := s.pool.Query(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT p.id,p.merchant_id,p.category_code,p.name,p.is_active,p.created_at,p.updated_at
		FROM payment_types p CROSS JOIN scope WHERE p.merchant_id=$1::uuid AND (NOT $3 OR p.is_active)
		ORDER BY CASE p.category_code WHEN 'CASH' THEN 1 WHEN 'ONLINE' THEN 2 ELSE 3 END,lower(p.name)`, c.MerchantID, c.IdentityID, activeOnly)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []PaymentType{}
	for rows.Next() {
		var item PaymentType
		if err = rows.Scan(&item.ID, &item.MerchantID, &item.CategoryCode, &item.Name, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func normalizePaymentType(request PaymentTypeRequest) PaymentTypeRequest {
	request.Name = strings.TrimSpace(request.Name)
	request.CategoryCode = strings.ToUpper(strings.TrimSpace(request.CategoryCode))
	return request
}

func (s *Service) CreatePaymentType(ctx context.Context, c *authdto.Claims, request PaymentTypeRequest) (PaymentType, error) {
	r := normalizePaymentType(request)
	return writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (PaymentType, error) {
		active := true
		if r.IsActive != nil {
			active = *r.IsActive
		}
		var item PaymentType
		err := tx.QueryRow(ctx, `INSERT INTO payment_types(id,merchant_id,category_code,name,is_active) VALUES($1,$2,$3,$4,$5) RETURNING id,merchant_id,category_code,name,is_active,created_at,updated_at`, uuid.NewString(), c.MerchantID, r.CategoryCode, r.Name, active).Scan(&item.ID, &item.MerchantID, &item.CategoryCode, &item.Name, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
		return item, err
	})
}

func (s *Service) UpdatePaymentType(ctx context.Context, c *authdto.Claims, id string, request PaymentTypeRequest) (PaymentType, error) {
	r := normalizePaymentType(request)
	return writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (PaymentType, error) {
		var currentCategory string
		var used bool
		if err := tx.QueryRow(ctx, `SELECT category_code,EXISTS(SELECT 1 FROM payments WHERE merchant_id=$1::uuid AND payment_type_id=$2::uuid) OR EXISTS(SELECT 1 FROM orders WHERE merchant_id=$1::uuid AND payment_type_id=$2::uuid) FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid FOR UPDATE`, c.MerchantID, id).Scan(&currentCategory, &used); err != nil {
			return PaymentType{}, err
		}
		if used && currentCategory != r.CategoryCode {
			return PaymentType{}, app.NewError("CONFLICT", "The category of a payment type used by a transaction cannot be changed. Create a new payment type instead.", 409)
		}
		var item PaymentType
		err := tx.QueryRow(ctx, `UPDATE payment_types SET category_code=$3,name=$4,is_active=COALESCE($5,is_active),updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,merchant_id,category_code,name,is_active,created_at,updated_at`, c.MerchantID, id, r.CategoryCode, r.Name, r.IsActive).Scan(&item.ID, &item.MerchantID, &item.CategoryCode, &item.Name, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
		return item, err
	})
}

func (s *Service) DeletePaymentType(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (bool, error) {
		var used bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM payments WHERE merchant_id=$1::uuid AND payment_type_id=$2::uuid) OR EXISTS(SELECT 1 FROM orders WHERE merchant_id=$1::uuid AND payment_type_id=$2::uuid)`, c.MerchantID, id).Scan(&used); err != nil {
			return false, err
		}
		if used {
			return false, app.NewError("CONFLICT", "A payment type used by a transaction cannot be deleted. Set it inactive instead.", 409)
		}
		result, err := tx.Exec(ctx, `DELETE FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
		if err != nil {
			return false, err
		}
		if result.RowsAffected() == 0 {
			return false, pgx.ErrNoRows
		}
		return true, nil
	})
	return err
}
