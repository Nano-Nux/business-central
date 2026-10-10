ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS delivery_payment_status_auto_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_payment_status VARCHAR(16) NOT NULL DEFAULT 'COMPLETE' CHECK (delivery_payment_status IN ('UN_PAID','COMPLETE'));
-- Existing orders already captured their delivery fees. Future checkouts resolve
-- the shop default explicitly; never retroactively declare old fees outstanding.
ALTER TABLE orders ALTER COLUMN delivery_payment_status SET DEFAULT 'UN_PAID';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS purpose VARCHAR(16) NOT NULL DEFAULT 'ORDER' CHECK (purpose IN ('ORDER','DELIVERY'));

CREATE OR REPLACE FUNCTION validate_payment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_total NUMERIC(15,2); captured_total NUMERIC(15,2);
BEGIN
    SELECT grand_total INTO order_total
      FROM orders
     WHERE merchant_id = NEW.merchant_id AND id = NEW.order_id
     FOR UPDATE;
    IF order_total IS NULL THEN
        RAISE EXCEPTION 'Payment order must belong to the same merchant';
    END IF;
    IF NEW.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') THEN
        SELECT COALESCE(sum(amount), 0) INTO captured_total
          FROM payments
         WHERE merchant_id = NEW.merchant_id AND order_id = NEW.order_id
           AND status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')
           AND id <> NEW.id;
        -- A replacement delivery receipt can follow a recorded reversal. Keep the
        -- cap on net captured money, subtracting all succeeded refunds, also during receipt status updates.
        captured_total := captured_total - COALESCE((SELECT sum(r.amount) FROM refunds r
          WHERE r.merchant_id=NEW.merchant_id AND r.order_id=NEW.order_id
            AND r.status='SUCCEEDED'),0);
        IF captured_total + NEW.amount > order_total THEN
            RAISE EXCEPTION 'Net captured payments cannot exceed the order total';
        END IF;
        NEW.captured_at := COALESCE(NEW.captured_at, now());
    ELSE
        NEW.captured_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION validate_payment_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id
       OR OLD.order_id IS DISTINCT FROM NEW.order_id
       OR OLD.method IS DISTINCT FROM NEW.method
       OR OLD.purpose IS DISTINCT FROM NEW.purpose
       OR OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
        RAISE EXCEPTION 'Payment identity, method, amount, and idempotency key are immutable';
    END IF;
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('AUTHORIZED','CAPTURED','FAILED','VOIDED'))
        OR (OLD.status = 'AUTHORIZED' AND NEW.status IN ('CAPTURED','FAILED','VOIDED'))
        OR (OLD.status = 'CAPTURED' AND NEW.status IN ('PARTIALLY_REFUNDED','REFUNDED'))
        OR (OLD.status = 'PARTIALLY_REFUNDED' AND NEW.status = 'REFUNDED')
    ) THEN
        RAISE EXCEPTION 'Invalid payment status transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') THEN
        NEW.captured_at := COALESCE(NEW.captured_at, now());
    ELSE
        NEW.captured_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

