DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'product_prices'::regclass
          AND conname = 'product_prices_one_per_list_variant'
    ) THEN
        ALTER TABLE product_prices
            ADD CONSTRAINT product_prices_one_per_list_variant
            UNIQUE (merchant_id, price_list_id, variant_id);
    END IF;
END $$;
