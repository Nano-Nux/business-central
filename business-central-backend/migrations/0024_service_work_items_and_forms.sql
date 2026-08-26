-- Introduce repeatable service work items without changing the legacy repair
-- ticket contract. Existing repair tickets are backfilled as one DEVICE item.
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_order_images_work_item_fk') THEN
        ALTER TABLE repair_order_images ADD CONSTRAINT repair_order_images_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_diagnostics_work_item_fk') THEN
        ALTER TABLE repair_diagnostics ADD CONSTRAINT repair_diagnostics_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_order_parts_work_item_fk') THEN
        ALTER TABLE repair_order_parts ADD CONSTRAINT repair_order_parts_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_approvals_work_item_fk') THEN
        ALTER TABLE repair_approvals ADD CONSTRAINT repair_approvals_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_warranties_work_item_fk') THEN
        ALTER TABLE repair_warranties ADD CONSTRAINT repair_warranties_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_order_attachments_work_item_fk') THEN
        ALTER TABLE service_order_attachments ADD CONSTRAINT service_order_attachments_work_item_fk FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
END $$;

INSERT INTO service_order_work_items (merchant_id, service_order_id, sequence_number, item_type, status, summary)
SELECT ro.merchant_id, ro.service_order_id, 1, 'DEVICE',
       CASE ro.status WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'REFUNDED' THEN 'CANCELLED' ELSE 'OPEN' END,
       ro.order_number
  FROM repair_orders ro
 WHERE NOT EXISTS (
       SELECT 1 FROM service_order_work_items wi
        WHERE wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id
   );

INSERT INTO repair_work_item_devices (merchant_id, work_item_id, repair_device_id, issue_description, notes)
SELECT ro.merchant_id, wi.id, ro.device_id, ro.issue_description, ro.note
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE NOT EXISTS (
       SELECT 1 FROM repair_work_item_devices existing
        WHERE existing.merchant_id = ro.merchant_id AND existing.work_item_id = wi.id
   );

UPDATE repair_order_images i
   SET work_item_id = wi.id
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE i.merchant_id = ro.merchant_id AND i.repair_order_id = ro.id AND i.work_item_id IS NULL;
UPDATE repair_diagnostics d
   SET work_item_id = wi.id
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE d.merchant_id = ro.merchant_id AND d.repair_order_id = ro.id AND d.work_item_id IS NULL;
UPDATE repair_order_parts p
   SET work_item_id = wi.id
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE p.merchant_id = ro.merchant_id AND p.repair_order_id = ro.id AND p.work_item_id IS NULL;
UPDATE repair_approvals a
   SET work_item_id = wi.id
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE a.merchant_id = ro.merchant_id AND a.repair_order_id = ro.id AND a.work_item_id IS NULL;
UPDATE repair_warranties w
   SET work_item_id = wi.id
  FROM repair_orders ro
  JOIN service_order_work_items wi
    ON wi.merchant_id = ro.merchant_id AND wi.service_order_id = ro.service_order_id AND wi.sequence_number = 1
 WHERE w.merchant_id = ro.merchant_id AND w.repair_order_id = ro.id AND w.work_item_id IS NULL;
UPDATE service_order_attachments a
   SET work_item_id = wi.id
  FROM service_order_work_items wi
 WHERE a.merchant_id = wi.merchant_id
   AND a.service_order_id = wi.service_order_id
   AND wi.sequence_number = 1
   AND a.work_item_id IS NULL;

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
