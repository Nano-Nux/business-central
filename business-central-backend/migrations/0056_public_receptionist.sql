-- Platform-owned public support records, never merchant/customer masters.
CREATE TABLE IF NOT EXISTS receptionist_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    settings jsonb NOT NULL,
    refresh_ciphertext text NOT NULL DEFAULT ''
);
INSERT INTO receptionist_settings(singleton, settings) VALUES (true,
 '{"enabled":false,"greeting":"Hi! I am Nanonux Business Central’s AI receptionist. How can I help with your business or arrange a demo?","knowledge":"Business Central provides POS, inventory, repair and service workflows. Web clients require connectivity; the mobile application supports offline operation. For pricing, availability or account-specific issues, arrange a call with the Nanonux team. Never promise features or prices that are not confirmed here.","timezone":"Asia/Bangkok","calendar_id":"primary","duration_minutes":30,"start_hour":9,"end_hour":17,"weekdays":[1,2,3,4,5],"daily_limit":200}')
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS receptionist_oauth_states (
    state_hash text PRIMARY KEY,
    verifier_ciphertext text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE TABLE IF NOT EXISTS receptionist_conversations (
    id uuid PRIMARY KEY,
    token_hash text NOT NULL,
    name text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    company text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS receptionist_conversations_updated ON receptionist_conversations(updated_at DESC,id);
CREATE TABLE IF NOT EXISTS receptionist_messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES receptionist_conversations(id),
    role text NOT NULL CHECK (role IN ('user','assistant','system')),
    content text NOT NULL CHECK (octet_length(content) <= 16000),
    slots jsonb NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receptionist_messages_conversation ON receptionist_messages(conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS receptionist_bookings (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES receptionist_conversations(id),
    calendar_id text NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    status text NOT NULL CHECK (status IN ('PENDING','CONFIRMED','FAILED')),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS receptionist_one_active_booking ON receptionist_bookings(conversation_id) WHERE status IN ('PENDING','CONFIRMED');
CREATE INDEX IF NOT EXISTS receptionist_bookings_created ON receptionist_bookings(created_at DESC,id);
CREATE TABLE IF NOT EXISTS receptionist_daily_usage (
    day date PRIMARY KEY,
    requests integer NOT NULL DEFAULT 0
);
-- Only the dedicated repository enables this transaction-local service context.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['receptionist_settings','receptionist_oauth_states','receptionist_conversations','receptionist_messages','receptionist_bookings','receptionist_daily_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=t AND policyname='receptionist_service') THEN
      EXECUTE format('CREATE POLICY receptionist_service ON %I FOR ALL USING (current_setting(''app.receptionist_service'',true) = ''on'') WITH CHECK (current_setting(''app.receptionist_service'',true) = ''on'')', t);
    END IF;
  END LOOP;
END $$;
