-- Avoid accessing table-specific NEW fields until the generic trigger has
-- selected the matching table branch.
CREATE OR REPLACE FUNCTION validate_variant_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    variant_policy RECORD;
    operation_variant UUID;
    base_unit UUID;
    transformation_type VARCHAR(20);
BEGIN
    IF TG_TABLE_NAME = 'goods_receipt_lines' THEN
        SELECT pol.variant_id INTO operation_variant
          FROM purchase_order_lines pol
         WHERE pol.merchant_id = NEW.merchant_id AND pol.id = NEW.purchase_order_line_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = operation_variant;
        IF FOUND THEN
            IF variant_policy.track_batches AND NEW.batch_number IS NULL THEN
                RAISE EXCEPTION 'Batch number is required for variant %', operation_variant;
            ELSIF NOT variant_policy.track_batches AND NEW.batch_number IS NOT NULL THEN
                RAISE EXCEPTION 'Batch tracking is disabled for variant %', operation_variant;
            END IF;
            IF variant_policy.track_expiry AND NEW.expires_at IS NULL THEN
                RAISE EXCEPTION 'Expiry is required for variant %', operation_variant;
            ELSIF NOT variant_policy.track_expiry AND NEW.expires_at IS NOT NULL THEN
                RAISE EXCEPTION 'Expiry tracking is disabled for variant %', operation_variant;
            END IF;
            SELECT pv.base_unit_id INTO base_unit FROM product_variants pv
             WHERE pv.merchant_id = NEW.merchant_id AND pv.id = operation_variant;
            IF NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit
               AND NOT variant_policy.allow_unit_conversions THEN
                RAISE EXCEPTION 'Unit conversions are disabled for variant %', operation_variant;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_batches' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND THEN
            IF NOT variant_policy.track_batches THEN
                RAISE EXCEPTION 'Batch tracking is disabled for variant %', NEW.variant_id;
            END IF;
            IF variant_policy.track_expiry AND NEW.expires_at IS NULL THEN
                RAISE EXCEPTION 'Expiry is required for variant %', NEW.variant_id;
            ELSIF NOT variant_policy.track_expiry AND NEW.expires_at IS NOT NULL THEN
                RAISE EXCEPTION 'Expiry tracking is disabled for variant %', NEW.variant_id;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_assets' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT variant_policy.track_unique_assets THEN
            RAISE EXCEPTION 'Unique asset tracking is disabled for variant %', NEW.variant_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_serials' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT (variant_policy.track_serials OR variant_policy.track_unique_assets) THEN
            RAISE EXCEPTION 'Serial tracking is disabled for variant %', NEW.variant_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_reservations' THEN
        IF NEW.status = 'ACTIVE' THEN
            SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
             WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
            IF FOUND AND NOT variant_policy.track_reservations THEN
                RAISE EXCEPTION 'Reservation tracking is disabled for variant %', NEW.variant_id;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'product_variant_units' THEN
        IF NEW.unit_role <> 'BASE' THEN
            SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
             WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
            IF FOUND AND NOT variant_policy.allow_unit_conversions THEN
                RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
        SELECT pv.base_unit_id INTO base_unit FROM product_variants pv
         WHERE pv.merchant_id = NEW.merchant_id AND pv.id = NEW.variant_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit
           AND NOT variant_policy.allow_unit_conversions THEN
            RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_transformation_lines' THEN
        SELECT it.transformation_type INTO transformation_type
          FROM inventory_transformations it
         WHERE it.merchant_id = NEW.merchant_id AND it.id = NEW.transformation_id;
        SELECT pv.base_unit_id INTO base_unit FROM product_variants pv
         WHERE pv.merchant_id = NEW.merchant_id AND pv.id = NEW.variant_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND THEN
            IF transformation_type IN ('PACK_BREAK','REPACK') AND NOT variant_policy.allow_pack_breaking THEN
                RAISE EXCEPTION 'Pack breaking is disabled for variant %', NEW.variant_id;
            END IF;
            IF NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit
               AND NOT variant_policy.allow_unit_conversions THEN
                RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id;
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'barcode_registry' AND NEW.variant_id IS NOT NULL THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip
         WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT variant_policy.allow_multiple_barcodes AND EXISTS (
            SELECT 1 FROM barcode_registry b
             WHERE b.merchant_id = NEW.merchant_id
               AND b.variant_id = NEW.variant_id
               AND b.is_active
               AND (TG_OP <> 'UPDATE' OR b.id <> NEW.id)
        ) THEN
            RAISE EXCEPTION 'Multiple barcodes are disabled for variant %', NEW.variant_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
