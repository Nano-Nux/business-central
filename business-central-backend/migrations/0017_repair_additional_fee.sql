ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0);
