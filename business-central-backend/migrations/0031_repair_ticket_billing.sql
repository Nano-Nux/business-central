ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS promotion_id UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_orders_promotion_fk') THEN
        ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_promotion_fk
            FOREIGN KEY (merchant_id, promotion_id)
            REFERENCES promotions(merchant_id, id)
            ON DELETE SET NULL;
    END IF;
END $$;

UPDATE repair_orders ro
SET promotion_id = (
    SELECT op.promotion_id
    FROM order_promotions op
    JOIN service_orders so
      ON so.merchant_id = op.merchant_id
     AND so.order_id = op.order_id
    WHERE op.merchant_id = ro.merchant_id
      AND so.id = ro.service_order_id
    ORDER BY op.applied_at ASC
    LIMIT 1
)
WHERE ro.promotion_id IS NULL;
