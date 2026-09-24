CREATE TABLE IF NOT EXISTS ai_chat_deletion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deleted_by_identity_id UUID REFERENCES user_identities(id) ON DELETE SET NULL,
    deleted_by_email TEXT NOT NULL,
    deleted_by_name TEXT NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    messages_count INT NOT NULL DEFAULT 0,
    conversations_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_deletion_logs_date ON ai_chat_deletion_logs(deleted_at DESC);

ALTER TABLE ai_chat_deletion_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_chat_deletion_logs_platform_admin ON ai_chat_deletion_logs;
CREATE POLICY ai_chat_deletion_logs_platform_admin ON ai_chat_deletion_logs
    USING (app_is_platform_admin())
    WITH CHECK (app_is_platform_admin());
