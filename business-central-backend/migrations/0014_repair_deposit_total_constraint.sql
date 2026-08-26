DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='repair_orders' AND column_name='estimated_cost'
    ) THEN
        UPDATE repair_orders SET total_cost = estimated_cost WHERE total_cost < estimated_cost;
    END IF;
END;
$$;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_deposit_check;
ALTER TABLE repair_orders
    ADD CONSTRAINT repair_orders_deposit_check
    CHECK (deposit_paid >= 0 AND deposit_paid <= total_cost);
