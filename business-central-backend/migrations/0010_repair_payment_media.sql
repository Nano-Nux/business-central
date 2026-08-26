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
