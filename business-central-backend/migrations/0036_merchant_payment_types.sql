CREATE TABLE IF NOT EXISTS payment_type_categories (
    code VARCHAR(20) PRIMARY KEY CHECK (code IN ('CASH','ONLINE','DIGITAL')),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO payment_type_categories(code,name,is_available) VALUES
('CASH','Cash',TRUE),('ONLINE','Online',TRUE),('DIGITAL','Digital',FALSE)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,is_available=EXCLUDED.is_available;

CREATE TABLE IF NOT EXISTS payment_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_code VARCHAR(20) NOT NULL REFERENCES payment_type_categories(code) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_types_merchant_name ON payment_types(merchant_id,lower(name));
CREATE INDEX IF NOT EXISTS idx_payment_types_merchant_category ON payment_types(merchant_id,category_code,is_active,name);
INSERT INTO payment_types(merchant_id,category_code,name) SELECT id,'CASH','Cash' FROM merchants ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION provision_default_payment_type() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO payment_types(merchant_id,category_code,name) VALUES(NEW.id,'CASH','Cash') ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS merchants_default_payment_type ON merchants;
CREATE TRIGGER merchants_default_payment_type AFTER INSERT ON merchants FOR EACH ROW EXECUTE FUNCTION provision_default_payment_type();

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type_id UUID;
ALTER TABLE payments ALTER COLUMN method TYPE VARCHAR(255);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_payment_type_fk') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_payment_type_fk FOREIGN KEY (merchant_id,payment_type_id) REFERENCES payment_types(merchant_id,id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payments_payment_type_fk') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_payment_type_fk FOREIGN KEY (merchant_id,payment_type_id) REFERENCES payment_types(merchant_id,id) ON DELETE RESTRICT;
    END IF;
END $$;
UPDATE payments p SET payment_type_id=pt.id FROM payment_types pt WHERE pt.merchant_id=p.merchant_id AND pt.name='Cash' AND p.method='CASH' AND p.payment_type_id IS NULL;
UPDATE orders o SET payment_type_id=pt.id FROM payment_types pt WHERE pt.merchant_id=o.merchant_id AND pt.name='Cash' AND o.payment_type='CASH' AND o.payment_type_id IS NULL;

ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON payment_types;
DROP POLICY IF EXISTS tenant_insert ON payment_types;
DROP POLICY IF EXISTS tenant_update ON payment_types;
DROP POLICY IF EXISTS tenant_delete ON payment_types;
CREATE POLICY tenant_select ON payment_types FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON payment_types FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON payment_types FOR UPDATE USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage')) WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON payment_types FOR DELETE USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
