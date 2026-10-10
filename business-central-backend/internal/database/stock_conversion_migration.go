package database

const stockConversion = `
CREATE TABLE IF NOT EXISTS stock_conversion_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    source_variant_id UUID NOT NULL,
    destination_variant_id UUID NOT NULL,
    destination_quantity INTEGER NOT NULL CHECK (destination_quantity > 0 AND destination_quantity <= 1000000),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, source_variant_id, destination_variant_id),
    FOREIGN KEY (merchant_id, source_variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, destination_variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    CHECK (source_variant_id <> destination_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_conversion_rules_merchant ON stock_conversion_rules(merchant_id, is_active);
DROP TRIGGER IF EXISTS trg_stock_conversion_rules_updated ON stock_conversion_rules;
CREATE TRIGGER trg_stock_conversion_rules_updated BEFORE UPDATE ON stock_conversion_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE stock_conversion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_conversion_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_conversion_rules_read ON stock_conversion_rules;
CREATE POLICY stock_conversion_rules_read ON stock_conversion_rules
    FOR SELECT USING (app_can_read_tenant(merchant_id));
DROP POLICY IF EXISTS stock_conversion_rules_write ON stock_conversion_rules;
CREATE POLICY stock_conversion_rules_write ON stock_conversion_rules
    FOR ALL USING (app_can_write_tenant(merchant_id))
    WITH CHECK (app_can_write_tenant(merchant_id));
ALTER TABLE inventory_transformations ADD COLUMN IF NOT EXISTS stock_conversion_rule_id UUID;
ALTER TABLE inventory_transformations ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2);
ALTER TABLE inventory_transformations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_transformations_stock_conversion_rule_fk' AND conrelid='inventory_transformations'::regclass) THEN
        ALTER TABLE inventory_transformations ADD CONSTRAINT inventory_transformations_stock_conversion_rule_fk
            FOREIGN KEY (merchant_id, stock_conversion_rule_id)
            REFERENCES stock_conversion_rules(merchant_id, id) ON DELETE RESTRICT;
    END IF;
END $$;
`
