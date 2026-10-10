-- Merchant-authorized hard correction is the only exception to ledger guards.
-- The flag is scoped to a DELETE trigger and reset before returning.
CREATE OR REPLACE FUNCTION order_purge_active() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT pg_trigger_depth()>1
 AND nullif(current_setting('app.purge_order',true),'') IS NOT NULL
 AND current_setting('app.purge_merchant',true)=app_current_merchant_id()::text;
$$;
CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Inventory movements are append-only; create a reversal movement instead';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_link_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Inventory movement links are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_identity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND order_purge_active() THEN RETURN NEW; END IF;
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'inventory_assets'
       AND NEW.variant_id IS NOT DISTINCT FROM OLD.variant_id
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND NEW.serial_id IS NOT DISTINCT FROM OLD.serial_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Inventory serials and assets cannot be manually moved or deleted';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_payment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Payments are append-only; use a void or failure status';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_refund_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Refunds are append-only; update the refund status instead';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_status VARCHAR(20);
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    IF TG_TABLE_NAME = 'journal_entries' THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.status = 'POSTED' THEN
                NEW.posted_at := COALESCE(NEW.posted_at, now());
            END IF;
            RETURN NEW;
        END IF;
        IF TG_OP = 'DELETE' THEN
            IF OLD.status = 'POSTED' THEN
                RAISE EXCEPTION 'Posted journal entries are immutable';
            END IF;
            RETURN OLD;
        END IF;
        IF OLD.status = 'POSTED' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.accounting_event_id IS DISTINCT FROM OLD.accounting_event_id) THEN
            RAISE EXCEPTION 'Posted journal entries are immutable';
        END IF;
        IF NEW.status = 'POSTED' THEN
            NEW.posted_at := COALESCE(NEW.posted_at, now());
        END IF;
        RETURN NEW;
    END IF;

    SELECT status INTO entry_status
      FROM journal_entries
     WHERE merchant_id = COALESCE(NEW.merchant_id, OLD.merchant_id)
       AND id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    IF entry_status = 'POSTED' THEN
        RAISE EXCEPTION 'Posted journal lines are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_promotion_redemption_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Promotion redemptions are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_promotion_counter_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND order_purge_active() THEN RETURN NEW; END IF;
    IF pg_trigger_depth() <= 1
       AND NEW.redemption_count IS DISTINCT FROM OLD.redemption_count THEN
        RAISE EXCEPTION 'Promotion redemption counters are maintained by promotion redemptions';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC(20,6);
BEGIN
    IF TG_OP='DELETE' AND order_purge_active() THEN RETURN OLD; END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Reservations are released or consumed; they are not deleted';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id
           OR OLD.location_id IS DISTINCT FROM NEW.location_id
           OR OLD.variant_id IS DISTINCT FROM NEW.variant_id
           OR OLD.order_line_id IS DISTINCT FROM NEW.order_line_id
           OR OLD.quantity IS DISTINCT FROM NEW.quantity
           OR OLD.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'Reservation scope and quantity are immutable';
        END IF;
        IF NEW.status = 'ACTIVE' THEN
            RETURN NEW;
        END IF;
        UPDATE inventory_balances
        SET quantity_reserved = quantity_reserved - OLD.quantity, updated_at = now()
        WHERE merchant_id = OLD.merchant_id AND location_id = OLD.location_id AND variant_id = OLD.variant_id
          AND quantity_reserved >= OLD.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Reservation balance is inconsistent'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
    SELECT quantity_on_hand - quantity_reserved INTO available
    FROM inventory_balances
    WHERE merchant_id = NEW.merchant_id AND location_id = NEW.location_id AND variant_id = NEW.variant_id
    FOR UPDATE;
    IF NOT FOUND OR available < NEW.quantity THEN
        RAISE EXCEPTION 'Insufficient available inventory for reservation';
    END IF;
    UPDATE inventory_balances SET quantity_reserved = quantity_reserved + NEW.quantity, updated_at = now()
    WHERE merchant_id = NEW.merchant_id AND location_id = NEW.location_id AND variant_id = NEW.variant_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION purge_order_dependencies() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mids uuid[]; pids uuid[]; rids uuid[]; eids uuid[]; actor uuid; assigned uuid; sid uuid;
BEGIN
 -- Other order contexts keep their existing deletion guards and lifecycle.
 IF OLD.channel NOT IN ('POS','TELEGRAM') THEN RETURN OLD; END IF;
 SELECT um.id,um.shop_id INTO actor,assigned FROM user_memberships um
 JOIN membership_roles mr ON mr.merchant_id=um.merchant_id AND mr.membership_id=um.id
 JOIN roles r ON r.merchant_id=mr.merchant_id AND r.id=mr.role_id
 WHERE um.merchant_id=OLD.merchant_id AND um.identity_id=app_current_user_id() AND um.is_active AND r.code IN ('merchant','owner') LIMIT 1;
 SELECT shop_id INTO sid FROM locations WHERE merchant_id=OLD.merchant_id AND id=OLD.fulfillment_location_id;
 IF actor IS NULL OR NOT app_can_write_tenant(OLD.merchant_id) OR (assigned IS NOT NULL AND assigned IS DISTINCT FROM sid) THEN
  RAISE EXCEPTION 'Only a merchant owner with tenant.write can permanently correct transactions' USING ERRCODE='42501';
 END IF;
 PERFORM set_config('app.purge_order',OLD.id::text,true),set_config('app.purge_merchant',OLD.merchant_id::text,true);
 WITH RECURSIVE affected AS (
  SELECT m.id FROM inventory_movements m JOIN order_lines l ON l.merchant_id=m.merchant_id AND l.id=m.order_line_id WHERE l.merchant_id=OLD.merchant_id AND l.order_id=OLD.id
  UNION SELECT m.id FROM inventory_movements m JOIN affected a ON m.reverses_movement_id=a.id WHERE m.merchant_id=OLD.merchant_id
 ) SELECT COALESCE(array_agg(id),'{}') INTO mids FROM affected;
 PERFORM 1 FROM inventory_balances WHERE merchant_id=OLD.merchant_id AND (variant_id,location_id) IN (SELECT variant_id,coalesce(source_location_id,destination_location_id) FROM inventory_movements WHERE merchant_id=OLD.merchant_id AND id=ANY(mids)) ORDER BY variant_id,location_id FOR UPDATE;
 PERFORM 1 FROM inventory_cost_layers WHERE merchant_id=OLD.merchant_id AND id IN (SELECT cost_layer_id FROM inventory_cost_allocations WHERE merchant_id=OLD.merchant_id AND consumption_movement_id=ANY(mids)) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM inventory_cost_allocations a JOIN inventory_cost_layers l ON l.merchant_id=a.merchant_id AND l.id=a.cost_layer_id WHERE l.merchant_id=OLD.merchant_id AND l.receipt_movement_id=ANY(mids) AND NOT a.consumption_movement_id=ANY(mids)) THEN
  RAISE EXCEPTION 'Returned stock has been consumed by another transaction; correct the dependent transaction first';
 END IF;
 SELECT COALESCE(array_agg(id),'{}') INTO pids FROM payments WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 SELECT COALESCE(array_agg(id),'{}') INTO rids FROM refunds WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 SELECT COALESCE(array_agg(id),'{}') INTO eids FROM accounting_events WHERE merchant_id=OLD.merchant_id AND (source_order_id=OLD.id OR source_payment_id=ANY(pids) OR source_refund_id=ANY(rids) OR source_movement_id=ANY(mids));
 DELETE FROM journal_entries WHERE merchant_id=OLD.merchant_id AND accounting_event_id=ANY(eids);
 DELETE FROM accounting_events WHERE merchant_id=OLD.merchant_id AND id=ANY(eids);
 UPDATE inventory_cost_layers l SET quantity_remaining=l.quantity_remaining+a.qty FROM (SELECT cost_layer_id,sum(quantity) qty FROM inventory_cost_allocations WHERE merchant_id=OLD.merchant_id AND consumption_movement_id=ANY(mids) GROUP BY cost_layer_id) a WHERE l.merchant_id=OLD.merchant_id AND l.id=a.cost_layer_id AND NOT l.receipt_movement_id=ANY(mids);
 DELETE FROM inventory_cost_allocations WHERE merchant_id=OLD.merchant_id AND consumption_movement_id=ANY(mids);
 DELETE FROM inventory_cost_layers WHERE merchant_id=OLD.merchant_id AND receipt_movement_id=ANY(mids);
 UPDATE inventory_balances b SET quantity_on_hand=b.quantity_on_hand+x.delta,updated_at=now() FROM (
  SELECT variant_id,location_id,sum(delta) delta FROM (
   SELECT variant_id,source_location_id location_id,quantity delta FROM inventory_movements WHERE merchant_id=OLD.merchant_id AND id=ANY(mids) AND source_location_id IS NOT NULL
   UNION ALL SELECT variant_id,destination_location_id,-quantity FROM inventory_movements WHERE merchant_id=OLD.merchant_id AND id=ANY(mids) AND destination_location_id IS NOT NULL
  ) d GROUP BY variant_id,location_id
 ) x WHERE b.merchant_id=OLD.merchant_id AND b.variant_id=x.variant_id AND b.location_id=x.location_id;
 UPDATE inventory_batches b SET quantity_remaining=b.quantity_remaining+x.qty FROM (SELECT mb.batch_id,sum(mb.quantity) qty FROM inventory_movement_batches mb JOIN inventory_movements m ON m.merchant_id=mb.merchant_id AND m.id=mb.movement_id WHERE m.merchant_id=OLD.merchant_id AND m.id=ANY(mids) AND m.movement_type='SALE' GROUP BY mb.batch_id) x WHERE b.merchant_id=OLD.merchant_id AND b.id=x.batch_id;
 UPDATE inventory_assets SET status='ACTIVE',location_id=OLD.fulfillment_location_id WHERE merchant_id=OLD.merchant_id AND id IN (SELECT asset_id FROM inventory_movement_assets WHERE merchant_id=OLD.merchant_id AND movement_id=ANY(mids));
 UPDATE inventory_serials SET status='AVAILABLE',location_id=OLD.fulfillment_location_id WHERE merchant_id=OLD.merchant_id AND id IN (SELECT serial_id FROM inventory_movement_serials WHERE merchant_id=OLD.merchant_id AND movement_id=ANY(mids));
 DELETE FROM inventory_movements WHERE merchant_id=OLD.merchant_id AND id=ANY(mids);
 UPDATE inventory_reservations SET status='RELEASED',released_at=now() WHERE merchant_id=OLD.merchant_id AND order_line_id IN (SELECT id FROM order_lines WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id) AND status='ACTIVE';
 DELETE FROM inventory_reservations WHERE merchant_id=OLD.merchant_id AND order_line_id IN (SELECT id FROM order_lines WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id);
 UPDATE promotions p SET redemption_count=p.redemption_count-x.n FROM (SELECT promotion_id,count(*)::integer n FROM promotion_redemptions WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id GROUP BY promotion_id) x WHERE p.merchant_id=OLD.merchant_id AND p.id=x.promotion_id;
 UPDATE promotion_codes p SET redemption_count=p.redemption_count-x.n FROM (SELECT code_id,count(*)::integer n FROM promotion_redemptions WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id GROUP BY code_id) x WHERE p.merchant_id=OLD.merchant_id AND p.id=x.code_id;
 DELETE FROM promotion_redemptions WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM cash_transactions WHERE merchant_id=OLD.merchant_id AND (order_id=OLD.id OR payment_id=ANY(pids));
 DELETE FROM fulfillment_lines WHERE merchant_id=OLD.merchant_id AND order_line_id IN (SELECT id FROM order_lines WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id);
 DELETE FROM fulfillments WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM ecommerce_order_item_allocations WHERE merchant_id=OLD.merchant_id AND order_line_id IN (SELECT id FROM order_lines WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id);
 DELETE FROM refunds WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM ecommerce_return_lines WHERE merchant_id=OLD.merchant_id AND order_line_id IN (SELECT id FROM order_lines WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id);
 DELETE FROM ecommerce_returns WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM payments WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM telegram_order_sources WHERE merchant_id=OLD.merchant_id AND order_id=OLD.id;
 DELETE FROM audit_events WHERE merchant_id=OLD.merchant_id AND (entity_id=OLD.id OR entity_id=ANY(mids) OR entity_id=ANY(pids) OR entity_id=ANY(rids));
 DELETE FROM outbox_events WHERE merchant_id=OLD.merchant_id AND (aggregate_id=OLD.id OR aggregate_id=ANY(mids) OR aggregate_id=ANY(pids) OR aggregate_id=ANY(rids));
 DELETE FROM sync_changes WHERE merchant_id=OLD.merchant_id AND (entity_id=OLD.id OR entity_id=ANY(mids) OR entity_id=ANY(pids) OR entity_id=ANY(rids));
 -- Prevent checkout retry or a queued sync operation from recreating deleted history.
 UPDATE idempotency_keys SET response_body=jsonb_build_object('deleted_order_id',OLD.id),status='COMPLETED',response_status=410 WHERE merchant_id=OLD.merchant_id AND status='COMPLETED' AND (response_body->'result'->>'id'=OLD.id::text OR response_body->'result'->>'order_id'=OLD.id::text OR response_body->'request'->>'order_id'=OLD.id::text OR response_body->>'order_id'=OLD.id::text);
 PERFORM set_config('app.purge_order','',true),set_config('app.purge_merchant','',true);
 RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_order_permanent_delete ON orders;
CREATE TRIGGER trg_order_permanent_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION purge_order_dependencies();
