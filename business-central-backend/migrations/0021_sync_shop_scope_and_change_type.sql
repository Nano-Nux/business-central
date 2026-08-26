ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS operation_type VARCHAR(20) NOT NULL DEFAULT 'UPDATE';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_changes_operation_type_check') THEN
        ALTER TABLE sync_changes ADD CONSTRAINT sync_changes_operation_type_check
            CHECK (operation_type IN ('CREATE','UPDATE','DELETE'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_changes_shop_scope_fk') THEN
        ALTER TABLE sync_changes ADD CONSTRAINT sync_changes_shop_scope_fk
            FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sync_changes_shop_sequence
    ON sync_changes(merchant_id,shop_id,server_sequence);
