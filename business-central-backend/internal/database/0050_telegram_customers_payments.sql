-- Link existing Telegram orders without matching people by name. Merchant
-- confirmation is the payment acknowledgement; preserve existing payment ledgers.
DO $$
DECLARE previous_service TEXT := current_setting('app.telegram_service', true);
BEGIN
    PERFORM set_config('app.telegram_service','on',true);
    INSERT INTO customers(merchant_id,customer_number,customer_type,display_name,metadata)
    SELECT merchant_id,'TG-'||id::text,'GUEST',COALESCE(NULLIF(billing_address->>'name',''),''),
           '{"source":"TELEGRAM","label":"Online-Telegram-Customer"}'::jsonb
    FROM orders WHERE channel='TELEGRAM' AND customer_id IS NULL
    ON CONFLICT(merchant_id,customer_number) DO NOTHING;

    UPDATE orders o SET customer_id=c.id,payment_type=COALESCE(o.payment_type,'Telegram')
    FROM customers c WHERE o.channel='TELEGRAM' AND o.customer_id IS NULL
      AND c.merchant_id=o.merchant_id AND c.customer_number='TG-'||o.id::text;

    INSERT INTO payments(merchant_id,order_id,method,status,amount,idempotency_key,captured_at)
    SELECT o.merchant_id,o.id,'Telegram',CASE WHEN o.status='DRAFT' THEN 'PENDING' ELSE 'CAPTURED' END,
           o.grand_total,'telegram-payment:'||o.id::text,
           CASE WHEN o.status='DRAFT' THEN NULL ELSE COALESCE(s.confirmed_at,o.updated_at) END
    FROM orders o LEFT JOIN telegram_order_sources s ON s.merchant_id=o.merchant_id AND s.order_id=o.id
    WHERE o.channel='TELEGRAM' AND o.status IN ('DRAFT','CONFIRMED','PROCESSING','PARTIALLY_FULFILLED','FULFILLED')
      AND o.grand_total>0 AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id)
    ON CONFLICT(merchant_id,idempotency_key) DO NOTHING;

    INSERT INTO accounting_events(merchant_id,event_type,source_payment_id,event_key)
    SELECT merchant_id,'PAYMENT_CAPTURED',id,'telegram-payment-captured:'||id::text
    FROM payments WHERE status='CAPTURED' AND idempotency_key='telegram-payment:'||order_id::text
    ON CONFLICT(merchant_id,event_key) DO NOTHING;
    PERFORM set_config('app.telegram_service',COALESCE(previous_service,''),true);
END $$;
