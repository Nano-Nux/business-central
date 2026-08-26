ALTER TABLE repair_orders DROP COLUMN IF EXISTS estimated_cost;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_deposit_check;
ALTER TABLE repair_orders
    ADD CONSTRAINT repair_orders_deposit_check
    CHECK (deposit_paid >= 0 AND deposit_paid <= total_cost);
