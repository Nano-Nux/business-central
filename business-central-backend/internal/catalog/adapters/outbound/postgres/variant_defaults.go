package postgres

import (
	"context"
	"errors"
	"strings"

	"business-central-backend/internal/app"
	catalogdomain "business-central-backend/internal/catalog/domain/entities"
	"github.com/jackc/pgx/v5"
)

// ResolveVariantDefaults is shared by API creation and canonical sync replay.
func ResolveVariantDefaults(ctx context.Context, tx pgx.Tx, merchantID, productID, variantID, sku, unit, label string) (string, string, string, error) {
	var defaultUnit, defaultLabel string
	if strings.TrimSpace(unit) == "" || strings.TrimSpace(label) == "" {
		err := tx.QueryRow(ctx, `SELECT base_unit_id::text,unit_of_measure FROM product_variants WHERE merchant_id=$1::uuid AND product_id=$2::uuid ORDER BY (sku='STD-' || replace(product_id::text,'-','')) DESC,id LIMIT 1`, merchantID, productID).Scan(&defaultUnit, &defaultLabel)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx, `SELECT id::text,code FROM unit_definitions WHERE merchant_id=$1::uuid AND is_active AND code IN ('PCS','EA') ORDER BY (code='PCS') DESC,id LIMIT 1`, merchantID).Scan(&defaultUnit, &defaultLabel)
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return "", "", "", err
		}
	}
	sku, unit, label, err := catalogdomain.VariantDefaults(variantID, sku, unit, label, defaultUnit, defaultLabel)
	if err != nil {
		return "", "", "", app.Validation("Choose a base unit: this product has no default sellable option or Piece/Each unit to inherit.", nil)
	}
	return sku, unit, label, nil
}
