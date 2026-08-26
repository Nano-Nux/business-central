DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='pos_complexity_level'
    ) THEN
        -- Existing merchants retain the catalog/variant workflow they had before this feature.
        ALTER TABLE merchants ADD COLUMN pos_complexity_level VARCHAR(10) NOT NULL DEFAULT 'COMPLEX';
        ALTER TABLE merchants ADD CONSTRAINT merchants_pos_complexity_level_check
            CHECK (pos_complexity_level IN ('SIMPLE', 'COMPLEX'));
        ALTER TABLE merchants ALTER COLUMN pos_complexity_level SET DEFAULT 'SIMPLE';
    END IF;
END $$;
