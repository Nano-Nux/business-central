-- Preserve purchase-order scope validation for linked receipts while allowing
-- canonical direct receipts that intentionally have no goods receipt line.
CREATE OR REPLACE FUNCTION validate_inventory_movement_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    expected_variant UUID;
    expected_location UUID;
    expected_quantity NUMERIC(20,6);
    expected_order UUID;
    sold_quantity NUMERIC(20,6);
    received_quantity NUMERIC(20,6);
    original RECORD;
    order_status VARCHAR(25);
BEGIN
    IF NEW.movement_type = 'ADJUSTMENT'
       AND NEW.source_location_id IS NOT NULL
       AND NEW.destination_location_id IS NOT NULL THEN
        RAISE EXCEPTION 'An adjustment movement must affect one location';
    END IF;
    IF NEW.movement_type = 'RECEIPT' AND NEW.receipt_line_id IS NOT NULL THEN
        SELECT pol.variant_id, po.destination_location_id,
               convert_unit_quantity(NEW.merchant_id, grl.quantity_received, grl.unit_id, pv.base_unit_id)
          INTO expected_variant, expected_location, expected_quantity
          FROM goods_receipt_lines grl
          JOIN goods_receipts gr
            ON gr.merchant_id = grl.merchant_id AND gr.id = grl.receipt_id
          JOIN purchase_order_lines pol
            ON pol.merchant_id = grl.merchant_id AND pol.id = grl.purchase_order_line_id
          JOIN purchase_orders po
            ON po.merchant_id = pol.merchant_id AND po.id = pol.purchase_order_id
          JOIN product_variants pv
            ON pv.merchant_id = pol.merchant_id AND pv.id = pol.variant_id
         WHERE grl.merchant_id = NEW.merchant_id AND grl.id = NEW.receipt_line_id
         FOR UPDATE OF grl;
        IF NOT FOUND OR expected_variant IS DISTINCT FROM NEW.variant_id
           OR expected_location IS DISTINCT FROM NEW.destination_location_id
           OR expected_quantity IS DISTINCT FROM NEW.quantity THEN
            RAISE EXCEPTION 'Receipt movement must match its receipt line, purchase order, variant, location, and quantity';
        END IF;
        SELECT COALESCE(sum(im.quantity), 0) INTO received_quantity
          FROM inventory_movements im
         WHERE im.merchant_id = NEW.merchant_id
           AND im.receipt_line_id = NEW.receipt_line_id
           AND im.id <> NEW.id;
        IF received_quantity + NEW.quantity > expected_quantity THEN
            RAISE EXCEPTION 'Receipt movements cannot exceed the receipt line quantity';
        END IF;
    ELSIF NEW.movement_type = 'SALE' THEN
        SELECT ol.variant_id, o.fulfillment_location_id, o.status,
               convert_unit_quantity(NEW.merchant_id, ol.quantity, ol.unit_id, pv.base_unit_id),
               ol.order_id
          INTO expected_variant, expected_location, order_status,
               expected_quantity, expected_order
         FROM order_lines ol
          JOIN orders o
            ON o.merchant_id = ol.merchant_id AND o.id = ol.order_id
          JOIN product_variants pv
            ON pv.merchant_id = ol.merchant_id AND pv.id = ol.variant_id
         WHERE ol.merchant_id = NEW.merchant_id AND ol.id = NEW.order_line_id
         FOR UPDATE OF ol, o;
        IF NOT FOUND OR expected_variant IS DISTINCT FROM NEW.variant_id
           OR expected_order IS NULL
           OR order_status NOT IN ('CONFIRMED','PROCESSING','PARTIALLY_FULFILLED','FULFILLED')
           OR (expected_location IS NOT NULL AND expected_location IS DISTINCT FROM NEW.source_location_id) THEN
            RAISE EXCEPTION 'Sale movement must match an inventory-backed order line';
        END IF;
        SELECT COALESCE(sum(im.quantity), 0) INTO sold_quantity
          FROM inventory_movements im
         WHERE im.merchant_id = NEW.merchant_id
           AND im.order_line_id = NEW.order_line_id
           AND im.movement_type = 'SALE'
           AND im.id <> NEW.id;
        IF sold_quantity + NEW.quantity > expected_quantity THEN
            RAISE EXCEPTION 'Sale movements cannot exceed the order line quantity';
        END IF;
    ELSIF NEW.movement_type = 'RETURN' THEN
        SELECT * INTO original
          FROM inventory_movements im
         WHERE im.merchant_id = NEW.merchant_id AND im.id = NEW.reverses_movement_id
         FOR UPDATE;
        IF NOT FOUND OR original.movement_type <> 'SALE'
           OR original.variant_id IS DISTINCT FROM NEW.variant_id
           OR original.order_line_id IS DISTINCT FROM NEW.order_line_id
           OR original.quantity IS DISTINCT FROM NEW.quantity THEN
            RAISE EXCEPTION 'Return movement must fully reverse an existing sale movement';
        END IF;
    ELSIF NEW.movement_type = 'REVERSAL' THEN
        SELECT * INTO original
          FROM inventory_movements im
         WHERE im.merchant_id = NEW.merchant_id AND im.id = NEW.reverses_movement_id
         FOR UPDATE;
        IF NOT FOUND OR original.movement_type = 'REVERSAL'
           OR original.variant_id IS DISTINCT FROM NEW.variant_id
           OR original.quantity IS DISTINCT FROM NEW.quantity
           OR NEW.source_location_id IS DISTINCT FROM original.destination_location_id
           OR NEW.destination_location_id IS DISTINCT FROM original.source_location_id THEN
            RAISE EXCEPTION 'Reversal movement must be an exact inverse of its original movement';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
