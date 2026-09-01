-- Business Central backend database foundation
-- PostgreSQL 15+
-- This file is the canonical database contract for business-central-backend.
-- It is used by the Go Fiber backend and is also the source schema for the
-- mobile SQLite model, after applying SQLite-specific adaptations.
--
-- Database responsibilities:
--   1. Define the persistent domain model and tenant boundaries.
--   2. Protect invariants with constraints, indexes, triggers, and RLS.
--   3. Provide the system-of-record relationships used by backend use cases.
--
-- Application responsibilities:
--   1. Expose APIs through the Go Fiber backend.
--   2. Enforce authentication, authorization, and merchant-module access.
--   3. Coordinate transactions, idempotency, integrations, and sync protocol.
--
-- Do not add frontend-only models here. New business capabilities must first
-- identify their domain owner, tenant boundary, lifecycle, permissions, API
-- behavior, mobile/offline implications, and accounting/inventory effects.
-- Update BUSINESS_CONTEXT.md, ARCHITECTURE.md, ERD.md, DOMAIN_FLOWS.md, and
-- the affected project's FEATURES.md when the domain contract changes.
--
-- This is a fresh-build schema. It intentionally removes the legacy duplicate
-- customer, order, and inventory models instead of preserving compatibility.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE currencies (
    code CHAR(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    decimal_places SMALLINT NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO currencies(code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('EUR', 'Euro', '€', 2)
ON CONFLICT (code) DO NOTHING;

-- Reference currencies required before the first merchant can be created.
INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'Pound Sterling', '£', 2)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    legal_name VARCHAR(255),
    default_currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    country_code CHAR(2),
    pos_complexity_level VARCHAR(10) NOT NULL DEFAULT 'SIMPLE' CHECK (pos_complexity_level IN ('SIMPLE','COMPLEX')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_user_identities_email ON user_identities (lower(email));

CREATE TABLE user_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    identity_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE RESTRICT,
    display_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    shop_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, identity_id)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code)
);

CREATE TABLE business_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_types(code, name) VALUES
    ('BAR', 'Bar'), ('CLOTHING', 'Clothing'), ('GROCERY', 'Grocery'),
    ('SHOES', 'Shoes'), ('ELECTRONICS', 'Electronics'),
    ('MOBILE_DEVICES', 'Mobile / Laptop / Tablet'), ('FOOD', 'Food')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE permissions (
    code VARCHAR(150) PRIMARY KEY,
    description TEXT
);

CREATE TABLE membership_roles (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL,
    role_id UUID NOT NULL,
    granted_by_membership_id UUID,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, membership_id, role_id),
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, role_id) REFERENCES roles(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, granted_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (granted_by_membership_id),
    CHECK (valid_until IS NULL OR valid_until >= granted_at)
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code VARCHAR(150) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    business_type_id UUID REFERENCES business_types(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    footer_note TEXT NOT NULL DEFAULT '',
    timezone VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code)
);

ALTER TABLE user_memberships
    ADD CONSTRAINT user_memberships_shop_fk
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE RESTRICT;

CREATE TABLE deliveries (
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

CREATE INDEX idx_deliveries_shop ON deliveries(merchant_id, shop_id, is_active, name);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    parent_location_id UUID,
    shop_id UUID,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    location_type VARCHAR(30) NOT NULL CHECK (location_type IN ('WAREHOUSE','BIN','SHOP','STOCK_ROOM','FULFILLMENT_CENTER','TRANSIT','VIRTUAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    FOREIGN KEY (merchant_id, parent_location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE RESTRICT,
    CHECK (parent_location_id IS NULL OR parent_location_id <> id),
    CHECK ((location_type = 'SHOP' AND shop_id IS NOT NULL) OR location_type <> 'SHOP')
);

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    identity_id UUID REFERENCES user_identities(id) ON DELETE SET NULL,
    customer_number VARCHAR(100) NOT NULL,
    customer_type VARCHAR(20) NOT NULL DEFAULT 'RETAIL' CHECK (customer_type IN ('RETAIL','WHOLESALE','GUEST')),
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(320),
    phone VARCHAR(50),
    loyalty_identifier VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, customer_number),
    UNIQUE (merchant_id, loyalty_identifier)
);

CREATE UNIQUE INDEX uq_customer_identity ON customers(merchant_id, identity_id) WHERE identity_id IS NOT NULL;
CREATE UNIQUE INDEX uq_customer_email ON customers(merchant_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('BILLING','SHIPPING','OTHER')),
    recipient_name VARCHAR(255) NOT NULL,
    address JSONB NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE,
    UNIQUE (merchant_id, id)
);

CREATE UNIQUE INDEX uq_customer_default_address ON customer_addresses(merchant_id, customer_id, address_type) WHERE is_default;

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    brand_id UUID,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    product_type VARCHAR(20) NOT NULL DEFAULT 'PHYSICAL' CHECK (product_type IN ('PHYSICAL','DIGITAL','SERVICE')),
    manufacture_date DATE,
    expired_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id)
);

CREATE TABLE measurement_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    CHECK (length(trim(code)) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE unit_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    measurement_group_id UUID,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(50),
    dimension_code VARCHAR(100) NOT NULL DEFAULT 'CUSTOM',
    allows_decimal BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    FOREIGN KEY (merchant_id, measurement_group_id) REFERENCES measurement_groups(merchant_id, id) ON DELETE SET NULL (measurement_group_id),
    CHECK (length(trim(code)) > 0),
    CHECK (length(trim(name)) > 0),
    CHECK (length(trim(dimension_code)) > 0)
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit_of_measure VARCHAR(100) NOT NULL DEFAULT 'EA',
    base_unit_id UUID NOT NULL,
    is_stock_tracked BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, sku),
    UNIQUE (merchant_id, barcode),
    FOREIGN KEY (merchant_id, base_unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE variant_inventory_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    track_batches BOOLEAN NOT NULL DEFAULT FALSE,
    track_expiry BOOLEAN NOT NULL DEFAULT FALSE,
    track_serials BOOLEAN NOT NULL DEFAULT FALSE,
    track_unique_assets BOOLEAN NOT NULL DEFAULT FALSE,
    track_reservations BOOLEAN NOT NULL DEFAULT FALSE,
    allow_unit_conversions BOOLEAN NOT NULL DEFAULT FALSE,
    allow_pack_breaking BOOLEAN NOT NULL DEFAULT FALSE,
    allow_multiple_barcodes BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, variant_id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE,
    CHECK (NOT track_expiry OR track_batches),
    CHECK (NOT allow_pack_breaking OR allow_unit_conversions)
);

CREATE TABLE price_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code)
);

CREATE TABLE product_prices (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    price_list_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, price_list_id, variant_id, valid_from),
    CONSTRAINT product_prices_one_per_list_variant UNIQUE (merchant_id, price_list_id, variant_id),
    FOREIGN KEY (merchant_id, price_list_id) REFERENCES price_lists(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE,
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    supplier_code VARCHAR(100) NOT NULL,
    email VARCHAR(320),
    phone VARCHAR(50),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, supplier_code)
);

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    destination_location_id UUID NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
    ordered_at TIMESTAMPTZ,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, order_number),
    FOREIGN KEY (merchant_id, supplier_id) REFERENCES suppliers(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, destination_location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    unit_id UUID,
    quantity_ordered NUMERIC(20,6) NOT NULL CHECK (quantity_ordered > 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    quantity_received NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, purchase_order_id) REFERENCES purchase_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT,
    CHECK (quantity_received <= quantity_ordered)
);

CREATE TABLE goods_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL,
    receipt_number VARCHAR(100) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_by_membership_id UUID NOT NULL,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, receipt_number),
    FOREIGN KEY (merchant_id, purchase_order_id) REFERENCES purchase_orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, received_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL,
    purchase_order_line_id UUID NOT NULL,
    unit_id UUID,
    batch_number VARCHAR(100),
    expires_at TIMESTAMPTZ,
    quantity_received NUMERIC(20,6) NOT NULL CHECK (quantity_received > 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, receipt_id) REFERENCES goods_receipts(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, purchase_order_line_id) REFERENCES purchase_order_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE pos_terminals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    device_identifier VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, shop_id, id),
    UNIQUE (merchant_id, shop_id, name),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE pos_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    terminal_id UUID,
    membership_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','ABANDONED')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_cash NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
    expected_cash NUMERIC(15,2),
    counted_cash NUMERIC(15,2),
    variance NUMERIC(15,2),
    closed_by_membership_id UUID,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, terminal_id) REFERENCES pos_terminals(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, closed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (closed_by_membership_id),
    CHECK ((status = 'OPEN' AND closed_at IS NULL) OR (status <> 'OPEN' AND closed_at IS NOT NULL)),
    CHECK (counted_cash IS NULL OR expected_cash IS NULL OR variance = counted_cash - expected_cash)
);

CREATE TABLE payment_type_categories (
    code VARCHAR(20) PRIMARY KEY CHECK (code IN ('CASH','ONLINE','DIGITAL')),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO payment_type_categories(code,name,is_available) VALUES
('CASH','Cash',TRUE),('ONLINE','Online',TRUE),('DIGITAL','Digital',FALSE);

CREATE TABLE payment_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_code VARCHAR(20) NOT NULL REFERENCES payment_type_categories(code) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id,id)
);
CREATE UNIQUE INDEX uq_payment_types_merchant_name ON payment_types(merchant_id,lower(name));
CREATE INDEX idx_payment_types_merchant_category ON payment_types(merchant_id,category_code,is_active,name);
INSERT INTO payment_types(merchant_id,category_code,name) SELECT id,'CASH','Cash' FROM merchants ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION provision_default_payment_type() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO payment_types(merchant_id,category_code,name) VALUES(NEW.id,'CASH','Cash') ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER merchants_default_payment_type AFTER INSERT ON merchants FOR EACH ROW EXECUTE FUNCTION provision_default_payment_type();

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    fulfillment_location_id UUID,
    pos_session_id UUID,
    store_id UUID,
    order_number VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('POS','ONLINE','WHOLESALE','PHONE','MARKETPLACE','SERVICE')),
    status VARCHAR(25) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_PAYMENT','CONFIRMED','PROCESSING','PARTIALLY_FULFILLED','FULFILLED','CANCELLED','REFUNDED')),
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
    tax_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
    shipping_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
    delivery_id UUID,
    delivery_name VARCHAR(255),
    delivery_contact VARCHAR(500),
    note TEXT,
    payment_type_id UUID,
    payment_type VARCHAR(255),
    grand_total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
    billing_address JSONB,
    shipping_address JSONB,
    placed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, order_number),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, fulfillment_location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, delivery_id) REFERENCES deliveries(merchant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id, payment_type_id) REFERENCES payment_types(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, pos_session_id) REFERENCES pos_sessions(merchant_id, id) ON DELETE SET NULL (pos_session_id),
    CHECK (grand_total = subtotal - discount_total + tax_total + shipping_total)
);

CREATE TABLE order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    variant_id UUID,
    asset_id UUID,
    unit_id UUID,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    line_total NUMERIC(15,2) NOT NULL CHECK (line_total >= 0),
    quantity_fulfilled NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (quantity_fulfilled >= 0),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, order_id, line_number),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT,
    CHECK (quantity_fulfilled <= quantity),
    CHECK (line_total = round(quantity * unit_price - discount_amount + tax_amount, 2))
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    payment_type_id UUID,
    method VARCHAR(255) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','VOIDED','REFUNDED','PARTIALLY_REFUNDED')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    provider_reference VARCHAR(255),
    idempotency_key VARCHAR(255) NOT NULL,
    captured_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, idempotency_key),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, payment_type_id) REFERENCES payment_types(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    order_id UUID NOT NULL,
    return_id UUID,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE fulfillments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    location_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PICKING','SHIPPED','DELIVERED','CANCELLED','RETURNED')),
    tracking_number VARCHAR(255),
    shipped_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, id, order_id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE fulfillment_lines (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    fulfillment_id UUID NOT NULL,
    order_line_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (merchant_id, fulfillment_id, order_line_id),
    FOREIGN KEY (merchant_id, fulfillment_id) REFERENCES fulfillments(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, order_line_id) REFERENCES order_lines(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity_on_hand NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, location_id, variant_id),
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('RECEIPT','TRANSFER','SALE','RETURN','ADJUSTMENT','REVERSAL')),
    source_location_id UUID,
    destination_location_id UUID,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_id UUID,
    entered_quantity NUMERIC(20,6),
    unit_cost NUMERIC(15,2),
    receipt_line_id UUID,
    order_line_id UUID,
    reverses_movement_id UUID,
    event_key VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, event_key),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, source_location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, destination_location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, receipt_line_id) REFERENCES goods_receipt_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, order_line_id) REFERENCES order_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, reverses_movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE RESTRICT,
    CHECK (source_location_id IS NOT NULL OR destination_location_id IS NOT NULL),
    CHECK (source_location_id IS NULL OR destination_location_id IS NULL OR source_location_id <> destination_location_id),
    CHECK (entered_quantity IS NULL OR entered_quantity > 0),
    CHECK ((movement_type = 'RECEIPT' AND destination_location_id IS NOT NULL AND source_location_id IS NULL AND unit_cost IS NOT NULL AND reverses_movement_id IS NULL)
        OR (movement_type = 'TRANSFER' AND source_location_id IS NOT NULL AND destination_location_id IS NOT NULL)
        OR (movement_type = 'SALE' AND source_location_id IS NOT NULL AND order_line_id IS NOT NULL AND destination_location_id IS NULL AND reverses_movement_id IS NULL)
        OR (movement_type = 'RETURN' AND source_location_id IS NULL AND destination_location_id IS NOT NULL AND order_line_id IS NOT NULL AND reverses_movement_id IS NOT NULL)
        OR (movement_type = 'ADJUSTMENT' AND reverses_movement_id IS NULL)
        OR (movement_type = 'REVERSAL' AND reverses_movement_id IS NOT NULL)),
    CHECK (unit_cost IS NULL OR unit_cost >= 0)
);

CREATE TABLE inventory_cost_layers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    location_id UUID NOT NULL,
    receipt_movement_id UUID NOT NULL,
    receipt_line_id UUID,
    quantity_received NUMERIC(20,6) NOT NULL CHECK (quantity_received > 0),
    quantity_remaining NUMERIC(20,6) NOT NULL CHECK (quantity_remaining >= 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    transferred_from_layer_id UUID,
    restored_from_allocation_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, receipt_movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, receipt_line_id) REFERENCES goods_receipt_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, transferred_from_layer_id) REFERENCES inventory_cost_layers(merchant_id, id) ON DELETE RESTRICT,
    CHECK (quantity_remaining <= quantity_received)
);

CREATE TABLE inventory_cost_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    consumption_movement_id UUID NOT NULL,
    cost_layer_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC(15,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, consumption_movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, cost_layer_id) REFERENCES inventory_cost_layers(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_line_id UUID NOT NULL,
    location_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','CONSUMED')),
    reservation_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, reservation_key),
    FOREIGN KEY (merchant_id, order_line_id) REFERENCES order_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    CHECK ((status = 'ACTIVE' AND released_at IS NULL) OR (status <> 'ACTIVE' AND released_at IS NOT NULL))
);

CREATE TABLE accounting_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    account_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, account_code)
);

CREATE TABLE accounting_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('ORDER_CONFIRMED','PAYMENT_CAPTURED','REFUND_COMPLETED','INVENTORY_RECEIVED','INVENTORY_SOLD','PURCHASE_INVOICED')),
    source_order_id UUID,
    source_payment_id UUID,
    source_refund_id UUID,
    source_movement_id UUID,
    source_purchase_order_id UUID,
    event_key VARCHAR(255) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    posted_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, event_key),
    FOREIGN KEY (merchant_id, source_order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, source_payment_id) REFERENCES payments(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, source_refund_id) REFERENCES refunds(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, source_movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, source_purchase_order_id) REFERENCES purchase_orders(merchant_id, id) ON DELETE RESTRICT,
    CHECK (num_nonnulls(source_order_id, source_payment_id, source_refund_id, source_movement_id, source_purchase_order_id) = 1)
);

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    accounting_event_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','VOIDED')),
    posted_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, accounting_event_id),
    FOREIGN KEY (merchant_id, accounting_event_id) REFERENCES accounting_events(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE journal_lines (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    account_id UUID NOT NULL,
    debit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    description VARCHAR(255),
    PRIMARY KEY (merchant_id, journal_entry_id, line_number),
    FOREIGN KEY (merchant_id, journal_entry_id) REFERENCES journal_entries(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, account_id) REFERENCES accounting_accounts(merchant_id, id) ON DELETE RESTRICT,
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    actor_membership_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    before_data JSONB,
    after_data JSONB,
    request_id UUID,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (merchant_id, actor_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (actor_membership_id)
);

-- P1 extensions: these tables restore retained commerce capabilities without
-- reintroducing the old duplicate sale, customer, or inventory aggregates.

CREATE TABLE membership_shop_assignments (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    assigned_by_membership_id UUID,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, membership_id, shop_id),
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, assigned_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (assigned_by_membership_id),
    CHECK (valid_until IS NULL OR valid_until >= granted_at)
);

CREATE TABLE catalog_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, slug)
);

ALTER TABLE products
    ADD CONSTRAINT fk_products_brand_same_merchant
    FOREIGN KEY (merchant_id, brand_id) REFERENCES catalog_brands(merchant_id, id) ON DELETE SET NULL (brand_id);

CREATE TABLE catalog_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    parent_category_id UUID,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, slug),
    FOREIGN KEY (merchant_id, parent_category_id) REFERENCES catalog_categories(merchant_id, id) ON DELETE RESTRICT,
    CHECK (parent_category_id IS NULL OR parent_category_id <> id)
);

CREATE TABLE catalog_product_categories (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    category_id UUID NOT NULL,
    PRIMARY KEY (merchant_id, product_id, category_id),
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, category_id) REFERENCES catalog_categories(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE catalog_product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'URL' CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD')),
    alt_text VARCHAR(500),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE catalog_variant_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'URL' CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD')),
    alt_text VARCHAR(500),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE catalog_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('TEXT','NUMBER','BOOLEAN','SELECT','DATE','JSON')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code)
);

CREATE TABLE catalog_attribute_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    definition_id UUID NOT NULL,
    value VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, definition_id, value),
    FOREIGN KEY (merchant_id, definition_id) REFERENCES catalog_attribute_definitions(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE catalog_attribute_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    definition_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, definition_id) REFERENCES catalog_attribute_definitions(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    location_id UUID NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    quantity_received NUMERIC(20,6) NOT NULL CHECK (quantity_received > 0),
    quantity_remaining NUMERIC(20,6) NOT NULL CHECK (quantity_remaining >= 0),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, variant_id, location_id, batch_number),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    CHECK (quantity_remaining <= quantity_received),
    CHECK (expires_at IS NULL OR expires_at >= received_at)
);

CREATE TABLE inventory_serials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    location_id UUID,
    batch_id UUID,
    serial_number VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','SOLD','DAMAGED','RETIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, serial_number),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, batch_id) REFERENCES inventory_batches(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    location_id UUID,
    serial_id UUID,
    asset_tag VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','IN_SERVICE','SOLD','RETIRED','LOST')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, asset_tag),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, serial_id) REFERENCES inventory_serials(merchant_id, id) ON DELETE RESTRICT
);

ALTER TABLE order_lines
    ADD CONSTRAINT order_lines_asset_fk
    FOREIGN KEY (merchant_id, asset_id) REFERENCES inventory_assets(merchant_id, id) ON DELETE RESTRICT;

CREATE TABLE inventory_movement_batches (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL,
    batch_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (merchant_id, movement_id, batch_id),
    FOREIGN KEY (merchant_id, movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, batch_id) REFERENCES inventory_batches(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_movement_serials (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL,
    serial_id UUID NOT NULL,
    PRIMARY KEY (merchant_id, movement_id, serial_id),
    FOREIGN KEY (merchant_id, movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, serial_id) REFERENCES inventory_serials(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_movement_assets (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    movement_id UUID NOT NULL,
    asset_id UUID NOT NULL,
    PRIMARY KEY (merchant_id, movement_id, asset_id),
    FOREIGN KEY (merchant_id, movement_id) REFERENCES inventory_movements(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, asset_id) REFERENCES inventory_assets(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_identifier_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    validation_regex TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    CHECK (length(trim(code)) > 0),
    CHECK (length(trim(name)) > 0)
);

CREATE TABLE variant_identifier_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    identifier_type_id UUID NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    min_count INTEGER NOT NULL DEFAULT 1 CHECK (min_count >= 0),
    max_count INTEGER CHECK (max_count IS NULL OR max_count >= min_count),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, variant_id, identifier_type_id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, identifier_type_id) REFERENCES inventory_identifier_types(merchant_id, id) ON DELETE RESTRICT,
    CHECK (is_required OR min_count = 0)
);

CREATE TABLE inventory_asset_identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL,
    identifier_type_id UUID NOT NULL,
    value VARCHAR(255) NOT NULL,
    normalized_value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, identifier_type_id, normalized_value),
    FOREIGN KEY (merchant_id, asset_id) REFERENCES inventory_assets(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, identifier_type_id) REFERENCES inventory_identifier_types(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE barcode_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(255) NOT NULL,
    normalized_code VARCHAR(255) NOT NULL,
    product_id UUID,
    variant_id UUID,
    asset_id UUID,
    batch_id UUID,
    unit_id UUID,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_generated BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, normalized_code),
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, asset_id) REFERENCES inventory_assets(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, batch_id) REFERENCES inventory_batches(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE CASCADE,
    CHECK (num_nonnulls(product_id, variant_id, asset_id, batch_id, unit_id) = 1)
);

CREATE TABLE inventory_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    client_operation_id VARCHAR(255) NOT NULL,
    operation_type VARCHAR(80) NOT NULL,
    actor_membership_id UUID,
    location_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, client_operation_id),
    FOREIGN KEY (merchant_id, actor_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE SET NULL (location_id)
);

CREATE TABLE inventory_reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    location_id UUID,
    exception_key VARCHAR(255) NOT NULL,
    exception_type VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by_membership_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, exception_key),
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE SET NULL (location_id),
    FOREIGN KEY (merchant_id, resolved_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (resolved_by_membership_id),
    CHECK ((status = 'OPEN' AND resolved_at IS NULL) OR (status <> 'OPEN' AND resolved_at IS NOT NULL))
);

CREATE TABLE inventory_transformations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL,
    operation_id UUID,
    transformation_type VARCHAR(20) NOT NULL CHECK (transformation_type IN ('PACK_BREAK','REPACK','ASSEMBLY','ADJUSTMENT')),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPLIED','CANCELLED')),
    reference_id UUID,
    notes TEXT,
    created_by_membership_id UUID NOT NULL,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, operation_id) REFERENCES inventory_operations(merchant_id, id) ON DELETE SET NULL (operation_id),
    FOREIGN KEY (merchant_id, created_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE RESTRICT,
    CHECK (transformation_type <> 'ADJUSTMENT' OR reference_id IS NOT NULL),
    CHECK ((status = 'APPLIED' AND applied_at IS NOT NULL) OR status <> 'APPLIED')
);

CREATE TABLE inventory_transformation_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    transformation_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    unit_id UUID,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN','OUT')),
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    base_quantity NUMERIC(20,6),
    unit_cost NUMERIC(15,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, transformation_id) REFERENCES inventory_transformations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT,
    CHECK (base_quantity IS NULL OR base_quantity > 0)
);

CREATE TABLE ecommerce_carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID,
    customer_id UUID,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CONVERTED','ABANDONED','EXPIRED')),
    cart_token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, cart_token),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id)
);

CREATE TABLE ecommerce_cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    cart_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, cart_id, variant_id),
    FOREIGN KEY (merchant_id, cart_id) REFERENCES ecommerce_carts(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE ecommerce_checkout_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    cart_id UUID NOT NULL,
    store_id UUID,
    customer_id UUID,
    order_id UUID,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED','PENDING_PAYMENT','COMPLETED','EXPIRED','CANCELLED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, idempotency_key),
    FOREIGN KEY (merchant_id, cart_id) REFERENCES ecommerce_carts(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE SET NULL (order_id)
);

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    promotion_type VARCHAR(20) NOT NULL CHECK (promotion_type IN ('PERCENTAGE','FIXED_AMOUNT')),
    value NUMERIC(15,2) NOT NULL CHECK (value >= 0),
    minimum_subtotal NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal >= 0),
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CHECK (promotion_type <> 'PERCENTAGE' OR value <= 100),
    CHECK (usage_limit IS NULL OR redemption_count <= usage_limit)
);

CREATE TABLE promotion_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE promotion_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL,
    code VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, id, promotion_id),
    FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE CASCADE,
    CHECK (usage_limit IS NULL OR redemption_count <= usage_limit)
);

CREATE TABLE order_promotions (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    promotion_id UUID NOT NULL,
    code_id UUID,
    discount_amount NUMERIC(15,2) NOT NULL CHECK (discount_amount >= 0),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, order_id, promotion_id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, code_id) REFERENCES promotion_codes(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, code_id, promotion_id) REFERENCES promotion_codes(merchant_id, id, promotion_id) ON DELETE RESTRICT
);

CREATE TABLE promotion_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL,
    code_id UUID,
    order_id UUID NOT NULL,
    customer_id UUID,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, order_id, promotion_id),
    FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, code_id) REFERENCES promotion_codes(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, code_id, promotion_id) REFERENCES promotion_codes(merchant_id, id, promotion_id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id)
);

CREATE TABLE ecommerce_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    fulfillment_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','RECEIVED','REJECTED','REFUNDED','CANCELLED')),
    reason VARCHAR(255),
    requested_by_membership_id UUID,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    received_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, fulfillment_id) REFERENCES fulfillments(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, fulfillment_id, order_id) REFERENCES fulfillments(merchant_id, id, order_id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, requested_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (requested_by_membership_id)
);

CREATE TABLE ecommerce_return_lines (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    return_id UUID NOT NULL,
    order_line_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    condition VARCHAR(20) NOT NULL DEFAULT 'UNINSPECTED' CHECK (condition IN ('UNINSPECTED','RESELLABLE','DAMAGED')),
    disposition VARCHAR(20) NOT NULL DEFAULT 'RESTOCK' CHECK (disposition IN ('RESTOCK','SCRAP','REPAIR')),
    PRIMARY KEY (merchant_id, return_id, order_line_id),
    FOREIGN KEY (merchant_id, return_id) REFERENCES ecommerce_returns(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, order_line_id) REFERENCES order_lines(merchant_id, id) ON DELETE RESTRICT
);


-- P2 extensions: formerly deferred enterprise, finance, platform,
-- automation, sync, service, repair, and clinical capabilities. These
-- tables extend the canonical commerce aggregates; they do not create
-- competing order, customer, product, or inventory masters. Remaining
-- optional deferred scope is tracked in Phase 7.

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_organization_id UUID,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    organization_type VARCHAR(30) NOT NULL DEFAULT 'COMPANY' CHECK (organization_type IN ('HOLDING','GROUP','COMPANY','DIVISION','SUBSIDIARY')),
    legal_name VARCHAR(255),
    default_currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    country_code CHAR(2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, parent_organization_id),
    FOREIGN KEY (parent_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
    CHECK (parent_organization_id IS NULL OR parent_organization_id <> id)
);

CREATE TABLE unit_conversions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    from_unit_id UUID NOT NULL,
    to_unit_id UUID NOT NULL,
    multiplier NUMERIC(30,12) NOT NULL CHECK (multiplier > 0),
    additive_offset NUMERIC(30,12) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, from_unit_id, to_unit_id),
    FOREIGN KEY (merchant_id, from_unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, to_unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE CASCADE,
    CHECK (from_unit_id <> to_unit_id)
);

CREATE TABLE product_variant_units (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL,
    unit_id UUID NOT NULL,
    unit_role VARCHAR(20) NOT NULL CHECK (unit_role IN ('BASE','PURCHASE','SALE','COUNTING')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, variant_id, unit_id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, unit_id) REFERENCES unit_definitions(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE organization_merchants (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, merchant_id)
);

CREATE TABLE business_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    parent_business_unit_id UUID,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit_type VARCHAR(30) NOT NULL DEFAULT 'DEPARTMENT' CHECK (unit_type IN ('DIVISION','DEPARTMENT','REGION','COST_CENTER','PROJECT','TEAM')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    FOREIGN KEY (merchant_id, parent_business_unit_id) REFERENCES business_units(merchant_id, id) ON DELETE RESTRICT,
    CHECK (parent_business_unit_id IS NULL OR parent_business_unit_id <> id)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_id UUID NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);

CREATE TABLE accounting_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    period_code VARCHAR(30) NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','LOCKED')),
    closed_at TIMESTAMPTZ,
    closed_by_membership_id UUID,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, period_code),
    FOREIGN KEY (merchant_id, closed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (closed_by_membership_id),
    CHECK (ends_on >= starts_on),
    CHECK ((status = 'OPEN' AND closed_at IS NULL) OR (status <> 'OPEN' AND closed_at IS NOT NULL))
);

CREATE TABLE tax_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    rate NUMERIC(7,4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE accounts_receivable_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    order_id UUID,
    accounting_period_id UUID,
    document_number VARCHAR(100) NOT NULL,
    document_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
    balance_amount NUMERIC(15,2) NOT NULL CHECK (balance_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','PARTIALLY_PAID','PAID','VOID','OVERDUE')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, document_number),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE SET NULL (order_id),
    FOREIGN KEY (merchant_id, accounting_period_id) REFERENCES accounting_periods(merchant_id, id) ON DELETE RESTRICT,
    CHECK (total_amount = subtotal + tax_amount),
    CHECK (balance_amount <= total_amount),
    CHECK (due_date IS NULL OR due_date >= document_date)
);

CREATE TABLE accounts_receivable_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, document_id, payment_id),
    FOREIGN KEY (merchant_id, document_id) REFERENCES accounts_receivable_documents(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE supplier_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    purchase_order_id UUID,
    accounting_period_id UUID,
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
    balance_amount NUMERIC(15,2) NOT NULL CHECK (balance_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','PARTIALLY_PAID','PAID','VOID','OVERDUE')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, invoice_number),
    FOREIGN KEY (merchant_id, supplier_id) REFERENCES suppliers(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, purchase_order_id) REFERENCES purchase_orders(merchant_id, id) ON DELETE SET NULL (purchase_order_id),
    FOREIGN KEY (merchant_id, accounting_period_id) REFERENCES accounting_periods(merchant_id, id) ON DELETE RESTRICT,
    CHECK (total_amount = subtotal + tax_amount),
    CHECK (balance_amount <= total_amount),
    CHECK (due_date IS NULL OR due_date >= invoice_date)
);

CREATE TABLE supplier_invoice_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_invoice_id UUID NOT NULL,
    purchase_order_line_id UUID,
    variant_id UUID,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    line_total NUMERIC(15,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, supplier_invoice_id) REFERENCES supplier_invoices(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, purchase_order_line_id) REFERENCES purchase_order_lines(merchant_id, id) ON DELETE SET NULL (purchase_order_line_id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE SET NULL (variant_id)
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    business_unit_id UUID,
    supplier_id UUID,
    accounting_period_id UUID,
    expense_number VARCHAR(100) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description VARCHAR(500) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PAID','VOID')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, expense_number),
    FOREIGN KEY (merchant_id, business_unit_id) REFERENCES business_units(merchant_id, id) ON DELETE SET NULL (business_unit_id),
    FOREIGN KEY (merchant_id, supplier_id) REFERENCES suppliers(merchant_id, id) ON DELETE SET NULL (supplier_id),
    FOREIGN KEY (merchant_id, accounting_period_id) REFERENCES accounting_periods(merchant_id, id) ON DELETE SET NULL (accounting_period_id)
);

CREATE TABLE expense_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    expense_id UUID NOT NULL,
    account_id UUID NOT NULL,
    tax_rate_id UUID,
    description VARCHAR(500) NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, expense_id) REFERENCES expenses(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, account_id) REFERENCES accounting_accounts(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, tax_rate_id) REFERENCES tax_rates(merchant_id, id) ON DELETE SET NULL (tax_rate_id)
);

CREATE TABLE cash_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID,
    account_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, account_code),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE SET NULL (shop_id)
);

CREATE TABLE cash_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    cash_account_id UUID NOT NULL,
    order_id UUID,
    payment_id UUID,
    expense_id UUID,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('RECEIPT','DISBURSEMENT','ADJUSTMENT','TRANSFER')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference VARCHAR(255),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, cash_account_id) REFERENCES cash_accounts(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE SET NULL (order_id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE SET NULL (payment_id),
    FOREIGN KEY (merchant_id, expense_id) REFERENCES expenses(merchant_id, id) ON DELETE SET NULL (expense_id)
);

CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_last4 VARCHAR(4),
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id)
);

CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL,
    external_transaction_id VARCHAR(255),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    description VARCHAR(500),
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, bank_account_id, external_transaction_id),
    FOREIGN KEY (merchant_id, bank_account_id) REFERENCES bank_accounts(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED')),
    completed_at TIMESTAMPTZ,
    completed_by_membership_id UUID,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, bank_account_id) REFERENCES bank_accounts(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, completed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (completed_by_membership_id),
    CHECK (period_end >= period_start),
    CHECK ((status = 'OPEN' AND completed_at IS NULL) OR (status = 'COMPLETED' AND completed_at IS NOT NULL))
);

CREATE TABLE bank_reconciliation_items (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    reconciliation_id UUID NOT NULL,
    bank_transaction_id UUID NOT NULL,
    matched_amount NUMERIC(15,2) NOT NULL CHECK (matched_amount > 0),
    PRIMARY KEY (merchant_id, reconciliation_id, bank_transaction_id),
    FOREIGN KEY (merchant_id, reconciliation_id) REFERENCES bank_reconciliations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, bank_transaction_id) REFERENCES bank_transactions(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE supplier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_invoice_id UUID NOT NULL,
    cash_account_id UUID,
    bank_account_id UUID,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
    paid_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, supplier_invoice_id) REFERENCES supplier_invoices(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, cash_account_id) REFERENCES cash_accounts(merchant_id, id) ON DELETE SET NULL (cash_account_id),
    FOREIGN KEY (merchant_id, bank_account_id) REFERENCES bank_accounts(merchant_id, id) ON DELETE SET NULL (bank_account_id),
    CHECK (num_nonnulls(cash_account_id, bank_account_id) <= 1)
);

CREATE TABLE accounts_payable_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_invoice_id UUID NOT NULL,
    supplier_payment_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, supplier_invoice_id, supplier_payment_id),
    FOREIGN KEY (merchant_id, supplier_invoice_id) REFERENCES supplier_invoices(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, supplier_payment_id) REFERENCES supplier_payments(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE supplier_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL,
    purchase_order_id UUID,
    location_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','SHIPPED','COMPLETED','CANCELLED')),
    reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, supplier_id) REFERENCES suppliers(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, purchase_order_id) REFERENCES purchase_orders(merchant_id, id) ON DELETE SET NULL (purchase_order_id),
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE SET NULL (location_id)
);

CREATE TABLE supplier_return_lines (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    supplier_return_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15,2) NOT NULL CHECK (unit_cost >= 0),
    PRIMARY KEY (merchant_id, supplier_return_id, variant_id),
    FOREIGN KEY (merchant_id, supplier_return_id) REFERENCES supplier_returns(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE staff_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    salary_amount NUMERIC(15,2) NOT NULL CHECK (salary_amount >= 0),
    pay_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (pay_frequency IN ('WEEKLY','BIWEEKLY','MONTHLY')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED','CANCELLED')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE,
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE salary_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','VOID')),
    paid_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, contract_id, period_start, period_end),
    FOREIGN KEY (merchant_id, contract_id) REFERENCES staff_contracts(merchant_id, id) ON DELETE RESTRICT,
    CHECK (period_end >= period_start)
);

CREATE TABLE payment_settings (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
    include_tax BOOLEAN NOT NULL DEFAULT FALSE,
    tax_label VARCHAR(100) NOT NULL DEFAULT 'Tax',
    receipt_note TEXT NOT NULL DEFAULT '',
    service_charge NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
    delivery_charge NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
    PRIMARY KEY (merchant_id, shop_id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE merchant_payment_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID,
    provider_name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    credentials_secret_ref VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, shop_id, provider_name),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE,
    CHECK (NOT (configuration ?| ARRAY['secret','api_key','password','client_secret','access_token']))
);

CREATE TABLE file_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    uploaded_by_membership_id UUID,
    storage_provider VARCHAR(50) NOT NULL,
    object_key VARCHAR(1000) NOT NULL,
    original_filename VARCHAR(500),
    content_type VARCHAR(255),
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    checksum VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    entity_type VARCHAR(100),
    entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, object_key),
    FOREIGN KEY (merchant_id, uploaded_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (uploaded_by_membership_id)
);

CREATE TABLE merchant_testimonials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    file_object_id UUID,
    author_name VARCHAR(120) NOT NULL,
    author_role VARCHAR(120),
    content TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','ARCHIVED')),
    display_position INTEGER NOT NULL DEFAULT 0 CHECK (display_position >= 0),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, file_object_id) REFERENCES file_objects(merchant_id, id) ON DELETE SET NULL (file_object_id),
    CHECK ((status = 'APPROVED' AND published_at IS NOT NULL) OR status <> 'APPROVED')
);

CREATE TABLE payment_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    file_object_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    rejection_reason VARCHAR(500),
    uploaded_by_membership_id UUID,
    reviewed_by_membership_id UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, file_object_id) REFERENCES file_objects(merchant_id, id) ON DELETE SET NULL (file_object_id),
    FOREIGN KEY (merchant_id, uploaded_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (uploaded_by_membership_id),
    FOREIGN KEY (merchant_id, reviewed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (reviewed_by_membership_id)
);

CREATE TABLE payment_provider_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    provider_session_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','FAILED','CANCELLED','EXPIRED')),
    payment_url TEXT,
    callback_data JSONB,
    expires_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, provider_name, provider_session_id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ecommerce_stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    currency_code CHAR(3) NOT NULL REFERENCES currencies(code),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, slug),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE SET NULL (shop_id)
);

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_store_same_merchant
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE RESTRICT;

ALTER TABLE ecommerce_carts
    ADD CONSTRAINT fk_ecommerce_carts_store_same_merchant
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE SET NULL (store_id);

ALTER TABLE ecommerce_checkout_sessions
    ADD CONSTRAINT fk_ecommerce_checkout_sessions_store_same_merchant
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE SET NULL (store_id);

CREATE TABLE storefront_banners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL,
    file_object_id UUID NOT NULL,
    title VARCHAR(255),
    alt_text VARCHAR(500),
    target_url TEXT,
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    publish_at TIMESTAMPTZ,
    unpublish_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, file_object_id) REFERENCES file_objects(merchant_id, id) ON DELETE RESTRICT,
    CHECK (unpublish_at IS NULL OR publish_at IS NULL OR unpublish_at > publish_at),
    CHECK ((status = 'PUBLISHED' AND publish_at IS NOT NULL) OR status <> 'PUBLISHED')
);

CREATE TABLE ecommerce_store_products (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL,
    product_id UUID NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, store_id, product_id),
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, product_id) REFERENCES products(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ecommerce_store_product_variants (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (merchant_id, store_id, variant_id),
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ecommerce_store_fulfillment_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL,
    location_id UUID NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, store_id, location_id),
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ecommerce_shipping_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, store_id, code),
    FOREIGN KEY (merchant_id, store_id) REFERENCES ecommerce_stores(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ecommerce_order_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    from_status VARCHAR(25),
    to_status VARCHAR(25) NOT NULL,
    actor_membership_id UUID,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, actor_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (actor_membership_id)
);

CREATE TABLE ecommerce_order_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    promotion_id UUID,
    code_id UUID,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    description VARCHAR(255),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE SET NULL (promotion_id),
    FOREIGN KEY (merchant_id, code_id) REFERENCES promotion_codes(merchant_id, id) ON DELETE SET NULL (code_id)
);

CREATE TABLE ecommerce_order_item_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    fulfillment_id UUID NOT NULL,
    order_line_id UUID NOT NULL,
    location_id UUID NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (merchant_id, fulfillment_id, order_line_id, location_id),
    FOREIGN KEY (merchant_id, fulfillment_id) REFERENCES fulfillments(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, order_line_id) REFERENCES order_lines(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, location_id) REFERENCES locations(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE guest_order_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    email VARCHAR(320) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, token_hash),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE guest_order_access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    email VARCHAR(320) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, token_hash),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE customer_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(30),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, name)
);

CREATE TABLE customer_tag_map (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    PRIMARY KEY (merchant_id, customer_id, tag_id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, tag_id) REFERENCES customer_tags(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    author_membership_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, author_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (author_membership_id)
);

CREATE TABLE customer_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    activity_type VARCHAR(100) NOT NULL,
    description TEXT,
    event_key VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, event_key),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PENDING','RESOLVED','CLOSED')),
    subject VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id)
);

CREATE TABLE support_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    customer_id UUID,
    shop_id UUID,
    assigned_membership_id UUID,
    case_number VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED','CLOSED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
    first_response_due_at TIMESTAMPTZ,
    resolution_due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, case_number),
    FOREIGN KEY (merchant_id, conversation_id) REFERENCES conversations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE SET NULL (shop_id),
    FOREIGN KEY (merchant_id, assigned_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (assigned_membership_id),
    CHECK (first_response_due_at IS NULL OR first_response_due_at >= created_at),
    CHECK (resolution_due_at IS NULL OR resolution_due_at >= created_at),
    CHECK ((status IN ('RESOLVED','CLOSED') AND resolved_at IS NOT NULL) OR status NOT IN ('RESOLVED','CLOSED')),
    CHECK ((status = 'CLOSED' AND closed_at IS NOT NULL) OR status <> 'CLOSED'),
    CHECK (closed_at IS NULL OR resolved_at IS NOT NULL)
);

CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    customer_id UUID,
    membership_id UUID,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, conversation_id) REFERENCES conversations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE,
    CHECK (num_nonnulls(customer_id, membership_id) = 1)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    sender_customer_id UUID,
    sender_membership_id UUID,
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, conversation_id) REFERENCES conversations(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, sender_customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (sender_customer_id),
    FOREIGN KEY (merchant_id, sender_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (sender_membership_id),
    CHECK (num_nonnulls(sender_customer_id, sender_membership_id) <= 1)
);

CREATE TABLE communication_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    channel_type VARCHAR(30) NOT NULL CHECK (channel_type IN ('EMAIL','SMS','PUSH','CHAT','WEBHOOK')),
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    CHECK (NOT (configuration ?| ARRAY['secret','api_key','password','client_secret','access_token']))
);

CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    template_code VARCHAR(100) NOT NULL,
    locale VARCHAR(20) NOT NULL DEFAULT 'en',
    subject_template VARCHAR(500) NOT NULL,
    body_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, template_code, locale)
);

CREATE TABLE email_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    template_id UUID,
    recipient_email VARCHAR(320) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, template_id) REFERENCES email_templates(merchant_id, id) ON DELETE SET NULL (template_id),
    CHECK ((status = 'SENT' AND sent_at IS NOT NULL) OR status <> 'SENT')
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    recipient_membership_id UUID NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, recipient_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE integration_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    connection_name VARCHAR(255) NOT NULL,
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ERROR','REVOKED')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, provider, connection_name),
    CHECK (NOT (configuration ?| ARRAY['secret','api_key','password','client_secret','access_token']))
);

CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    scope VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','COMPLETED','FAILED')),
    response_status INTEGER,
    response_body JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id, idempotency_key),
    UNIQUE (merchant_id, scope, idempotency_key),
    CHECK ((status = 'PROCESSING' AND response_status IS NULL) OR status <> 'PROCESSING')
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(150) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID,
    event_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED','CANCELLED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, event_key),
    CHECK ((status = 'PUBLISHED' AND published_at IS NOT NULL) OR status <> 'PUBLISHED')
);

CREATE TABLE custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    module_code VARCHAR(100) NOT NULL DEFAULT 'SERVICE',
    service_type VARCHAR(20),
    field_scope VARCHAR(20) NOT NULL DEFAULT 'TICKET' CHECK (field_scope IN ('TICKET','WORK_ITEM')),
    field_code VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('TEXT','NUMBER','BOOLEAN','DATE','SELECT','JSON')),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    visibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    section VARCHAR(100),
    printable BOOLEAN NOT NULL DEFAULT FALSE,
    form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, entity_type, field_code)
);

CREATE TABLE custom_field_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    definition_id UUID NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version > 0),
    value JSONB NOT NULL,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, definition_id, entity_id),
    FOREIGN KEY (merchant_id, definition_id) REFERENCES custom_field_definitions(merchant_id, id) ON DELETE CASCADE,
    CHECK (entity_type <> '')
);

CREATE TABLE modules (
    code VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE merchant_modules (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    module_code VARCHAR(100) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'ENABLED' CHECK (status IN ('ENABLED','DISABLED','TRIAL')),
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, module_code),
    CHECK ((status = 'ENABLED' AND disabled_at IS NULL) OR status <> 'ENABLED')
);

CREATE TABLE shop_modules (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    module_code VARCHAR(100) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    PRIMARY KEY (merchant_id, shop_id, module_code),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE merchant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    module_code VARCHAR(100),
    setting_key VARCHAR(255) NOT NULL,
    value_type VARCHAR(20) NOT NULL CHECK (value_type IN ('STRING','NUMBER','BOOLEAN','JSON','SECRET_REF')),
    value_json JSONB NOT NULL,
    updated_by_membership_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (module_code) REFERENCES modules(code) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, updated_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (updated_by_membership_id),
    CHECK (length(trim(setting_key)) > 0)
);

CREATE TABLE document_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    prefix VARCHAR(30) NOT NULL DEFAULT '',
    next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
    padding SMALLINT NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 18),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, document_type)
);

CREATE TABLE external_id_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    system_code VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, system_code, entity_type, external_id),
    UNIQUE (merchant_id, system_code, entity_type, entity_id)
);

CREATE TABLE migration_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE SET NULL,
    migration_name VARCHAR(255) NOT NULL,
    source_table VARCHAR(255),
    source_key VARCHAR(255),
    target_table VARCHAR(255),
    target_key VARCHAR(255),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','IMPORTED','SKIPPED','FAILED')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    trigger_type VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, name)
);

CREATE TABLE workflow_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
    condition JSONB NOT NULL DEFAULT '{}'::jsonb,
    action JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, workflow_id, sequence_number),
    FOREIGN KEY (merchant_id, workflow_id) REFERENCES workflows(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL,
    event_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCESS','FAILED','CANCELLED')),
    input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_data JSONB,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, event_key),
    FOREIGN KEY (merchant_id, workflow_id) REFERENCES workflows(merchant_id, id) ON DELETE CASCADE,
    CHECK ((status = 'RUNNING' AND completed_at IS NULL) OR (status <> 'RUNNING' AND completed_at IS NOT NULL))
);

CREATE TABLE workflow_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    execution_id UUID NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
    message TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, execution_id) REFERENCES workflow_executions(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    provider_code VARCHAR(100) NOT NULL,
    model_code VARCHAR(150),
    configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, provider_code),
    CHECK (NOT (configuration ?| ARRAY['secret','api_key','password','client_secret','access_token']))
);

CREATE TABLE ai_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    membership_id UUID,
    customer_id UUID,
    provider_id UUID,
    purpose VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED','FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (membership_id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, provider_id) REFERENCES ai_providers(merchant_id, id) ON DELETE SET NULL (provider_id)
);

CREATE TABLE ai_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    session_id UUID,
    provider_id UUID,
    request_key VARCHAR(255) NOT NULL,
    prompt JSONB NOT NULL,
    response JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, request_key),
    FOREIGN KEY (merchant_id, session_id) REFERENCES ai_sessions(merchant_id, id) ON DELETE SET NULL (session_id),
    FOREIGN KEY (merchant_id, provider_id) REFERENCES ai_providers(merchant_id, id) ON DELETE SET NULL (provider_id)
);

CREATE SEQUENCE sync_server_sequence_seq;

CREATE TABLE sync_devices (
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

CREATE TABLE sync_entity_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, entity_type, entity_id)
);

CREATE TABLE sync_sessions (
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

CREATE TABLE sync_operations (
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

CREATE TABLE sync_checkpoints (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    scope VARCHAR(100) NOT NULL,
    server_sequence BIGINT NOT NULL CHECK (server_sequence >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, device_id, scope),
    FOREIGN KEY (merchant_id, device_id) REFERENCES sync_devices(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE sync_conflicts (
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

CREATE TABLE sync_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID,
    server_sequence BIGINT NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_version BIGINT NOT NULL CHECK (entity_version > 0),
    operation_id UUID,
    operation_type VARCHAR(20) NOT NULL DEFAULT 'UPDATE' CHECK (operation_type IN ('CREATE','UPDATE','DELETE')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, server_sequence),
    UNIQUE (merchant_id, entity_type, entity_id, entity_version),
    FOREIGN KEY (merchant_id, operation_id) REFERENCES sync_operations(merchant_id, id) ON DELETE SET NULL (operation_id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE sync_logs (
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

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    patient_number VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    sex VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DECEASED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, patient_number),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id)
);

CREATE TABLE patient_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    relationship VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(320),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE patient_identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    identifier_type VARCHAR(100) NOT NULL,
    identifier_value VARCHAR(255) NOT NULL,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, identifier_type, identifier_value),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE
);

-- Service and repair domain:
-- General service work is represented by service_orders. Repair is a
-- specialized service workflow: a repair_order must reference exactly one
-- service_order with service_type = 'REPAIR'. Service orders may reference
-- one canonical orders row with channel = 'SERVICE'; payments and refunds
-- remain attached to orders, while service_order_billings records service
-- billing. This keeps financial history in the canonical commerce model.
CREATE TABLE service_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, name),
    FOREIGN KEY (merchant_id, parent_id) REFERENCES service_categories(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE service_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    category_id UUID,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    labor_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (labor_fee >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, code),
    FOREIGN KEY (merchant_id, category_id) REFERENCES service_categories(merchant_id, id) ON DELETE SET NULL (category_id)
);

CREATE TABLE service_prices (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_id UUID NOT NULL,
    price_list_id UUID,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    PRIMARY KEY (merchant_id, service_id, valid_from),
    FOREIGN KEY (merchant_id, service_id) REFERENCES service_catalog(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, price_list_id) REFERENCES price_lists(merchant_id, id) ON DELETE SET NULL (price_list_id),
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

ALTER TABLE product_prices
    ADD CONSTRAINT ex_product_prices_no_overlap
    EXCLUDE USING gist (
        merchant_id WITH =,
        price_list_id WITH =,
        variant_id WITH =,
        tstzrange(valid_from, COALESCE(valid_until, 'infinity'::timestamptz), '[)') WITH &&
    );

CREATE TABLE service_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    patient_id UUID,
    shop_id UUID,
    order_id UUID,
    order_number VARCHAR(100) NOT NULL,
    service_type VARCHAR(20) NOT NULL DEFAULT 'GENERAL' CHECK (service_type IN ('GENERAL','REPAIR','CLINICAL')),
    status VARCHAR(25) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, order_number),
    UNIQUE (merchant_id, order_id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE SET NULL (patient_id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE SET NULL (shop_id),
    FOREIGN KEY (merchant_id, order_id) REFERENCES orders(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE service_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    work_item_id UUID,
    service_id UUID,
    variant_id UUID,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, service_id) REFERENCES service_catalog(merchant_id, id) ON DELETE SET NULL (service_id),
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE SET NULL (variant_id)
);

-- A service order is the parent ticket. Work items are the repeatable
-- operational subjects being serviced (devices today, other subject types
-- later). Billing remains on the parent order in the first migration slice.
CREATE TABLE service_order_work_items (
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

ALTER TABLE service_order_items
    ADD CONSTRAINT service_order_items_work_item_fk
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL;

CREATE TABLE service_order_assignments (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    membership_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (merchant_id, service_order_id, membership_id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE service_appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    shop_id UUID,
    assigned_membership_id UUID,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','BOOKED','CONFIRMED','CHECKED_IN','IN_PROGRESS','COMPLETED','CANCELLED')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE SET NULL (shop_id),
    FOREIGN KEY (merchant_id, assigned_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (assigned_membership_id),
    CHECK (ends_at > starts_at)
);

CREATE TABLE service_order_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    author_membership_id UUID,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, author_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (author_membership_id)
);

CREATE TABLE service_order_attachments (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    work_item_id UUID,
    file_object_id UUID NOT NULL,
    PRIMARY KEY (merchant_id, service_order_id, file_object_id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id, file_object_id) REFERENCES file_objects(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE service_order_billings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    ar_document_id UUID,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','INVOICED','PAID','VOID')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, ar_document_id) REFERENCES accounts_receivable_documents(merchant_id, id) ON DELETE SET NULL (ar_document_id)
);

CREATE TABLE service_order_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    from_status VARCHAR(25),
    to_status VARCHAR(25) NOT NULL,
    changed_by_membership_id UUID,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, changed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (changed_by_membership_id)
);

CREATE TABLE repair_drafts (
    id UUID NOT NULL,
    merchant_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    created_by_membership_id UUID,
    payload JSONB NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, created_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL
);
CREATE INDEX idx_repair_drafts_scope ON repair_drafts(merchant_id, shop_id, updated_at DESC);

CREATE TABLE repair_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID,
    device_type VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL (customer_id)
);

CREATE TABLE repair_work_item_devices (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    work_item_id UUID NOT NULL,
    repair_device_id UUID NOT NULL,
    issue_description TEXT NOT NULL,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(issues) = 'array'),
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array'),
    notes TEXT,
    additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0),
    waiting_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    waiting_end_date DATE NOT NULL DEFAULT CURRENT_DATE,
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, work_item_id),
    UNIQUE (merchant_id, repair_device_id),
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, repair_device_id) REFERENCES repair_devices(merchant_id, id) ON DELETE RESTRICT
);
ALTER TABLE repair_work_item_devices ADD CONSTRAINT repair_work_item_devices_waiting_range CHECK (waiting_end_date >= waiting_start_date);

CREATE TABLE repair_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL,
    preset_type VARCHAR(20) NOT NULL CHECK (preset_type IN ('ISSUE','CONDITION')),
    value VARCHAR(500) NOT NULL CHECK (btrim(value) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, shop_id) REFERENCES shops(merchant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX repair_presets_unique_value ON repair_presets(merchant_id, shop_id, preset_type, lower(btrim(value)));
CREATE INDEX idx_repair_presets_shop_type ON repair_presets(merchant_id, shop_id, preset_type, value);

CREATE TABLE repair_device_identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL,
    identifier_type VARCHAR(100) NOT NULL,
    identifier_value VARCHAR(255) NOT NULL,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, identifier_type, identifier_value),
    FOREIGN KEY (merchant_id, device_id) REFERENCES repair_devices(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE repair_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    service_order_id UUID NOT NULL,
    device_id UUID NOT NULL,
    order_number VARCHAR(100) NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','IN_PROGRESS','READY_FOR_PICKUP','COMPLETED','REFUNDED')),
    issue_description TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    customer_id UUID,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    service_id UUID,
    promotion_id UUID,
    labor_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (labor_fee >= 0),
    additional_fee NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (additional_fee >= 0),
    tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    note TEXT,
    form_version INTEGER NOT NULL DEFAULT 1 CHECK (form_version > 0),
    deposit_paid NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (deposit_paid >= 0 AND deposit_paid <= total_cost),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','DEPOSIT_PAID','AMOUNT_PAID','PAID')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, service_order_id),
    UNIQUE (merchant_id, order_number),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, device_id) REFERENCES repair_devices(merchant_id, id) ON DELETE RESTRICT
    ,FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE SET NULL
    ,FOREIGN KEY (merchant_id, service_id) REFERENCES service_catalog(merchant_id, id) ON DELETE SET NULL
    ,FOREIGN KEY (merchant_id, promotion_id) REFERENCES promotions(merchant_id, id) ON DELETE SET NULL
);

CREATE TABLE repair_payment_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    payment_id UUID NOT NULL,
    payment_kind VARCHAR(20) NOT NULL CHECK (payment_kind IN ('DEPOSIT','FINAL','ADJUSTMENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE RESTRICT
);

CREATE TABLE service_work_item_payment_allocations (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL,
    work_item_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, payment_id, work_item_id),
    FOREIGN KEY (merchant_id, payment_id) REFERENCES payments(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE repair_order_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    work_item_id UUID,
    filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    image_url TEXT,
    source_type VARCHAR(20) NOT NULL DEFAULT 'LEGACY_BASE64' CHECK (source_type IN ('URL','GOOGLE_DRIVE','UPLOAD','LEGACY_BASE64')),
    image_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT repair_order_images_storage_check CHECK ((source_type = 'LEGACY_BASE64' AND image_data IS NOT NULL AND image_url IS NULL) OR (source_type <> 'LEGACY_BASE64' AND image_url IS NOT NULL AND image_data IS NULL)),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE
    ,FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL
);

CREATE TABLE repair_diagnostics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    work_item_id UUID,
    performed_by_membership_id UUID,
    diagnosis TEXT NOT NULL,
    estimated_cost NUMERIC(15,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id, performed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (performed_by_membership_id)
);

CREATE TABLE customer_supplied_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    description VARCHAR(255) NOT NULL,
    serial_number VARCHAR(255),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, customer_id) REFERENCES customers(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE repair_order_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    work_item_id UUID,
    variant_id UUID,
    customer_supplied_part_id UUID,
    quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ORDERED','USED','RETURNED','CANCELLED')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (merchant_id, variant_id) REFERENCES product_variants(merchant_id, id) ON DELETE SET NULL (variant_id),
    FOREIGN KEY (merchant_id, customer_supplied_part_id) REFERENCES customer_supplied_parts(merchant_id, id) ON DELETE SET NULL (customer_supplied_part_id),
    CHECK (num_nonnulls(variant_id, customer_supplied_part_id) = 1)
);

CREATE TABLE repair_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    work_item_id UUID,
    approval_version INTEGER NOT NULL CHECK (approval_version > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    approved_amount NUMERIC(15,2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, repair_order_id, approval_version),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE
    ,FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL
);

CREATE TABLE repair_warranties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL,
    work_item_id UUID,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    terms TEXT,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, repair_order_id) REFERENCES repair_orders(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, work_item_id) REFERENCES service_order_work_items(merchant_id, id) ON DELETE SET NULL,
    CHECK (ends_at > starts_at)
);

CREATE TABLE clinical_encounters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    practitioner_membership_id UUID,
    service_order_id UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SIGNED','CLOSED','CANCELLED')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, practitioner_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (practitioner_membership_id),
    FOREIGN KEY (merchant_id, service_order_id) REFERENCES service_orders(merchant_id, id) ON DELETE SET NULL (service_order_id),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE clinical_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    note_text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SIGNED','AMENDED')),
    predecessor_id UUID,
    authored_by_membership_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    signed_at TIMESTAMPTZ,
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, encounter_id, version_number),
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, predecessor_id) REFERENCES clinical_notes(merchant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (merchant_id, authored_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (authored_by_membership_id),
    CHECK ((status = 'SIGNED' AND signed_at IS NOT NULL) OR status <> 'SIGNED')
);

CREATE TABLE clinical_measurements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    measurement_code VARCHAR(100) NOT NULL,
    value NUMERIC(20,6) NOT NULL,
    unit VARCHAR(50),
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE clinical_procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    procedure_code VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    performed_by_membership_id UUID,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, performed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (performed_by_membership_id)
);

CREATE TABLE clinical_diagnoses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL,
    diagnosis_code VARCHAR(100) NOT NULL,
    description TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE treatment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    encounter_id UUID,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
    starts_on DATE,
    ends_on DATE,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE SET NULL (encounter_id),
    CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE treatment_plan_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    treatment_plan_id UUID NOT NULL,
    service_id UUID,
    description VARCHAR(500) NOT NULL,
    sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','COMPLETED','CANCELLED')),
    UNIQUE (merchant_id, id),
    UNIQUE (merchant_id, treatment_plan_id, sequence_number),
    FOREIGN KEY (merchant_id, treatment_plan_id) REFERENCES treatment_plans(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, service_id) REFERENCES service_catalog(merchant_id, id) ON DELETE SET NULL (service_id)
);

CREATE TABLE patient_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    consent_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('GRANTED','REVOKED','EXPIRED')),
    granted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    document_file_id UUID,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, document_file_id) REFERENCES file_objects(merchant_id, id) ON DELETE SET NULL (document_file_id)
);

CREATE TABLE patient_allergies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    allergen VARCHAR(255) NOT NULL,
    reaction VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RESOLVED','INACTIVE')),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE
);

CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL,
    encounter_id UUID,
    prescribed_by_membership_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, patient_id) REFERENCES patients(merchant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (merchant_id, encounter_id) REFERENCES clinical_encounters(merchant_id, id) ON DELETE SET NULL (encounter_id),
    FOREIGN KEY (merchant_id, prescribed_by_membership_id) REFERENCES user_memberships(merchant_id, id) ON DELETE SET NULL (prescribed_by_membership_id)
);

CREATE TABLE prescription_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    prescription_id UUID NOT NULL,
    medication_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(255),
    frequency VARCHAR(255),
    duration VARCHAR(255),
    instructions TEXT,
    UNIQUE (merchant_id, id),
    FOREIGN KEY (merchant_id, prescription_id) REFERENCES prescriptions(merchant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_organizations_parent ON organizations(parent_organization_id);
CREATE INDEX idx_organization_merchants_merchant ON organization_merchants(merchant_id, organization_id);
CREATE UNIQUE INDEX uq_organization_primary_merchant ON organization_merchants(organization_id) WHERE is_primary;
CREATE UNIQUE INDEX uq_unit_definitions_code_lower ON unit_definitions(merchant_id, lower(code));
CREATE UNIQUE INDEX uq_measurement_groups_code_lower ON measurement_groups(merchant_id, lower(code));
CREATE INDEX idx_unit_definitions_dimension ON unit_definitions(merchant_id, dimension_code, is_active);
CREATE INDEX idx_unit_definitions_measurement_group ON unit_definitions(merchant_id, measurement_group_id, is_active);
CREATE INDEX idx_unit_conversions_from ON unit_conversions(merchant_id, from_unit_id, is_active);
CREATE INDEX idx_unit_conversions_to ON unit_conversions(merchant_id, to_unit_id, is_active);
CREATE INDEX idx_product_variant_units_role ON product_variant_units(merchant_id, variant_id, unit_role, is_default);
CREATE UNIQUE INDEX uq_product_variant_default_unit_role
    ON product_variant_units(merchant_id, variant_id, unit_role) WHERE is_default;
CREATE UNIQUE INDEX uq_product_variant_base_unit
    ON product_variant_units(merchant_id, variant_id) WHERE unit_role = 'BASE';
CREATE UNIQUE INDEX uq_promotion_product_scope
    ON promotion_products(merchant_id, promotion_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX uq_promotion_variant_scope
    ON promotion_products(merchant_id, promotion_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX idx_promotion_products_product ON promotion_products(merchant_id, product_id, variant_id);
CREATE INDEX idx_order_lines_unit ON order_lines(merchant_id, unit_id);
CREATE INDEX idx_purchase_order_lines_unit ON purchase_order_lines(merchant_id, unit_id);
CREATE INDEX idx_goods_receipt_lines_unit ON goods_receipt_lines(merchant_id, unit_id);
CREATE INDEX idx_inventory_movements_unit ON inventory_movements(merchant_id, unit_id, occurred_at);
CREATE INDEX idx_inventory_asset_identifiers_lookup ON inventory_asset_identifiers(merchant_id, identifier_type_id, normalized_value);
CREATE UNIQUE INDEX uq_inventory_asset_primary_identifier
    ON inventory_asset_identifiers(merchant_id, asset_id, identifier_type_id) WHERE is_primary;
CREATE INDEX idx_variant_identifier_rules_variant ON variant_identifier_rules(merchant_id, variant_id, identifier_type_id);
CREATE INDEX idx_barcode_registry_lookup ON barcode_registry(merchant_id, normalized_code, is_active);
CREATE INDEX idx_inventory_operations_type_time ON inventory_operations(merchant_id, operation_type, created_at DESC);
CREATE INDEX idx_inventory_exceptions_status ON inventory_reconciliation_exceptions(merchant_id, status, created_at DESC);
CREATE INDEX idx_inventory_transformations_status ON inventory_transformations(merchant_id, status, created_at DESC);
CREATE INDEX idx_inventory_transformation_lines_transformation ON inventory_transformation_lines(merchant_id, transformation_id);
CREATE INDEX idx_ecommerce_store_fulfillment_locations ON ecommerce_store_fulfillment_locations(merchant_id, store_id, priority, is_active);
CREATE INDEX idx_business_units_parent ON business_units(merchant_id, parent_business_unit_id);
CREATE INDEX idx_business_units_organization ON business_units(organization_id, merchant_id, code);
CREATE INDEX idx_refresh_tokens_identity_expiry ON refresh_tokens(identity_id, expires_at);
CREATE INDEX idx_memberships_identity ON user_memberships(identity_id, merchant_id, is_active);
CREATE INDEX idx_accounting_periods_merchant_dates ON accounting_periods(merchant_id, starts_on, ends_on);
CREATE INDEX idx_tax_rates_active ON tax_rates(merchant_id, is_active, starts_at, ends_at);
CREATE INDEX idx_ar_documents_customer_status ON accounts_receivable_documents(merchant_id, customer_id, status, due_date);
CREATE INDEX idx_ar_documents_due ON accounts_receivable_documents(merchant_id, due_date) WHERE status IN ('OPEN','PARTIALLY_PAID','OVERDUE');
CREATE INDEX idx_ar_allocations_document ON accounts_receivable_allocations(merchant_id, document_id, allocated_at);
CREATE INDEX idx_supplier_invoices_supplier_status ON supplier_invoices(merchant_id, supplier_id, status, due_date);
CREATE INDEX idx_supplier_invoice_lines_invoice ON supplier_invoice_lines(merchant_id, supplier_invoice_id);
CREATE INDEX idx_supplier_payments_invoice ON supplier_payments(merchant_id, supplier_invoice_id, paid_at);
CREATE INDEX idx_ap_allocations_invoice ON accounts_payable_allocations(merchant_id, supplier_invoice_id, allocated_at);
CREATE INDEX idx_expenses_date_status ON expenses(merchant_id, expense_date, status);
CREATE INDEX idx_expense_items_expense ON expense_items(merchant_id, expense_id);
CREATE INDEX idx_cash_accounts_shop ON cash_accounts(merchant_id, shop_id, is_active);
CREATE INDEX idx_cash_transactions_account_date ON cash_transactions(merchant_id, cash_account_id, occurred_at DESC);
CREATE INDEX idx_bank_accounts_active ON bank_accounts(merchant_id, is_active);
CREATE INDEX idx_bank_transactions_account_date ON bank_transactions(merchant_id, bank_account_id, occurred_at DESC);
CREATE INDEX idx_bank_reconciliations_account_status ON bank_reconciliations(merchant_id, bank_account_id, status, period_end DESC);
CREATE INDEX idx_bank_reconciliation_items_reconciliation ON bank_reconciliation_items(merchant_id, reconciliation_id, bank_transaction_id);
CREATE INDEX idx_supplier_returns_status ON supplier_returns(merchant_id, supplier_id, status, created_at DESC);
CREATE INDEX idx_supplier_return_lines_return ON supplier_return_lines(merchant_id, supplier_return_id);
CREATE INDEX idx_staff_contracts_membership ON staff_contracts(merchant_id, membership_id, status);
CREATE INDEX idx_salary_payments_period ON salary_payments(merchant_id, contract_id, period_start, status);
CREATE INDEX idx_payment_settings_shop ON payment_settings(merchant_id, shop_id);
CREATE INDEX idx_merchant_payment_config_provider ON merchant_payment_configurations(merchant_id, provider_name, is_active);
CREATE INDEX idx_payment_proofs_payment_status ON payment_proofs(merchant_id, payment_id, status);
CREATE INDEX idx_payment_provider_sessions_payment_status ON payment_provider_sessions(merchant_id, payment_id, status, expires_at);
CREATE INDEX idx_ecommerce_stores_active ON ecommerce_stores(merchant_id, is_active);
CREATE INDEX idx_ecommerce_stores_domain ON ecommerce_stores(merchant_id, lower(domain));
CREATE INDEX idx_ecommerce_carts_store_status ON ecommerce_carts(merchant_id, store_id, status, updated_at DESC);
CREATE INDEX idx_ecommerce_store_products_store ON ecommerce_store_products(merchant_id, store_id, is_published);
CREATE INDEX idx_ecommerce_store_variants_product ON ecommerce_store_product_variants(merchant_id, store_id, variant_id);
CREATE INDEX idx_ecommerce_shipping_methods_store ON ecommerce_shipping_methods(merchant_id, store_id, is_active);
CREATE INDEX idx_ecommerce_order_events_order ON ecommerce_order_events(merchant_id, order_id, created_at DESC);
CREATE INDEX idx_ecommerce_order_discounts_order ON ecommerce_order_discounts(merchant_id, order_id);
CREATE INDEX idx_ecommerce_order_allocations_line ON ecommerce_order_item_allocations(merchant_id, order_line_id, location_id);
CREATE INDEX idx_guest_order_verifications_email ON guest_order_verifications(merchant_id, lower(email), expires_at);
CREATE INDEX idx_guest_order_access_tokens_expiry ON guest_order_access_tokens(merchant_id, expires_at);
CREATE INDEX idx_customer_tags_merchant ON customer_tags(merchant_id, name);
CREATE INDEX idx_customer_tag_map_customer ON customer_tag_map(merchant_id, customer_id, tag_id);
CREATE INDEX idx_customer_notes_customer ON customer_notes(merchant_id, customer_id, created_at DESC);
CREATE INDEX idx_customer_activities_customer ON customer_activities(merchant_id, customer_id, created_at DESC);
CREATE INDEX idx_conversations_customer_status ON conversations(merchant_id, customer_id, status, updated_at DESC);
CREATE INDEX idx_conversation_participants_conversation ON conversation_participants(merchant_id, conversation_id);
CREATE INDEX idx_messages_conversation_time ON messages(merchant_id, conversation_id, sent_at);
CREATE INDEX idx_communication_channels_type ON communication_channels(merchant_id, channel_type, is_active);
CREATE INDEX idx_email_templates_code ON email_templates(merchant_id, template_code, locale);
CREATE INDEX idx_email_queue_dispatch ON email_queue(merchant_id, status, next_attempt_at);
CREATE INDEX idx_notifications_recipient_read ON notifications(merchant_id, recipient_membership_id, read_at, created_at DESC);
CREATE INDEX idx_file_objects_entity ON file_objects(merchant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_integration_connections_scope ON integration_connections(merchant_id, provider, status);
CREATE INDEX idx_idempotency_keys_expiry ON idempotency_keys(merchant_id, expires_at);
CREATE INDEX idx_outbox_events_pending ON outbox_events(merchant_id, status, next_attempt_at, created_at);
CREATE INDEX idx_custom_field_definitions_entity ON custom_field_definitions(merchant_id, entity_type, value_type);
CREATE INDEX idx_custom_field_values_entity ON custom_field_values(merchant_id, entity_type, entity_id, definition_id);
CREATE INDEX idx_merchant_modules_status ON merchant_modules(merchant_id, status);
CREATE INDEX idx_document_sequences_type ON document_sequences(merchant_id, document_type);
CREATE INDEX idx_external_id_map_lookup ON external_id_map(merchant_id, entity_type, system_code, external_id);
CREATE INDEX idx_migration_audit_merchant_time ON migration_audit(merchant_id, created_at DESC);
CREATE INDEX idx_workflows_trigger_active ON workflows(merchant_id, trigger_type, is_active);
CREATE INDEX idx_workflow_rules_workflow_sequence ON workflow_rules(merchant_id, workflow_id, sequence_number);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(merchant_id, workflow_id, status, started_at DESC);
CREATE INDEX idx_workflow_logs_execution ON workflow_logs(merchant_id, execution_id, created_at);
CREATE INDEX idx_ai_providers_active ON ai_providers(merchant_id, provider_code, is_active);
CREATE INDEX idx_ai_sessions_customer ON ai_sessions(merchant_id, customer_id, created_at DESC);
CREATE INDEX idx_ai_requests_session_status ON ai_requests(merchant_id, session_id, status, requested_at DESC);
CREATE INDEX idx_sync_devices_membership ON sync_devices(merchant_id, membership_id, last_seen_at DESC);
CREATE INDEX idx_sync_entity_versions_entity ON sync_entity_versions(merchant_id, entity_type, entity_id, version DESC);
CREATE INDEX idx_sync_sessions_device_status ON sync_sessions(merchant_id, device_id, status, started_at DESC);
CREATE INDEX idx_sync_operations_pending ON sync_operations(merchant_id, device_id, status, server_sequence);
CREATE INDEX idx_sync_checkpoints_device ON sync_checkpoints(merchant_id, device_id, scope, server_sequence);
CREATE INDEX idx_sync_conflicts_open ON sync_conflicts(merchant_id, status, operation_id);
CREATE INDEX idx_sync_changes_entity_sequence ON sync_changes(merchant_id, entity_type, entity_id, server_sequence);
CREATE INDEX idx_sync_changes_shop_sequence ON sync_changes(merchant_id, shop_id, server_sequence);
CREATE INDEX idx_sync_logs_merchant_time ON sync_logs(merchant_id, created_at DESC);
CREATE INDEX idx_patients_status ON patients(merchant_id, status, display_name);
CREATE INDEX idx_patient_contacts_patient ON patient_contacts(merchant_id, patient_id, is_primary);
CREATE INDEX idx_patient_identifiers_lookup ON patient_identifiers(merchant_id, identifier_type, identifier_value);
CREATE INDEX idx_service_categories_parent ON service_categories(merchant_id, parent_id, name);
CREATE INDEX idx_service_catalog_active ON service_catalog(merchant_id, category_id, is_active);
CREATE INDEX idx_service_prices_lookup ON service_prices(merchant_id, service_id, price_list_id, valid_from DESC);
CREATE INDEX idx_service_orders_customer_status ON service_orders(merchant_id, customer_id, status, opened_at DESC);
CREATE INDEX idx_service_orders_patient ON service_orders(merchant_id, patient_id, opened_at DESC);
CREATE INDEX idx_service_order_items_order ON service_order_items(merchant_id, service_order_id, status);
CREATE INDEX idx_service_order_items_work_item ON service_order_items(merchant_id, work_item_id, id);
CREATE INDEX idx_service_work_item_payment_allocations_item ON service_work_item_payment_allocations(merchant_id, work_item_id, payment_id);
CREATE INDEX idx_service_order_work_items_order ON service_order_work_items(merchant_id, service_order_id, sequence_number);
CREATE INDEX idx_repair_work_item_devices_device ON repair_work_item_devices(merchant_id, repair_device_id);
CREATE INDEX idx_service_order_assignments_membership ON service_order_assignments(merchant_id, membership_id, assigned_at DESC);
CREATE INDEX idx_service_appointments_schedule ON service_appointments(merchant_id, assigned_membership_id, starts_at, ends_at);
CREATE INDEX idx_service_order_notes_order ON service_order_notes(merchant_id, service_order_id, created_at DESC);
CREATE INDEX idx_service_order_attachments_order ON service_order_attachments(merchant_id, service_order_id, file_object_id);
CREATE INDEX idx_service_order_billings_order ON service_order_billings(merchant_id, service_order_id, status);
CREATE INDEX idx_service_order_status_history_order ON service_order_status_history(merchant_id, service_order_id, changed_at DESC);
CREATE INDEX idx_repair_devices_customer ON repair_devices(merchant_id, customer_id, created_at DESC);
CREATE INDEX idx_repair_device_identifiers_lookup ON repair_device_identifiers(merchant_id, identifier_type, identifier_value);
CREATE INDEX idx_repair_orders_device_status ON repair_orders(merchant_id, device_id, status, received_at DESC);
CREATE INDEX idx_repair_orders_service_status ON repair_orders(merchant_id, service_order_id, status, received_at DESC);
CREATE INDEX idx_repair_diagnostics_order ON repair_diagnostics(merchant_id, repair_order_id, created_at DESC);
CREATE INDEX idx_customer_supplied_parts_customer ON customer_supplied_parts(merchant_id, customer_id, received_at DESC);
CREATE INDEX idx_repair_order_parts_order ON repair_order_parts(merchant_id, repair_order_id);
CREATE INDEX idx_repair_approvals_order ON repair_approvals(merchant_id, repair_order_id, status);
CREATE INDEX idx_repair_warranties_order ON repair_warranties(merchant_id, repair_order_id, ends_at);
CREATE INDEX idx_clinical_encounters_patient ON clinical_encounters(merchant_id, patient_id, started_at DESC);
CREATE INDEX idx_clinical_notes_encounter_version ON clinical_notes(merchant_id, encounter_id, version_number DESC);
CREATE INDEX idx_clinical_measurements_encounter ON clinical_measurements(merchant_id, encounter_id, measured_at DESC);
CREATE INDEX idx_clinical_procedures_encounter ON clinical_procedures(merchant_id, encounter_id, performed_at DESC);
CREATE INDEX idx_clinical_diagnoses_encounter ON clinical_diagnoses(merchant_id, encounter_id, is_primary);
CREATE INDEX idx_treatment_plans_patient_status ON treatment_plans(merchant_id, patient_id, status);
CREATE INDEX idx_treatment_plan_items_plan ON treatment_plan_items(merchant_id, treatment_plan_id, sequence_number);
CREATE INDEX idx_patient_consents_patient ON patient_consents(merchant_id, patient_id, consent_type, status);
CREATE INDEX idx_patient_allergies_patient ON patient_allergies(merchant_id, patient_id, status);
CREATE INDEX idx_prescriptions_patient_status ON prescriptions(merchant_id, patient_id, status, issued_at DESC);
CREATE INDEX idx_prescription_items_prescription ON prescription_items(merchant_id, prescription_id);

CREATE INDEX idx_orders_merchant_status ON orders(merchant_id, status, created_at DESC);
CREATE INDEX idx_orders_store_status ON orders(merchant_id, store_id, status, created_at DESC);
CREATE INDEX idx_order_lines_order ON order_lines(merchant_id, order_id);
CREATE INDEX idx_payments_order_status ON payments(merchant_id, order_id, status);
CREATE INDEX idx_refunds_payment_status ON refunds(merchant_id, payment_id, status);
CREATE INDEX idx_refunds_order_status ON refunds(merchant_id, order_id, status);
CREATE INDEX idx_fulfillment_lines_order_line ON fulfillment_lines(merchant_id, order_line_id);
CREATE INDEX idx_inventory_movements_variant_time ON inventory_movements(merchant_id, variant_id, occurred_at, id);
CREATE INDEX idx_inventory_layers_fifo ON inventory_cost_layers(merchant_id, location_id, variant_id, created_at, id) WHERE quantity_remaining > 0;
CREATE INDEX idx_inventory_cost_allocations_consumption ON inventory_cost_allocations(merchant_id, consumption_movement_id);
CREATE UNIQUE INDEX uq_inventory_restored_allocation
    ON inventory_cost_layers(merchant_id, restored_from_allocation_id)
    WHERE restored_from_allocation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_inventory_movement_return
    ON inventory_movements(merchant_id, reverses_movement_id)
    WHERE movement_type = 'RETURN';
CREATE UNIQUE INDEX uq_inventory_movement_reversal
    ON inventory_movements(merchant_id, reverses_movement_id)
    WHERE movement_type = 'REVERSAL';
CREATE INDEX idx_purchase_receipt_lines_po_line ON goods_receipt_lines(merchant_id, purchase_order_line_id);
CREATE INDEX idx_audit_events_merchant_time ON audit_events(merchant_id, occurred_at DESC);
CREATE INDEX idx_membership_shop_assignments_membership ON membership_shop_assignments(merchant_id, membership_id, valid_until);
CREATE INDEX idx_membership_shop_assignments_shop ON membership_shop_assignments(merchant_id, shop_id, valid_until);
CREATE INDEX idx_catalog_categories_parent ON catalog_categories(merchant_id, parent_category_id, sort_order);
CREATE INDEX idx_products_brand ON products(merchant_id, brand_id);
CREATE INDEX idx_catalog_product_categories_category ON catalog_product_categories(merchant_id, category_id, product_id);
CREATE INDEX idx_catalog_product_images_product ON catalog_product_images(merchant_id, product_id, position);
CREATE INDEX idx_catalog_variant_images_variant ON catalog_variant_images(merchant_id, variant_id, position);
CREATE INDEX idx_catalog_attribute_values_lookup ON catalog_attribute_values(merchant_id, definition_id, product_id, variant_id);
CREATE UNIQUE INDEX uq_catalog_attribute_product ON catalog_attribute_values(merchant_id, definition_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX uq_catalog_attribute_variant ON catalog_attribute_values(merchant_id, definition_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX idx_inventory_batches_lookup ON inventory_batches(merchant_id, variant_id, location_id, expires_at);
CREATE INDEX idx_inventory_serials_lookup ON inventory_serials(merchant_id, variant_id, location_id, status);
CREATE INDEX idx_inventory_assets_lookup ON inventory_assets(merchant_id, variant_id, location_id, status);
CREATE INDEX idx_inventory_movement_batches_batch ON inventory_movement_batches(merchant_id, batch_id);
CREATE INDEX idx_inventory_movement_serials_serial ON inventory_movement_serials(merchant_id, serial_id);
CREATE INDEX idx_inventory_movement_assets_asset ON inventory_movement_assets(merchant_id, asset_id);
CREATE INDEX idx_pos_terminals_shop ON pos_terminals(merchant_id, shop_id, is_active);
CREATE INDEX idx_pos_sessions_shop_status ON pos_sessions(merchant_id, shop_id, status, opened_at DESC);
CREATE UNIQUE INDEX uq_pos_open_session_terminal ON pos_sessions(merchant_id, terminal_id)
    WHERE status = 'OPEN' AND terminal_id IS NOT NULL;
CREATE INDEX idx_ecommerce_carts_customer_status ON ecommerce_carts(merchant_id, customer_id, status);
CREATE UNIQUE INDEX uq_ecommerce_active_cart_customer ON ecommerce_carts(merchant_id, customer_id)
    WHERE status = 'ACTIVE' AND customer_id IS NOT NULL;
CREATE INDEX idx_ecommerce_cart_items_cart ON ecommerce_cart_items(merchant_id, cart_id);
CREATE INDEX idx_ecommerce_checkout_sessions_status ON ecommerce_checkout_sessions(merchant_id, status, expires_at);
CREATE UNIQUE INDEX uq_promotion_codes_lower ON promotion_codes(merchant_id, lower(code));
CREATE INDEX idx_promotions_active_window ON promotions(merchant_id, is_active, starts_at, ends_at);
CREATE INDEX idx_promotion_redemptions_code ON promotion_redemptions(merchant_id, code_id, redeemed_at DESC);
CREATE INDEX idx_ecommerce_returns_order_status ON ecommerce_returns(merchant_id, order_id, status);
CREATE INDEX idx_ecommerce_return_lines_order_line ON ecommerce_return_lines(merchant_id, order_line_id);
CREATE INDEX idx_variant_inventory_policies_flags
    ON variant_inventory_policies(merchant_id, track_batches, track_serials, track_unique_assets, track_reservations);
CREATE INDEX idx_support_cases_status_priority
    ON support_cases(merchant_id, status, priority, updated_at DESC);
CREATE INDEX idx_support_cases_assignee_status
    ON support_cases(merchant_id, assigned_membership_id, status, updated_at DESC);
CREATE INDEX idx_support_cases_customer_created
    ON support_cases(merchant_id, customer_id, created_at DESC);
CREATE INDEX idx_support_cases_sla
    ON support_cases(merchant_id, resolution_due_at, status);
CREATE UNIQUE INDEX uq_merchant_settings_global_key
    ON merchant_settings(merchant_id, setting_key) WHERE module_code IS NULL;
CREATE UNIQUE INDEX uq_merchant_settings_module_key
    ON merchant_settings(merchant_id, module_code, setting_key) WHERE module_code IS NOT NULL;
CREATE INDEX idx_merchant_settings_updated
    ON merchant_settings(merchant_id, updated_at DESC);
CREATE INDEX idx_storefront_banners_published
    ON storefront_banners(merchant_id, store_id, status, position, publish_at);
CREATE INDEX idx_storefront_banners_schedule
    ON storefront_banners(merchant_id, publish_at, unpublish_at);
CREATE INDEX idx_merchant_testimonials_published
    ON merchant_testimonials(merchant_id, status, display_position, published_at DESC);
CREATE INDEX idx_merchant_testimonials_customer
    ON merchant_testimonials(merchant_id, customer_id, created_at DESC);

CREATE OR REPLACE VIEW shop_settings_view
WITH (security_invoker = true) AS
SELECT s.merchant_id,
       s.id AS shop_id,
       s.code AS shop_code,
       s.name AS shop_name,
       s.address,
       s.timezone,
       s.is_active,
       COALESCE(ps.tax_rate, 0)::NUMERIC(7,4) AS tax_rate,
       COALESCE(ps.service_charge, 0)::NUMERIC(15,2) AS service_charge,
       COALESCE(ps.delivery_charge, 0)::NUMERIC(15,2) AS delivery_charge
  FROM shops s
  LEFT JOIN payment_settings ps
    ON ps.merchant_id = s.merchant_id AND ps.shop_id = s.id;

CREATE OR REPLACE VIEW inventory_position_view
WITH (security_invoker = true) AS
SELECT b.merchant_id,
       b.location_id,
       l.code AS location_code,
       l.name AS location_name,
       b.variant_id,
       p.id AS product_id,
       p.name AS product_name,
       v.sku,
       v.name AS variant_name,
       b.quantity_on_hand,
       b.quantity_reserved,
       b.quantity_on_hand - b.quantity_reserved AS quantity_available,
       b.updated_at
  FROM inventory_balances b
  JOIN locations l ON l.merchant_id = b.merchant_id AND l.id = b.location_id
  JOIN product_variants v ON v.merchant_id = b.merchant_id AND v.id = b.variant_id
  JOIN products p ON p.merchant_id = v.merchant_id AND p.id = v.product_id;

CREATE OR REPLACE VIEW order_reporting_view
WITH (security_invoker = true) AS
SELECT o.merchant_id,
       o.id AS order_id,
       o.order_number,
       o.channel,
       o.store_id,
       o.status,
       o.customer_id,
       o.created_at,
       o.placed_at,
       o.currency_code,
       o.subtotal,
       o.discount_total,
       o.tax_total,
       o.shipping_total,
       o.grand_total,
       COALESCE(lines.line_count, 0) AS line_count,
       COALESCE(lines.fulfilled_quantity, 0) AS fulfilled_quantity,
       COALESCE(payments.captured_amount, 0) AS captured_amount,
       COALESCE(refunds.refunded_amount, 0) AS refunded_amount
  FROM orders o
  LEFT JOIN LATERAL (
      SELECT count(*)::INTEGER AS line_count,
             COALESCE(sum(ol.quantity_fulfilled), 0)::NUMERIC(20,6) AS fulfilled_quantity
        FROM order_lines ol
       WHERE ol.merchant_id = o.merchant_id AND ol.order_id = o.id
  ) lines ON TRUE
  LEFT JOIN LATERAL (
      SELECT COALESCE(sum(py.amount) FILTER (WHERE py.status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')), 0)::NUMERIC(15,2) AS captured_amount
        FROM payments py
       WHERE py.merchant_id = o.merchant_id AND py.order_id = o.id
  ) payments ON TRUE
  LEFT JOIN LATERAL (
      SELECT COALESCE(sum(r.amount) FILTER (WHERE r.status = 'SUCCEEDED'), 0)::NUMERIC(15,2) AS refunded_amount
        FROM refunds r
       WHERE r.merchant_id = o.merchant_id AND r.order_id = o.id
  ) refunds ON TRUE;

CREATE OR REPLACE VIEW customer_activity_summary_view
WITH (security_invoker = true) AS
SELECT c.merchant_id,
       c.id AS customer_id,
       c.display_name,
       c.email,
       c.phone,
       COALESCE(order_stats.order_count, 0) AS order_count,
       COALESCE(order_stats.order_value, 0)::NUMERIC(15,2) AS order_value,
       order_stats.last_order_at,
       activity.last_activity_at
  FROM customers c
  LEFT JOIN LATERAL (
      SELECT count(*)::INTEGER AS order_count,
             COALESCE(sum(o.grand_total), 0) AS order_value,
             max(o.created_at) AS last_order_at
        FROM orders o
       WHERE o.merchant_id = c.merchant_id AND o.customer_id = c.id
  ) order_stats ON TRUE
  LEFT JOIN LATERAL (
      SELECT max(ca.created_at) AS last_activity_at
        FROM customer_activities ca
       WHERE ca.merchant_id = c.merchant_id AND ca.customer_id = c.id
  ) activity ON TRUE;

CREATE OR REPLACE VIEW accounts_receivable_aging_view
WITH (security_invoker = true) AS
SELECT d.merchant_id,
       d.id AS document_id,
       d.document_number,
       d.customer_id,
       d.document_date,
       d.due_date,
       d.total_amount,
       d.balance_amount,
       CASE
           WHEN d.due_date IS NULL OR d.due_date >= CURRENT_DATE THEN 'CURRENT'
           WHEN CURRENT_DATE - d.due_date <= 30 THEN '1_30'
           WHEN CURRENT_DATE - d.due_date <= 60 THEN '31_60'
           WHEN CURRENT_DATE - d.due_date <= 90 THEN '61_90'
           ELSE '90_PLUS'
       END AS aging_bucket
  FROM accounts_receivable_documents d
 WHERE d.status IN ('OPEN','PARTIALLY_PAID','OVERDUE');

CREATE OR REPLACE FUNCTION validate_catalog_category_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_category_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_category_id = NEW.id THEN
        RAISE EXCEPTION 'A catalog category cannot be its own parent';
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors(category_id, path) AS (
            SELECT c.parent_category_id, ARRAY[c.parent_category_id]::uuid[]
              FROM catalog_categories c
             WHERE c.merchant_id = NEW.merchant_id AND c.id = NEW.parent_category_id
            UNION ALL
            SELECT c.parent_category_id, a.path || c.parent_category_id
              FROM catalog_categories c
              JOIN ancestors a
                ON c.merchant_id = NEW.merchant_id AND c.id = a.category_id
             WHERE c.parent_category_id IS NOT NULL
               AND NOT c.parent_category_id = ANY(a.path)
        )
        SELECT 1 FROM ancestors WHERE category_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Catalog category hierarchy cannot contain a cycle';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_unit_conversion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE from_dimension VARCHAR(100); to_dimension VARCHAR(100); from_group UUID; to_group UUID;
BEGIN
    SELECT dimension_code, measurement_group_id INTO from_dimension, from_group
      FROM unit_definitions
      WHERE merchant_id = NEW.merchant_id AND id = NEW.from_unit_id AND is_active;
    SELECT dimension_code, measurement_group_id INTO to_dimension, to_group
      FROM unit_definitions
      WHERE merchant_id = NEW.merchant_id AND id = NEW.to_unit_id AND is_active;
    IF from_dimension IS NULL OR to_dimension IS NULL THEN
        RAISE EXCEPTION 'Unit conversion endpoints must belong to the same merchant';
    END IF;
    IF (from_group IS NOT NULL OR to_group IS NOT NULL) AND from_group IS DISTINCT FROM to_group THEN
        RAISE EXCEPTION 'Unit conversions must stay within one measurement group';
    END IF;
    IF from_dimension <> to_dimension THEN
        RAISE EXCEPTION 'Unit conversions must stay within one measurement dimension';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_order_store() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ecommerce_stores
         WHERE merchant_id = NEW.merchant_id AND id = NEW.store_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Order store must be an active store of the same merchant';
    END IF;
    IF NEW.store_id IS NOT NULL AND NEW.channel <> 'ONLINE' THEN
        RAISE EXCEPTION 'Only online orders can be assigned to an ecommerce store';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_refund_return() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE return_order_id UUID;
BEGIN
    IF NEW.return_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT order_id INTO return_order_id
      FROM ecommerce_returns
     WHERE merchant_id = NEW.merchant_id AND id = NEW.return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund return must belong to the same merchant';
    END IF;
    IF return_order_id <> NEW.order_id THEN
        RAISE EXCEPTION 'Refund return must belong to the refund order';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_inventory_cost_layer_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.restored_from_allocation_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM inventory_cost_allocations
            WHERE merchant_id = NEW.merchant_id AND id = NEW.restored_from_allocation_id
       ) THEN
        RAISE EXCEPTION 'Restored inventory cost layer must reference an allocation in the same merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Inventory movements are append-only; create a reversal movement instead';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_derived_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'Inventory-derived records can only be changed by inventory movements';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_link_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Inventory movement links are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_inventory_identity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION validate_inventory_batch_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement RECORD; batch_location UUID; referenced_batch_number VARCHAR(100); receipt_batch_number VARCHAR(100);
BEGIN
    SELECT * INTO movement
      FROM inventory_movements
     WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
    SELECT location_id, batch_number INTO batch_location, referenced_batch_number
      FROM inventory_batches
      WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory batch link must reference an existing batch';
    END IF;
    IF movement.movement_type = 'RECEIPT' THEN
        SELECT batch_number INTO receipt_batch_number
          FROM goods_receipt_lines
         WHERE merchant_id = NEW.merchant_id AND id = movement.receipt_line_id;
        IF receipt_batch_number IS NULL
           OR referenced_batch_number IS DISTINCT FROM receipt_batch_number
           OR NEW.quantity IS DISTINCT FROM movement.quantity THEN
            RAISE EXCEPTION 'Receipt batch link must match the receipt line batch and quantity';
        END IF;
    END IF;
    IF movement.source_location_id IS NOT NULL AND movement.destination_location_id IS NULL
       AND batch_location IS DISTINCT FROM movement.source_location_id THEN
        RAISE EXCEPTION 'Inventory source batch must be at the movement source location';
    END IF;
    IF movement.source_location_id IS NULL AND movement.destination_location_id IS NOT NULL
       AND batch_location IS DISTINCT FROM movement.destination_location_id THEN
        RAISE EXCEPTION 'Inventory destination batch must be at the movement destination location';
    END IF;
    IF movement.source_location_id IS NOT NULL AND movement.destination_location_id IS NOT NULL
       AND batch_location IS DISTINCT FROM movement.source_location_id THEN
        RAISE EXCEPTION 'Transfer batch links must reference the source batch';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_batch_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement RECORD; batch RECORD;
BEGIN
    SELECT * INTO movement
      FROM inventory_movements
     WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
    SELECT * INTO batch
      FROM inventory_batches
     WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id
     FOR UPDATE;
    IF movement.movement_type = 'RECEIPT' THEN
        RETURN NEW;
    END IF;
    IF movement.source_location_id IS NOT NULL THEN
        IF batch.quantity_remaining < NEW.quantity THEN
            RAISE EXCEPTION 'Inventory batch cannot become negative';
        END IF;
        UPDATE inventory_batches
           SET quantity_remaining = quantity_remaining - NEW.quantity
         WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id;
    END IF;
    IF movement.destination_location_id IS NOT NULL AND movement.source_location_id IS NOT NULL THEN
        INSERT INTO inventory_batches(
            merchant_id, variant_id, location_id, batch_number, received_at, expires_at,
            quantity_received, quantity_remaining
        ) VALUES (
            movement.merchant_id, batch.variant_id, movement.destination_location_id,
            batch.batch_number, batch.received_at, batch.expires_at,
            NEW.quantity, NEW.quantity
        )
        ON CONFLICT (merchant_id, variant_id, location_id, batch_number)
        DO UPDATE SET quantity_received = inventory_batches.quantity_received + EXCLUDED.quantity_received,
                      quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining;
    ELSIF movement.destination_location_id IS NOT NULL THEN
        UPDATE inventory_batches
           SET quantity_received = quantity_received + NEW.quantity,
               quantity_remaining = quantity_remaining + NEW.quantity
         WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_serial_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement RECORD; current_location UUID; current_status VARCHAR(20);
BEGIN
    SELECT * INTO movement FROM inventory_movements
     WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
    SELECT location_id, status INTO current_location, current_status
      FROM inventory_serials
     WHERE merchant_id = NEW.merchant_id AND id = NEW.serial_id
     FOR UPDATE;
    IF movement.source_location_id IS NOT NULL
       AND (current_location IS DISTINCT FROM movement.source_location_id
            OR current_status IN ('SOLD','RETIRED','DAMAGED')) THEN
        RAISE EXCEPTION 'Serial is not available at the movement source location';
    END IF;
    IF movement.movement_type = 'SALE' THEN
        UPDATE inventory_serials SET location_id = NULL, status = 'SOLD'
         WHERE merchant_id = NEW.merchant_id AND id = NEW.serial_id;
    ELSIF movement.destination_location_id IS NOT NULL THEN
        UPDATE inventory_serials SET location_id = movement.destination_location_id, status = 'AVAILABLE'
         WHERE merchant_id = NEW.merchant_id AND id = NEW.serial_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_asset_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement RECORD; current_location UUID; current_status VARCHAR(20);
BEGIN
    SELECT * INTO movement FROM inventory_movements
     WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
    SELECT location_id, status INTO current_location, current_status
      FROM inventory_assets
     WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id
     FOR UPDATE;
    IF movement.source_location_id IS NOT NULL
       AND (current_location IS DISTINCT FROM movement.source_location_id
            OR current_status IN ('SOLD','RETIRED','LOST')) THEN
        RAISE EXCEPTION 'Asset is not available at the movement source location';
    END IF;
    IF movement.movement_type = 'SALE' THEN
        UPDATE inventory_assets SET location_id = NULL, status = 'SOLD'
         WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id;
        UPDATE inventory_serials
           SET location_id = NULL, status = 'SOLD'
         WHERE merchant_id = NEW.merchant_id
           AND id = (SELECT serial_id FROM inventory_assets WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id);
    ELSIF movement.destination_location_id IS NOT NULL THEN
        UPDATE inventory_assets SET location_id = movement.destination_location_id, status = 'ACTIVE'
         WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id;
        UPDATE inventory_serials
           SET location_id = movement.destination_location_id, status = 'AVAILABLE'
         WHERE merchant_id = NEW.merchant_id
           AND id = (SELECT serial_id FROM inventory_assets WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_inventory_movement_completeness() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement RECORD; target_movement_id UUID; policy RECORD; linked_quantity NUMERIC(20,6); linked_serials BIGINT; linked_assets BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'inventory_movements' THEN
        target_movement_id := NEW.id;
    ELSE
        target_movement_id := NEW.movement_id;
    END IF;
    SELECT im.* INTO movement
      FROM inventory_movements im
     WHERE im.merchant_id = NEW.merchant_id
       AND im.id = target_movement_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory movement completeness check requires an existing movement';
    END IF;

    SELECT vip.* INTO policy
      FROM variant_inventory_policies vip
     WHERE vip.merchant_id = movement.merchant_id
       AND vip.variant_id = movement.variant_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    IF policy.track_batches AND movement.movement_type <> 'RECEIPT' THEN
        SELECT COALESCE(sum(quantity), 0) INTO linked_quantity
          FROM inventory_movement_batches imb
          WHERE imb.merchant_id = movement.merchant_id AND imb.movement_id = movement.id;
        IF linked_quantity IS DISTINCT FROM movement.quantity THEN
            RAISE EXCEPTION 'Batch-tracked movement requires batch links totaling the movement quantity';
        END IF;
    END IF;
    IF policy.track_serials THEN
        IF movement.quantity <> trunc(movement.quantity) THEN
            RAISE EXCEPTION 'Serial-tracked movements require whole-number quantities';
        END IF;
        SELECT count(*) INTO linked_serials
          FROM inventory_movement_serials ims
          WHERE ims.merchant_id = movement.merchant_id AND ims.movement_id = movement.id;
        IF linked_serials::NUMERIC IS DISTINCT FROM movement.quantity THEN
            RAISE EXCEPTION 'Serial-tracked movement requires one serial link per unit';
        END IF;
    END IF;
    IF policy.track_unique_assets THEN
        IF movement.quantity <> trunc(movement.quantity) THEN
            RAISE EXCEPTION 'Asset-tracked movements require whole-number quantities';
        END IF;
        SELECT count(*) INTO linked_assets
          FROM inventory_movement_assets ima
          WHERE ima.merchant_id = movement.merchant_id AND ima.movement_id = movement.id;
        IF linked_assets::NUMERIC IS DISTINCT FROM movement.quantity THEN
            RAISE EXCEPTION 'Asset-tracked movement requires one asset link per unit';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_product_variant_base_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE unit_code VARCHAR(100); resolved_unit UUID;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.unit_of_measure IS DISTINCT FROM OLD.unit_of_measure
       AND NEW.base_unit_id IS NOT DISTINCT FROM OLD.base_unit_id THEN
        NEW.base_unit_id := NULL;
    END IF;

    IF NEW.base_unit_id IS NULL THEN
        unit_code := lower(trim(COALESCE(NEW.unit_of_measure, '')));
        IF unit_code = '' THEN
            RAISE EXCEPTION 'A stock-tracked product variant requires a base unit';
        END IF;
        INSERT INTO unit_definitions(merchant_id, code, name, symbol, dimension_code)
        VALUES (NEW.merchant_id, unit_code, trim(NEW.unit_of_measure), trim(NEW.unit_of_measure), 'CUSTOM')
        ON CONFLICT DO NOTHING;
        SELECT id, code INTO resolved_unit, unit_code
          FROM unit_definitions
         WHERE merchant_id = NEW.merchant_id AND lower(code) = unit_code;
        IF resolved_unit IS NULL THEN
            RAISE EXCEPTION 'Unable to resolve the product variant base unit';
        END IF;
        NEW.base_unit_id := resolved_unit;
    ELSE
        SELECT id, code INTO resolved_unit, unit_code
          FROM unit_definitions
         WHERE merchant_id = NEW.merchant_id AND id = NEW.base_unit_id AND is_active;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product variant base unit must be an active unit of the same merchant';
        END IF;
        NEW.base_unit_id := resolved_unit;
        NEW.unit_of_measure := unit_code;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assign_product_variant_base_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM product_variant_units
     WHERE merchant_id = NEW.merchant_id
       AND variant_id = NEW.id
       AND unit_role = 'BASE'
       AND unit_id <> NEW.base_unit_id;
    INSERT INTO product_variant_units(merchant_id, variant_id, unit_id, unit_role, is_default)
    VALUES (NEW.merchant_id, NEW.id, NEW.base_unit_id, 'BASE', TRUE)
    ON CONFLICT (merchant_id, variant_id, unit_id)
    DO UPDATE SET unit_role = 'BASE', is_default = TRUE;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_product_variant_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_dimension VARCHAR(100); assigned_dimension VARCHAR(100); base_unit UUID;
BEGIN
    SELECT pv.base_unit_id, base.dimension_code, assigned.dimension_code
      INTO base_unit, base_dimension, assigned_dimension
      FROM product_variants pv
      JOIN unit_definitions base
        ON base.merchant_id = pv.merchant_id AND base.id = pv.base_unit_id AND base.is_active
      JOIN unit_definitions assigned
        ON assigned.merchant_id = NEW.merchant_id AND assigned.id = NEW.unit_id AND assigned.is_active
     WHERE pv.merchant_id = NEW.merchant_id AND pv.id = NEW.variant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant unit assignment must reference an existing same-merchant variant and unit';
    END IF;
    IF base_dimension <> assigned_dimension THEN
        RAISE EXCEPTION 'Variant units must share the base unit measurement dimension';
    END IF;
    IF NEW.unit_role = 'BASE' AND NEW.unit_id <> base_unit THEN
        RAISE EXCEPTION 'A variant BASE unit assignment must match base_unit_id';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_unit_quantity_precision(
    p_merchant_id UUID,
    p_unit_id UUID,
    p_amount NUMERIC
) RETURNS VOID LANGUAGE plpgsql STABLE AS $$
DECLARE unit_allows_decimal BOOLEAN;
BEGIN
    SELECT allows_decimal INTO unit_allows_decimal
      FROM unit_definitions
     WHERE merchant_id = p_merchant_id AND id = p_unit_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quantity unit must be an active unit of the same merchant';
    END IF;
    IF NOT unit_allows_decimal AND p_amount <> trunc(p_amount) THEN
        RAISE EXCEPTION 'Unit % only accepts whole-number quantities', p_unit_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION convert_unit_quantity(
    p_merchant_id UUID,
    p_amount NUMERIC,
    p_from_unit_id UUID,
    p_to_unit_id UUID
) RETURNS NUMERIC LANGUAGE plpgsql STABLE AS $$
DECLARE from_dimension VARCHAR(100); to_dimension VARCHAR(100); converted NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_from_unit_id IS NULL OR p_to_unit_id IS NULL THEN
        RAISE EXCEPTION 'Unit conversion requires an amount and both unit identifiers';
    END IF;
    SELECT dimension_code INTO from_dimension
      FROM unit_definitions
     WHERE merchant_id = p_merchant_id AND id = p_from_unit_id AND is_active;
    SELECT dimension_code INTO to_dimension
      FROM unit_definitions
     WHERE merchant_id = p_merchant_id AND id = p_to_unit_id AND is_active;
    IF from_dimension IS NULL OR to_dimension IS NULL THEN
        RAISE EXCEPTION 'Unit conversion requires active same-merchant units';
    END IF;
    IF from_dimension <> to_dimension THEN
        RAISE EXCEPTION 'Cannot convert between different measurement dimensions';
    END IF;
    IF p_from_unit_id = p_to_unit_id THEN
        RETURN p_amount;
    END IF;

    WITH RECURSIVE edges(from_unit_id, to_unit_id, multiplier, additive_offset) AS (
        SELECT uc.from_unit_id, uc.to_unit_id, uc.multiplier, uc.additive_offset
          FROM unit_conversions uc
         WHERE uc.merchant_id = p_merchant_id AND uc.is_active
        UNION ALL
        SELECT uc.to_unit_id, uc.from_unit_id,
               1 / uc.multiplier,
               -uc.additive_offset / uc.multiplier
          FROM unit_conversions uc
         WHERE uc.merchant_id = p_merchant_id AND uc.is_active
    ), paths(unit_id, scale_factor, offset_value, path, depth) AS (
        SELECT p_from_unit_id, 1::NUMERIC, 0::NUMERIC,
               ARRAY[p_from_unit_id]::uuid[], 0
        UNION ALL
        SELECT e.to_unit_id,
               p.scale_factor * e.multiplier,
               p.offset_value * e.multiplier + e.additive_offset,
               p.path || e.to_unit_id,
               p.depth + 1
          FROM paths p
          JOIN edges e ON e.from_unit_id = p.unit_id
         WHERE NOT e.to_unit_id = ANY(p.path)
    )
    SELECT p_amount * scale_factor + offset_value
      INTO converted
      FROM paths
     WHERE unit_id = p_to_unit_id
     ORDER BY depth
     LIMIT 1;
    IF converted IS NULL THEN
        RAISE EXCEPTION 'No conversion path exists between the requested units';
    END IF;
    RETURN converted;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_inventory_movement_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_unit UUID; original_quantity NUMERIC(20,6);
BEGIN
    SELECT base_unit_id INTO base_unit
      FROM product_variants
     WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
    IF base_unit IS NULL THEN
        RAISE EXCEPTION 'Inventory movement variant has no base unit';
    END IF;
    original_quantity := COALESCE(NEW.entered_quantity, NEW.quantity);
    IF original_quantity <= 0 THEN
        RAISE EXCEPTION 'Inventory movement quantity must be positive';
    END IF;
    IF NEW.unit_id IS NULL THEN
        NEW.unit_id := base_unit;
    ELSIF NOT EXISTS (
        SELECT 1 FROM product_variant_units
         WHERE merchant_id = NEW.merchant_id
           AND variant_id = NEW.variant_id
           AND unit_id = NEW.unit_id
    ) THEN
        RAISE EXCEPTION 'Inventory movement unit is not assigned to the product variant';
    END IF;
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, NEW.unit_id, original_quantity);
    NEW.entered_quantity := original_quantity;
    NEW.quantity := convert_unit_quantity(NEW.merchant_id, original_quantity, NEW.unit_id, base_unit);
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, base_unit, NEW.quantity);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_order_line_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_unit UUID;
BEGIN
    IF NEW.variant_id IS NULL THEN
        IF NEW.unit_id IS NOT NULL THEN
            RAISE EXCEPTION 'A custom order line without a variant cannot specify a unit';
        END IF;
        RETURN NEW;
    END IF;
    SELECT base_unit_id INTO base_unit
      FROM product_variants
     WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
    IF base_unit IS NULL THEN
        RAISE EXCEPTION 'Order line variant has no base unit';
    END IF;
    NEW.unit_id := COALESCE(NEW.unit_id, base_unit);
    IF NOT EXISTS (
        SELECT 1 FROM product_variant_units
         WHERE merchant_id = NEW.merchant_id AND variant_id = NEW.variant_id AND unit_id = NEW.unit_id
    ) THEN
        RAISE EXCEPTION 'Order line unit is not assigned to the product variant';
    END IF;
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, NEW.unit_id, NEW.quantity);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_purchase_order_line_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_unit UUID;
BEGIN
    SELECT base_unit_id INTO base_unit
      FROM product_variants
     WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
    IF base_unit IS NULL THEN
        RAISE EXCEPTION 'Purchase order line variant has no base unit';
    END IF;
    NEW.unit_id := COALESCE(NEW.unit_id, base_unit);
    IF NOT EXISTS (
        SELECT 1 FROM product_variant_units
         WHERE merchant_id = NEW.merchant_id AND variant_id = NEW.variant_id AND unit_id = NEW.unit_id
    ) THEN
        RAISE EXCEPTION 'Purchase order line unit is not assigned to the product variant';
    END IF;
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, NEW.unit_id, NEW.quantity_ordered);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_goods_receipt_line_unit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase_unit UUID;
BEGIN
    SELECT pol.unit_id INTO purchase_unit
      FROM purchase_order_lines pol
     WHERE pol.merchant_id = NEW.merchant_id AND pol.id = NEW.purchase_order_line_id;
    IF purchase_unit IS NULL THEN
        RAISE EXCEPTION 'Goods receipt line requires a unit-bearing purchase order line';
    END IF;
    IF NEW.unit_id IS NULL THEN
        NEW.unit_id := purchase_unit;
    ELSIF NEW.unit_id <> purchase_unit THEN
        RAISE EXCEPTION 'Goods receipt line unit must match the purchase order line unit';
    END IF;
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, NEW.unit_id, NEW.quantity_received);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_inventory_transformation_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_unit UUID; transformation_status VARCHAR(20);
BEGIN
    SELECT status INTO transformation_status
      FROM inventory_transformations
     WHERE merchant_id = NEW.merchant_id AND id = NEW.transformation_id;
    IF transformation_status IS NULL OR transformation_status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Transformation lines can only be changed while the transformation is DRAFT';
    END IF;
    SELECT base_unit_id INTO base_unit
      FROM product_variants
     WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
    IF base_unit IS NULL THEN
        RAISE EXCEPTION 'Transformation variant has no base unit';
    END IF;
    NEW.unit_id := COALESCE(NEW.unit_id, base_unit);
    IF NOT EXISTS (
        SELECT 1 FROM product_variant_units
         WHERE merchant_id = NEW.merchant_id AND variant_id = NEW.variant_id AND unit_id = NEW.unit_id
    ) THEN
        RAISE EXCEPTION 'Transformation unit is not assigned to the product variant';
    END IF;
    PERFORM validate_unit_quantity_precision(NEW.merchant_id, NEW.unit_id, NEW.quantity);
    NEW.base_quantity := convert_unit_quantity(NEW.merchant_id, NEW.quantity, NEW.unit_id, base_unit);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_support_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conversation_customer UUID; assigned_active BOOLEAN;
BEGIN
    SELECT customer_id INTO conversation_customer
      FROM conversations
     WHERE merchant_id = NEW.merchant_id AND id = NEW.conversation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support case conversation must belong to the same merchant';
    END IF;
    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := conversation_customer;
    ELSIF conversation_customer IS NOT NULL AND NEW.customer_id IS DISTINCT FROM conversation_customer THEN
        RAISE EXCEPTION 'Support case customer must match the conversation customer';
    END IF;
    IF NEW.assigned_membership_id IS NOT NULL THEN
        SELECT is_active INTO assigned_active FROM user_memberships
         WHERE merchant_id = NEW.merchant_id AND id = NEW.assigned_membership_id;
        IF NOT COALESCE(assigned_active, FALSE) THEN
            RAISE EXCEPTION 'Support case assignee must be an active membership';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'OPEN' AND NEW.status IN ('IN_PROGRESS','WAITING_FOR_CUSTOMER','RESOLVED','CLOSED'))
        OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('WAITING_FOR_CUSTOMER','RESOLVED','CLOSED'))
        OR (OLD.status = 'WAITING_FOR_CUSTOMER' AND NEW.status IN ('IN_PROGRESS','RESOLVED','CLOSED'))
        OR (OLD.status = 'RESOLVED' AND NEW.status IN ('CLOSED','OPEN'))
        OR (OLD.status = 'CLOSED' AND NEW.status = 'OPEN')
    ) THEN
        RAISE EXCEPTION 'Invalid support case status transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status IN ('RESOLVED','CLOSED') AND NEW.resolved_at IS NULL THEN
        NEW.resolved_at := now();
    ELSIF NEW.status NOT IN ('RESOLVED','CLOSED') THEN
        NEW.resolved_at := NULL;
    END IF;
    IF NEW.status = 'CLOSED' AND NEW.closed_at IS NULL THEN
        NEW.closed_at := now();
    ELSIF NEW.status <> 'CLOSED' THEN
        NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_merchant_setting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.value_type = 'STRING' AND jsonb_typeof(NEW.value_json) <> 'string' THEN
        RAISE EXCEPTION 'STRING settings require a JSON string value';
    ELSIF NEW.value_type = 'NUMBER' AND jsonb_typeof(NEW.value_json) <> 'number' THEN
        RAISE EXCEPTION 'NUMBER settings require a JSON number value';
    ELSIF NEW.value_type = 'BOOLEAN' AND jsonb_typeof(NEW.value_json) <> 'boolean' THEN
        RAISE EXCEPTION 'BOOLEAN settings require a JSON boolean value';
    ELSIF NEW.value_type = 'SECRET_REF' AND NOT (
        jsonb_typeof(NEW.value_json) = 'object'
        AND jsonb_typeof(NEW.value_json -> 'secret_ref') = 'string'
        AND length(trim(NEW.value_json ->> 'secret_ref')) > 0
    ) THEN
        RAISE EXCEPTION 'SECRET_REF settings require a secret_ref object value';
    END IF;
    IF NEW.value_type <> 'SECRET_REF' AND jsonb_typeof(NEW.value_json) = 'object'
       AND NEW.value_json ?| ARRAY['secret','api_key','password','client_secret','access_token'] THEN
        RAISE EXCEPTION 'Settings must store secret references instead of raw credentials';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_storefront_banner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE store_active BOOLEAN;
BEGIN
    IF NEW.status = 'PUBLISHED' THEN
        IF NEW.publish_at IS NULL THEN
            NEW.publish_at := now();
        END IF;
        SELECT is_active INTO store_active FROM ecommerce_stores
         WHERE merchant_id = NEW.merchant_id AND id = NEW.store_id;
        IF NOT COALESCE(store_active, FALSE) THEN
            RAISE EXCEPTION 'A banner can only be published on an active store';
        END IF;
    END IF;
    IF NEW.unpublish_at IS NOT NULL AND NEW.publish_at IS NULL THEN
        RAISE EXCEPTION 'Banner unpublish time requires a publish time';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_merchant_testimonial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF length(trim(NEW.content)) = 0 THEN
        RAISE EXCEPTION 'Testimonial content cannot be blank';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('PENDING_REVIEW','ARCHIVED'))
        OR (OLD.status = 'PENDING_REVIEW' AND NEW.status IN ('APPROVED','REJECTED','DRAFT'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('ARCHIVED','REJECTED'))
        OR (OLD.status = 'REJECTED' AND NEW.status IN ('DRAFT','PENDING_REVIEW'))
        OR (OLD.status = 'ARCHIVED' AND NEW.status = 'DRAFT')
    ) THEN
        RAISE EXCEPTION 'Invalid testimonial status transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'APPROVED' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit_extension_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_data JSONB; after_data JSONB; entity_id UUID; merchant_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        before_data := NULL;
        after_data := to_jsonb(NEW);
        entity_id := NEW.id;
        merchant_id := NEW.merchant_id;
    ELSE
        before_data := to_jsonb(OLD);
        after_data := to_jsonb(NEW);
        entity_id := NEW.id;
        merchant_id := NEW.merchant_id;
    END IF;
    IF TG_TABLE_NAME = 'merchant_settings' THEN
        IF TG_OP = 'INSERT' THEN
            after_data := jsonb_build_object('module_code', NEW.module_code, 'setting_key', NEW.setting_key, 'value_type', NEW.value_type);
        ELSE
            before_data := jsonb_build_object('module_code', OLD.module_code, 'setting_key', OLD.setting_key, 'value_type', OLD.value_type);
            after_data := jsonb_build_object('module_code', NEW.module_code, 'setting_key', NEW.setting_key, 'value_type', NEW.value_type);
        END IF;
    END IF;
    INSERT INTO audit_events(merchant_id, action, entity_type, entity_id, before_data, after_data)
    VALUES (merchant_id, TG_OP, TG_TABLE_NAME, entity_id, before_data, after_data);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_variant_inventory_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.track_expiry AND NOT NEW.track_batches THEN
        RAISE EXCEPTION 'Expiry tracking requires batch tracking for variant %', NEW.variant_id;
    END IF;
    IF NEW.allow_pack_breaking AND NOT NEW.allow_unit_conversions THEN
        RAISE EXCEPTION 'Pack breaking requires unit conversions for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.allow_unit_conversions AND EXISTS (
        SELECT 1 FROM product_variant_units pvu
         WHERE pvu.merchant_id = NEW.merchant_id
           AND pvu.variant_id = NEW.variant_id
           AND pvu.unit_role <> 'BASE'
    ) THEN
        RAISE EXCEPTION 'Cannot disable unit conversions while alternate units exist for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.track_batches AND EXISTS (
        SELECT 1 FROM inventory_batches b
         WHERE b.merchant_id = NEW.merchant_id AND b.variant_id = NEW.variant_id
    ) THEN
        RAISE EXCEPTION 'Cannot disable batch tracking while batches exist for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.track_unique_assets AND EXISTS (
        SELECT 1 FROM inventory_assets a
         WHERE a.merchant_id = NEW.merchant_id AND a.variant_id = NEW.variant_id
    ) THEN
        RAISE EXCEPTION 'Cannot disable asset tracking while assets exist for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.track_serials AND NOT NEW.track_unique_assets AND EXISTS (
        SELECT 1 FROM inventory_serials s
         WHERE s.merchant_id = NEW.merchant_id AND s.variant_id = NEW.variant_id
    ) THEN
        RAISE EXCEPTION 'Cannot disable serial tracking while serials exist for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.track_reservations AND EXISTS (
        SELECT 1 FROM inventory_reservations r
         WHERE r.merchant_id = NEW.merchant_id
           AND r.variant_id = NEW.variant_id
           AND r.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Cannot disable reservations while active reservations exist for variant %', NEW.variant_id;
    END IF;
    IF NOT NEW.allow_multiple_barcodes AND (
        SELECT count(*) FROM barcode_registry b
         WHERE b.merchant_id = NEW.merchant_id
           AND b.variant_id = NEW.variant_id
           AND b.is_active
    ) > 1 THEN
        RAISE EXCEPTION 'Cannot disable multiple barcodes while multiple active barcodes exist for variant %', NEW.variant_id;
    END IF;
    RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION validate_order_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('PENDING_PAYMENT','CANCELLED'))
        OR (OLD.status = 'PENDING_PAYMENT' AND NEW.status IN ('CONFIRMED','CANCELLED'))
        OR (OLD.status = 'CONFIRMED' AND NEW.status IN ('PROCESSING','CANCELLED'))
        OR (OLD.status = 'PROCESSING' AND NEW.status IN ('PARTIALLY_FULFILLED','FULFILLED','CANCELLED'))
        OR (OLD.status = 'PARTIALLY_FULFILLED' AND NEW.status IN ('FULFILLED','CANCELLED'))
        OR (OLD.status IN ('FULFILLED','CANCELLED') AND NEW.status = 'REFUNDED')) THEN
        RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assert_order_totals(p_merchant_id UUID, p_order_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE header RECORD; line_subtotal NUMERIC(15,2); line_discount NUMERIC(15,2); line_tax NUMERIC(15,2);
BEGIN
    SELECT subtotal, discount_total, tax_total, shipping_total, grand_total
      INTO header
      FROM orders
     WHERE merchant_id = p_merchant_id AND id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT COALESCE(sum(round(quantity * unit_price, 2)), 0)::NUMERIC(15,2),
           COALESCE(sum(discount_amount), 0)::NUMERIC(15,2),
           COALESCE(sum(tax_amount), 0)::NUMERIC(15,2)
      INTO line_subtotal, line_discount, line_tax
      FROM order_lines
     WHERE merchant_id = p_merchant_id AND order_id = p_order_id;
    IF header.subtotal IS DISTINCT FROM line_subtotal
       OR header.discount_total IS DISTINCT FROM line_discount
       OR header.tax_total IS DISTINCT FROM line_tax
       OR header.grand_total IS DISTINCT FROM line_subtotal - line_discount + line_tax + header.shipping_total THEN
        RAISE EXCEPTION 'Order totals must match the order lines';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_order_totals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'orders' AND TG_OP <> 'DELETE' THEN
        PERFORM assert_order_totals(NEW.merchant_id, NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'orders' THEN
            PERFORM assert_order_totals(OLD.merchant_id, OLD.id);
        ELSE
            PERFORM assert_order_totals(OLD.merchant_id, OLD.order_id);
        END IF;
    ELSE
        PERFORM assert_order_totals(NEW.merchant_id, NEW.order_id);
        IF TG_OP = 'UPDATE' AND (OLD.merchant_id IS DISTINCT FROM NEW.merchant_id OR OLD.order_id IS DISTINCT FROM NEW.order_id) THEN
            PERFORM assert_order_totals(OLD.merchant_id, OLD.order_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION assert_purchase_order_totals(p_merchant_id UUID, p_purchase_order_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE header_total NUMERIC(15,2); line_total NUMERIC(15,2);
BEGIN
    SELECT total_amount INTO header_total
      FROM purchase_orders
     WHERE merchant_id = p_merchant_id AND id = p_purchase_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT COALESCE(sum(round(quantity_ordered * unit_cost, 2)), 0)::NUMERIC(15,2)
      INTO line_total
      FROM purchase_order_lines
     WHERE merchant_id = p_merchant_id AND purchase_order_id = p_purchase_order_id;
    IF header_total IS DISTINCT FROM line_total THEN
        RAISE EXCEPTION 'Purchase order total must match its purchase order lines';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_purchase_order_totals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'purchase_orders' AND TG_OP <> 'DELETE' THEN
        PERFORM assert_purchase_order_totals(NEW.merchant_id, NEW.id);
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'purchase_orders' THEN
            PERFORM assert_purchase_order_totals(OLD.merchant_id, OLD.id);
        ELSE
            PERFORM assert_purchase_order_totals(OLD.merchant_id, OLD.purchase_order_id);
        END IF;
    ELSE
        PERFORM assert_purchase_order_totals(NEW.merchant_id, NEW.purchase_order_id);
        IF TG_OP = 'UPDATE' AND (OLD.merchant_id IS DISTINCT FROM NEW.merchant_id OR OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id) THEN
            PERFORM assert_purchase_order_totals(OLD.merchant_id, OLD.purchase_order_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION validate_receipt_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ordered NUMERIC(20,6); received NUMERIC(20,6); receipt_po UUID; line_po UUID; po_status VARCHAR(20);
BEGIN
    SELECT gr.purchase_order_id, pol.purchase_order_id, pol.quantity_ordered, pol.quantity_received, po.status
      INTO receipt_po, line_po, ordered, received, po_status
      FROM goods_receipts gr
      JOIN purchase_order_lines pol
        ON pol.merchant_id = gr.merchant_id AND pol.purchase_order_id = gr.purchase_order_id
      JOIN purchase_orders po
        ON po.merchant_id = pol.merchant_id AND po.id = pol.purchase_order_id
     WHERE gr.merchant_id = NEW.merchant_id
       AND gr.id = NEW.receipt_id
       AND pol.id = NEW.purchase_order_line_id
     FOR UPDATE OF gr, pol, po;
    IF NOT FOUND OR receipt_po IS DISTINCT FROM line_po OR po_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Receipt line must belong to the receipt purchase order and it cannot receive a cancelled order';
    END IF;
    IF received + NEW.quantity_received > ordered THEN
        RAISE EXCEPTION 'Receipt quantity exceeds the purchase order line';
    END IF;
    UPDATE purchase_order_lines SET quantity_received = quantity_received + NEW.quantity_received
    WHERE merchant_id = NEW.merchant_id AND id = NEW.purchase_order_line_id;
    UPDATE purchase_orders po
       SET status = CASE
           WHEN NOT EXISTS (
               SELECT 1 FROM purchase_order_lines pol
                WHERE pol.merchant_id = po.merchant_id
                  AND pol.purchase_order_id = po.id
                  AND pol.quantity_received < pol.quantity_ordered
           ) THEN 'RECEIVED'
           ELSE 'PARTIALLY_RECEIVED'
       END,
           updated_at = now()
     WHERE po.merchant_id = NEW.merchant_id AND po.id = receipt_po AND po.status <> 'CANCELLED';
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_inventory_balance(p_merchant UUID, p_location UUID, p_variant UUID, p_delta NUMERIC)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE balance_id UUID;
BEGIN
    INSERT INTO inventory_balances(merchant_id, location_id, variant_id, quantity_on_hand)
    VALUES (p_merchant, p_location, p_variant, 0)
    ON CONFLICT (merchant_id, location_id, variant_id) DO NOTHING;
    SELECT id INTO balance_id FROM inventory_balances
    WHERE merchant_id = p_merchant AND location_id = p_location AND variant_id = p_variant FOR UPDATE;
    IF (SELECT quantity_on_hand + p_delta FROM inventory_balances WHERE id = balance_id) < 0 THEN
        RAISE EXCEPTION 'Inventory cannot become negative';
    END IF;
    UPDATE inventory_balances SET quantity_on_hand = quantity_on_hand + p_delta, updated_at = now()
    WHERE id = balance_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE layer RECORD; remaining NUMERIC(20,6); allocated NUMERIC(20,6) := 0; batch_id UUID;
BEGIN
    -- Transfers lock both balances in deterministic UUID order to avoid
    -- opposite-transfer deadlocks.
    IF NEW.source_location_id IS NOT NULL AND NEW.destination_location_id IS NOT NULL THEN
        IF NEW.source_location_id::text < NEW.destination_location_id::text THEN
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.source_location_id, NEW.variant_id, -NEW.quantity);
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.destination_location_id, NEW.variant_id, NEW.quantity);
        ELSE
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.destination_location_id, NEW.variant_id, NEW.quantity);
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.source_location_id, NEW.variant_id, -NEW.quantity);
        END IF;
    ELSE
        IF NEW.source_location_id IS NOT NULL THEN
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.source_location_id, NEW.variant_id, -NEW.quantity);
        END IF;
        IF NEW.destination_location_id IS NOT NULL THEN
            PERFORM ensure_inventory_balance(NEW.merchant_id, NEW.destination_location_id, NEW.variant_id, NEW.quantity);
        END IF;
    END IF;

    IF NEW.movement_type = 'RECEIPT' THEN
        IF EXISTS (
            SELECT 1 FROM goods_receipt_lines
             WHERE merchant_id = NEW.merchant_id AND id = NEW.receipt_line_id AND batch_number IS NOT NULL
        ) THEN
            INSERT INTO inventory_batches(
                merchant_id, variant_id, location_id, batch_number, received_at, expires_at,
                quantity_received, quantity_remaining
            )
            SELECT NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, grl.batch_number,
                   now(), grl.expires_at, NEW.quantity, NEW.quantity
              FROM goods_receipt_lines grl
             WHERE grl.merchant_id = NEW.merchant_id AND grl.id = NEW.receipt_line_id
            ON CONFLICT (merchant_id, variant_id, location_id, batch_number)
            DO UPDATE SET quantity_received = inventory_batches.quantity_received + EXCLUDED.quantity_received,
                          quantity_remaining = inventory_batches.quantity_remaining + EXCLUDED.quantity_remaining;
            SELECT b.id INTO batch_id
              FROM inventory_batches b
              JOIN goods_receipt_lines grl
                ON grl.merchant_id = b.merchant_id AND grl.batch_number = b.batch_number
             WHERE b.merchant_id = NEW.merchant_id
               AND b.variant_id = NEW.variant_id
               AND b.location_id = NEW.destination_location_id
               AND grl.merchant_id = NEW.merchant_id
               AND grl.id = NEW.receipt_line_id;
            IF batch_id IS NOT NULL THEN
                INSERT INTO inventory_movement_batches(merchant_id, movement_id, batch_id, quantity)
                VALUES (NEW.merchant_id, NEW.id, batch_id, NEW.quantity)
                ON CONFLICT (merchant_id, movement_id, batch_id) DO NOTHING;
            END IF;
        END IF;
        INSERT INTO inventory_cost_layers(merchant_id, variant_id, location_id, receipt_movement_id, receipt_line_id,
            quantity_received, quantity_remaining, unit_cost)
        VALUES (NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, NEW.id, NEW.receipt_line_id, NEW.quantity, NEW.quantity, NEW.unit_cost);
    ELSIF NEW.movement_type = 'REVERSAL'
          AND NEW.source_location_id IS NULL
          AND NEW.destination_location_id IS NOT NULL THEN
        INSERT INTO inventory_cost_layers(merchant_id, variant_id, location_id, receipt_movement_id, receipt_line_id,
            quantity_received, quantity_remaining, unit_cost, restored_from_allocation_id)
        SELECT NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, NEW.id, NULL, a.quantity, a.quantity,
               a.unit_cost, a.id
        FROM inventory_cost_allocations a
        WHERE a.merchant_id = NEW.merchant_id AND a.consumption_movement_id = NEW.reverses_movement_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Reversal must restore an existing consumed cost allocation'; END IF;
    ELSIF NEW.movement_type = 'REVERSAL'
          AND NEW.source_location_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM inventory_movements original_return
               WHERE original_return.merchant_id = NEW.merchant_id
                 AND original_return.id = NEW.reverses_movement_id
                 AND original_return.movement_type = 'RETURN'
          ) THEN
        FOR layer IN SELECT id, quantity_remaining, unit_cost FROM inventory_cost_layers
            WHERE merchant_id = NEW.merchant_id
              AND variant_id = NEW.variant_id
              AND location_id = NEW.source_location_id
              AND receipt_movement_id = NEW.reverses_movement_id
              AND quantity_remaining > 0
            ORDER BY created_at, id FOR UPDATE LOOP
            EXIT WHEN allocated >= NEW.quantity;
            remaining := LEAST(layer.quantity_remaining, NEW.quantity - allocated);
            INSERT INTO inventory_cost_allocations(merchant_id, consumption_movement_id, cost_layer_id, quantity, unit_cost)
            VALUES (NEW.merchant_id, NEW.id, layer.id, remaining, layer.unit_cost);
            UPDATE inventory_cost_layers SET quantity_remaining = quantity_remaining - remaining WHERE id = layer.id;
            allocated := allocated + remaining;
        END LOOP;
        IF allocated < NEW.quantity THEN RAISE EXCEPTION 'Reversal cannot remove already-consumed returned cost layers'; END IF;
    ELSIF NEW.movement_type IN ('TRANSFER','SALE')
          OR (NEW.movement_type = 'REVERSAL' AND NEW.source_location_id IS NOT NULL) THEN
        FOR layer IN SELECT id, quantity_remaining, unit_cost FROM inventory_cost_layers
            WHERE merchant_id = NEW.merchant_id AND variant_id = NEW.variant_id
              AND location_id = NEW.source_location_id AND quantity_remaining > 0
            ORDER BY created_at, id FOR UPDATE LOOP
            EXIT WHEN allocated >= NEW.quantity;
            remaining := LEAST(layer.quantity_remaining, NEW.quantity - allocated);
            INSERT INTO inventory_cost_allocations(merchant_id, consumption_movement_id, cost_layer_id, quantity, unit_cost)
            VALUES (NEW.merchant_id, NEW.id, layer.id, remaining, layer.unit_cost);
            UPDATE inventory_cost_layers SET quantity_remaining = quantity_remaining - remaining WHERE id = layer.id;
            IF NEW.movement_type IN ('TRANSFER','REVERSAL') AND NEW.destination_location_id IS NOT NULL THEN
                INSERT INTO inventory_cost_layers(merchant_id, variant_id, location_id, receipt_movement_id,
                    quantity_received, quantity_remaining, unit_cost, transferred_from_layer_id)
                VALUES (NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, NEW.id,
                    remaining, remaining, layer.unit_cost, layer.id);
            END IF;
            allocated := allocated + remaining;
        END LOOP;
        IF allocated < NEW.quantity THEN RAISE EXCEPTION 'Insufficient FIFO cost layers for sale'; END IF;
    ELSIF NEW.movement_type = 'RETURN' THEN
        IF (SELECT quantity FROM inventory_movements WHERE merchant_id = NEW.merchant_id AND id = NEW.reverses_movement_id) <> NEW.quantity THEN
            RAISE EXCEPTION 'A return must reverse the complete original consumption movement';
        END IF;
        INSERT INTO inventory_cost_layers(merchant_id, variant_id, location_id, receipt_movement_id, receipt_line_id,
            quantity_received, quantity_remaining, unit_cost, restored_from_allocation_id)
        SELECT NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, NEW.id, NEW.receipt_line_id, a.quantity, a.quantity,
               a.unit_cost, a.id
        FROM inventory_cost_allocations a
        WHERE a.merchant_id = NEW.merchant_id AND a.consumption_movement_id = NEW.reverses_movement_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Return must reference an existing consumed cost allocation'; END IF;
    ELSIF NEW.movement_type = 'ADJUSTMENT' AND NEW.destination_location_id IS NOT NULL THEN
        INSERT INTO inventory_cost_layers(merchant_id, variant_id, location_id, receipt_movement_id,
            quantity_received, quantity_remaining, unit_cost)
        VALUES (NEW.merchant_id, NEW.variant_id, NEW.destination_location_id, NEW.id,
            NEW.quantity, NEW.quantity, COALESCE(NEW.unit_cost, 0));
    ELSIF NEW.movement_type = 'ADJUSTMENT' AND NEW.source_location_id IS NOT NULL THEN
        FOR layer IN SELECT id, quantity_remaining, unit_cost FROM inventory_cost_layers
            WHERE merchant_id = NEW.merchant_id AND variant_id = NEW.variant_id
              AND location_id = NEW.source_location_id AND quantity_remaining > 0
            ORDER BY created_at, id FOR UPDATE LOOP
            EXIT WHEN allocated >= NEW.quantity;
            remaining := LEAST(layer.quantity_remaining, NEW.quantity - allocated);
            INSERT INTO inventory_cost_allocations(merchant_id, consumption_movement_id, cost_layer_id, quantity, unit_cost)
            VALUES (NEW.merchant_id, NEW.id, layer.id, remaining, layer.unit_cost);
            UPDATE inventory_cost_layers SET quantity_remaining = quantity_remaining - remaining WHERE id = layer.id;
            allocated := allocated + remaining;
        END LOOP;
        IF allocated < NEW.quantity THEN RAISE EXCEPTION 'Insufficient FIFO cost layers for inventory adjustment'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION post_inventory_transformation(
    p_merchant_id UUID,
    p_transformation_id UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE transformation RECORD; line RECORD;
BEGIN
    SELECT * INTO transformation
      FROM inventory_transformations
     WHERE merchant_id = p_merchant_id AND id = p_transformation_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory transformation was not found';
    END IF;
    IF transformation.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Only draft inventory transformations can be posted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM inventory_transformation_lines WHERE merchant_id = p_merchant_id AND transformation_id = p_transformation_id) THEN
        RAISE EXCEPTION 'Inventory transformation requires at least one line';
    END IF;

    FOR line IN
        SELECT * FROM inventory_transformation_lines
         WHERE merchant_id = p_merchant_id AND transformation_id = p_transformation_id
         ORDER BY id
    LOOP
        INSERT INTO inventory_movements(
            merchant_id, variant_id, movement_type, source_location_id, destination_location_id,
            quantity, unit_id, unit_cost, event_key, occurred_at
        ) VALUES (
            p_merchant_id,
            line.variant_id,
            'ADJUSTMENT',
            CASE WHEN line.direction = 'OUT' THEN transformation.location_id END,
            CASE WHEN line.direction = 'IN' THEN transformation.location_id END,
            line.quantity,
            line.unit_id,
            line.unit_cost,
            'inventory-transformation:' || p_transformation_id::text || ':' || line.id::text,
            now()
        );
    END LOOP;

    UPDATE inventory_transformations
       SET status = 'APPLIED', applied_at = now()
     WHERE merchant_id = p_merchant_id AND id = p_transformation_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_inventory_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC(20,6);
BEGIN
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

CREATE OR REPLACE FUNCTION guard_inventory_balance_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() <= 1 AND
       (NEW.quantity_on_hand IS DISTINCT FROM OLD.quantity_on_hand OR
        NEW.quantity_reserved IS DISTINCT FROM OLD.quantity_reserved) THEN
        RAISE EXCEPTION 'Inventory balances are derived from movements and reservations';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE deb NUMERIC(15,2); cred NUMERIC(15,2); st VARCHAR(20); m UUID; e UUID;
BEGIN
    IF TG_TABLE_NAME = 'journal_entries' THEN
        m := NEW.merchant_id;
        e := NEW.id;
        st := NEW.status;
    ELSIF TG_OP = 'DELETE' THEN
        m := OLD.merchant_id;
        e := OLD.journal_entry_id;
        SELECT status INTO st FROM journal_entries WHERE merchant_id = m AND id = e;
    ELSE
        m := NEW.merchant_id;
        e := NEW.journal_entry_id;
        SELECT status INTO st FROM journal_entries WHERE merchant_id = m AND id = e;
    END IF;
    IF st = 'POSTED' THEN
        SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0) INTO deb, cred
        FROM journal_lines WHERE merchant_id = m AND journal_entry_id = e;
        IF deb = 0 OR deb <> cred THEN RAISE EXCEPTION 'Posted journal entry must balance'; END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION validate_fulfillment_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fulfillment_order UUID; line_order UUID; ordered NUMERIC(20,6); already_fulfilled NUMERIC(20,6);
BEGIN
    SELECT order_id INTO fulfillment_order
      FROM fulfillments
     WHERE merchant_id = NEW.merchant_id AND id = NEW.fulfillment_id;
    SELECT order_id, quantity INTO line_order, ordered
      FROM order_lines
     WHERE merchant_id = NEW.merchant_id AND id = NEW.order_line_id;
    IF fulfillment_order IS NULL OR line_order IS NULL OR fulfillment_order <> line_order THEN
        RAISE EXCEPTION 'Fulfillment line must belong to the fulfillment order';
    END IF;
    SELECT COALESCE(sum(quantity), 0) INTO already_fulfilled
     FROM fulfillment_lines
     WHERE merchant_id = NEW.merchant_id
       AND order_line_id = NEW.order_line_id
       AND NOT (TG_OP = 'UPDATE' AND fulfillment_id = OLD.fulfillment_id AND order_line_id = OLD.order_line_id);
    IF already_fulfilled + NEW.quantity > ordered THEN
        RAISE EXCEPTION 'Fulfillment quantity cannot exceed order line quantity';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_order_line_fulfilled_quantity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_order_line UUID; affected_merchant UUID;
BEGIN
    affected_order_line := COALESCE(NEW.order_line_id, OLD.order_line_id);
    affected_merchant := COALESCE(NEW.merchant_id, OLD.merchant_id);
    UPDATE order_lines
       SET quantity_fulfilled = COALESCE((
           SELECT sum(quantity) FROM fulfillment_lines
            WHERE merchant_id = affected_merchant AND order_line_id = affected_order_line
       ), 0)
     WHERE merchant_id = affected_merchant AND id = affected_order_line;
    IF TG_OP = 'UPDATE' AND (OLD.order_line_id IS DISTINCT FROM NEW.order_line_id OR OLD.merchant_id IS DISTINCT FROM NEW.merchant_id) THEN
        UPDATE order_lines
           SET quantity_fulfilled = COALESCE((
               SELECT sum(quantity) FROM fulfillment_lines
                WHERE merchant_id = OLD.merchant_id AND order_line_id = OLD.order_line_id
           ), 0)
         WHERE merchant_id = OLD.merchant_id AND id = OLD.order_line_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ecommerce_order_item_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fulfillment_order UUID; fulfillment_location UUID; line_order UUID; ordered NUMERIC(20,6); allocated NUMERIC(20,6);
BEGIN
    SELECT order_id, location_id INTO fulfillment_order, fulfillment_location
      FROM fulfillments
     WHERE merchant_id = NEW.merchant_id AND id = NEW.fulfillment_id;
    SELECT order_id, quantity INTO line_order, ordered
      FROM order_lines
     WHERE merchant_id = NEW.merchant_id AND id = NEW.order_line_id;
    IF fulfillment_order IS NULL OR line_order IS NULL OR fulfillment_order <> line_order THEN
        RAISE EXCEPTION 'Order allocation must match its fulfillment order';
    END IF;
    IF fulfillment_location <> NEW.location_id THEN
        RAISE EXCEPTION 'Order allocation location must match the fulfillment location';
    END IF;
    SELECT COALESCE(sum(quantity), 0) INTO allocated
     FROM ecommerce_order_item_allocations
     WHERE merchant_id = NEW.merchant_id AND order_line_id = NEW.order_line_id
       AND NOT (TG_OP = 'UPDATE' AND fulfillment_id = OLD.fulfillment_id AND location_id = OLD.location_id);
    IF allocated + NEW.quantity > ordered THEN
        RAISE EXCEPTION 'Allocated quantity cannot exceed order line quantity';
    END IF;
    RETURN NEW;
END;
$$;

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
        IF captured_total + NEW.amount > order_total THEN
            RAISE EXCEPTION 'Captured payments cannot exceed the order total';
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

CREATE OR REPLACE FUNCTION prevent_payment_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Payments are append-only; use a void or failure status';
END;
$$;

CREATE OR REPLACE FUNCTION validate_refund_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment_order UUID; payment_amount NUMERIC(15,2); refunded_total NUMERIC(15,2); payment_status VARCHAR(25);
BEGIN
    SELECT order_id, amount, status INTO payment_order, payment_amount, payment_status
      FROM payments
     WHERE merchant_id = NEW.merchant_id AND id = NEW.payment_id
     FOR UPDATE;
    IF payment_order IS NULL OR payment_order <> NEW.order_id THEN
        RAISE EXCEPTION 'Refund payment and order must belong to the same order';
    END IF;
    IF NEW.status NOT IN ('FAILED','CANCELLED')
       AND payment_status NOT IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') THEN
        RAISE EXCEPTION 'Refunds require a captured payment';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO refunded_total
      FROM refunds
     WHERE merchant_id = NEW.merchant_id AND payment_id = NEW.payment_id
       AND status NOT IN ('FAILED','CANCELLED') AND id <> NEW.id;
    IF refunded_total + NEW.amount > payment_amount THEN
        RAISE EXCEPTION 'Refunds cannot exceed the payment amount';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_refund_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id
       OR OLD.payment_id IS DISTINCT FROM NEW.payment_id
       OR OLD.order_id IS DISTINCT FROM NEW.order_id
       OR OLD.return_id IS DISTINCT FROM NEW.return_id
       OR OLD.amount IS DISTINCT FROM NEW.amount THEN
        RAISE EXCEPTION 'Refund identity and amount are immutable';
    END IF;
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    IF NOT (OLD.status = 'PENDING' AND NEW.status IN ('SUCCEEDED','FAILED','CANCELLED')) THEN
        RAISE EXCEPTION 'Invalid refund status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_refund_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Refunds are append-only; update the refund status instead';
END;
$$;

CREATE OR REPLACE FUNCTION refresh_payment_refund_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment_amount NUMERIC(15,2); succeeded_total NUMERIC(15,2); current_status VARCHAR(25);
BEGIN
    SELECT amount, status INTO payment_amount, current_status
      FROM payments
     WHERE merchant_id = NEW.merchant_id
       AND id = NEW.payment_id
     FOR UPDATE;
    SELECT COALESCE(sum(amount), 0) INTO succeeded_total
      FROM refunds
     WHERE merchant_id = NEW.merchant_id
       AND payment_id = NEW.payment_id
       AND status = 'SUCCEEDED';
    IF succeeded_total >= payment_amount THEN
        UPDATE payments SET status = 'REFUNDED', captured_at = COALESCE(captured_at, now())
         WHERE merchant_id = NEW.merchant_id
           AND id = NEW.payment_id
           AND status <> 'REFUNDED';
    ELSIF succeeded_total > 0 THEN
        UPDATE payments SET status = 'PARTIALLY_REFUNDED', captured_at = COALESCE(captured_at, now())
         WHERE merchant_id = NEW.merchant_id
           AND id = NEW.payment_id
           AND status = 'CAPTURED';
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_status VARCHAR(20);
BEGIN
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

CREATE OR REPLACE FUNCTION validate_membership_shop_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM user_memberships
        WHERE merchant_id = NEW.merchant_id AND id = NEW.membership_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Shop assignment requires an active membership in the same merchant';
    END IF;

    IF NEW.assigned_by_membership_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM membership_roles mr
        JOIN roles r ON r.merchant_id = mr.merchant_id AND r.id = mr.role_id
        WHERE mr.merchant_id = NEW.merchant_id
          AND mr.membership_id = NEW.assigned_by_membership_id
          AND (mr.valid_until IS NULL OR mr.valid_until >= now())
          AND r.code IN ('admin', 'merchant')
    ) THEN
        RAISE EXCEPTION 'Only an administrator or merchant can grant shop assignments';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_catalog_attribute_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE variant_product UUID;
BEGIN
    IF NEW.variant_id IS NOT NULL THEN
        SELECT product_id INTO variant_product
        FROM product_variants
        WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
        IF variant_product IS DISTINCT FROM NEW.product_id THEN
            RAISE EXCEPTION 'Catalog attribute variant must belong to the supplied product';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_product_brand() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM catalog_brands
         WHERE merchant_id = NEW.merchant_id AND id = NEW.brand_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Product brand must be active and belong to the same merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_inventory_identity_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE movement_variant UUID; referenced_variant UUID; serial_variant UUID; batch_variant UUID;
BEGIN
    IF TG_TABLE_NAME = 'inventory_serials' AND NEW.batch_id IS NOT NULL THEN
        SELECT variant_id INTO batch_variant FROM inventory_batches
        WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id;
        IF batch_variant IS DISTINCT FROM NEW.variant_id THEN
            RAISE EXCEPTION 'Inventory serial batch and variant must match';
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_assets' AND NEW.serial_id IS NOT NULL THEN
        SELECT variant_id INTO serial_variant FROM inventory_serials
        WHERE merchant_id = NEW.merchant_id AND id = NEW.serial_id;
        IF serial_variant IS DISTINCT FROM NEW.variant_id THEN
            RAISE EXCEPTION 'Inventory asset serial and variant must match';
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_movement_batches' THEN
        SELECT variant_id INTO movement_variant FROM inventory_movements
        WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
        SELECT variant_id INTO referenced_variant FROM inventory_batches
        WHERE merchant_id = NEW.merchant_id AND id = NEW.batch_id;
        IF movement_variant IS DISTINCT FROM referenced_variant THEN
            RAISE EXCEPTION 'Inventory movement batch and movement variant must match';
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_movement_serials' THEN
        SELECT variant_id INTO movement_variant FROM inventory_movements
        WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
        SELECT variant_id INTO referenced_variant FROM inventory_serials
        WHERE merchant_id = NEW.merchant_id AND id = NEW.serial_id;
        IF movement_variant IS DISTINCT FROM referenced_variant THEN
            RAISE EXCEPTION 'Inventory movement serial and movement variant must match';
        END IF;
    ELSIF TG_TABLE_NAME = 'inventory_movement_assets' THEN
        SELECT variant_id INTO movement_variant FROM inventory_movements
        WHERE merchant_id = NEW.merchant_id AND id = NEW.movement_id;
        SELECT variant_id INTO referenced_variant FROM inventory_assets
        WHERE merchant_id = NEW.merchant_id AND id = NEW.asset_id;
        IF movement_variant IS DISTINCT FROM referenced_variant THEN
            RAISE EXCEPTION 'Inventory movement asset and movement variant must match';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_inventory_identifier() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE validation_pattern TEXT;
BEGIN
    NEW.normalized_value := lower(trim(NEW.value));
    IF NEW.normalized_value = '' THEN
        RAISE EXCEPTION 'Inventory identifiers cannot be blank';
    END IF;
    SELECT validation_regex INTO validation_pattern
      FROM inventory_identifier_types
     WHERE merchant_id = NEW.merchant_id AND id = NEW.identifier_type_id AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Identifier type must be active and belong to the same merchant';
    END IF;
    IF validation_pattern IS NOT NULL AND NEW.value !~ validation_pattern THEN
        RAISE EXCEPTION 'Inventory identifier does not match its identifier type validation pattern';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_barcode_registry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE variant_product UUID;
BEGIN
    NEW.normalized_code := lower(trim(NEW.code));
    IF NEW.normalized_code = '' THEN
        RAISE EXCEPTION 'Barcode cannot be blank';
    END IF;
    IF NEW.variant_id IS NOT NULL THEN
        SELECT product_id INTO variant_product
          FROM product_variants
         WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
        IF NEW.product_id IS NOT NULL AND variant_product IS DISTINCT FROM NEW.product_id THEN
            RAISE EXCEPTION 'Barcode product and variant must match';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_promotion_product() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE variant_product UUID;
BEGIN
    IF NEW.variant_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT product_id INTO variant_product
      FROM product_variants
     WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id;
    IF variant_product IS DISTINCT FROM NEW.product_id THEN
        RAISE EXCEPTION 'Promotion variant must belong to the supplied product';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION promotion_applies_to_variant(
    p_merchant_id UUID,
    p_promotion_id UUID,
    p_variant_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE variant_product UUID; scoped_count INTEGER;
BEGIN
    SELECT product_id INTO variant_product
      FROM product_variants
     WHERE merchant_id = p_merchant_id AND id = p_variant_id;
    IF variant_product IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT count(*) INTO scoped_count
      FROM promotion_products
     WHERE merchant_id = p_merchant_id AND promotion_id = p_promotion_id;
    IF scoped_count = 0 THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM promotion_products
         WHERE merchant_id = p_merchant_id AND promotion_id = p_promotion_id
           AND product_id = variant_product AND (variant_id IS NULL OR variant_id = p_variant_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION validate_pos_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM user_memberships
        WHERE merchant_id = NEW.merchant_id AND id = NEW.membership_id AND is_active
    ) THEN
        RAISE EXCEPTION 'POS session requires an active membership';
    END IF;
    IF NEW.terminal_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pos_terminals
        WHERE merchant_id = NEW.merchant_id AND id = NEW.terminal_id AND shop_id = NEW.shop_id AND is_active
    ) THEN
        RAISE EXCEPTION 'POS terminal must be active and belong to the session shop';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ecommerce_cart_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ecommerce_carts
        WHERE merchant_id = NEW.merchant_id AND id = NEW.cart_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Cart items can only be changed on active carts';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM product_variants
        WHERE merchant_id = NEW.merchant_id AND id = NEW.variant_id
    ) THEN
        RAISE EXCEPTION 'Cart variant does not belong to the cart merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ecommerce_cart_store() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ecommerce_stores
         WHERE merchant_id = NEW.merchant_id AND id = NEW.store_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Cart store must be an active store of the same merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ecommerce_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cart_customer UUID; cart_store UUID; cart_status VARCHAR(20);
BEGIN
    SELECT customer_id, store_id, status INTO cart_customer, cart_store, cart_status
    FROM ecommerce_carts
    WHERE merchant_id = NEW.merchant_id AND id = NEW.cart_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Checkout session cart does not belong to the merchant';
    END IF;
    IF NEW.status IN ('INITIATED','PENDING_PAYMENT') AND cart_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Checkout can only start from an active cart';
    END IF;
    IF NEW.customer_id IS DISTINCT FROM cart_customer AND cart_customer IS NOT NULL THEN
        RAISE EXCEPTION 'Checkout customer does not match the cart customer';
    END IF;
    IF NEW.store_id IS DISTINCT FROM cart_store THEN
        RAISE EXCEPTION 'Checkout store does not match the cart store';
    END IF;
    IF NEW.store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ecommerce_stores
         WHERE merchant_id = NEW.merchant_id AND id = NEW.store_id AND is_active
    ) THEN
        RAISE EXCEPTION 'Checkout store must be an active store of the same merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_promotion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE promo RECORD; code RECORD; now_at TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO promo FROM promotions
    WHERE merchant_id = NEW.merchant_id AND id = NEW.promotion_id FOR UPDATE;
    IF NOT FOUND OR NOT promo.is_active
       OR (promo.starts_at IS NOT NULL AND promo.starts_at > now_at)
       OR (promo.ends_at IS NOT NULL AND promo.ends_at <= now_at)
       OR (promo.usage_limit IS NOT NULL AND promo.redemption_count >= promo.usage_limit) THEN
        RAISE EXCEPTION 'Promotion is not available for redemption';
    END IF;

    IF NEW.code_id IS NOT NULL THEN
        SELECT * INTO code FROM promotion_codes
        WHERE merchant_id = NEW.merchant_id AND id = NEW.code_id AND promotion_id = NEW.promotion_id
        FOR UPDATE;
        IF NOT FOUND OR NOT code.is_active
           OR (code.usage_limit IS NOT NULL AND code.redemption_count >= code.usage_limit) THEN
            RAISE EXCEPTION 'Promotion code is not available for redemption';
        END IF;
        UPDATE promotion_codes SET redemption_count = redemption_count + 1
        WHERE merchant_id = NEW.merchant_id AND id = NEW.code_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM promotion_products
         WHERE merchant_id = NEW.merchant_id AND promotion_id = NEW.promotion_id
    ) AND NOT EXISTS (
        SELECT 1
          FROM order_lines ol
         WHERE ol.merchant_id = NEW.merchant_id
           AND ol.order_id = NEW.order_id
           AND ol.variant_id IS NOT NULL
           AND promotion_applies_to_variant(NEW.merchant_id, NEW.promotion_id, ol.variant_id)
    ) THEN
        RAISE EXCEPTION 'Promotion is not applicable to any product on the order';
    END IF;

    UPDATE promotions SET redemption_count = redemption_count + 1, updated_at = now_at
    WHERE merchant_id = NEW.merchant_id AND id = NEW.promotion_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_promotion_counter_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() <= 1
       AND NEW.redemption_count IS DISTINCT FROM OLD.redemption_count THEN
        RAISE EXCEPTION 'Promotion redemption counters are maintained by promotion redemptions';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_promotion_redemption_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Promotion redemptions are append-only';
END;
$$;

CREATE OR REPLACE FUNCTION validate_return_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE return_order UUID; fulfilled NUMERIC(20,6); already_returned NUMERIC(20,6);
BEGIN
    SELECT order_id INTO return_order FROM ecommerce_returns
    WHERE merchant_id = NEW.merchant_id AND id = NEW.return_id;
    SELECT quantity_fulfilled INTO fulfilled FROM order_lines
    WHERE merchant_id = NEW.merchant_id AND id = NEW.order_line_id AND order_id = return_order;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return line must belong to the return order';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(sum(quantity), 0) INTO already_returned
        FROM ecommerce_return_lines
        WHERE merchant_id = NEW.merchant_id AND return_id = NEW.return_id AND order_line_id = NEW.order_line_id
          AND (return_id, order_line_id) <> (OLD.return_id, OLD.order_line_id);
    ELSE
        SELECT COALESCE(sum(quantity), 0) INTO already_returned
        FROM ecommerce_return_lines
        WHERE merchant_id = NEW.merchant_id AND return_id = NEW.return_id AND order_line_id = NEW.order_line_id;
    END IF;
    IF already_returned + NEW.quantity > fulfilled THEN
        RAISE EXCEPTION 'Returned quantity cannot exceed fulfilled quantity';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_return_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'REQUESTED' THEN
            RAISE EXCEPTION 'A new return must start in REQUESTED status';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NOT ((OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED'))
        OR (OLD.status = 'APPROVED' AND NEW.status IN ('RECEIVED','CANCELLED'))
        OR (OLD.status = 'RECEIVED' AND NEW.status = 'REFUNDED')) THEN
        RAISE EXCEPTION 'Invalid return status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_financial_allocation_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Financial allocations are append-only; create a compensating allocation instead';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_receipt_line_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Goods receipt lines are append-only; create a reversal receipt instead';
END;
$$;

CREATE OR REPLACE FUNCTION prevent_purchase_order_received_quantity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;
    IF NEW.quantity_received IS DISTINCT FROM OLD.quantity_received THEN
        RAISE EXCEPTION 'Purchase-order received quantity is derived from goods receipt lines';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_purchase_order_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_count BIGINT; received_count BIGINT; open_count BIGINT;
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status = 'DRAFT' AND NEW.status IN ('ISSUED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'))
        OR (OLD.status = 'ISSUED' AND NEW.status IN ('PARTIALLY_RECEIVED','RECEIVED','CANCELLED'))
        OR (OLD.status = 'PARTIALLY_RECEIVED' AND NEW.status IN ('RECEIVED','CANCELLED'))
    ) THEN
        RAISE EXCEPTION 'Invalid purchase-order status transition: % -> %', OLD.status, NEW.status;
    END IF;
    IF NEW.status IN ('PARTIALLY_RECEIVED','RECEIVED') THEN
        SELECT count(*),
               count(*) FILTER (WHERE quantity_received > 0),
               count(*) FILTER (WHERE quantity_received < quantity_ordered)
          INTO line_count, received_count, open_count
          FROM purchase_order_lines
         WHERE merchant_id = NEW.merchant_id AND purchase_order_id = NEW.id;
        IF line_count = 0 OR received_count = 0
           OR (NEW.status = 'RECEIVED' AND open_count <> 0)
           OR (NEW.status = 'PARTIALLY_RECEIVED' AND open_count = 0) THEN
            RAISE EXCEPTION 'Purchase-order status does not match received line quantities';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_return_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM refunds
         WHERE merchant_id = OLD.merchant_id AND return_id = OLD.id
    ) THEN
        RAISE EXCEPTION 'A return referenced by a refund cannot be deleted';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ar_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining NUMERIC(15,2); document_status VARCHAR(20); document_due_date DATE;
        payment_amount NUMERIC(15,2); allocated_total NUMERIC(15,2); payment_status VARCHAR(25);
BEGIN
    SELECT amount, status INTO payment_amount, payment_status
      FROM payments
     WHERE merchant_id = NEW.merchant_id AND id = NEW.payment_id
     FOR UPDATE;
    IF NOT FOUND OR payment_status NOT IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') THEN
        RAISE EXCEPTION 'Accounts receivable allocation requires a captured payment';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO allocated_total
      FROM accounts_receivable_allocations
     WHERE merchant_id = NEW.merchant_id
       AND payment_id = NEW.payment_id
       AND id <> NEW.id;
    IF allocated_total + NEW.amount > payment_amount THEN
        RAISE EXCEPTION 'Accounts receivable allocations exceed the payment amount';
    END IF;
    SELECT balance_amount, status, due_date
      INTO remaining, document_status, document_due_date
      FROM accounts_receivable_documents
     WHERE merchant_id = NEW.merchant_id AND id = NEW.document_id
     FOR UPDATE;
    IF NOT FOUND OR document_status NOT IN ('OPEN','PARTIALLY_PAID','OVERDUE') THEN
        RAISE EXCEPTION 'Accounts receivable document is not allocatable';
    END IF;
    IF NEW.amount > remaining THEN
        RAISE EXCEPTION 'Accounts receivable allocation exceeds document balance';
    END IF;
    UPDATE accounts_receivable_documents
       SET balance_amount = balance_amount - NEW.amount,
           status = CASE
               WHEN balance_amount - NEW.amount = 0 THEN 'PAID'
               WHEN document_due_date IS NOT NULL AND document_due_date < CURRENT_DATE THEN 'OVERDUE'
               ELSE 'PARTIALLY_PAID'
           END
     WHERE merchant_id = NEW.merchant_id AND id = NEW.document_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_business_unit_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.organization_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM organization_merchants om
         WHERE om.organization_id = NEW.organization_id
           AND om.merchant_id = NEW.merchant_id
    ) THEN
        RAISE EXCEPTION 'Business unit organization must be linked to the same merchant';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ap_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining NUMERIC(15,2); invoice_status VARCHAR(20); invoice_due_date DATE;
        payment_amount NUMERIC(15,2); allocated_total NUMERIC(15,2); payment_status VARCHAR(20);
BEGIN
    SELECT amount, status INTO payment_amount, payment_status
      FROM supplier_payments
     WHERE merchant_id = NEW.merchant_id AND id = NEW.supplier_payment_id
     FOR UPDATE;
    IF NOT FOUND OR payment_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Accounts payable allocation requires a completed supplier payment';
    END IF;
    SELECT COALESCE(sum(amount), 0) INTO allocated_total
      FROM accounts_payable_allocations
     WHERE merchant_id = NEW.merchant_id
       AND supplier_payment_id = NEW.supplier_payment_id
       AND id <> NEW.id;
    IF allocated_total + NEW.amount > payment_amount THEN
        RAISE EXCEPTION 'Accounts payable allocations exceed the supplier payment amount';
    END IF;
    SELECT balance_amount, status, due_date
      INTO remaining, invoice_status, invoice_due_date
      FROM supplier_invoices
     WHERE merchant_id = NEW.merchant_id AND id = NEW.supplier_invoice_id
     FOR UPDATE;
    IF NOT FOUND OR invoice_status NOT IN ('OPEN','PARTIALLY_PAID','OVERDUE') THEN
        RAISE EXCEPTION 'Supplier invoice is not allocatable';
    END IF;
    IF NEW.amount > remaining THEN
        RAISE EXCEPTION 'Accounts payable allocation exceeds invoice balance';
    END IF;
    UPDATE supplier_invoices
       SET balance_amount = balance_amount - NEW.amount,
           status = CASE
               WHEN balance_amount - NEW.amount = 0 THEN 'PAID'
               WHEN invoice_due_date IS NOT NULL AND invoice_due_date < CURRENT_DATE THEN 'OVERDUE'
               ELSE 'PARTIALLY_PAID'
           END
     WHERE merchant_id = NEW.merchant_id AND id = NEW.supplier_invoice_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_supplier_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'COMPLETED' THEN
        IF num_nonnulls(NEW.cash_account_id, NEW.bank_account_id) <> 1 THEN
            RAISE EXCEPTION 'A completed supplier payment must use exactly one cash or bank account';
        END IF;
        NEW.paid_at := COALESCE(NEW.paid_at, now());
    ELSIF NEW.status IN ('PENDING','FAILED','CANCELLED') THEN
        NEW.paid_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_supplier_payment_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    IF OLD.merchant_id IS DISTINCT FROM NEW.merchant_id
       OR OLD.supplier_invoice_id IS DISTINCT FROM NEW.supplier_invoice_id
       OR OLD.amount IS DISTINCT FROM NEW.amount THEN
        RAISE EXCEPTION 'Supplier payment identity and amount are immutable';
    END IF;
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('COMPLETED','FAILED','CANCELLED') THEN
        RAISE EXCEPTION 'Invalid supplier payment status transition: % -> %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_service_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status NOT IN ('CANCELLED','COMPLETED') AND EXISTS (
        SELECT 1
          FROM service_appointments a
         WHERE a.merchant_id = NEW.merchant_id
           AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
           AND a.status NOT IN ('CANCELLED','COMPLETED')
           AND a.starts_at < NEW.ends_at
           AND a.ends_at > NEW.starts_at
           AND (
               (NEW.assigned_membership_id IS NOT NULL AND a.assigned_membership_id = NEW.assigned_membership_id)
               OR (NEW.shop_id IS NOT NULL AND a.shop_id = NEW.shop_id)
           )
    ) THEN
        RAISE EXCEPTION 'Service appointment overlaps an existing appointment for the assigned resource';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_clinical_note() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor_encounter UUID; predecessor_version INTEGER; predecessor_status VARCHAR(20);
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'SIGNED' THEN
        RAISE EXCEPTION 'Signed clinical notes are immutable; create an amendment instead';
    END IF;
    IF NEW.status = 'SIGNED' THEN
        NEW.signed_at := COALESCE(NEW.signed_at, now());
    END IF;
    IF NEW.status = 'AMENDED' AND NEW.predecessor_id IS NULL THEN
        RAISE EXCEPTION 'An amended clinical note must reference its predecessor';
    END IF;
    IF NEW.predecessor_id IS NOT NULL THEN
        SELECT encounter_id, version_number, status
          INTO predecessor_encounter, predecessor_version, predecessor_status
          FROM clinical_notes
         WHERE merchant_id = NEW.merchant_id AND id = NEW.predecessor_id;
        IF NOT FOUND OR predecessor_encounter <> NEW.encounter_id
           OR predecessor_status <> 'SIGNED'
           OR NEW.version_number <> predecessor_version + 1 THEN
            RAISE EXCEPTION 'Clinical note amendment must follow the signed predecessor version';
        END IF;
    END IF;
    RETURN NEW;
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

    SELECT version INTO current_version
      FROM sync_entity_versions
     WHERE merchant_id = NEW.merchant_id
       AND entity_type = NEW.entity_type
       AND entity_id = NEW.entity_id;

    IF NEW.status IN ('PENDING','APPLIED') THEN
        IF NEW.operation_type = 'CREATE' AND current_version IS NOT NULL THEN
            NEW.status := 'CONFLICT';
        ELSIF NEW.operation_type <> 'CREATE' AND current_version IS NOT NULL
              AND NEW.base_version IS DISTINCT FROM current_version THEN
            NEW.status := 'CONFLICT';
        ELSIF NEW.operation_type <> 'CREATE' AND current_version IS NULL
              AND NEW.base_version IS NOT NULL AND NEW.base_version > 0 THEN
            NEW.status := 'CONFLICT';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_sync_conflict() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'OPEN' THEN
        NEW.resolved_at := NULL;
        NEW.resolution := NULL;
    ELSE
        NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_email_queue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'SENT' THEN
        NEW.sent_at := COALESCE(NEW.sent_at, now());
    ELSE
        NEW.sent_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_outbox_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'PUBLISHED' THEN
        NEW.published_at := COALESCE(NEW.published_at, now());
    ELSE
        NEW.published_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_workflow_execution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'RUNNING' THEN
        NEW.completed_at := NULL;
    ELSE
        NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_payment_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('APPROVED','REJECTED') THEN
        NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    ELSE
        NEW.reviewed_at := NULL;
        NEW.rejection_reason := NULL;
    END IF;
    IF NEW.status = 'REJECTED' AND NULLIF(trim(NEW.rejection_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Rejected payment proofs require a rejection reason';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_patient_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'GRANTED' THEN
        NEW.granted_at := COALESCE(NEW.granted_at, now());
        NEW.revoked_at := NULL;
    ELSIF NEW.status = 'REVOKED' THEN
        NEW.revoked_at := COALESCE(NEW.revoked_at, now());
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_repair_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'APPROVED' THEN
        NEW.approved_at := COALESCE(NEW.approved_at, now());
        IF NEW.approved_amount IS NULL THEN
            RAISE EXCEPTION 'Approved repair approvals require an approved amount';
        END IF;
    ELSE
        NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_service_order_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    linked_order_channel VARCHAR(20);
BEGIN
    IF NEW.order_id IS NOT NULL THEN
        SELECT channel
          INTO linked_order_channel
          FROM orders
         WHERE merchant_id = NEW.merchant_id
           AND id = NEW.order_id;

        IF linked_order_channel IS DISTINCT FROM 'SERVICE' THEN
            RAISE EXCEPTION 'Service orders must link to an order with channel SERVICE';
        END IF;
    END IF;

    IF NEW.service_type <> 'REPAIR'
       AND EXISTS (
           SELECT 1
             FROM repair_orders
            WHERE merchant_id = NEW.merchant_id
              AND service_order_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'A service order linked to a repair cannot change service_type away from REPAIR';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_repair_service_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    linked_service_order_type VARCHAR(20);
    linked_order_id UUID;
BEGIN
    SELECT service_type, order_id
      INTO linked_service_order_type, linked_order_id
      FROM service_orders
     WHERE merchant_id = NEW.merchant_id
       AND id = NEW.service_order_id;

    IF linked_service_order_type IS DISTINCT FROM 'REPAIR' THEN
        RAISE EXCEPTION 'Repair orders must link to a service order with service_type REPAIR';
    END IF;

    IF linked_order_id IS NULL THEN
        RAISE EXCEPTION 'Repair service orders must link to a canonical order';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_bank_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'COMPLETED' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSE
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_salary_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'PAID' THEN
        NEW.paid_at := COALESCE(NEW.paid_at, now());
    ELSE
        NEW.paid_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_current_merchant_id() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.merchant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1
          FROM pg_roles r
         WHERE r.rolname = 'platform_admin'
            AND pg_has_role(session_user, r.oid, 'member')
    );
$$;

CREATE OR REPLACE FUNCTION app_is_authenticated_member(p_merchant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
          FROM user_memberships um
         WHERE um.merchant_id = p_merchant_id
           AND um.identity_id = app_current_user_id()
           AND um.is_active
    );
$$;

CREATE OR REPLACE FUNCTION app_has_permission(p_permission_code VARCHAR) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin()
        OR EXISTS (
            SELECT 1
              FROM user_memberships um
              JOIN membership_roles mr
                ON mr.merchant_id = um.merchant_id
               AND mr.membership_id = um.id
              JOIN roles r
                ON r.merchant_id = mr.merchant_id
               AND r.id = mr.role_id
              LEFT JOIN role_permissions rp
                ON rp.role_id = r.id
             WHERE um.merchant_id = app_current_merchant_id()
               AND um.identity_id = app_current_user_id()
               AND um.is_active
               AND (mr.valid_until IS NULL OR mr.valid_until >= now())
               AND (
                   rp.permission_code = p_permission_code
                   OR (p_permission_code IN ('tenant.read','tenant.write','rbac.manage','membership.manage') AND r.code IN ('admin','merchant'))
               )
        );
$$;

CREATE OR REPLACE FUNCTION app_can_read_tenant(p_merchant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin()
        OR (
            p_merchant_id = app_current_merchant_id()
            AND app_is_authenticated_member(p_merchant_id)
            AND (
                app_has_permission('tenant.read')
                OR app_has_permission('tenant.write')
            )
        );
$$;

CREATE OR REPLACE FUNCTION app_can_write_tenant(p_merchant_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT app_is_platform_admin()
        OR (
            p_merchant_id = app_current_merchant_id()
            AND app_is_authenticated_member(p_merchant_id)
            AND app_has_permission('tenant.write')
        );
$$;

CREATE TRIGGER trg_user_identities_updated BEFORE UPDATE ON user_identities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON user_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_merchants_updated BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_business_units_updated BEFORE UPDATE ON business_units FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_unit_definitions_updated BEFORE UPDATE ON unit_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_unit_conversions_updated BEFORE UPDATE ON unit_conversions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_measurement_groups_updated BEFORE UPDATE ON measurement_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_catalog_category_hierarchy_validate BEFORE INSERT OR UPDATE OF parent_category_id ON catalog_categories FOR EACH ROW EXECUTE FUNCTION validate_catalog_category_hierarchy();
CREATE TRIGGER trg_unit_conversion_validate BEFORE INSERT OR UPDATE ON unit_conversions FOR EACH ROW EXECUTE FUNCTION validate_unit_conversion();
CREATE TRIGGER trg_order_store_validate BEFORE INSERT OR UPDATE OF store_id, channel ON orders FOR EACH ROW EXECUTE FUNCTION validate_order_store();
CREATE TRIGGER trg_refund_return_validate BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION validate_refund_return();
CREATE TRIGGER trg_payment_scope_validate BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION validate_payment_scope();
CREATE TRIGGER trg_payment_lifecycle_validate BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION validate_payment_status_transition();
CREATE TRIGGER trg_payment_delete_guard BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION prevent_payment_delete();
CREATE TRIGGER trg_refund_scope_validate BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION validate_refund_scope();
CREATE TRIGGER trg_refund_lifecycle_validate BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION validate_refund_status_transition();
CREATE TRIGGER trg_refund_status_refresh AFTER INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION refresh_payment_refund_status();
CREATE TRIGGER trg_refund_delete_guard BEFORE DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION prevent_refund_delete();
CREATE TRIGGER trg_inventory_cost_layer_links_validate BEFORE INSERT OR UPDATE ON inventory_cost_layers FOR EACH ROW EXECUTE FUNCTION validate_inventory_cost_layer_links();
CREATE TRIGGER trg_product_variant_base_unit BEFORE INSERT OR UPDATE OF base_unit_id, unit_of_measure ON product_variants FOR EACH ROW EXECUTE FUNCTION ensure_product_variant_base_unit();
CREATE TRIGGER trg_product_variant_base_unit_assignment AFTER INSERT OR UPDATE OF base_unit_id, unit_of_measure ON product_variants FOR EACH ROW EXECUTE FUNCTION assign_product_variant_base_unit();
CREATE TRIGGER trg_product_variant_unit_validate BEFORE INSERT OR UPDATE ON product_variant_units FOR EACH ROW EXECUTE FUNCTION validate_product_variant_unit();
CREATE TRIGGER trg_00_inventory_movement_unit_normalize BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION normalize_inventory_movement_unit();
CREATE TRIGGER trg_order_line_unit_normalize BEFORE INSERT OR UPDATE OF variant_id, unit_id ON order_lines FOR EACH ROW EXECUTE FUNCTION normalize_order_line_unit();
CREATE TRIGGER trg_purchase_order_line_unit_normalize BEFORE INSERT OR UPDATE OF variant_id, unit_id ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION normalize_purchase_order_line_unit();
CREATE TRIGGER trg_goods_receipt_line_unit_normalize BEFORE INSERT OR UPDATE OF purchase_order_line_id, unit_id ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION normalize_goods_receipt_line_unit();
CREATE TRIGGER trg_fulfillment_line_validate BEFORE INSERT OR UPDATE ON fulfillment_lines FOR EACH ROW EXECUTE FUNCTION validate_fulfillment_line();
CREATE TRIGGER trg_fulfillment_line_quantity_refresh AFTER INSERT OR UPDATE OR DELETE ON fulfillment_lines FOR EACH ROW EXECUTE FUNCTION refresh_order_line_fulfilled_quantity();
CREATE TRIGGER trg_ecommerce_order_item_allocation_validate BEFORE INSERT OR UPDATE ON ecommerce_order_item_allocations FOR EACH ROW EXECUTE FUNCTION validate_ecommerce_order_item_allocation();
CREATE TRIGGER trg_journal_entry_immutability BEFORE INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();
CREATE TRIGGER trg_journal_line_immutability BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_mutation();
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_purchase_order_status BEFORE UPDATE OF status ON purchase_orders FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_status_transition();
CREATE TRIGGER trg_purchase_order_received_quantity BEFORE UPDATE OF quantity_received ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION prevent_purchase_order_received_quantity_mutation();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_order_status BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION validate_order_status_transition();
CREATE TRIGGER trg_receipt_line_validate BEFORE INSERT ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION validate_receipt_line();
CREATE TRIGGER trg_receipt_line_immutability BEFORE UPDATE OR DELETE ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION prevent_receipt_line_mutation();
CREATE TRIGGER trg_inventory_movement_scope_validate BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_scope();
CREATE TRIGGER trg_inventory_movement_apply AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();
CREATE TRIGGER trg_inventory_movement_immutability BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_mutation();
CREATE TRIGGER trg_inventory_cost_layer_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_cost_layers FOR EACH ROW EXECUTE FUNCTION prevent_inventory_derived_mutation();
CREATE TRIGGER trg_inventory_cost_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_cost_allocations FOR EACH ROW EXECUTE FUNCTION prevent_inventory_derived_mutation();
CREATE TRIGGER trg_inventory_batch_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_batches FOR EACH ROW EXECUTE FUNCTION prevent_inventory_derived_mutation();
CREATE TRIGGER trg_inventory_movement_batch_validate BEFORE INSERT OR UPDATE ON inventory_movement_batches FOR EACH ROW EXECUTE FUNCTION validate_inventory_batch_link();
CREATE TRIGGER trg_inventory_movement_batch_apply AFTER INSERT ON inventory_movement_batches FOR EACH ROW EXECUTE FUNCTION apply_inventory_batch_link();
CREATE TRIGGER trg_inventory_movement_batch_immutability BEFORE UPDATE OR DELETE ON inventory_movement_batches FOR EACH ROW EXECUTE FUNCTION prevent_inventory_link_mutation();
CREATE TRIGGER trg_inventory_movement_serial_apply AFTER INSERT ON inventory_movement_serials FOR EACH ROW EXECUTE FUNCTION apply_inventory_serial_link();
CREATE TRIGGER trg_inventory_movement_serial_immutability BEFORE UPDATE OR DELETE ON inventory_movement_serials FOR EACH ROW EXECUTE FUNCTION prevent_inventory_link_mutation();
CREATE TRIGGER trg_inventory_movement_asset_apply AFTER INSERT ON inventory_movement_assets FOR EACH ROW EXECUTE FUNCTION apply_inventory_asset_link();
CREATE TRIGGER trg_inventory_movement_asset_immutability BEFORE UPDATE OR DELETE ON inventory_movement_assets FOR EACH ROW EXECUTE FUNCTION prevent_inventory_link_mutation();
CREATE TRIGGER trg_inventory_serial_immutability BEFORE UPDATE OR DELETE ON inventory_serials FOR EACH ROW EXECUTE FUNCTION prevent_inventory_identity_mutation();
CREATE TRIGGER trg_inventory_asset_immutability BEFORE UPDATE OR DELETE ON inventory_assets FOR EACH ROW EXECUTE FUNCTION prevent_inventory_identity_mutation();
CREATE TRIGGER trg_inventory_reservation_apply BEFORE INSERT OR UPDATE OR DELETE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION apply_inventory_reservation();
CREATE TRIGGER trg_inventory_balance_insert_delete_guard BEFORE INSERT OR DELETE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION prevent_inventory_derived_mutation();
CREATE TRIGGER trg_inventory_balance_guard BEFORE UPDATE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION guard_inventory_balance_update();
CREATE CONSTRAINT TRIGGER trg_journal_balance AFTER INSERT OR UPDATE OR DELETE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
CREATE CONSTRAINT TRIGGER trg_journal_entry_balance AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
CREATE TRIGGER trg_membership_shop_assignment_validate BEFORE INSERT OR UPDATE ON membership_shop_assignments FOR EACH ROW EXECUTE FUNCTION validate_membership_shop_assignment();
CREATE TRIGGER trg_catalog_attribute_scope_validate BEFORE INSERT OR UPDATE ON catalog_attribute_values FOR EACH ROW EXECUTE FUNCTION validate_catalog_attribute_scope();
CREATE TRIGGER trg_product_brand_validate BEFORE INSERT OR UPDATE OF brand_id ON products FOR EACH ROW EXECUTE FUNCTION validate_product_brand();
CREATE TRIGGER trg_inventory_serial_scope_validate BEFORE INSERT OR UPDATE ON inventory_serials FOR EACH ROW EXECUTE FUNCTION validate_inventory_identity_scope();
CREATE TRIGGER trg_inventory_asset_scope_validate BEFORE INSERT OR UPDATE ON inventory_assets FOR EACH ROW EXECUTE FUNCTION validate_inventory_identity_scope();
CREATE TRIGGER trg_inventory_movement_batch_scope_validate BEFORE INSERT OR UPDATE ON inventory_movement_batches FOR EACH ROW EXECUTE FUNCTION validate_inventory_identity_scope();
CREATE TRIGGER trg_inventory_movement_serial_scope_validate BEFORE INSERT OR UPDATE ON inventory_movement_serials FOR EACH ROW EXECUTE FUNCTION validate_inventory_identity_scope();
CREATE TRIGGER trg_inventory_movement_asset_scope_validate BEFORE INSERT OR UPDATE ON inventory_movement_assets FOR EACH ROW EXECUTE FUNCTION validate_inventory_identity_scope();
CREATE TRIGGER trg_inventory_asset_identifier_normalize BEFORE INSERT OR UPDATE ON inventory_asset_identifiers FOR EACH ROW EXECUTE FUNCTION normalize_inventory_identifier();
CREATE TRIGGER trg_barcode_registry_validate BEFORE INSERT OR UPDATE ON barcode_registry FOR EACH ROW EXECUTE FUNCTION validate_barcode_registry();
CREATE TRIGGER trg_promotion_product_validate BEFORE INSERT OR UPDATE ON promotion_products FOR EACH ROW EXECUTE FUNCTION validate_promotion_product();
CREATE TRIGGER trg_inventory_transformation_line_normalize BEFORE INSERT OR UPDATE ON inventory_transformation_lines FOR EACH ROW EXECUTE FUNCTION normalize_inventory_transformation_line();
CREATE TRIGGER trg_pos_session_validate BEFORE INSERT OR UPDATE ON pos_sessions FOR EACH ROW EXECUTE FUNCTION validate_pos_session();
CREATE TRIGGER trg_ecommerce_cart_item_validate BEFORE INSERT OR UPDATE ON ecommerce_cart_items FOR EACH ROW EXECUTE FUNCTION validate_ecommerce_cart_item();
CREATE TRIGGER trg_ecommerce_cart_store_validate BEFORE INSERT OR UPDATE OF store_id ON ecommerce_carts FOR EACH ROW EXECUTE FUNCTION validate_ecommerce_cart_store();
CREATE TRIGGER trg_ecommerce_checkout_validate BEFORE INSERT OR UPDATE ON ecommerce_checkout_sessions FOR EACH ROW EXECUTE FUNCTION validate_ecommerce_checkout();
CREATE TRIGGER trg_promotion_redemption_apply BEFORE INSERT ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION redeem_promotion();
CREATE TRIGGER trg_promotion_counter_guard BEFORE UPDATE OF redemption_count ON promotions FOR EACH ROW EXECUTE FUNCTION prevent_promotion_counter_mutation();
CREATE TRIGGER trg_promotion_code_counter_guard BEFORE UPDATE OF redemption_count ON promotion_codes FOR EACH ROW EXECUTE FUNCTION prevent_promotion_counter_mutation();
CREATE TRIGGER trg_promotion_redemption_immutability BEFORE UPDATE OR DELETE ON promotion_redemptions FOR EACH ROW EXECUTE FUNCTION prevent_promotion_redemption_mutation();
CREATE TRIGGER trg_ecommerce_return_line_validate BEFORE INSERT OR UPDATE ON ecommerce_return_lines FOR EACH ROW EXECUTE FUNCTION validate_return_line();
CREATE TRIGGER trg_ecommerce_return_transition BEFORE INSERT OR UPDATE OF status ON ecommerce_returns FOR EACH ROW EXECUTE FUNCTION validate_return_transition();
CREATE TRIGGER trg_ecommerce_return_delete_guard BEFORE DELETE ON ecommerce_returns FOR EACH ROW EXECUTE FUNCTION prevent_return_delete();
CREATE TRIGGER trg_catalog_brands_updated BEFORE UPDATE ON catalog_brands FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_catalog_categories_updated BEFORE UPDATE ON catalog_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ecommerce_carts_updated BEFORE UPDATE ON ecommerce_carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ecommerce_store_fulfillment_locations_updated BEFORE UPDATE ON ecommerce_store_fulfillment_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ecommerce_cart_items_updated BEFORE UPDATE ON ecommerce_cart_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ecommerce_checkout_sessions_updated BEFORE UPDATE ON ecommerce_checkout_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_promotions_updated BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_business_unit_scope_validate BEFORE INSERT OR UPDATE ON business_units FOR EACH ROW EXECUTE FUNCTION validate_business_unit_scope();
CREATE TRIGGER trg_inventory_identifier_types_updated BEFORE UPDATE ON inventory_identifier_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_variant_identifier_rules_updated BEFORE UPDATE ON variant_identifier_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_reconciliation_exceptions_updated BEFORE UPDATE ON inventory_reconciliation_exceptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_transformations_updated BEFORE UPDATE ON inventory_transformations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ar_allocation_apply BEFORE INSERT ON accounts_receivable_allocations FOR EACH ROW EXECUTE FUNCTION validate_ar_allocation();
CREATE TRIGGER trg_ap_allocation_apply BEFORE INSERT ON accounts_payable_allocations FOR EACH ROW EXECUTE FUNCTION validate_ap_allocation();
CREATE TRIGGER trg_ar_allocation_immutability BEFORE UPDATE OR DELETE ON accounts_receivable_allocations FOR EACH ROW EXECUTE FUNCTION prevent_financial_allocation_mutation();
CREATE TRIGGER trg_ap_allocation_immutability BEFORE UPDATE OR DELETE ON accounts_payable_allocations FOR EACH ROW EXECUTE FUNCTION prevent_financial_allocation_mutation();
CREATE TRIGGER trg_supplier_payment_lifecycle BEFORE INSERT OR UPDATE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION validate_supplier_payment_status_transition();
CREATE TRIGGER trg_supplier_payment_validate BEFORE INSERT OR UPDATE ON supplier_payments FOR EACH ROW EXECUTE FUNCTION validate_supplier_payment();
CREATE TRIGGER trg_service_appointment_validate BEFORE INSERT OR UPDATE ON service_appointments FOR EACH ROW EXECUTE FUNCTION validate_service_appointment();
CREATE TRIGGER trg_service_order_links_validate BEFORE INSERT OR UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION validate_service_order_links();
CREATE TRIGGER trg_clinical_note_validate BEFORE INSERT OR UPDATE ON clinical_notes FOR EACH ROW EXECUTE FUNCTION validate_clinical_note();
CREATE TRIGGER trg_sync_operation_validate BEFORE INSERT OR UPDATE ON sync_operations FOR EACH ROW EXECUTE FUNCTION validate_sync_operation();
CREATE TRIGGER trg_sync_conflict_validate BEFORE INSERT OR UPDATE ON sync_conflicts FOR EACH ROW EXECUTE FUNCTION validate_sync_conflict();
CREATE TRIGGER trg_email_queue_validate BEFORE INSERT OR UPDATE ON email_queue FOR EACH ROW EXECUTE FUNCTION validate_email_queue();
CREATE TRIGGER trg_outbox_event_validate BEFORE INSERT OR UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION validate_outbox_event();
CREATE TRIGGER trg_workflow_execution_validate BEFORE INSERT OR UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION validate_workflow_execution();
CREATE TRIGGER trg_payment_proof_validate BEFORE INSERT OR UPDATE ON payment_proofs FOR EACH ROW EXECUTE FUNCTION validate_payment_proof();
CREATE TRIGGER trg_patient_consent_validate BEFORE INSERT OR UPDATE ON patient_consents FOR EACH ROW EXECUTE FUNCTION validate_patient_consent();
CREATE TRIGGER trg_repair_approval_validate BEFORE INSERT OR UPDATE ON repair_approvals FOR EACH ROW EXECUTE FUNCTION validate_repair_approval();
CREATE TRIGGER trg_repair_service_order_validate BEFORE INSERT OR UPDATE ON repair_orders FOR EACH ROW EXECUTE FUNCTION validate_repair_service_order();
CREATE TRIGGER trg_bank_reconciliation_validate BEFORE INSERT OR UPDATE ON bank_reconciliations FOR EACH ROW EXECUTE FUNCTION validate_bank_reconciliation();
CREATE TRIGGER trg_salary_payment_validate BEFORE INSERT OR UPDATE ON salary_payments FOR EACH ROW EXECUTE FUNCTION validate_salary_payment();
CREATE TRIGGER trg_z_variant_inventory_policy_validate BEFORE INSERT OR UPDATE ON variant_inventory_policies FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_policy();
CREATE TRIGGER trg_z_variant_inventory_policy_units BEFORE INSERT OR UPDATE ON product_variant_units FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_receipt BEFORE INSERT OR UPDATE ON goods_receipt_lines FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_batches BEFORE INSERT OR UPDATE ON inventory_batches FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_assets BEFORE INSERT OR UPDATE ON inventory_assets FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_reservations BEFORE INSERT OR UPDATE ON inventory_reservations FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_movements BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_transformations BEFORE INSERT OR UPDATE ON inventory_transformation_lines FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_z_variant_inventory_policy_barcodes BEFORE INSERT OR UPDATE ON barcode_registry FOR EACH ROW EXECUTE FUNCTION validate_variant_inventory_operation();
CREATE TRIGGER trg_support_case_validate BEFORE INSERT OR UPDATE ON support_cases FOR EACH ROW EXECUTE FUNCTION validate_support_case();
CREATE TRIGGER trg_support_case_updated BEFORE UPDATE ON support_cases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_support_case_audit AFTER INSERT OR UPDATE ON support_cases FOR EACH ROW EXECUTE FUNCTION audit_extension_change();
CREATE TRIGGER trg_merchant_setting_validate BEFORE INSERT OR UPDATE ON merchant_settings FOR EACH ROW EXECUTE FUNCTION validate_merchant_setting();
CREATE TRIGGER trg_merchant_setting_updated BEFORE UPDATE ON merchant_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_merchant_setting_audit AFTER INSERT OR UPDATE ON merchant_settings FOR EACH ROW EXECUTE FUNCTION audit_extension_change();
CREATE TRIGGER trg_storefront_banner_validate BEFORE INSERT OR UPDATE ON storefront_banners FOR EACH ROW EXECUTE FUNCTION validate_storefront_banner();
CREATE TRIGGER trg_storefront_banner_updated BEFORE UPDATE ON storefront_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_storefront_banner_audit AFTER INSERT OR UPDATE ON storefront_banners FOR EACH ROW EXECUTE FUNCTION audit_extension_change();
CREATE TRIGGER trg_merchant_testimonial_validate BEFORE INSERT OR UPDATE ON merchant_testimonials FOR EACH ROW EXECUTE FUNCTION validate_merchant_testimonial();
CREATE TRIGGER trg_merchant_testimonial_updated BEFORE UPDATE ON merchant_testimonials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_merchant_testimonial_audit AFTER INSERT OR UPDATE ON merchant_testimonials FOR EACH ROW EXECUTE FUNCTION audit_extension_change();

CREATE CONSTRAINT TRIGGER trg_order_totals_validate
    AFTER INSERT OR UPDATE OR DELETE ON orders
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_totals();
CREATE CONSTRAINT TRIGGER trg_order_line_totals_validate
    AFTER INSERT OR UPDATE OR DELETE ON order_lines
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_totals();
CREATE CONSTRAINT TRIGGER trg_purchase_order_totals_validate
    AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_totals();
CREATE CONSTRAINT TRIGGER trg_purchase_order_line_totals_validate
    AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_totals();
CREATE CONSTRAINT TRIGGER trg_inventory_movement_completeness
    AFTER INSERT ON inventory_movements
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_completeness();
CREATE CONSTRAINT TRIGGER trg_inventory_batch_link_completeness
    AFTER INSERT ON inventory_movement_batches
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_completeness();
CREATE CONSTRAINT TRIGGER trg_inventory_serial_link_completeness
    AFTER INSERT ON inventory_movement_serials
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_completeness();
CREATE CONSTRAINT TRIGGER trg_inventory_asset_link_completeness
    AFTER INSERT ON inventory_movement_assets
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_inventory_movement_completeness();

INSERT INTO permissions(code, description) VALUES
    ('tenant.read', 'Read tenant-owned business data'),
    ('tenant.write', 'Create, update, and delete tenant-owned business data'),
    ('rbac.manage', 'Manage tenant roles and permissions'),
    ('membership.manage', 'Manage tenant memberships')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_identity_self_access ON user_identities;
DROP POLICY IF EXISTS user_identity_access ON user_identities;
CREATE POLICY user_identity_access ON user_identities
    USING (
        id = app_current_user_id()
        OR current_setting('app.auth_mode', true) = 'login'
        OR app_is_platform_admin()
    )
    WITH CHECK (
        id = app_current_user_id()
        OR current_setting('app.auth_mode', true) = 'login'
        OR app_is_platform_admin()
    );

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_identity_access ON refresh_tokens
    USING (identity_id = app_current_user_id() OR app_is_platform_admin())
    WITH CHECK (identity_id = app_current_user_id() OR app_is_platform_admin());

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permission_tenant_access ON role_permissions
    USING (
        app_is_platform_admin()
        OR EXISTS (
            SELECT 1
              FROM roles r
             WHERE r.id = role_permissions.role_id
               AND r.merchant_id = app_current_merchant_id()
               AND app_is_authenticated_member(r.merchant_id)
        )
    )
    WITH CHECK (
        app_is_platform_admin()
        OR (
            EXISTS (
                SELECT 1
                  FROM roles r
                 WHERE r.id = role_permissions.role_id
                   AND r.merchant_id = app_current_merchant_id()
                   AND app_is_authenticated_member(r.merchant_id)
            )
            AND app_has_permission('rbac.manage')
        )
    );

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants FORCE ROW LEVEL SECURITY;
CREATE POLICY merchant_read_access ON merchants FOR SELECT
    USING (app_can_read_tenant(id));
CREATE POLICY merchant_insert_access ON merchants FOR INSERT
    WITH CHECK (app_is_platform_admin());
CREATE POLICY merchant_update_access ON merchants FOR UPDATE
    USING (app_can_write_tenant(id))
    WITH CHECK (app_can_write_tenant(id));
CREATE POLICY merchant_delete_access ON merchants FOR DELETE
    USING (app_is_platform_admin());

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_tenant_access ON organizations
    USING (
        app_is_platform_admin()
        OR EXISTS (
            SELECT 1
             FROM organization_merchants om
             WHERE om.organization_id = organizations.id
               AND om.merchant_id = app_current_merchant_id()
               AND app_is_authenticated_member(om.merchant_id)
        )
    )
    WITH CHECK (app_is_platform_admin());

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'user_memberships','roles','membership_roles','shops','locations','customers','customer_addresses',
        'products','product_variants','variant_inventory_policies','price_lists','product_prices','suppliers','purchase_orders','measurement_groups',
        'purchase_order_lines','goods_receipts','goods_receipt_lines','orders','order_lines','payments','payment_types',
        'refunds','fulfillments','fulfillment_lines','inventory_balances','inventory_movements',
        'inventory_cost_layers','inventory_cost_allocations','inventory_reservations','accounting_accounts',
        'accounting_events','journal_entries','journal_lines','audit_events',
        'membership_shop_assignments','catalog_brands','catalog_categories','catalog_product_categories',
        'catalog_product_images','catalog_variant_images','catalog_attribute_definitions','catalog_attribute_options','catalog_attribute_values',
        'inventory_batches','inventory_serials','inventory_assets','inventory_identifier_types','variant_identifier_rules','inventory_asset_identifiers','barcode_registry',
        'inventory_operations','inventory_reconciliation_exceptions','inventory_transformations','inventory_transformation_lines','inventory_movement_batches','inventory_movement_serials','inventory_movement_assets',
        'pos_terminals','pos_sessions','ecommerce_carts','ecommerce_cart_items','ecommerce_checkout_sessions',
        'promotions','promotion_products','promotion_codes','order_promotions','promotion_redemptions','ecommerce_returns','ecommerce_return_lines'
        ,'organization_merchants','unit_definitions','unit_conversions','product_variant_units','business_units','accounting_periods','tax_rates',
        'accounts_receivable_documents','accounts_receivable_allocations','supplier_invoices','supplier_invoice_lines',
        'supplier_payments','accounts_payable_allocations','expenses','expense_items','cash_accounts','cash_transactions',
        'bank_accounts','bank_transactions','bank_reconciliations','bank_reconciliation_items','supplier_returns',
        'supplier_return_lines','staff_contracts','salary_payments','payment_settings','merchant_payment_configurations',
        'payment_proofs','payment_provider_sessions','ecommerce_stores','storefront_banners','ecommerce_store_products',
        'ecommerce_store_product_variants','ecommerce_store_fulfillment_locations','ecommerce_shipping_methods','ecommerce_order_events','ecommerce_order_discounts',
        'ecommerce_order_item_allocations','guest_order_verifications','guest_order_access_tokens','customer_tags',
        'customer_tag_map','customer_notes','customer_activities','conversations','support_cases','conversation_participants','messages',
        'communication_channels','email_templates','email_queue','notifications','file_objects','merchant_testimonials','integration_connections',
        'idempotency_keys','outbox_events','custom_field_definitions','custom_field_values','merchant_modules','merchant_settings',
        'document_sequences','external_id_map','migration_audit','workflows','workflow_rules','workflow_executions',
        'workflow_logs','ai_providers','ai_sessions','ai_requests','sync_devices','sync_entity_versions','sync_sessions',
        'sync_operations','sync_checkpoints','sync_conflicts','sync_changes','sync_logs','patients','patient_contacts',
        'patient_identifiers','service_categories','service_catalog','service_prices','service_orders','service_order_items','service_order_work_items',
        'service_order_assignments','service_appointments','service_order_notes','service_order_attachments',
        'service_order_billings','service_order_status_history','repair_devices','repair_device_identifiers','repair_work_item_devices','repair_presets','repair_orders','service_work_item_payment_allocations',
        'repair_diagnostics','customer_supplied_parts','repair_order_parts','repair_approvals','repair_warranties',
        'clinical_encounters','clinical_notes','clinical_measurements','clinical_procedures','clinical_diagnoses',
        'treatment_plans','treatment_plan_items','patient_consents','patient_allergies','prescriptions','prescription_items'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        IF t = 'user_memberships' THEN
            EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (app_is_platform_admin() OR (merchant_id = app_current_merchant_id() AND identity_id = app_current_user_id() AND is_active))', t);
        ELSIF t IN ('roles','membership_roles') THEN
            EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (app_is_platform_admin() OR app_is_authenticated_member(merchant_id))', t);
        ELSE
            EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (app_can_read_tenant(merchant_id))', t);
        END IF;
        EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (app_can_write_tenant(merchant_id))', t);
        EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (app_can_write_tenant(merchant_id)) WITH CHECK (app_can_write_tenant(merchant_id))', t);
        EXECUTE format('CREATE POLICY tenant_delete ON %I FOR DELETE USING (app_can_write_tenant(merchant_id))', t);
    END LOOP;
END;
$$;

DROP POLICY IF EXISTS tenant_insert ON user_memberships;
DROP POLICY IF EXISTS tenant_update ON user_memberships;
DROP POLICY IF EXISTS tenant_delete ON user_memberships;
CREATE POLICY tenant_insert ON user_memberships FOR INSERT
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON user_memberships FOR UPDATE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'))
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON user_memberships FOR DELETE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));

DROP POLICY IF EXISTS tenant_insert ON roles;
DROP POLICY IF EXISTS tenant_update ON roles;
DROP POLICY IF EXISTS tenant_delete ON roles;
CREATE POLICY tenant_insert ON roles FOR INSERT
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('rbac.manage'));
CREATE POLICY tenant_update ON roles FOR UPDATE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('rbac.manage'))
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('rbac.manage'));
CREATE POLICY tenant_delete ON roles FOR DELETE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('rbac.manage'));

DROP POLICY IF EXISTS tenant_insert ON membership_roles;
DROP POLICY IF EXISTS tenant_update ON membership_roles;
DROP POLICY IF EXISTS tenant_delete ON membership_roles;
CREATE POLICY tenant_insert ON membership_roles FOR INSERT
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON membership_roles FOR UPDATE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'))
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON membership_roles FOR DELETE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));

DROP POLICY IF EXISTS tenant_insert ON membership_shop_assignments;
DROP POLICY IF EXISTS tenant_update ON membership_shop_assignments;
DROP POLICY IF EXISTS tenant_delete ON membership_shop_assignments;
CREATE POLICY tenant_insert ON membership_shop_assignments FOR INSERT
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON membership_shop_assignments FOR UPDATE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'))
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON membership_shop_assignments FOR DELETE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));

DROP POLICY IF EXISTS tenant_insert ON payment_types;
DROP POLICY IF EXISTS tenant_update ON payment_types;
DROP POLICY IF EXISTS tenant_delete ON payment_types;
CREATE POLICY tenant_insert ON payment_types FOR INSERT
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_update ON payment_types FOR UPDATE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'))
    WITH CHECK (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));
CREATE POLICY tenant_delete ON payment_types FOR DELETE
    USING (app_can_write_tenant(merchant_id) AND app_has_permission('membership.manage'));

COMMENT ON TABLE user_identities IS 'Sole authentication authority: email, password, lock state, and login tracking live here only.';
COMMENT ON TABLE user_memberships IS 'Tenant membership and display profile; contains no credentials.';
COMMENT ON TABLE customers IS 'Single merchant customer master for POS, ecommerce, CRM, loyalty, service, and guests.';
COMMENT ON TABLE orders IS 'Single authoritative commercial order aggregate for every channel.';
COMMENT ON TABLE inventory_movements IS 'Single immutable stock ledger. Transfers always have explicit source and destination locations.';
COMMENT ON TABLE inventory_cost_layers IS 'FIFO receipt layers; quantity_remaining is consumed by inventory_cost_allocations.';
COMMENT ON TABLE accounting_events IS 'Integration boundary for posting order, payment, refund, purchasing, and inventory events.';
