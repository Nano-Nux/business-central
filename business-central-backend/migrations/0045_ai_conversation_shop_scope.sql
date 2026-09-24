DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='ai_conversations' AND column_name='shop_id'
    ) THEN
        ALTER TABLE ai_conversations ADD COLUMN shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS idx_ai_conversations_shop
        ON ai_conversations(merchant_id, shop_id, updated_at DESC);
END $$;
