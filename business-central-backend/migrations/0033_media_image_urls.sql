ALTER TABLE repair_order_images ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE repair_order_images ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'LEGACY_BASE64';
ALTER TABLE repair_order_images ALTER COLUMN image_data DROP NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'repair_order_images'::regclass AND conname = 'repair_order_images_source_type_check') THEN
        ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_source_type_check
            CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD','LEGACY_BASE64'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'repair_order_images'::regclass AND conname = 'repair_order_images_storage_check') THEN
        ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_storage_check
            CHECK ((source_type = 'LEGACY_BASE64' AND image_data IS NOT NULL AND image_url IS NULL)
                OR (source_type <> 'LEGACY_BASE64' AND image_url IS NOT NULL AND image_data IS NULL));
    END IF;
END $$;
