package postgres

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
)

type defaultRow struct {
	unit, label string
	err         error
}

func (r defaultRow) Scan(values ...any) error {
	if r.err != nil {
		return r.err
	}
	*values[0].(*string) = r.unit
	*values[1].(*string) = r.label
	return nil
}

type defaultsTx struct {
	pgx.Tx
	rows  []defaultRow
	calls [][]any
}

func (tx *defaultsTx) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	tx.calls = append(tx.calls, args)
	row := tx.rows[0]
	tx.rows = tx.rows[1:]
	return row
}

func TestResolveVariantDefaultsScopeAndFallback(t *testing.T) {
	tx := &defaultsTx{rows: []defaultRow{{unit: "product-unit", label: "packet"}}}
	sku, unit, label, err := ResolveVariantDefaults(context.Background(), tx, "merchant-1", "product-1", "variant-1", "", "", "")
	if err != nil || sku != "OPT-variant1" || unit != "product-unit" || label != "packet" {
		t.Fatalf("defaults: %s %s %s %v", sku, unit, label, err)
	}
	if len(tx.calls) != 1 || tx.calls[0][0] != "merchant-1" || tx.calls[0][1] != "product-1" {
		t.Fatal("default option lookup was not tenant/product scoped")
	}
	tx = &defaultsTx{rows: []defaultRow{{err: pgx.ErrNoRows}, {unit: "pcs-unit", label: "PCS"}}}
	_, unit, label, err = ResolveVariantDefaults(context.Background(), tx, "merchant-1", "product-1", "variant-1", "", "", "")
	if err != nil || unit != "pcs-unit" || label != "PCS" || tx.calls[1][0] != "merchant-1" {
		t.Fatal("first-option fallback failed")
	}
	tx = &defaultsTx{rows: []defaultRow{{err: pgx.ErrNoRows}, {err: pgx.ErrNoRows}}}
	if _, _, _, err = ResolveVariantDefaults(context.Background(), tx, "merchant-1", "product-1", "variant-1", "", "", ""); err == nil {
		t.Fatal("missing defaults must produce an actionable error")
	}
	tx = &defaultsTx{}
	if _, _, _, err = ResolveVariantDefaults(context.Background(), tx, "merchant-1", "product-1", "variant-1", "SKU", "explicit-unit", "label"); err != nil || len(tx.calls) != 0 {
		t.Fatal("complete overrides should not depend on default lookup")
	}
}
