package postgres

import (
	"context"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/services/application/dto"
	"github.com/jackc/pgx/v5"
)

func normalizeRepairPreset(x dto.RepairPresetRequest) (dto.RepairPresetRequest, error) {
	x.ShopID = strings.TrimSpace(x.ShopID)
	x.PresetType = strings.ToUpper(strings.TrimSpace(x.PresetType))
	x.Value = strings.TrimSpace(x.Value)
	if x.ShopID == "" || x.Value == "" {
		return x, app.Validation("Shop and preset value are required.", nil)
	}
	if x.PresetType != "ISSUE" && x.PresetType != "CONDITION" {
		return x, app.Validation("Preset type must be ISSUE or CONDITION.", nil)
	}
	if len([]rune(x.Value)) > 500 {
		return x, app.Validation("Preset value must be 500 characters or fewer.", nil)
	}
	return x, nil
}

func (r *Repository) ListRepairPresets(ctx context.Context, c *authdto.Claims, shopID, presetType string, q app.ListQuery) ([]dto.RepairPreset, int, error) {
	where, args := scoped(c, q, "x", "x.value")
	if strings.TrimSpace(shopID) != "" {
		where, args = addFilter(where, args, "x.shop_id=$%d::uuid", strings.TrimSpace(shopID))
	}
	if strings.TrimSpace(presetType) != "" {
		where, args = addFilter(where, args, "x.preset_type=$%d", strings.ToUpper(strings.TrimSpace(presetType)))
	}
	return listRows(ctx, r.pool, contextPrefix(), "SELECT COUNT(*) FROM repair_presets x CROSS JOIN ctx WHERE "+where,
		"SELECT x.id,x.merchant_id,x.shop_id,x.preset_type,x.value,x.created_at,x.updated_at FROM repair_presets x CROSS JOIN ctx WHERE "+where+" ORDER BY x.preset_type,x.value", args, q,
		func(rows pgx.Rows) (dto.RepairPreset, error) {
			var value dto.RepairPreset
			err := rows.Scan(&value.ID, &value.MerchantID, &value.ShopID, &value.PresetType, &value.Value, &value.CreatedAt, &value.UpdatedAt)
			return value, err
		})
}

func (r *Repository) CreateRepairPreset(ctx context.Context, c *authdto.Claims, request dto.RepairPresetRequest) (dto.RepairPreset, error) {
	x, err := normalizeRepairPreset(request)
	if err != nil {
		return dto.RepairPreset{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairPreset, error) {
		var value dto.RepairPreset
		err := tx.QueryRow(ctx, `INSERT INTO repair_presets(merchant_id,shop_id,preset_type,value)
			SELECT $1::uuid,$2::uuid,$3,$4 WHERE EXISTS(SELECT 1 FROM shops WHERE merchant_id=$1::uuid AND id=$2::uuid)
			RETURNING id,merchant_id,shop_id,preset_type,value,created_at,updated_at`, c.MerchantID, x.ShopID, x.PresetType, x.Value).
			Scan(&value.ID, &value.MerchantID, &value.ShopID, &value.PresetType, &value.Value, &value.CreatedAt, &value.UpdatedAt)
		return value, err
	})
}

func (r *Repository) UpdateRepairPreset(ctx context.Context, c *authdto.Claims, id string, request dto.RepairPresetRequest) (dto.RepairPreset, error) {
	x, err := normalizeRepairPreset(request)
	if err != nil {
		return dto.RepairPreset{}, err
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairPreset, error) {
		var value dto.RepairPreset
		err := tx.QueryRow(ctx, `UPDATE repair_presets SET shop_id=$3::uuid,preset_type=$4,value=$5,updated_at=now()
			WHERE merchant_id=$1::uuid AND id=$2::uuid AND EXISTS(SELECT 1 FROM shops WHERE merchant_id=$1::uuid AND id=$3::uuid)
			RETURNING id,merchant_id,shop_id,preset_type,value,created_at,updated_at`, c.MerchantID, id, x.ShopID, x.PresetType, x.Value).
			Scan(&value.ID, &value.MerchantID, &value.ShopID, &value.PresetType, &value.Value, &value.CreatedAt, &value.UpdatedAt)
		return value, err
	})
}

func (r *Repository) DeleteRepairPreset(ctx context.Context, c *authdto.Claims, id string) error {
	_, err := r.pool.Exec(ctx, contextPrefix()+"DELETE FROM repair_presets x USING ctx WHERE x.merchant_id=$2::uuid AND x.id=$3::uuid", c.IdentityID, c.MerchantID, id)
	return err
}
