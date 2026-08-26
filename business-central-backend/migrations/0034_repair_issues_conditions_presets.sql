ALTER TABLE repair_work_item_devices
    ADD COLUMN IF NOT EXISTS issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE repair_work_item_devices
SET issues = jsonb_build_array(issue_description)
WHERE issues = '[]'::jsonb AND btrim(issue_description) <> '';

ALTER TABLE repair_work_item_devices
    DROP CONSTRAINT IF EXISTS repair_work_item_devices_issues_array,
    DROP CONSTRAINT IF EXISTS repair_work_item_devices_conditions_array;
ALTER TABLE repair_work_item_devices
    ADD CONSTRAINT repair_work_item_devices_issues_array CHECK (jsonb_typeof(issues) = 'array'),
    ADD CONSTRAINT repair_work_item_devices_conditions_array CHECK (jsonb_typeof(conditions) = 'array');

CREATE TABLE IF NOT EXISTS repair_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    preset_type VARCHAR(20) NOT NULL CHECK (preset_type IN ('ISSUE','CONDITION')),
    value VARCHAR(500) NOT NULL CHECK (btrim(value) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS repair_presets_unique_value
    ON repair_presets(merchant_id, shop_id, preset_type, lower(btrim(value)));
CREATE INDEX IF NOT EXISTS idx_repair_presets_shop_type
    ON repair_presets(merchant_id, shop_id, preset_type, value);

ALTER TABLE repair_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_presets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON repair_presets;
DROP POLICY IF EXISTS tenant_insert ON repair_presets;
DROP POLICY IF EXISTS tenant_update ON repair_presets;
DROP POLICY IF EXISTS tenant_delete ON repair_presets;
CREATE POLICY tenant_select ON repair_presets FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON repair_presets FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON repair_presets FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON repair_presets FOR DELETE USING (app_can_write_tenant(merchant_id));
