CREATE TABLE IF NOT EXISTS merchant_custom_themes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    badge VARCHAR(50) NOT NULL DEFAULT 'Custom',
    primary_color VARCHAR(9) NOT NULL,
    secondary_color VARCHAR(9) NOT NULL,
    accent_color VARCHAR(9) NOT NULL,
    border_color VARCHAR(9) NOT NULL,
    canvas_color VARCHAR(9) NOT NULL,
    mode VARCHAR(10) NOT NULL DEFAULT 'light' CHECK (mode IN ('light', 'dark')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_custom_themes_name ON merchant_custom_themes(merchant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_merchant_custom_themes_merchant ON merchant_custom_themes(merchant_id, is_active, created_at DESC);

ALTER TABLE merchant_custom_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_custom_themes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select ON merchant_custom_themes;
DROP POLICY IF EXISTS tenant_insert ON merchant_custom_themes;
DROP POLICY IF EXISTS tenant_update ON merchant_custom_themes;
DROP POLICY IF EXISTS tenant_delete ON merchant_custom_themes;

CREATE POLICY tenant_select ON merchant_custom_themes FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON merchant_custom_themes FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON merchant_custom_themes FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON merchant_custom_themes FOR DELETE USING (app_can_write_tenant(merchant_id));
