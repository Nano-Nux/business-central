ALTER TABLE repair_work_item_devices
    ADD COLUMN IF NOT EXISTS waiting_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS waiting_end_date DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE repair_work_item_devices device
SET waiting_start_date = repair.received_at::date,
    waiting_end_date = repair.received_at::date
FROM service_order_work_items work_item
JOIN repair_orders repair
  ON repair.merchant_id = work_item.merchant_id
 AND repair.service_order_id = work_item.service_order_id
WHERE device.merchant_id = work_item.merchant_id
  AND device.work_item_id = work_item.id;

ALTER TABLE repair_work_item_devices
    DROP CONSTRAINT IF EXISTS repair_work_item_devices_waiting_range;

ALTER TABLE repair_work_item_devices
    ADD CONSTRAINT repair_work_item_devices_waiting_range
    CHECK (waiting_end_date >= waiting_start_date);
