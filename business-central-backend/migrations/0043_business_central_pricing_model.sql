DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='business_central_pricing_model'
    ) THEN
        ALTER TABLE merchants ADD COLUMN business_central_pricing_model VARCHAR(32) NOT NULL DEFAULT 'starter';
        ALTER TABLE merchants ADD CONSTRAINT merchants_business_central_pricing_model_check
            CHECK (lower(business_central_pricing_model) IN ('starter', 'growth', 'professional', 'enterprise'));
    END IF;
END $$;
