package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const userManagementPolicies = `
CREATE OR REPLACE FUNCTION app_can_manage_memberships(p_merchant_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
    SELECT app_is_platform_admin()
        OR EXISTS (
            SELECT 1
              FROM user_memberships um
              JOIN membership_roles mr
                ON mr.merchant_id = um.merchant_id AND mr.membership_id = um.id
              JOIN roles r
                ON r.merchant_id = mr.merchant_id AND r.id = mr.role_id
              LEFT JOIN role_permissions rp ON rp.role_id = r.id
             WHERE um.merchant_id = p_merchant_id
               AND um.identity_id = app_current_user_id()
               AND um.is_active
               AND (mr.valid_until IS NULL OR mr.valid_until >= now())
               AND (rp.permission_code = 'membership.manage' OR r.code IN ('admin', 'merchant'))
        );
$$;

DROP POLICY IF EXISTS user_identity_self_access ON user_identities;
DROP POLICY IF EXISTS user_identity_access ON user_identities;
CREATE POLICY user_identity_access ON user_identities
    USING (
        id = app_current_user_id()
        OR current_setting('app.auth_mode', true) = 'login'
        OR app_is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM user_memberships managed_membership
             WHERE managed_membership.identity_id = user_identities.id
               AND managed_membership.merchant_id = app_current_merchant_id()
               AND app_can_manage_memberships(managed_membership.merchant_id)
        )
    )
    WITH CHECK (
        id = app_current_user_id()
        OR current_setting('app.auth_mode', true) = 'login'
        OR app_is_platform_admin()
        OR app_can_manage_memberships(app_current_merchant_id())
    );

DROP POLICY IF EXISTS refresh_token_identity_access ON refresh_tokens;
CREATE POLICY refresh_token_identity_access ON refresh_tokens
    USING (
        identity_id = app_current_user_id()
        OR current_setting('app.auth_mode', true) IN ('login', 'refresh')
        OR app_is_platform_admin()
    )
    WITH CHECK (identity_id = app_current_user_id() OR app_is_platform_admin());

DROP POLICY IF EXISTS tenant_select ON user_memberships;
CREATE POLICY tenant_select ON user_memberships FOR SELECT
    USING (
        app_is_platform_admin()
        OR (merchant_id = app_current_merchant_id() AND identity_id = app_current_user_id() AND is_active)
        OR (merchant_id = app_current_merchant_id() AND app_can_manage_memberships(merchant_id))
    );
`

const userIdentityBootstrapPolicyFix = `
DROP POLICY IF EXISTS user_identity_bootstrap_login ON user_identities;
CREATE POLICY user_identity_bootstrap_login ON user_identities
    FOR INSERT
    WITH CHECK (current_setting('app.auth_mode', true) = 'login');
`

const onePricePerVariant = `
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
`

const productDates = `
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacture_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expired_date DATE;
`

const repairIssuesConditionsPresets = `
ALTER TABLE repair_work_item_devices
    ADD COLUMN IF NOT EXISTS issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE repair_work_item_devices SET issues=jsonb_build_array(issue_description) WHERE issues='[]'::jsonb AND btrim(issue_description)<>'';
ALTER TABLE repair_work_item_devices DROP CONSTRAINT IF EXISTS repair_work_item_devices_issues_array;
ALTER TABLE repair_work_item_devices DROP CONSTRAINT IF EXISTS repair_work_item_devices_conditions_array;
ALTER TABLE repair_work_item_devices ADD CONSTRAINT repair_work_item_devices_issues_array CHECK (jsonb_typeof(issues)='array');
ALTER TABLE repair_work_item_devices ADD CONSTRAINT repair_work_item_devices_conditions_array CHECK (jsonb_typeof(conditions)='array');
CREATE TABLE IF NOT EXISTS repair_presets (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
 shop_id UUID NOT NULL, preset_type VARCHAR(20) NOT NULL CHECK (preset_type IN ('ISSUE','CONDITION')),
 value VARCHAR(500) NOT NULL CHECK (btrim(value)<>''), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(merchant_id,id), FOREIGN KEY(merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS repair_presets_unique_value ON repair_presets(merchant_id,shop_id,preset_type,lower(btrim(value)));
CREATE INDEX IF NOT EXISTS idx_repair_presets_shop_type ON repair_presets(merchant_id,shop_id,preset_type,value);
ALTER TABLE repair_presets ENABLE ROW LEVEL SECURITY; ALTER TABLE repair_presets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON repair_presets; DROP POLICY IF EXISTS tenant_insert ON repair_presets; DROP POLICY IF EXISTS tenant_update ON repair_presets; DROP POLICY IF EXISTS tenant_delete ON repair_presets;
CREATE POLICY tenant_select ON repair_presets FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON repair_presets FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON repair_presets FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON repair_presets FOR DELETE USING (app_can_write_tenant(merchant_id));
`

const repairWaitingTime = `
ALTER TABLE repair_work_item_devices
    ADD COLUMN IF NOT EXISTS waiting_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS waiting_end_date DATE NOT NULL DEFAULT CURRENT_DATE;
UPDATE repair_work_item_devices device
SET waiting_start_date=repair.received_at::date,waiting_end_date=repair.received_at::date
FROM service_order_work_items work_item JOIN repair_orders repair ON repair.merchant_id=work_item.merchant_id AND repair.service_order_id=work_item.service_order_id
WHERE device.merchant_id=work_item.merchant_id AND device.work_item_id=work_item.id;
ALTER TABLE repair_work_item_devices DROP CONSTRAINT IF EXISTS repair_work_item_devices_waiting_range;
ALTER TABLE repair_work_item_devices ADD CONSTRAINT repair_work_item_devices_waiting_range CHECK (waiting_end_date >= waiting_start_date);
`

const platformAdminSupport = `
CREATE TABLE IF NOT EXISTS platform_admin_identities (
    identity_id UUID PRIMARY KEY REFERENCES user_identities(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1
          FROM pg_roles r
         WHERE r.rolname = 'platform_admin'
           AND pg_has_role(session_user, r.oid, 'member')
    ) OR EXISTS (
        SELECT 1 FROM public.platform_admin_identities pai
         WHERE pai.identity_id = public.app_current_user_id()
    );
$$;
`

const catalogVariantTriggerFix = `
CREATE OR REPLACE FUNCTION validate_variant_inventory_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    variant_policy RECORD;
    operation_variant UUID;
    base_unit UUID;
    transformation_type VARCHAR(20);
BEGIN
    IF TG_TABLE_NAME = 'goods_receipt_lines' THEN
        SELECT pol.variant_id INTO operation_variant FROM purchase_order_lines pol WHERE pol.merchant_id = NEW.merchant_id AND pol.id = NEW.purchase_order_line_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = operation_variant;
        IF FOUND THEN
            IF variant_policy.track_batches AND NEW.batch_number IS NULL THEN RAISE EXCEPTION 'Batch number is required for variant %', operation_variant; END IF;
            IF NOT variant_policy.track_batches AND NEW.batch_number IS NOT NULL THEN RAISE EXCEPTION 'Batch tracking is disabled for variant %', operation_variant; END IF;
            IF variant_policy.track_expiry AND NEW.expires_at IS NULL THEN RAISE EXCEPTION 'Expiry is required for variant %', operation_variant; END IF;
            IF NOT variant_policy.track_expiry AND NEW.expires_at IS NOT NULL THEN RAISE EXCEPTION 'Expiry tracking is disabled for variant %', operation_variant; END IF;
            SELECT pv.base_unit_id INTO base_unit FROM product_variants pv WHERE pv.merchant_id = NEW.merchant_id AND pv.id = operation_variant;
            IF NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit AND NOT variant_policy.allow_unit_conversions THEN RAISE EXCEPTION 'Unit conversions are disabled for variant %', operation_variant; END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_batches' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND THEN
            IF NOT variant_policy.track_batches THEN RAISE EXCEPTION 'Batch tracking is disabled for variant %', NEW.variant_id; END IF;
            IF variant_policy.track_expiry AND NEW.expires_at IS NULL THEN RAISE EXCEPTION 'Expiry is required for variant %', NEW.variant_id; END IF;
            IF NOT variant_policy.track_expiry AND NEW.expires_at IS NOT NULL THEN RAISE EXCEPTION 'Expiry tracking is disabled for variant %', NEW.variant_id; END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_assets' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT variant_policy.track_unique_assets THEN RAISE EXCEPTION 'Unique asset tracking is disabled for variant %', NEW.variant_id; END IF;
    ELSIF TG_TABLE_NAME = 'inventory_serials' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT (variant_policy.track_serials OR variant_policy.track_unique_assets) THEN RAISE EXCEPTION 'Serial tracking is disabled for variant %', NEW.variant_id; END IF;
    ELSIF TG_TABLE_NAME = 'inventory_reservations' THEN
        IF NEW.status = 'ACTIVE' THEN
            SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
            IF FOUND AND NOT variant_policy.track_reservations THEN RAISE EXCEPTION 'Reservation tracking is disabled for variant %', NEW.variant_id; END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'product_variant_units' THEN
        IF NEW.unit_role <> 'BASE' THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
            IF FOUND AND NOT variant_policy.allow_unit_conversions THEN RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id; END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_movements' THEN
        SELECT pv.base_unit_id INTO base_unit FROM product_variants pv WHERE pv.merchant_id = NEW.merchant_id AND pv.id = NEW.variant_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit AND NOT variant_policy.allow_unit_conversions THEN RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id; END IF;
    ELSIF TG_TABLE_NAME = 'inventory_transformation_lines' THEN
        SELECT it.transformation_type INTO transformation_type FROM inventory_transformations it WHERE it.merchant_id = NEW.merchant_id AND it.id = NEW.transformation_id;
        SELECT pv.base_unit_id INTO base_unit FROM product_variants pv WHERE pv.merchant_id = NEW.merchant_id AND pv.id = NEW.variant_id;
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND THEN
            IF transformation_type IN ('PACK_BREAK','REPACK') AND NOT variant_policy.allow_pack_breaking THEN RAISE EXCEPTION 'Pack breaking is disabled for variant %', NEW.variant_id; END IF;
            IF NEW.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM base_unit AND NOT variant_policy.allow_unit_conversions THEN RAISE EXCEPTION 'Unit conversions are disabled for variant %', NEW.variant_id; END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'barcode_registry' AND NEW.variant_id IS NOT NULL THEN
        SELECT vip.* INTO variant_policy FROM variant_inventory_policies vip WHERE vip.merchant_id = NEW.merchant_id AND vip.variant_id = NEW.variant_id;
        IF FOUND AND NOT variant_policy.allow_multiple_barcodes AND EXISTS (SELECT 1 FROM barcode_registry b WHERE b.merchant_id = NEW.merchant_id AND b.variant_id = NEW.variant_id AND b.is_active AND (TG_OP <> 'UPDATE' OR b.id <> NEW.id)) THEN
            RAISE EXCEPTION 'Multiple barcodes are disabled for variant %', NEW.variant_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
`

const currencySeeds = `
INSERT INTO currencies(code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('EUR', 'Euro', '€', 2)
ON CONFLICT (code) DO NOTHING;
`

const referenceCurrencies = `
INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'Pound Sterling', '£', 2)
ON CONFLICT (code) DO NOTHING;
`

const portalOperations = `
ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS shop_id UUID;
DO $$ BEGIN
    ALTER TABLE user_memberships ADD CONSTRAINT user_memberships_shop_fk
        FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_user_memberships_shop ON user_memberships(merchant_id, shop_id) WHERE shop_id IS NOT NULL;
INSERT INTO locations(merchant_id, shop_id, code, name, location_type, is_active)
SELECT s.merchant_id, s.id, 'SHOP-' || s.code, s.name || ' stock', 'SHOP', s.is_active
FROM shops s
WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.merchant_id=s.merchant_id AND l.shop_id=s.id AND l.location_type='SHOP')
ON CONFLICT (merchant_id, code) DO NOTHING;
`

const directStockReceipts = `
DO $$
DECLARE existing_constraint TEXT;
BEGIN
    SELECT c.conname INTO existing_constraint
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
`
const directReceiptScope = `
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
`
const variantInventoryTriggerScope = `
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
`

const shopModules = `
CREATE TABLE IF NOT EXISTS shop_modules (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    module_code VARCHAR(100) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    PRIMARY KEY (merchant_id, shop_id, module_code),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);
INSERT INTO modules(code, name, description) VALUES
    ('sales', 'Sales', 'Point of sale and commerce workflows'),
    ('repair', 'Repairs', 'Repair tickets, diagnostics, parts and warranties'),
    ('clinic', 'Clinic', 'Clinical service workflows'),
    ('services', 'Services', 'General service orders and service catalog')
ON CONFLICT (code) DO NOTHING;
`

const repairPaymentMedia = `
ALTER TABLE repair_orders
    ADD COLUMN IF NOT EXISTS customer_id UUID,
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID';
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_payment_status_check;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_payment_status_check CHECK (payment_status IN ('UNPAID','AMOUNT_PAID','PAID'));
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_deposit_check;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_deposit_check CHECK (deposit_paid >= 0 AND deposit_paid <= estimated_cost);
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_customer_fk;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_customer_fk FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS repair_payment_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    payment_kind VARCHAR(20) NOT NULL CHECK (payment_kind IN ('DEPOSIT','FINAL','ADJUSTMENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS repair_order_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    image_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE
);
`

const repairTaxAndFees = `
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS include_tax BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS labor_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (labor_fee >= 0);
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS service_id UUID;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS labor_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (labor_fee >= 0);
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0);
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_service_fk;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_service_fk FOREIGN KEY (merchant_id, service_id) REFERENCES service_catalog(merchant_id, id) ON DELETE SET NULL;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_payment_status_check;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_payment_status_check CHECK (payment_status IN ('UNPAID','DEPOSIT_PAID','AMOUNT_PAID','PAID'));
`

const shopDeliveries = `
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_info VARCHAR(500) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, shop_id, name),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deliveries_shop ON deliveries(merchant_id, shop_id, is_active, name);
`

const posInvoiceMetadata = `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_contact VARCHAR(500);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50);
ALTER TABLE orders ADD CONSTRAINT orders_delivery_fk FOREIGN KEY (merchant_id, delivery_id) REFERENCES deliveries(merchant_id, id) ON DELETE SET NULL;
`

const repairDepositTotalConstraint = `
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
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_deposit_check CHECK (deposit_paid >= 0 AND deposit_paid <= total_cost);
`

const repairRemoveEstimatedCost = `
ALTER TABLE repair_orders DROP COLUMN IF EXISTS estimated_cost;
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_deposit_check;
ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_deposit_check CHECK (deposit_paid >= 0 AND deposit_paid <= total_cost);
`

const receiptAndPrinterSettings = `
ALTER TABLE shops ADD COLUMN IF NOT EXISTS footer_note TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS tax_label VARCHAR(100) NOT NULL DEFAULT 'Tax';
ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS receipt_note TEXT NOT NULL DEFAULT '';
`

const repairAdditionalFee = `
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0);
`

const mobileSynchronization = `
CREATE SEQUENCE IF NOT EXISTS sync_server_sequence_seq;
CREATE TABLE IF NOT EXISTS sync_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    membership_id UUID,
    device_identifier VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    last_seen_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, device_identifier),
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (membership_id)
);
CREATE TABLE IF NOT EXISTS sync_entity_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    client_session_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','FAILED','CANCELLED')),
    last_server_sequence BIGINT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, device_id, client_session_key),
    FOREIGN KEY (merchant_id, device_id) REFERENCES sync_devices(merchant_id, id) ON DELETE CASCADE,
    CHECK (last_server_sequence IS NULL OR last_server_sequence >= 0),
    CHECK ((status = 'OPEN' AND completed_at IS NULL) OR status <> 'OPEN')
);
CREATE TABLE IF NOT EXISTS sync_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    session_id UUID,
    client_operation_id VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('CREATE','UPDATE','DELETE')),
    base_version BIGINT,
    payload_hash VARCHAR(64),
    dependency_client_operation_id VARCHAR(255),
    server_sequence BIGINT DEFAULT nextval('sync_server_sequence_seq'),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPLIED','REJECTED','CONFLICT')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_payload JSONB,
    result_entity_version BIGINT,
    applied_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, device_id, client_operation_id),
    UNIQUE (merchant_id, server_sequence),
    FOREIGN KEY (merchant_id, device_id) REFERENCES sync_devices(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, session_id) REFERENCES sync_sessions(merchant_id, id) ON DELETE SET NULL (session_id),
    CHECK (base_version IS NULL OR base_version >= 0),
    CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
    CHECK (result_entity_version IS NULL OR result_entity_version > 0),
    CHECK (dependency_client_operation_id IS NULL OR dependency_client_operation_id <> client_operation_id),
    CHECK ((status = 'APPLIED' AND applied_at IS NOT NULL) OR status <> 'APPLIED')
);
CREATE TABLE IF NOT EXISTS sync_checkpoints (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    scope VARCHAR(100) NOT NULL,
    server_sequence BIGINT NOT NULL CHECK (server_sequence >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, device_id, scope),
    FOREIGN KEY (merchant_id, device_id) REFERENCES sync_devices(merchant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    operation_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
    server_payload JSONB,
    client_payload JSONB,
    resolution JSONB,
    resolved_at TIMESTAMPTZ,
    resolved_by_membership_id UUID,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, operation_id) REFERENCES sync_operations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, resolved_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (resolved_by_membership_id),
    CHECK ((status = 'OPEN' AND resolved_at IS NULL) OR status <> 'OPEN')
);
CREATE TABLE IF NOT EXISTS sync_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    server_sequence BIGINT NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_version BIGINT NOT NULL CHECK (entity_version > 0),
    operation_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, server_sequence),
    UNIQUE (merchant_id, entity_type, entity_id, entity_version),
    FOREIGN KEY (merchant_id, operation_id) REFERENCES sync_operations(merchant_id, id) ON DELETE SET NULL (operation_id)
);
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID,
    operation_id UUID,
    level VARCHAR(20) NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
    message TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, device_id) REFERENCES sync_devices(merchant_id, id) ON DELETE SET NULL (device_id),
    FOREIGN KEY (merchant_id, operation_id) REFERENCES sync_operations(merchant_id, id) ON DELETE SET NULL (operation_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_devices_membership ON sync_devices(merchant_id, membership_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_entity_versions_entity ON sync_entity_versions(merchant_id, entity_type, entity_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_device_status ON sync_sessions(merchant_id, device_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_operations_pending ON sync_operations(merchant_id, device_id, status, server_sequence);
CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_device ON sync_checkpoints(merchant_id, device_id, scope, server_sequence);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(merchant_id, status, operation_id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_entity_sequence ON sync_changes(merchant_id, entity_type, entity_id, server_sequence);
CREATE INDEX IF NOT EXISTS idx_sync_logs_merchant_time ON sync_logs(merchant_id, created_at DESC);
ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_entity_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_conflicts FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_devices' AND policyname='sync_devices_tenant') THEN
        CREATE POLICY sync_devices_tenant ON sync_devices USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_entity_versions' AND policyname='sync_entity_versions_tenant') THEN
        CREATE POLICY sync_entity_versions_tenant ON sync_entity_versions USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_sessions' AND policyname='sync_sessions_tenant') THEN
        CREATE POLICY sync_sessions_tenant ON sync_sessions USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_operations' AND policyname='sync_operations_tenant') THEN
        CREATE POLICY sync_operations_tenant ON sync_operations USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_checkpoints' AND policyname='sync_checkpoints_tenant') THEN
        CREATE POLICY sync_checkpoints_tenant ON sync_checkpoints USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_conflicts' AND policyname='sync_conflicts_tenant') THEN
        CREATE POLICY sync_conflicts_tenant ON sync_conflicts USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_changes' AND policyname='sync_changes_tenant') THEN
        CREATE POLICY sync_changes_tenant ON sync_changes USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sync_logs' AND policyname='sync_logs_tenant') THEN
        CREATE POLICY sync_logs_tenant ON sync_logs USING (app_can_read_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
    END IF;
END;
$$;
CREATE OR REPLACE FUNCTION validate_sync_operation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version BIGINT;
BEGIN
    IF NEW.status = 'APPLIED' THEN
        NEW.applied_at := COALESCE(NEW.applied_at, now());
    ELSIF NEW.status <> 'APPLIED' THEN
        NEW.applied_at := NULL;
    END IF;
    IF NEW.status IN ('PENDING','APPLIED') THEN
        SELECT version INTO current_version FROM sync_entity_versions WHERE merchant_id=NEW.merchant_id AND entity_type=NEW.entity_type AND entity_id=NEW.entity_id;
        IF NEW.operation_type='CREATE' AND current_version IS NOT NULL THEN
            NEW.status := 'CONFLICT';
        ELSIF NEW.operation_type<>'CREATE' AND current_version IS NOT NULL AND NEW.base_version IS DISTINCT FROM current_version THEN
            NEW.status := 'CONFLICT';
        ELSIF NEW.operation_type<>'CREATE' AND current_version IS NULL AND NEW.base_version IS NOT NULL AND NEW.base_version > 0 THEN
            NEW.status := 'CONFLICT';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
`

const syncOperationIntegrity = `
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64);
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS dependency_client_operation_id VARCHAR(255);
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS result_payload JSONB;
ALTER TABLE sync_operations ADD COLUMN IF NOT EXISTS result_entity_version BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_payload_hash_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_payload_hash_check CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_result_entity_version_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_result_entity_version_check CHECK (result_entity_version IS NULL OR result_entity_version > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_operations_dependency_not_self_check') THEN
        ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_dependency_not_self_check CHECK (dependency_client_operation_id IS NULL OR dependency_client_operation_id <> client_operation_id);
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_sync_operations_dependency ON sync_operations(merchant_id,device_id,dependency_client_operation_id);
`

const repairDrafts = `
CREATE TABLE IF NOT EXISTS repair_drafts (
    id UUID NOT NULL,
    merchant_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    created_by_membership_id UUID,
    payload JSONB NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id,id),
    FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id,created_by_membership_id) REFERENCES user_memberships(merchant_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_repair_drafts_scope ON repair_drafts(merchant_id,shop_id,updated_at DESC);
ALTER TABLE repair_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS repair_drafts_tenant_isolation ON repair_drafts;
CREATE POLICY repair_drafts_tenant_isolation ON repair_drafts USING (merchant_id=current_setting('app.merchant_id',true)::uuid);
`

const syncShopScopeAndChangeType = `
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS shop_id UUID;
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS operation_type VARCHAR(20) NOT NULL DEFAULT 'UPDATE';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_changes_operation_type_check') THEN
        ALTER TABLE sync_changes ADD CONSTRAINT sync_changes_operation_type_check CHECK (operation_type IN ('CREATE','UPDATE','DELETE'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sync_changes_shop_scope_fk') THEN
        ALTER TABLE sync_changes ADD CONSTRAINT sync_changes_shop_scope_fk FOREIGN KEY (merchant_id,shop_id) REFERENCES shops(merchant_id,id) ON DELETE CASCADE;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_sync_changes_shop_sequence ON sync_changes(merchant_id,shop_id,server_sequence);
`

const posComplexityLevel = `
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchants' AND column_name='pos_complexity_level'
    ) THEN
        ALTER TABLE merchants ADD COLUMN pos_complexity_level VARCHAR(10) NOT NULL DEFAULT 'COMPLEX';
        ALTER TABLE merchants ADD CONSTRAINT merchants_pos_complexity_level_check
            CHECK (pos_complexity_level IN ('SIMPLE', 'COMPLEX'));
        ALTER TABLE merchants ALTER COLUMN pos_complexity_level SET DEFAULT 'SIMPLE';
    END IF;
END $$;
`

const repairStatuses = `
ALTER TABLE repair_orders DROP CONSTRAINT IF EXISTS repair_orders_status_check;
UPDATE repair_orders
SET status = CASE status
    WHEN 'DIAGNOSING' THEN 'IN_PROGRESS'
    WHEN 'AWAITING_APPROVAL' THEN 'IN_PROGRESS'
    WHEN 'IN_REPAIR' THEN 'IN_PROGRESS'
    WHEN 'READY' THEN 'READY_FOR_PICKUP'
    WHEN 'CANCELLED' THEN 'REFUNDED'
    ELSE status
END;
ALTER TABLE repair_orders
    ADD CONSTRAINT repair_orders_status_check
    CHECK (status IN ('RECEIVED','IN_PROGRESS','READY_FOR_PICKUP','COMPLETED','REFUNDED'));
`

const serviceWorkItemsAndForms = `
CREATE TABLE IF NOT EXISTS service_order_work_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
    item_type VARCHAR(20) NOT NULL DEFAULT 'DEVICE' CHECK (item_type IN ('DEVICE','VEHICLE','PATIENT','OTHER')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
    form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version > 0),
    assigned_membership_id UUID,
    summary VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, service_order_id, sequence_number),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, assigned_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS repair_work_item_devices (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL,
    repair_device_id UUID NOT NULL,
    issue_description TEXT NOT NULL,
    notes TEXT,
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, work_item_id),
    UNIQUE (merchant_id, repair_device_id),
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, repair_device_id) REFERENCES repair_devices(merchant_id, id) ON DELETE RESTRICT
);
ALTER TABLE repair_order_images ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE repair_diagnostics ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE repair_order_parts ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE repair_approvals ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE repair_warranties ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE service_order_attachments ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE service_order_work_items ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_order_images_work_item_fk') THEN ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_diagnostics_work_item_fk') THEN ALTER TABLE repair_diagnostics ADD CONSTRAINT repair_diagnostics_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_order_parts_work_item_fk') THEN ALTER TABLE repair_order_parts ADD CONSTRAINT repair_order_parts_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_approvals_work_item_fk') THEN ALTER TABLE repair_approvals ADD CONSTRAINT repair_approvals_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_warranties_work_item_fk') THEN ALTER TABLE repair_warranties ADD CONSTRAINT repair_warranties_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_order_attachments_work_item_fk') THEN ALTER TABLE service_order_attachments ADD CONSTRAINT service_order_attachments_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL; END IF;
END $$;
INSERT INTO service_order_work_items (merchant_id, service_order_id, sequence_number, item_type, status, summary)
SELECT ro.merchant_id, ro.service_order_id, 1, 'DEVICE', CASE ro.status WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'REFUNDED' THEN 'CANCELLED' ELSE 'OPEN' END, ro.order_number
FROM repair_orders ro
WHERE NOT EXISTS (SELECT 1 FROM service_order_work_items wi WHERE wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id);
INSERT INTO repair_work_item_devices (merchant_id, work_item_id, repair_device_id, issue_description, notes)
SELECT ro.merchant_id, wi.id, ro.device_id, ro.issue_description, ro.note
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE NOT EXISTS (SELECT 1 FROM repair_work_item_devices existing WHERE existing.merchant_id=ro.merchant_id AND existing.work_item_id=wi.id);
UPDATE repair_order_images i SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE i.merchant_id=ro.merchant_id AND i.repair_order_id=ro.id AND i.work_item_id IS NULL;
UPDATE repair_diagnostics d SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE d.merchant_id=ro.merchant_id AND d.repair_order_id=ro.id AND d.work_item_id IS NULL;
UPDATE repair_order_parts p SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE p.merchant_id=ro.merchant_id AND p.repair_order_id=ro.id AND p.work_item_id IS NULL;
UPDATE repair_approvals a SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE a.merchant_id=ro.merchant_id AND a.repair_order_id=ro.id AND a.work_item_id IS NULL;
UPDATE repair_warranties w SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE w.merchant_id=ro.merchant_id AND w.repair_order_id=ro.id AND w.work_item_id IS NULL;
UPDATE service_order_attachments a SET work_item_id=wi.id
FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id AND wi.sequence_number=1
WHERE a.merchant_id=ro.merchant_id AND a.service_order_id=ro.service_order_id AND a.work_item_id IS NULL;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS module_code VARCHAR(100) NOT NULL DEFAULT 'SERVICE';
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS service_type VARCHAR(20);
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS field_scope VARCHAR(20) NOT NULL DEFAULT 'TICKET';
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS visibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS section VARCHAR(100);
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS printable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE custom_field_definitions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE custom_field_values ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_value_type_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_value_type_check CHECK (value_type IN ('TEXT','NUMBER','BOOLEAN','DATE','SELECT','JSON'));
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_scope_check CHECK (field_scope IN ('TICKET','WORK_ITEM'));
CREATE INDEX IF NOT EXISTS idx_service_order_work_items_order ON service_order_work_items(merchant_id, service_order_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_repair_work_item_devices_device ON repair_work_item_devices(merchant_id, repair_device_id);
CREATE INDEX IF NOT EXISTS idx_service_order_attachments_work_item ON service_order_attachments(merchant_id, work_item_id, file_object_id);
ALTER TABLE service_order_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_work_items FORCE ROW LEVEL SECURITY;
ALTER TABLE repair_work_item_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_work_item_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON service_order_work_items;
DROP POLICY IF EXISTS tenant_insert ON service_order_work_items;
DROP POLICY IF EXISTS tenant_update ON service_order_work_items;
DROP POLICY IF EXISTS tenant_delete ON service_order_work_items;
DROP POLICY IF EXISTS tenant_select ON repair_work_item_devices;
DROP POLICY IF EXISTS tenant_insert ON repair_work_item_devices;
DROP POLICY IF EXISTS tenant_update ON repair_work_item_devices;
DROP POLICY IF EXISTS tenant_delete ON repair_work_item_devices;
CREATE POLICY tenant_select ON service_order_work_items FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON service_order_work_items FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON service_order_work_items FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON service_order_work_items FOR DELETE USING (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_select ON repair_work_item_devices FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON repair_work_item_devices FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON repair_work_item_devices FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON repair_work_item_devices FOR DELETE USING (app_can_write_tenant(merchant_id));
`

const repairTicketFormVersions = `
ALTER TABLE repair_orders
    ADD COLUMN IF NOT EXISTS form_version INTEGER NOT NULL DEFAULT 1;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_orders_form_version_check') THEN
        ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_form_version_check CHECK (form_version > 0);
    END IF;
END $$;
`

const workItemFinancialAllocations = `
ALTER TABLE service_order_items ADD COLUMN IF NOT EXISTS work_item_id UUID;
ALTER TABLE repair_work_item_devices ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_order_items_work_item_fk') THEN
        ALTER TABLE service_order_items ADD CONSTRAINT service_order_items_work_item_fk
        FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
END $$;
UPDATE service_order_items item SET work_item_id=work_item.id
FROM service_orders service_order JOIN service_order_work_items work_item
  ON work_item.merchant_id=service_order.merchant_id AND work_item.service_order_id=service_order.id AND work_item.sequence_number=1
WHERE item.merchant_id=service_order.merchant_id AND item.service_order_id=service_order.id
  AND service_order.service_type='REPAIR' AND item.work_item_id IS NULL;
UPDATE repair_work_item_devices device SET additional_fee=repair.additional_fee
FROM repair_orders repair JOIN service_order_work_items work_item
  ON work_item.merchant_id=repair.merchant_id AND work_item.service_order_id=repair.service_order_id AND work_item.sequence_number=1
WHERE device.merchant_id=work_item.merchant_id AND device.work_item_id=work_item.id
  AND device.additional_fee=0 AND repair.additional_fee>0;
CREATE TABLE IF NOT EXISTS service_work_item_payment_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    work_item_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id,payment_id,work_item_id),
    FOREIGN KEY (merchant_id,payment_id) REFERENCES payments(merchant_id,id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id,work_item_id) REFERENCES service_order_work_items(merchant_id,id) ON DELETE CASCADE
);
INSERT INTO service_work_item_payment_allocations(merchant_id,payment_id,work_item_id,amount)
SELECT allocation.merchant_id,allocation.payment_id,work_item.id,payment.amount
FROM repair_payment_allocations allocation
JOIN repair_orders repair ON repair.merchant_id=allocation.merchant_id AND repair.id=allocation.repair_order_id
JOIN service_order_work_items work_item ON work_item.merchant_id=repair.merchant_id AND work_item.service_order_id=repair.service_order_id AND work_item.sequence_number=1
JOIN payments payment ON payment.merchant_id=allocation.merchant_id AND payment.id=allocation.payment_id
WHERE NOT EXISTS (SELECT 1 FROM service_work_item_payment_allocations existing WHERE existing.merchant_id=allocation.merchant_id AND existing.payment_id=allocation.payment_id);
CREATE INDEX IF NOT EXISTS idx_service_order_items_work_item ON service_order_items(merchant_id,work_item_id,id);
CREATE INDEX IF NOT EXISTS idx_service_work_item_payment_allocations_item ON service_work_item_payment_allocations(merchant_id,work_item_id,payment_id);
ALTER TABLE service_work_item_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_work_item_payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON service_work_item_payment_allocations;
DROP POLICY IF EXISTS tenant_insert ON service_work_item_payment_allocations;
DROP POLICY IF EXISTS tenant_update ON service_work_item_payment_allocations;
DROP POLICY IF EXISTS tenant_delete ON service_work_item_payment_allocations;
CREATE POLICY tenant_select ON service_work_item_payment_allocations FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON service_work_item_payment_allocations FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON service_work_item_payment_allocations FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON service_work_item_payment_allocations FOR DELETE USING (app_can_write_tenant(merchant_id));
`

const businessTypes = `
CREATE TABLE IF NOT EXISTS business_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL, description TEXT NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO business_types(code,name) VALUES
('BAR','Bar'),('CLOTHING','Clothing'),('GROCERY','Grocery'),('SHOES','Shoes'),('ELECTRONICS','Electronics'),('MOBILE_DEVICES','Mobile / Laptop / Tablet'),('FOOD','Food')
ON CONFLICT (code) DO NOTHING;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS business_type_id UUID;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shops_business_type_fk') THEN
   ALTER TABLE shops ADD CONSTRAINT shops_business_type_fk FOREIGN KEY (business_type_id) REFERENCES business_types(id) ON DELETE RESTRICT;
 END IF;
END $$;
`

const barcodeCheckout = `
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS asset_id UUID;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_lines_asset_fk') THEN
   ALTER TABLE order_lines ADD CONSTRAINT order_lines_asset_fk FOREIGN KEY (merchant_id,asset_id) REFERENCES inventory_assets(merchant_id,id) ON DELETE RESTRICT;
 END IF;
END $$;
`

const repairTicketBilling = `
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS promotion_id UUID;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='repair_orders_promotion_fk') THEN
        ALTER TABLE repair_orders ADD CONSTRAINT repair_orders_promotion_fk
            FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE SET NULL;
    END IF;
END $$;
UPDATE repair_orders ro
SET promotion_id = (
    SELECT op.promotion_id
    FROM order_promotions op
    JOIN service_orders so ON so.merchant_id=op.merchant_id AND so.order_id=op.order_id
    WHERE op.merchant_id=ro.merchant_id AND so.id=ro.service_order_id
    ORDER BY op.applied_at ASC
    LIMIT 1
)
WHERE ro.promotion_id IS NULL;
`

const catalogVariantImages = `
ALTER TABLE catalog_product_images ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'URL';
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'catalog_product_images'::regclass AND conname = 'catalog_product_images_source_type_check') THEN
        ALTER TABLE catalog_product_images ADD CONSTRAINT catalog_product_images_source_type_check CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD'));
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS catalog_variant_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL, image_url TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'URL' CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD')),
    alt_text VARCHAR(500), position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id), FOREIGN KEY (merchant_id,variant_id) REFERENCES product_variants(merchant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_catalog_variant_images_variant ON catalog_variant_images(merchant_id,variant_id,position);
ALTER TABLE catalog_variant_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_variant_images FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_insert ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_update ON catalog_variant_images;
DROP POLICY IF EXISTS tenant_delete ON catalog_variant_images;
CREATE POLICY tenant_select ON catalog_variant_images FOR SELECT USING (app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON catalog_variant_images FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_update ON catalog_variant_images FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id));
CREATE POLICY tenant_delete ON catalog_variant_images FOR DELETE USING (app_can_write_tenant(merchant_id));
`

const mediaImageURLs = `
ALTER TABLE repair_order_images ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE repair_order_images ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'LEGACY_BASE64';
ALTER TABLE repair_order_images ALTER COLUMN image_data DROP NOT NULL;
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'repair_order_images'::regclass AND conname = 'repair_order_images_source_type_check') THEN
		ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_source_type_check CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD','LEGACY_BASE64'));
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'repair_order_images'::regclass AND conname = 'repair_order_images_storage_check') THEN
		ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_storage_check CHECK ((source_type = 'LEGACY_BASE64' AND image_data IS NOT NULL AND image_url IS NULL) OR (source_type <> 'LEGACY_BASE64' AND image_url IS NOT NULL AND image_data IS NULL));
	END IF;
END $$;
`

const merchantPaymentTypes = `
CREATE TABLE IF NOT EXISTS payment_type_categories(code VARCHAR(20) PRIMARY KEY CHECK(code IN ('CASH','ONLINE','DIGITAL')),name VARCHAR(100) NOT NULL UNIQUE,is_available BOOLEAN NOT NULL DEFAULT TRUE);
INSERT INTO payment_type_categories(code,name,is_available) VALUES('CASH','Cash',TRUE),('ONLINE','Online',TRUE),('DIGITAL','Digital',FALSE) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,is_available=EXCLUDED.is_available;
CREATE TABLE IF NOT EXISTS payment_types(id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,category_code VARCHAR(20) NOT NULL REFERENCES payment_type_categories(code) ON DELETE RESTRICT,name VARCHAR(255) NOT NULL,is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(merchant_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_types_merchant_name ON payment_types(merchant_id,lower(name));
CREATE INDEX IF NOT EXISTS idx_payment_types_merchant_category ON payment_types(merchant_id,category_code,is_active,name);
INSERT INTO payment_types(merchant_id,category_code,name) SELECT id,'CASH','Cash' FROM merchants ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION provision_default_payment_type() RETURNS TRIGGER AS $$ BEGIN INSERT INTO payment_types(merchant_id,category_code,name) VALUES(NEW.id,'CASH','Cash') ON CONFLICT DO NOTHING; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS merchants_default_payment_type ON merchants;
CREATE TRIGGER merchants_default_payment_type AFTER INSERT ON merchants FOR EACH ROW EXECUTE FUNCTION provision_default_payment_type();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type_id UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_type_id UUID;
ALTER TABLE payments ALTER COLUMN method TYPE VARCHAR(255);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='orders_payment_type_fk') THEN ALTER TABLE orders ADD CONSTRAINT orders_payment_type_fk FOREIGN KEY(merchant_id,payment_type_id) REFERENCES payment_types(merchant_id,id) ON DELETE RESTRICT; END IF; IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='payments_payment_type_fk') THEN ALTER TABLE payments ADD CONSTRAINT payments_payment_type_fk FOREIGN KEY(merchant_id,payment_type_id) REFERENCES payment_types(merchant_id,id) ON DELETE RESTRICT; END IF; END $$;
UPDATE payments p SET payment_type_id=pt.id FROM payment_types pt WHERE pt.merchant_id=p.merchant_id AND pt.name='Cash' AND p.method='CASH' AND p.payment_type_id IS NULL;
UPDATE orders o SET payment_type_id=pt.id FROM payment_types pt WHERE pt.merchant_id=o.merchant_id AND pt.name='Cash' AND o.payment_type='CASH' AND o.payment_type_id IS NULL;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY; ALTER TABLE payment_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON payment_types; DROP POLICY IF EXISTS tenant_insert ON payment_types; DROP POLICY IF EXISTS tenant_update ON payment_types; DROP POLICY IF EXISTS tenant_delete ON payment_types;
CREATE POLICY tenant_select ON payment_types FOR SELECT USING(app_can_read_tenant(merchant_id));
CREATE POLICY tenant_insert ON payment_types FOR INSERT WITH CHECK(app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON payment_types FOR UPDATE USING(app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage')) WITH CHECK(app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON payment_types FOR DELETE USING(app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
`

const superAdminSupport = `
ALTER TABLE platform_admin_identities ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE platform_admin_identities SET is_super_admin = TRUE
WHERE identity_id = (
    SELECT identity_id FROM platform_admin_identities ORDER BY created_at ASC LIMIT 1
);
`

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migrations: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	migrations := []struct {
		version string
		sql     string
	}{
		{version: "0001_user_management_policies", sql: userManagementPolicies},
		{version: "0002_platform_admin_support", sql: platformAdminSupport},
		{version: "0003_catalog_variant_trigger_fix", sql: catalogVariantTriggerFix},
		{version: "0004_currency_seeds", sql: currencySeeds},
		{version: "0004_seed_reference_currencies", sql: referenceCurrencies},
		{version: "0005_portal_operations", sql: portalOperations},
		{version: "0006_direct_stock_receipts", sql: directStockReceipts},
		{version: "0007_direct_receipt_scope", sql: directReceiptScope},
		{version: "0008_variant_inventory_trigger_scope", sql: variantInventoryTriggerScope},
		{version: "0009_shop_modules", sql: shopModules},
		{version: "0010_repair_payment_media", sql: repairPaymentMedia},
		{version: "0011_repair_tax_and_fees", sql: repairTaxAndFees},
		{version: "0012_shop_deliveries", sql: shopDeliveries},
		{version: "0013_pos_invoice_metadata", sql: posInvoiceMetadata},
		{version: "0014_repair_deposit_total_constraint", sql: repairDepositTotalConstraint},
		{version: "0015_repair_remove_estimated_cost", sql: repairRemoveEstimatedCost},
		{version: "0016_receipt_and_printer_settings", sql: receiptAndPrinterSettings},
		{version: "0017_repair_additional_fee", sql: repairAdditionalFee},
		{version: "0018_mobile_synchronization", sql: mobileSynchronization},
		{version: "0019_sync_operation_integrity", sql: syncOperationIntegrity},
		{version: "0020_repair_drafts", sql: repairDrafts},
		{version: "0021_sync_shop_scope_and_change_type", sql: syncShopScopeAndChangeType},
		{version: "0022_pos_complexity_level", sql: posComplexityLevel},
		{version: "0023_repair_statuses", sql: repairStatuses},
		{version: "0024_service_work_items_and_forms", sql: serviceWorkItemsAndForms},
		{version: "0025_repair_ticket_form_versions", sql: repairTicketFormVersions},
		{version: "0026_work_item_financial_allocations", sql: workItemFinancialAllocations},
		{version: "0027_one_price_per_variant", sql: onePricePerVariant},
		{version: "0028_business_types", sql: businessTypes},
		{version: "0029_barcode_checkout", sql: barcodeCheckout},
		{version: "0030_product_dates", sql: productDates},
		{version: "0031_repair_ticket_billing", sql: repairTicketBilling},
		{version: "0032_catalog_variant_images", sql: catalogVariantImages},
		{version: "0033_media_image_urls", sql: mediaImageURLs},
		{version: "0034_repair_issues_conditions_presets", sql: repairIssuesConditionsPresets},
		{version: "0035_repair_waiting_time", sql: repairWaitingTime},
		{version: "0036_merchant_payment_types", sql: merchantPaymentTypes},
		{version: "0037_user_identity_bootstrap_rls", sql: userIdentityBootstrapPolicyFix},
		{version: "0038_super_admin_support", sql: superAdminSupport},
	}
	for _, migration := range migrations {
		var applied bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, migration.version).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", migration.version, err)
		}
		if applied {
			continue
		}
		if _, err := tx.Exec(ctx, migration.sql); err != nil {
			return fmt.Errorf("apply migration %s: %w", migration.version, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1)`, migration.version); err != nil {
			return fmt.Errorf("record migration %s: %w", migration.version, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migrations: %w", err)
	}
	return nil
}
