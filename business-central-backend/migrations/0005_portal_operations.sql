ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS shop_id UUID;

DO $$ BEGIN
    ALTER TABLE user_memberships
        ADD CONSTRAINT user_memberships_shop_fk
        FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_memberships_shop
    ON user_memberships(merchant_id, shop_id) WHERE shop_id IS NOT NULL;

INSERT INTO locations(merchant_id, shop_id, code, name, location_type, is_active)
SELECT s.merchant_id, s.id, 'SHOP-' || s.code, s.name || ' stock', 'SHOP', s.is_active
FROM shops s
WHERE NOT EXISTS (
    SELECT 1 FROM locations l
    WHERE l.merchant_id = s.merchant_id AND l.shop_id = s.id AND l.location_type = 'SHOP'
)
ON CONFLICT (merchant_id, code) DO NOTHING;
