package postgres

import (
	"context"
	"strings"

	authdto "business-central-backend/internal/auth/application/dto"
	operationsdto "business-central-backend/internal/operations/application/dto"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) ListCustomThemes(ctx context.Context, c *authdto.Claims) ([]operationsdto.CustomTheme, error) {
	rows, err := s.pool.Query(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true))
		SELECT t.id, t.merchant_id, t.name, t.description, t.badge,
		       t.primary_color, t.secondary_color, t.accent_color, t.border_color, t.canvas_color,
		       t.mode, t.is_active, t.created_at, t.updated_at
		FROM merchant_custom_themes t CROSS JOIN scope
		WHERE t.merchant_id = $1::uuid
		ORDER BY t.created_at ASC`, c.MerchantID, c.IdentityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []operationsdto.CustomTheme{}
	for rows.Next() {
		var item operationsdto.CustomTheme
		if err = rows.Scan(&item.ID, &item.MerchantID, &item.Name, &item.Description, &item.Badge,
			&item.PrimaryColor, &item.SecondaryColor, &item.AccentColor, &item.BorderColor, &item.CanvasColor,
			&item.Mode, &item.IsActive, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Colors = []string{item.PrimaryColor, item.SecondaryColor, item.AccentColor, item.BorderColor, item.CanvasColor}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetCustomTheme(ctx context.Context, c *authdto.Claims, id string) (operationsdto.CustomTheme, error) {
	var item operationsdto.CustomTheme
	err := s.pool.QueryRow(ctx, `WITH scope AS (SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$2,true))
		SELECT t.id, t.merchant_id, t.name, t.description, t.badge,
		       t.primary_color, t.secondary_color, t.accent_color, t.border_color, t.canvas_color,
		       t.mode, t.is_active, t.created_at, t.updated_at
		FROM merchant_custom_themes t CROSS JOIN scope
		WHERE t.id = $1::uuid AND t.merchant_id = $2::uuid`, id, c.MerchantID, c.IdentityID).
		Scan(&item.ID, &item.MerchantID, &item.Name, &item.Description, &item.Badge,
			&item.PrimaryColor, &item.SecondaryColor, &item.AccentColor, &item.BorderColor, &item.CanvasColor,
			&item.Mode, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
	item.Colors = []string{item.PrimaryColor, item.SecondaryColor, item.AccentColor, item.BorderColor, item.CanvasColor}
	return item, err
}

func (s *Service) CreateCustomTheme(ctx context.Context, c *authdto.Claims, r operationsdto.CustomThemeRequest) (operationsdto.CustomTheme, error) {
	return writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (operationsdto.CustomTheme, error) {
		themeID := uuid.NewString()
		badge := strings.TrimSpace(r.Badge)
		if badge == "" {
			badge = "Custom"
		}
		mode := strings.ToLower(strings.TrimSpace(r.Mode))
		if mode == "" {
			mode = "light"
		}
		active := true
		if r.IsActive != nil {
			active = *r.IsActive
		}
		var item operationsdto.CustomTheme
		err := tx.QueryRow(ctx, `INSERT INTO merchant_custom_themes(
			id, merchant_id, name, description, badge,
			primary_color, secondary_color, accent_color, border_color, canvas_color,
			mode, is_active
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, merchant_id, name, description, badge,
		          primary_color, secondary_color, accent_color, border_color, canvas_color,
		          mode, is_active, created_at, updated_at`,
			themeID, c.MerchantID, strings.TrimSpace(r.Name), strings.TrimSpace(r.Description), badge,
			r.PrimaryColor, r.SecondaryColor, r.AccentColor, r.BorderColor, r.CanvasColor,
			mode, active).Scan(
			&item.ID, &item.MerchantID, &item.Name, &item.Description, &item.Badge,
			&item.PrimaryColor, &item.SecondaryColor, &item.AccentColor, &item.BorderColor, &item.CanvasColor,
			&item.Mode, &item.IsActive, &item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return item, err
		}
		item.Colors = []string{item.PrimaryColor, item.SecondaryColor, item.AccentColor, item.BorderColor, item.CanvasColor}
		return item, nil
	})
}

func (s *Service) UpdateCustomTheme(ctx context.Context, c *authdto.Claims, id string, r operationsdto.CustomThemeRequest) (operationsdto.CustomTheme, error) {
	return writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (operationsdto.CustomTheme, error) {
		badge := strings.TrimSpace(r.Badge)
		if badge == "" {
			badge = "Custom"
		}
		mode := strings.ToLower(strings.TrimSpace(r.Mode))
		if mode == "" {
			mode = "light"
		}
		active := true
		if r.IsActive != nil {
			active = *r.IsActive
		}
		var item operationsdto.CustomTheme
		err := tx.QueryRow(ctx, `UPDATE merchant_custom_themes SET
			name = $3,
			description = $4,
			badge = $5,
			primary_color = $6,
			secondary_color = $7,
			accent_color = $8,
			border_color = $9,
			canvas_color = $10,
			mode = $11,
			is_active = $12,
			updated_at = now()
		WHERE id = $1::uuid AND merchant_id = $2::uuid
		RETURNING id, merchant_id, name, description, badge,
		          primary_color, secondary_color, accent_color, border_color, canvas_color,
		          mode, is_active, created_at, updated_at`,
			id, c.MerchantID, strings.TrimSpace(r.Name), strings.TrimSpace(r.Description), badge,
			r.PrimaryColor, r.SecondaryColor, r.AccentColor, r.BorderColor, r.CanvasColor,
			mode, active).Scan(
			&item.ID, &item.MerchantID, &item.Name, &item.Description, &item.Badge,
			&item.PrimaryColor, &item.SecondaryColor, &item.AccentColor, &item.BorderColor, &item.CanvasColor,
			&item.Mode, &item.IsActive, &item.CreatedAt, &item.UpdatedAt,
		)
		if err != nil {
			return item, err
		}
		item.Colors = []string{item.PrimaryColor, item.SecondaryColor, item.AccentColor, item.BorderColor, item.CanvasColor}
		return item, nil
	})
}

func (s *Service) DeleteCustomTheme(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := writeOperation(ctx, s.pool, c, func(tx pgx.Tx) (bool, error) {
		res, err := tx.Exec(ctx, `DELETE FROM merchant_custom_themes WHERE id = $1::uuid AND merchant_id = $2::uuid`, id, c.MerchantID)
		if err != nil {
			return false, err
		}
		if res.RowsAffected() == 0 {
			return false, pgx.ErrNoRows
		}
		return true, nil
	})
	return err
}
