ALTER TABLE service_order_items
    ADD COLUMN IF NOT EXISTS work_item_id UUID;

ALTER TABLE repair_work_item_devices
    ADD COLUMN IF NOT EXISTS additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_order_items_work_item_fk') THEN
        ALTER TABLE service_order_items
            ADD CONSTRAINT service_order_items_work_item_fk
            FOREIGN KEY (merchant_id, work_item_id)
            REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;
    END IF;
END $$;

UPDATE service_order_items item
SET work_item_id = work_item.id
FROM service_orders service_order
JOIN service_order_work_items work_item
  ON work_item.merchant_id = service_order.merchant_id
 AND work_item.service_order_id = service_order.id
 AND work_item.sequence_number = 1
WHERE item.merchant_id = service_order.merchant_id
  AND item.service_order_id = service_order.id
  AND service_order.service_type = 'REPAIR'
  AND item.work_item_id IS NULL;

UPDATE repair_work_item_devices device
SET additional_fee = repair.additional_fee
FROM repair_orders repair
JOIN service_order_work_items work_item
  ON work_item.merchant_id = repair.merchant_id
 AND work_item.service_order_id = repair.service_order_id
 AND work_item.sequence_number = 1
WHERE device.merchant_id = work_item.merchant_id
  AND device.work_item_id = work_item.id
  AND device.additional_fee = 0
  AND repair.additional_fee > 0;

CREATE TABLE IF NOT EXISTS service_work_item_payment_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    work_item_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_id, work_item_id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE CASCADE
);

INSERT INTO service_work_item_payment_allocations (merchant_id, payment_id, work_item_id, amount)
SELECT allocation.merchant_id, allocation.payment_id, work_item.id, payment.amount
FROM repair_payment_allocations allocation
JOIN repair_orders repair
  ON repair.merchant_id = allocation.merchant_id
 AND repair.id = allocation.repair_order_id
JOIN service_order_work_items work_item
  ON work_item.merchant_id = repair.merchant_id
 AND work_item.service_order_id = repair.service_order_id
 AND work_item.sequence_number = 1
JOIN payments payment
  ON payment.merchant_id = allocation.merchant_id
 AND payment.id = allocation.payment_id
WHERE NOT EXISTS (
    SELECT 1 FROM service_work_item_payment_allocations existing
    WHERE existing.merchant_id = allocation.merchant_id
      AND existing.payment_id = allocation.payment_id
);

CREATE INDEX IF NOT EXISTS idx_service_order_items_work_item
    ON service_order_items(merchant_id, work_item_id, id);
CREATE INDEX IF NOT EXISTS idx_service_work_item_payment_allocations_item
    ON service_work_item_payment_allocations(merchant_id, work_item_id, payment_id);

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
