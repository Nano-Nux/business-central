DO $$
BEGIN
    -- 1. Add ai_usage_limit to merchants (default 50)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='ai_usage_limit'
    ) THEN
        ALTER TABLE merchants ADD COLUMN ai_usage_limit INTEGER NOT NULL DEFAULT 50 CHECK (ai_usage_limit >= 0);
    END IF;

    -- 2. Add ai_usage_count to merchants (default 0)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='ai_usage_count'
    ) THEN
        ALTER TABLE merchants ADD COLUMN ai_usage_count INTEGER NOT NULL DEFAULT 0 CHECK (ai_usage_count >= 0);

        -- Backfill usage count from existing user messages
        UPDATE merchants m
        SET ai_usage_count = COALESCE((
            SELECT count(*) FROM ai_messages msg
            WHERE msg.merchant_id = m.id AND msg.sender_type = 'USER'
        ), 0);
    END IF;
END $$;
