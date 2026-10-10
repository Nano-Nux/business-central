-- Expand modes and change only the default for future merchants.
-- Existing merchants and all catalog/stock data remain unchanged.
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_pos_complexity_level_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_pos_complexity_level_check
    CHECK (pos_complexity_level IN ('NANO', 'MINI', 'SIMPLE', 'COMPLEX'));
ALTER TABLE merchants ALTER COLUMN pos_complexity_level SET DEFAULT 'NANO';
