DO $$
BEGIN
    -- 1. Update merchants.pos_complexity_level check constraint to include 'MINI'
    ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_pos_complexity_level_check;
    ALTER TABLE merchants ADD CONSTRAINT merchants_pos_complexity_level_check
        CHECK (pos_complexity_level IN ('SIMPLE', 'COMPLEX', 'MINI'));

    -- 2. Add original_price to product_variants if not already present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='product_variants' AND column_name='original_price'
    ) THEN
        ALTER TABLE product_variants ADD COLUMN original_price NUMERIC(15,2) CHECK (original_price IS NULL OR original_price >= 0);
    END IF;
END $$;
