ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64);
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS dependency_client_operation_id VARCHAR(255);
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS result_payload JSONB;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS result_entity_version BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_payload_hash_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_payload_hash_check
            CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_result_entity_version_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_result_entity_version_check
            CHECK (result_entity_version IS NULL OR result_entity_version > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_dependency_not_self_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_dependency_not_self_check
            CHECK (dependency_client_operation_id IS NULL OR dependency_client_operation_id <> client_operation_id);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sync_operations_dependency
    ON sync_operations(merchant_id,device_id,dependency_client_operation_id);
