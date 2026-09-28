ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check;
ALTER TABLE orders ADD CONSTRAINT orders_channel_check
    CHECK (channel IN ('POS','ONLINE','WHOLESALE','PHONE','MARKETPLACE','SERVICE','TELEGRAM'));

INSERT INTO modules(code,name,description) VALUES('telegram_automation','Telegram automation','Shared-bot shop-group order automation') ON CONFLICT(code) DO NOTHING;
INSERT INTO merchant_modules(merchant_id,module_code,status) SELECT id,'telegram_automation','ENABLED' FROM merchants ON CONFLICT(merchant_id,module_code) DO NOTHING;
INSERT INTO shop_modules(merchant_id,shop_id,module_code) SELECT merchant_id,id,'telegram_automation' FROM shops ON CONFLICT DO NOTHING;

CREATE TABLE telegram_group_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    group_title VARCHAR(255) NOT NULL,
    group_type VARCHAR(30) NOT NULL CHECK (group_type IN ('group','supergroup')),
    group_username VARCHAR(255),
    creator_telegram_user_id BIGINT,
    creator_display_name_snapshot VARCHAR(255),
    creator_username_snapshot VARCHAR(255),
    connected_by UUID,
    connection_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (connection_status IN ('PENDING_APPROVAL','ACTIVE','PAUSED','ERROR','REVOKED')),
    bot_membership_status VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
    bot_admin_status BOOLEAN NOT NULL DEFAULT FALSE,
    bot_permission_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    member_count INTEGER CHECK (member_count IS NULL OR member_count >= 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    connected_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_webhook_at TIMESTAMPTZ,
    last_refreshed_at TIMESTAMPTZ,
    last_successful_api_call_at TIMESTAMPTZ,
    last_error TEXT,
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id),
    UNIQUE (telegram_chat_id),
    FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id,connected_by) REFERENCES user_memberships(merchant_id,id) ON DELETE SET NULL (connected_by)
);

CREATE TABLE telegram_pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    code_hash CHAR(64) NOT NULL UNIQUE,
    created_by UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONSUMED','REVOKED','EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by_connection_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id),
    FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id,created_by) REFERENCES user_memberships(merchant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id,consumed_by_connection_id) REFERENCES telegram_group_connections(merchant_id,id) ON DELETE SET NULL (consumed_by_connection_id),
    CHECK (expires_at > created_at)
);

CREATE TABLE telegram_group_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    display_name_snapshot VARCHAR(255),
    username_snapshot VARCHAR(255),
    telegram_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (telegram_role IN ('CREATOR','ADMINISTRATOR','MEMBER','LEFT','KICKED')),
    is_known BOOLEAN NOT NULL DEFAULT TRUE,
    can_create_orders BOOLEAN NOT NULL DEFAULT TRUE,
    permission_revoked_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id),
    UNIQUE (merchant_id,connection_id,telegram_user_id),
    FOREIGN KEY (merchant_id,connection_id) REFERENCES telegram_group_connections(merchant_id,id) ON DELETE CASCADE
);

CREATE TABLE telegram_order_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    order_id UUID NOT NULL,
    telegram_group_connection_id UUID NOT NULL,
    telegram_chat_id BIGINT NOT NULL,
    telegram_message_id BIGINT NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    telegram_update_id BIGINT NOT NULL,
    bot_response_message_id BIGINT,
    confirmation_callback_id UUID,
    cancellation_callback_id UUID,
    original_command TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    UNIQUE (merchant_id,id),
    UNIQUE (telegram_update_id),
    UNIQUE (merchant_id,order_id),
    UNIQUE (telegram_chat_id,telegram_message_id),
    FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id,order_id) REFERENCES orders(merchant_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id,telegram_group_connection_id) REFERENCES telegram_group_connections(merchant_id,id) ON DELETE RESTRICT
);

CREATE TABLE telegram_callback_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    order_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('CONFIRM','CANCEL')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by_telegram_user_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id),
    FOREIGN KEY (merchant_id,connection_id) REFERENCES telegram_group_connections(merchant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id,order_id) REFERENCES orders(merchant_id,id) ON DELETE CASCADE
);

CREATE TABLE telegram_webhook_updates (
    update_id BIGINT PRIMARY KEY,
    update_kind VARCHAR(40) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX idx_telegram_connections_shop ON telegram_group_connections(merchant_id,shop_id,connection_status);
CREATE INDEX idx_telegram_connections_activity ON telegram_group_connections(last_seen_at DESC);
CREATE INDEX idx_telegram_pairing_active ON telegram_pairing_codes(merchant_id,shop_id,status,expires_at);
CREATE INDEX idx_telegram_users_connection ON telegram_group_users(merchant_id,connection_id,last_seen_at DESC);
CREATE INDEX idx_telegram_orders_connection ON telegram_order_sources(merchant_id,telegram_group_connection_id,created_at DESC);
CREATE INDEX idx_telegram_callbacks_expiry ON telegram_callback_tokens(expires_at) WHERE consumed_at IS NULL;

CREATE TRIGGER trg_telegram_connections_updated BEFORE UPDATE ON telegram_group_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_telegram_users_updated BEFORE UPDATE ON telegram_group_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION validate_order_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('PENDING_PAYMENT','CANCELLED'))
        OR (OLD.status = 'DRAFT' AND OLD.channel = 'TELEGRAM' AND NEW.status = 'CONFIRMED')
        OR (OLD.status = 'PENDING_PAYMENT' AND NEW.status IN ('CONFIRMED','CANCELLED'))
        OR (OLD.status = 'CONFIRMED' AND NEW.status IN ('PROCESSING','CANCELLED'))
        OR (OLD.status = 'PROCESSING' AND NEW.status IN ('PARTIALLY_FULFILLED','FULFILLED','CANCELLED'))
        OR (OLD.status = 'PARTIALLY_FULFILLED' AND NEW.status IN ('FULFILLED','CANCELLED'))
        OR (OLD.status IN ('FULFILLED','CANCELLED') AND NEW.status = 'REFUNDED')) THEN
        RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

-- The webhook is an authenticated backend-to-backend entry point and has no
-- human membership. This transaction-local flag is set only by the Telegram
-- repository after the HTTP secret has been validated. It keeps RLS enabled
-- while permitting the application service to resolve the tenant.
CREATE OR REPLACE FUNCTION app_is_telegram_service() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT current_setting('app.telegram_service', true) = 'on';
$$;
CREATE OR REPLACE FUNCTION app_can_read_tenant(p_merchant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin() OR app_is_telegram_service()
        OR (p_merchant_id = app_current_merchant_id() AND app_is_authenticated_member(p_merchant_id)
            AND (app_has_permission('tenant.read') OR app_has_permission('tenant.write')));
$$;
CREATE OR REPLACE FUNCTION app_can_write_tenant(p_merchant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin() OR app_is_telegram_service()
        OR (p_merchant_id = app_current_merchant_id() AND app_is_authenticated_member(p_merchant_id)
            AND app_has_permission('tenant.write'));
$$;

DO $$ DECLARE t TEXT; BEGIN
    FOREACH t IN ARRAY ARRAY['telegram_group_connections','telegram_pairing_codes','telegram_group_users','telegram_order_sources','telegram_callback_tokens'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
        EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (app_can_read_tenant(merchant_id))',t);
        EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id))',t);
        EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id))',t);
        EXECUTE format('CREATE POLICY tenant_delete ON %I FOR DELETE USING (app_can_write_tenant(merchant_id))',t);
    END LOOP;
END $$;
