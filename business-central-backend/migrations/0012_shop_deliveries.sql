CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_info VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, shop_id, name),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deliveries_shop ON deliveries(merchant_id, shop_id, is_active, name);
