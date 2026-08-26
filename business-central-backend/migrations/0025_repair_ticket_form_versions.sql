-- Persist the version of the ticket-level repair intake form used at creation.
ALTER TABLE repair_orders
    ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_orders_form_version_check') THEN
        ALTER TABLE repair_orders
            ADD CONSTRAINT repair_orders_form_version_check CHECK (form_version > 0);
    END IF;
END $$;
