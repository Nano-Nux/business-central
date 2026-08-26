CREATE TABLE IF NOT EXISTS repair_drafts (
    id UUID NOT NULL,
    merchant_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    created_by_membership_id UUID,
    payload JSONB NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, created_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_repair_drafts_scope ON repair_drafts(merchant_id, shop_id, updated_at DESC);
ALTER TABLE repair_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS repair_drafts_tenant_isolation ON repair_drafts;
CREATE POLICY repair_drafts_tenant_isolation ON repair_drafts USING (merchant_id = current_setting('app.merchant_id', true)::uuid);
