DO $$
BEGIN
    -- 1. Add ai_assistant_enabled to merchants
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='ai_assistant_enabled'
    ) THEN
        ALTER TABLE merchants ADD COLUMN ai_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    -- 2. Insert ai.chat permission
    INSERT INTO permissions(code, description) VALUES
        ('ai.chat', 'Access and query Nanonux AI Assistant')
    ON CONFLICT (code) DO NOTHING;

    -- 3. Grant ai.chat permission to merchant and owner roles
    INSERT INTO role_permissions(role_id, permission_code)
    SELECT r.id, 'ai.chat'
    FROM roles r
    WHERE r.code IN ('merchant', 'owner')
    ON CONFLICT (role_id, permission_code) DO NOTHING;

    -- 4. Create AI conversations table (tenant-scoped and user-scoped)
    CREATE TABLE IF NOT EXISTS ai_conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        membership_id UUID NOT NULL REFERENCES user_memberships(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user 
        ON ai_conversations(merchant_id, membership_id, updated_at DESC);

    -- 5. Create AI messages table
    CREATE TABLE IF NOT EXISTS ai_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
        merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        membership_id UUID NOT NULL REFERENCES user_memberships(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('USER', 'ASSISTANT', 'SYSTEM')),
        content TEXT NOT NULL,
        raw_query_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ai_messages_convo 
        ON ai_messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_user 
        ON ai_messages(merchant_id, membership_id, created_at DESC);
END $$;
