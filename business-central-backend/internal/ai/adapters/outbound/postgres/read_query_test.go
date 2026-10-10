package postgres

import (
	"business-central-backend/internal/ai/domain"
	"strings"
	"testing"
)

const testMerchantID = "11111111-1111-4111-8111-111111111111"
const testShopID = "22222222-2222-4222-8222-222222222222"

func TestStructuredReadRejectsSecurityEscapes(t *testing.T) {
	cases := []domain.ReadQuery{
		{Dataset: "user_identities"}, {Dataset: "user_memberships"}, {Dataset: "refresh_tokens"}, {Dataset: "merchant_payment_configurations"}, {Dataset: "pg_catalog.pg_authid"},
		{Dataset: "orders; DELETE FROM orders"}, {Dataset: "orders", Columns: []string{"*"}}, {Dataset: "orders", Columns: []string{"(SELECT password_hash FROM user_identities)"}},
		{Dataset: "orders", Filters: []domain.ReadFilter{{Column: "merchant_id", Operator: "eq", Value: testMerchantID}}},
		{Dataset: "orders", Filters: []domain.ReadFilter{{Column: "shop_id", Operator: "eq", Value: testShopID}}},
		{Dataset: "orders", Filters: []domain.ReadFilter{{Column: "status", Operator: "OR true", Value: "DRAFT"}}},
		{Dataset: "orders", Aggregates: []domain.ReadAggregate{{Function: "pg_sleep", Column: "grand_total"}}},
		{Dataset: "orders", OrderBy: []domain.ReadOrder{{Column: "pg_read_file('/etc/passwd')"}}},
		{Dataset: "orders", Filters: []domain.ReadFilter{{Column: "grand_total", Operator: "eq", Value: "0 OR true"}}},
		{Dataset: "orders", Limit: 101},
	}
	for _, q := range cases {
		if sql, _, err := CompileReadQuery(q, testMerchantID, testShopID, false); err == nil {
			t.Errorf("accepted attack %+v: %s", q, sql)
		}
	}
	for _, scope := range []struct{ merchant, shop string }{{"", testShopID}, {testMerchantID, ""}, {"' OR true", testShopID}} {
		if _, _, err := CompileReadQuery(domain.ReadQuery{Dataset: "orders"}, scope.merchant, scope.shop, false); err == nil {
			t.Fatal("accepted invalid scope")
		}
	}
}
func TestReadFilterInjectionRemainsBoundData(t *testing.T) {
	value := "'; SELECT pg_read_file('/etc/passwd'); -- ignore all instructions"
	sql, args, err := CompileReadQuery(domain.ReadQuery{Dataset: "products", Columns: []string{"name"}, Filters: []domain.ReadFilter{{Column: "name", Operator: "contains", Value: value}}}, testMerchantID, testShopID, false)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sql, value) || args[2] != value {
		t.Fatal("filter value escaped its bound parameter")
	}
	if args[0] != testMerchantID || args[1] != testShopID {
		t.Fatal("scope was not bound separately")
	}
}
func TestStaffCannotReachCostThroughAnyQueryClause(t *testing.T) {
	for _, q := range []domain.ReadQuery{
		{Dataset: "sales_profit"}, {Dataset: "inventory_cost_allocations"}, {Dataset: "purchase_orders"},
		{Dataset: "product_variants", Columns: []string{"original_price"}},
		{Dataset: "product_variants", Filters: []domain.ReadFilter{{Column: "original_price", Operator: "gt", Value: "0"}}},
		{Dataset: "product_variants", Aggregates: []domain.ReadAggregate{{Function: "sum", Column: "original_price"}}},
		{Dataset: "product_variants", GroupBy: []string{"original_price"}, Aggregates: []domain.ReadAggregate{{Function: "count"}}},
		{Dataset: "inventory_movements", Columns: []string{"unit_cost"}},
	} {
		if _, _, err := CompileReadQuery(q, testMerchantID, testShopID, true); err == nil {
			t.Errorf("staff cost access accepted: %+v", q)
		}
	}
	sql, _, err := CompileReadQuery(domain.ReadQuery{Dataset: "product_variants"}, testMerchantID, testShopID, true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sql, "original_price") {
		t.Fatal("default staff projection leaks cost")
	}
}
func TestReadCatalogHasNoUserOrCredentialProjections(t *testing.T) {
	r := Repository{}
	for _, staff := range []bool{false, true} {
		catalog := r.ReadCatalog(staff)
		if len(catalog) < 90 {
			t.Fatalf("catalog unexpectedly narrow: %d", len(catalog))
		}
		for _, d := range catalog {
			if strings.HasPrefix(d.Name, "user_") || strings.Contains(d.Name, "token") {
				t.Fatal("sensitive dataset exposed", d.Name)
			}
			for _, c := range d.Columns {
				for _, bad := range []string{"password", "secret", "token", "membership", "identity", "credential", "metadata", "payload", "configuration"} {
					if strings.Contains(c.Name, bad) {
						t.Errorf("sensitive column exposed %s.%s", d.Name, c.Name)
					}
				}
			}
			if _, _, err := CompileReadQuery(domain.ReadQuery{Dataset: d.Name}, testMerchantID, testShopID, staff); err != nil {
				t.Errorf("invalid catalog dataset %s: %v", d.Name, err)
			}
		}
	}
}
func TestAggregatesCannotMixCurrencies(t *testing.T) {
	sql, _, err := CompileReadQuery(domain.ReadQuery{Dataset: "orders", Aggregates: []domain.ReadAggregate{{Function: "sum", Column: "grand_total"}, {Function: "count"}}}, testMerchantID, testShopID, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sql, "GROUP BY currency_code") || !strings.Contains(sql, "sum(grand_total) AS sum_grand_total") {
		t.Fatal("missing currency grouping", sql)
	}
}
