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
