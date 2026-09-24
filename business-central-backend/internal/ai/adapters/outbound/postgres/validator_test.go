package postgres

import (
	"testing"
)

func TestValidateReadOnlyQuery(t *testing.T) {
	merchantID := "11111111-1111-1111-1111-111111111111"

	validQueries := []string{
		"SELECT id, name FROM products WHERE merchant_id = '11111111-1111-1111-1111-111111111111'",
		"SELECT p.name, pv.sku, pp.amount FROM products p JOIN product_variants pv ON pv.product_id = p.id LEFT JOIN product_prices pp ON pp.variant_id = pv.id WHERE p.merchant_id = '11111111-1111-1111-1111-111111111111';",
		`WITH daily_orders AS (
			SELECT id, grand_total FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'
		)
		SELECT count(*), sum(grand_total) FROM daily_orders`,
		"/* get product */ SELECT name -- inline comment\n FROM products WHERE merchant_id = '11111111-1111-1111-1111-111111111111'",
	}

	for _, query := range validQueries {
		sanitized, err := ValidateReadOnlyQuery(query, merchantID, false)
		if err != nil {
			t.Errorf("expected valid query, got error for %q: %v", query, err)
		}
		if sanitized == "" {
			t.Errorf("expected non-empty sanitized query for %q", query)
		}
	}

	invalidQueries := []struct {
		name  string
		query string
	}{
		{"Insert mutation", "INSERT INTO products(name) VALUES ('Hacked')"},
		{"Update mutation", "UPDATE products SET name = 'Hacked'"},
		{"Delete mutation", "DELETE FROM products WHERE id = '123'"},
		{"Drop table", "DROP TABLE products"},
		{"Alter table", "ALTER TABLE products ADD COLUMN hacked text"},
		{"Truncate table", "TRUNCATE TABLE products"},
		{"Query chaining with semicolon", "SELECT 1 FROM products WHERE merchant_id = '11111111-1111-1111-1111-111111111111'; DROP TABLE products"},
		{"Select into", "SELECT * INTO new_table FROM products"},
		{"Grant privileges", "GRANT ALL PRIVILEGES ON DATABASE business_central TO hacker"},
		{"Exec stored proc", "EXEC some_stored_proc"},
		{"Execute", "EXECUTE some_query"},
		{"Set configuration", "SET search_path = public"},
		{"Create table", "CREATE TABLE hack (id int)"},
		{"Empty query", ""},
		{"Whitespace only", "   "},
		{"Access user_identities", "SELECT email, password_hash FROM user_identities WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Access password_hash", "SELECT id, password_hash FROM users WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Access pg_catalog", "SELECT * FROM pg_catalog.pg_tables WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Access information_schema", "SELECT * FROM information_schema.tables WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Access non-whitelisted table", "SELECT * FROM random_secret_table WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Negated merchant_id !=", "SELECT * FROM orders WHERE merchant_id != '11111111-1111-1111-1111-111111111111'"},
		{"Negated merchant_id <>", "SELECT * FROM orders WHERE merchant_id <> '11111111-1111-1111-1111-111111111111'"},
		{"Negated merchant_id NOT IN", "SELECT * FROM orders WHERE merchant_id NOT IN ('11111111-1111-1111-1111-111111111111')"},
		{"Tautology bypass OR 1=1", "SELECT * FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111' OR 1=1"},
		{"Missing merchant scope", "SELECT * FROM orders WHERE id = '123'"},
	}

	for _, tc := range invalidQueries {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateReadOnlyQuery(tc.query, merchantID, false)
			if err == nil {
				t.Errorf("expected error for %s (%q), but got nil", tc.name, tc.query)
			}
		})
	}
}

func TestValidateReadOnlyQuery_StaffConfidentiality(t *testing.T) {
	merchantID := "11111111-1111-1111-1111-111111111111"

	// Queries that staff ARE allowed to execute (e.g. selling price, stock levels, orders)
	allowedForStaff := []string{
		"SELECT p.name, pv.sku, pp.amount FROM products p JOIN product_variants pv ON pv.product_id = p.id LEFT JOIN product_prices pp ON pp.variant_id = pv.id LEFT JOIN price_lists pl ON pl.id = pp.price_list_id WHERE p.merchant_id = '11111111-1111-1111-1111-111111111111'",
		"SELECT pv.name, ib.quantity_on_hand FROM inventory_balances ib JOIN product_variants pv ON pv.id = ib.variant_id LEFT JOIN locations l ON l.merchant_id = ib.merchant_id AND l.id = ib.location_id WHERE ib.merchant_id = '11111111-1111-1111-1111-111111111111'",
		"SELECT id, order_number, grand_total, status FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'",
		"SELECT count(o.id) AS total_sales, COALESCE(sum(o.grand_total), 0) AS total_revenue FROM orders o LEFT JOIN locations l ON l.merchant_id = o.merchant_id AND l.id = o.fulfillment_location_id WHERE o.merchant_id = '11111111-1111-1111-1111-111111111111' AND o.status NOT IN ('DRAFT', 'CANCELLED')",
	}

	for _, query := range allowedForStaff {
		_, err := ValidateReadOnlyQuery(query, merchantID, true)
		if err != nil {
			t.Errorf("expected allowed query for staff, got error for %q: %v", query, err)
		}
	}

	// Queries that staff MUST NOT execute (profit, original_price, cost_price, etc.)
	confidentialForStaff := []struct {
		name  string
		query string
	}{
		{"Query original_price column", "SELECT pv.name, pv.original_price FROM product_variants pv WHERE pv.merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query cost_price column", "SELECT ol.id, ol.cost_price FROM order_lines ol WHERE ol.merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query purchase_price", "SELECT id, purchase_price FROM products WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query gross_profit alias", "SELECT sum(grand_total) AS gross_profit FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query net_profit alias", "SELECT sum(grand_total) AS net_profit FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query profit in projection", "SELECT id, profit FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query margin column", "SELECT id, margin FROM products WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
		{"Query cogs", "SELECT sum(cogs) FROM orders WHERE merchant_id = '11111111-1111-1111-1111-111111111111'"},
	}

	for _, tc := range confidentialForStaff {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ValidateReadOnlyQuery(tc.query, merchantID, true)
			if err == nil {
				t.Errorf("expected staff confidentiality error for %s (%q), but got nil", tc.name, tc.query)
			}

			// Verify merchant CAN run it (isStaff = false)
			_, errMerchant := ValidateReadOnlyQuery(tc.query, merchantID, false)
			if errMerchant != nil {
				t.Errorf("merchant should be permitted to run %s (%q), but got error: %v", tc.name, tc.query, errMerchant)
			}
		})
	}
}
