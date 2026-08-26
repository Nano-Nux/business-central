ALTER TABLE catalog_product_images
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'URL';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'catalog_product_images'::regclass AND conname = 'catalog_product_images_source_type_check') THEN
        ALTER TABLE catalog_product_images ADD CONSTRAINT catalog_product_images_source_type_check
            CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalog_variant_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'URL' CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD')),
    alt_text VARCHAR(500),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_catalog_variant_images_variant
    ON catalog_variant_images(merchant_id, variant_id, position);

ALTER TABLE catalog_variant_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_variant_images FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_insert ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_update ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_delete ON catalog_variant_images;
CREATE POLICY tenant_select ON catalog_variant_images FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON catalog_variant_images FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON catalog_variant_images FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON catalog_variant_images FOR DELETE USING (app_can_write_tenant(merchant_id));
