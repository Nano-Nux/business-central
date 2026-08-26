-- Reference currencies required before the first merchant can be created.
INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'Pound Sterling', '£', 2)
ON CONFLICT (code) DO NOTHING;
