package postgres

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	commentRegex    = regexp.MustCompile(`(?s)/\*.*?\*/|--[^\r\n]*`)
	whitespaceRegex = regexp.MustCompile(`\s+`)
	startsValid     = regexp.MustCompile(`^(?i)(SELECT|WITH)\b`)

	// Disallowed SQL tokens that could mutate state, chain commands, execute administrative commands,
	// or access authentication, credentials, and system tables
	disallowedTokens = []string{
		// DDL & DML Mutations
		"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
		"CREATE", "REPLACE", "GRANT", "REVOKE", "SET", "EXEC",
		"EXECUTE", "CALL", "COPY", "INTO", "LOCK", "VACUUM",
		"MERGE", "UPSERT", "DO", "PREPARE", "DEALLOCATE",

		// Auth, Credential, and Audit Tables / Columns
		"user_identities", "password_hash", "refresh_tokens", "schema_migrations",
		"audit_logs", "admins", "admin_identities",

		// System Catalogs & Introspection
		"pg_catalog", "information_schema", "pg_tables", "pg_stat", "pg_user",
		"pg_shadow", "pg_roles", "pg_authid", "pg_proc", "pg_class", "pg_database",
		"pg_settings", "current_setting", "set_config",

		// Dangerous PostgreSQL Extension Functions
		"pg_read_file", "pg_write_file", "pg_ls_dir", "dblink", "query_to_xml",
	}

	// Confidential business metric tokens that staff members are strictly forbidden from accessing
	staffDisallowedTokens = []string{
		"original_price",
		"cost_price",
		"purchase_price",
		"buy_price",
		"cogs",
		"gross_profit",
		"net_profit",
		"profit",
		"margin",
		"markup",
		"purchase_orders",
		"purchase_order_lines",
	}

	// Pattern detecting negation operators on merchant_id
	merchantNegationRegex = regexp.MustCompile(`(?i)\bmerchant_id\s*(!=|<>|\bNOT\s+IN\b|\bIS\s+NOT\b)`)

	// Pattern detecting SQL tautologies intended to bypass WHERE clauses
	tautologyRegex = regexp.MustCompile(`(?i)\bOR\s+(?:1\s*=\s*1|true|'[^']+'\s*=\s*'[^']+')\b`)

	// Regex to extract table references following FROM or JOIN
	tableRefRegex = regexp.MustCompile(`(?i)\b(?:FROM|JOIN)\s+([a-zA-Z0-9_.]+)`)

	// Regex to extract CTE names defined in WITH clauses
	cteNameRegex = regexp.MustCompile(`(?i)(?:\bWITH\s+|\,\s*)([a-zA-Z0-9_]+)\s+AS\s*\(`)
)

// Allowed operational tables whitelist for merchant queries
var allowedOperationalTables = map[string]bool{
	"products":                              true,
	"product_variants":                      true,
	"product_prices":                        true,
	"product_categories":                    true,
	"product_images":                        true,
	"catalog_variant_images":                true,
	"categories":                            true,
	"brands":                                true,
	"variant_attributes":                    true,
	"variant_attribute_values":              true,
	"price_lists":                           true,
	"orders":                                true,
	"order_lines":                           true,
	"order_items":                           true,
	"payments":                              true,
	"payment_types":                         true,
	"payment_type_categories":               true,
	"payment_settings":                      true,
	"refunds":                               true,
	"inventory_balances":                    true,
	"inventory_movements":                   true,
	"inventory_cost_layers":                 true,
	"inventory_cost_allocations":            true,
	"storage_locations":                     true,
	"storage_zones":                         true,
	"stock_assets":                          true,
	"locations":                             true,
	"shops":                                 true,
	"customers":                             true,
	"customer_addresses":                    true,
	"deliveries":                            true,
	"invoices":                              true,
	"promotions":                            true,
	"suppliers":                             true,
	"purchase_orders":                       true,
	"purchase_order_lines":                  true,
	"goods_receipts":                        true,
	"goods_receipt_lines":                   true,
	"fulfillments":                          true,
	"fulfillment_lines":                     true,
	"repairs":                               true,
	"repair_orders":                         true,
	"repair_items":                          true,
	"repair_presets":                        true,
	"repair_catalog":                        true,
	"repair_drafts":                         true,
	"repair_devices":                        true,
	"repair_diagnostics":                    true,
	"repair_order_parts":                    true,
	"repair_approvals":                      true,
	"repair_warranties":                     true,
	"repair_order_images":                   true,
	"repair_payment_allocations":            true,
	"service_orders":                        true,
	"service_order_work_items":              true,
	"service_order_items":                   true,
	"service_order_attachments":             true,
	"repair_work_item_devices":              true,
	"service_work_item_payment_allocations": true,
	"units":                                 true,
	"unit_conversions":                      true,
	"merchants":                             true,
}

var (
	disallowedRegexes      []*regexp.Regexp
	staffDisallowedRegexes []*regexp.Regexp
)

func init() {
	disallowedRegexes = make([]*regexp.Regexp, len(disallowedTokens))
	for i, token := range disallowedTokens {
		disallowedRegexes[i] = regexp.MustCompile(fmt.Sprintf(`(?i)\b%s\b`, token))
	}

	staffDisallowedRegexes = make([]*regexp.Regexp, len(staffDisallowedTokens))
	for i, token := range staffDisallowedTokens {
		staffDisallowedRegexes[i] = regexp.MustCompile(fmt.Sprintf(`(?i)\b%s\b`, token))
	}
}

// ValidateReadOnlyQuery checks that the query:
// 1. Is strictly a SELECT or WITH ... SELECT statement.
// 2. Contains no disallowed mutating or credential-access keywords.
// 3. Contains no multiple statements (no semicolons).
// 4. References only allowed operational tables from the whitelist (or local CTEs).
// 5. Scopes to the provided merchantID and contains no merchant_id negation or tautological bypasses.
// 6. If caller is staff (isStaff == true), strictly blocks confidential metrics (profit, original_price, cost_price).
// 7. Is within safe length limits (max 4096 chars).
func ValidateReadOnlyQuery(rawSQL string, merchantID string, isStaff bool) (string, error) {
	if len(rawSQL) > 4096 {
		return "", errors.New("query exceeds maximum allowed length of 4096 characters")
	}

	// Remove comments
	cleaned := commentRegex.ReplaceAllString(rawSQL, " ")
	cleaned = strings.TrimSpace(cleaned)

	if cleaned == "" {
		return "", errors.New("query is empty")
	}

	// Reject semicolons to prevent multi-statement execution
	if strings.Contains(cleaned, ";") {
		// Allow trailing semicolon if it's strictly at the end
		trimmed := strings.TrimRight(cleaned, "; \t\r\n")
		if strings.Contains(trimmed, ";") {
			return "", errors.New("multiple SQL statements separated by semicolons are strictly prohibited")
		}
		cleaned = trimmed
	}

	// Must begin with SELECT or WITH
	if !startsValid.MatchString(cleaned) {
		return "", errors.New("only SELECT queries (or WITH queries) are permitted")
	}

	// Check for any disallowed keyword (mutations, system tables, credentials)
	for _, reg := range disallowedRegexes {
		if reg.MatchString(cleaned) {
			return "", fmt.Errorf("query contains disallowed token '%s': forbidden for security and privacy", reg.String())
		}
	}

	// If caller is staff, enforce strict confidentiality blocklist (profit, original_price, cost_price)
	if isStaff {
		for _, reg := range staffDisallowedRegexes {
			if reg.MatchString(cleaned) {
				return "", fmt.Errorf("access to confidential business metric '%s' (profit and original cost price) is restricted to merchant owners", reg.String())
			}
		}
	}

	// Check for merchant_id negation attempt (e.g. merchant_id != '...', merchant_id NOT IN, etc.)
	if merchantNegationRegex.MatchString(cleaned) {
		return "", errors.New("query contains negated merchant_id filter: unauthorized cross-tenant attempt")
	}

	// Check for SQL tautologies (e.g. OR 1=1)
	if tautologyRegex.MatchString(cleaned) {
		return "", errors.New("query contains disallowed logical tautology (e.g. OR 1=1)")
	}

	// If a merchantID is provided, verify query contains the merchantID literal
	if merchantID != "" {
		if !strings.Contains(cleaned, merchantID) {
			return "", fmt.Errorf("query must be strictly scoped to current merchant ID '%s'", merchantID)
		}
	}

	// Discover any local CTE names defined in the query
	cteMatches := cteNameRegex.FindAllStringSubmatch(cleaned, -1)
	localCTEs := make(map[string]bool)
	for _, match := range cteMatches {
		if len(match) > 1 {
			localCTEs[strings.ToLower(match[1])] = true
		}
	}

	// Verify all referenced tables are in the allowed operational tables whitelist or are local CTEs
	tableMatches := tableRefRegex.FindAllStringSubmatch(cleaned, -1)
	for _, match := range tableMatches {
		if len(match) > 1 {
			tableName := strings.ToLower(match[1])
			// Strip optional schema prefix (e.g. public.products -> products)
			if parts := strings.Split(tableName, "."); len(parts) > 1 {
				tableName = parts[len(parts)-1]
			}
			if !allowedOperationalTables[tableName] && !localCTEs[tableName] {
				return "", fmt.Errorf("table '%s' is not in the allowed operational tables whitelist", tableName)
			}
		}
	}

	// Normalize spaces
	normalized := whitespaceRegex.ReplaceAllString(cleaned, " ")
	return normalized, nil
}
