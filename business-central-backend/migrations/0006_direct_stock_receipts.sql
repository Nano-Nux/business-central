-- Allow a merchant to record opening/direct stock without manufacturing a
-- purchase order. Purchase-order receipts still carry receipt_line_id; direct
-- receipts remain canonical RECEIPT movements and therefore create FIFO cost
-- layers through apply_inventory_movement().
DO $$
DECLARE
    existing_constraint TEXT;
BEGIN
    SELECT c.conname
      INTO existing_constraint
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'inventory_movements'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%receipt_line_id IS NOT NULL%'
     LIMIT 1;

    IF existing_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE inventory_movements DROP CONSTRAINT %I', existing_constraint);
    END IF;
END $$;

DO $$
BEGIN
    ALTER TABLE inventory_movements
        ADD CONSTRAINT inventory_movements_reference_check CHECK (
            (movement_type = 'RECEIPT' AND destination_location_id IS NOT NULL AND source_location_id IS NULL AND unit_cost IS NOT NULL AND reverses_movement_id IS NULL)
            OR (movement_type = 'TRANSFER' AND source_location_id IS NOT NULL AND destination_location_id IS NOT NULL)
            OR (movement_type = 'SALE' AND source_location_id IS NOT NULL AND order_line_id IS NOT NULL AND destination_location_id IS NULL AND reverses_movement_id IS NULL)
            OR (movement_type = 'RETURN' AND source_location_id IS NULL AND destination_location_id IS NOT NULL AND order_line_id IS NOT NULL AND reverses_movement_id IS NOT NULL)
            OR (movement_type = 'ADJUSTMENT' AND reverses_movement_id IS NULL)
            OR (movement_type = 'REVERSAL' AND reverses_movement_id IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
