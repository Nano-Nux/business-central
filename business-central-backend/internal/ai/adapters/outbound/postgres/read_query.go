package postgres

import (
	"business-central-backend/internal/ai/domain"
	"fmt"
	"github.com/google/uuid"
	"regexp"
	"sort"
	"strings"
	"time"
)

type column struct {
	Name       string
	Type       string
	Monetary   bool
	ownerOnly  bool
	expression string // trusted projection, never supplied by the model
}
type dataset struct {
	from      string
	scope     string
	shared    bool
	ownerOnly bool
	module    string
	columns   []column
}

func locationScope(id string) string {
	return "EXISTS (SELECT 1 FROM locations sl WHERE sl.merchant_id=t.merchant_id AND sl.id=" + id + " AND sl.shop_id=$2::uuid)"
}
func orderScope(id string) string {
	return "EXISTS (SELECT 1 FROM orders so LEFT JOIN locations ol ON ol.merchant_id=so.merchant_id AND ol.id=so.fulfillment_location_id WHERE so.merchant_id=t.merchant_id AND so.id=" + id + " AND (ol.shop_id=$2::uuid OR (so.fulfillment_location_id IS NULL AND EXISTS (SELECT 1 FROM service_orders ss WHERE ss.merchant_id=so.merchant_id AND ss.order_id=so.id AND ss.shop_id=$2::uuid))))"
}
func customerScope(id string) string {
	return "(EXISTS (SELECT 1 FROM orders co JOIN locations cl ON cl.merchant_id=co.merchant_id AND cl.id=co.fulfillment_location_id WHERE co.merchant_id=t.merchant_id AND co.customer_id=" + id + " AND cl.shop_id=$2::uuid) OR EXISTS (SELECT 1 FROM service_orders cs WHERE cs.merchant_id=t.merchant_id AND cs.customer_id=" + id + " AND cs.shop_id=$2::uuid))"
}
func serviceScope(id string) string {
	return "EXISTS (SELECT 1 FROM service_orders ss WHERE ss.merchant_id=t.merchant_id AND ss.id=" + id + " AND ss.shop_id=$2::uuid)"
}
func repairScope(id string) string {
	return "EXISTS (SELECT 1 FROM repair_orders rr JOIN service_orders rs ON rs.merchant_id=rr.merchant_id AND rs.id=rr.service_order_id WHERE rr.merchant_id=t.merchant_id AND rr.id=" + id + " AND rs.shop_id=$2::uuid)"
}
func workItemScope(id string) string {
	return "EXISTS (SELECT 1 FROM service_order_work_items wi JOIN service_orders ws ON ws.merchant_id=wi.merchant_id AND ws.id=wi.service_order_id WHERE wi.merchant_id=t.merchant_id AND wi.id=" + id + " AND ws.shop_id=$2::uuid)"
}
func purchaseScope(id string) string {
	return "EXISTS (SELECT 1 FROM purchase_orders po JOIN locations pl ON pl.merchant_id=po.merchant_id AND pl.id=po.destination_location_id WHERE po.merchant_id=t.merchant_id AND po.id=" + id + " AND pl.shop_id=$2::uuid)"
}
func movementScope(id string) string {
	return "EXISTS (SELECT 1 FROM inventory_movements sm JOIN locations ml ON ml.merchant_id=sm.merchant_id AND ml.id=COALESCE(sm.source_location_id,sm.destination_location_id) WHERE sm.merchant_id=t.merchant_id AND sm.id=" + id + " AND ml.shop_id=$2::uuid)"
}
func storeScope(id string) string {
	return "EXISTS (SELECT 1 FROM ecommerce_stores es WHERE es.merchant_id=t.merchant_id AND es.id=" + id + " AND es.shop_id=$2::uuid)"
}

func allowedColumns(d dataset, isStaff bool) []column {
	out := make([]column, 0, len(d.columns)+1)
	hasCurrency := false
	for _, c := range d.columns {
		if c.Name == "currency_code" {
			hasCurrency = true
		}
		if !isStaff || !c.ownerOnly {
			out = append(out, c)
		}
	}
	if !hasCurrency {
		// These tables have amounts in the merchant base currency. Price-list-based
		// prices and order-linked amounts get their recorded currency below.
		expr := "(SELECT mc.default_currency_code FROM merchants mc WHERE mc.id=t.merchant_id)"
		switch {
		case d.from == "product_prices t" || d.from == "service_prices t":
			expr = "(SELECT pc.currency_code FROM price_lists pc WHERE pc.merchant_id=t.merchant_id AND pc.id=t.price_list_id)"
		case d.from == "payments t" || d.from == "order_lines t" || d.from == "refunds t" || d.from == "accounts_receivable_documents t" || d.from == "ecommerce_order_discounts t":
			expr = "(SELECT oc.currency_code FROM orders oc WHERE oc.merchant_id=t.merchant_id AND oc.id=t.order_id)"
		case d.from == "purchase_order_lines t" || d.from == "supplier_invoices t":
			expr = "(SELECT pc.currency_code FROM purchase_orders pc WHERE pc.merchant_id=t.merchant_id AND pc.id=t.purchase_order_id)"
		case d.from == "cash_transactions t":
			expr = "(SELECT cc.currency_code FROM cash_accounts cc WHERE cc.merchant_id=t.merchant_id AND cc.id=t.cash_account_id)"
		}
		out = append(out, column{Name: "currency_code", Type: "text", expression: expr})
	}
	return out
}
func (r *Repository) ReadCatalog(isStaff bool) []domain.ReadDataset {
	names := make([]string, 0, len(datasets))
	for name, d := range datasets {
		if !isStaff || !d.ownerOnly {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	out := make([]domain.ReadDataset, 0, len(names))
	for _, name := range names {
		d := datasets[name]
		scope := "shop"
		if d.shared {
			scope = "merchant shared reference"
		}
		cols := []domain.ReadColumn{}
		for _, c := range allowedColumns(d, isStaff) {
			cols = append(cols, domain.ReadColumn{Name: c.Name, Type: c.Type, Monetary: c.Monetary})
		}
		out = append(out, domain.ReadDataset{Name: name, Scope: scope, Columns: cols})
	}
	return out
}

var numberValue = regexp.MustCompile(`^-?[0-9]{1,20}(?:\.[0-9]{1,6})?$`)

// CompileReadQuery translates only finite choices into SQL. It has no raw SQL,
// expression, join, function, schema, alias, OR, or scope escape hatch.
func CompileReadQuery(q domain.ReadQuery, merchantID, shopID string, isStaff bool) (string, []any, error) {
	if _, err := uuid.Parse(merchantID); err != nil {
		return "", nil, fmt.Errorf("invalid merchant scope")
	}
	if _, err := uuid.Parse(shopID); err != nil {
		return "", nil, fmt.Errorf("invalid shop scope")
	}
	d, ok := datasets[q.Dataset]
	if !ok {
		return "", nil, fmt.Errorf("dataset is not available")
	}
	if isStaff && d.ownerOnly {
		return "", nil, fmt.Errorf("confidential data is restricted to merchant owners")
	}
	if len(q.Columns) > 24 || len(q.Filters) > 16 || len(q.Aggregates) > 8 || len(q.GroupBy) > 6 || len(q.OrderBy) > 4 || q.Limit < 0 || q.Limit > 100 {
		return "", nil, fmt.Errorf("read request exceeds allowed bounds")
	}
	cols := allowedColumns(d, isStaff)
	lookup := map[string]column{}
	projections := []string{}
	for _, c := range cols {
		lookup[c.Name] = c
		expr := c.expression
		if expr == "" {
			expr = "t." + c.Name
		}
		projections = append(projections, expr+" AS "+c.Name)
	}
	args := []any{merchantID, shopID}
	base := "SELECT " + strings.Join(projections, ",") + " FROM " + d.from + " WHERE t.merchant_id=$1::uuid AND EXISTS (SELECT 1 FROM shops active_shop WHERE active_shop.merchant_id=$1::uuid AND active_shop.id=$2::uuid AND active_shop.is_active) AND (" + d.scope + ")"
	if d.module != "" {
		args = append(args, d.module)
		base += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM merchant_modules mm JOIN shop_modules sm ON sm.merchant_id=mm.merchant_id AND sm.module_code=mm.module_code WHERE mm.merchant_id=$1::uuid AND sm.shop_id=$2::uuid AND mm.module_code=$%d::text AND mm.status='ENABLED')", len(args))
	}
	where := []string{}
	for _, f := range q.Filters {
		c, ok := lookup[f.Column]
		if !ok {
			return "", nil, fmt.Errorf("filter column is not available")
		}
		if len(f.Value) > 500 {
			return "", nil, fmt.Errorf("filter value exceeds allowed length")
		}
		if f.Operator == "is_null" || f.Operator == "not_null" {
			op := " IS NULL"
			if f.Operator == "not_null" {
				op = " IS NOT NULL"
			}
			where = append(where, f.Column+op)
			continue
		}
		cast := "text"
		switch c.Type {
		case "number":
			if !numberValue.MatchString(f.Value) {
				return "", nil, fmt.Errorf("invalid numeric filter")
			}
			cast = "numeric"
		case "uuid":
			if _, err := uuid.Parse(f.Value); err != nil {
				return "", nil, fmt.Errorf("invalid identifier filter")
			}
			cast = "uuid"
		case "boolean":
			if f.Value != "true" && f.Value != "false" {
				return "", nil, fmt.Errorf("invalid boolean filter")
			}
			cast = "boolean"
		case "date":
			valid := false
			for _, layout := range []string{time.RFC3339, "2006-01-02", "2006-01-02 15:04:05"} {
				if _, err := time.Parse(layout, f.Value); err == nil {
					valid = true
				}
			}
			if !valid {
				return "", nil, fmt.Errorf("invalid date filter")
			}
			cast = "timestamptz"
		}
		args = append(args, f.Value)
		param := fmt.Sprintf("$%d::text::%s", len(args), cast)
		ops := map[string]string{"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
		if op, ok := ops[f.Operator]; ok {
			where = append(where, f.Column+op+param)
		} else if f.Operator == "contains" && c.Type == "text" {
			where = append(where, "pg_catalog.strpos(pg_catalog.lower("+f.Column+"::text),pg_catalog.lower("+param+"))>0")
		} else {
			return "", nil, fmt.Errorf("filter operator is not available")
		}
	}
	selected := []string{}
	outputs := map[string]bool{}
	group := []string{}
	seen := map[string]bool{}
	addColumn := func(name string) error {
		if _, ok := lookup[name]; !ok {
			return fmt.Errorf("column is not available")
		}
		if seen[name] {
			return fmt.Errorf("duplicate column")
		}
		seen[name] = true
		selected = append(selected, name)
		outputs[name] = true
		return nil
	}
	if len(q.Aggregates) > 0 {
		if len(q.Columns) > 0 {
			return "", nil, fmt.Errorf("use group_by with aggregates, not columns")
		}
		for _, name := range q.GroupBy {
			if err := addColumn(name); err != nil {
				return "", nil, err
			}
			group = append(group, name)
		}
		// Every aggregate result includes currency, preventing mixed-currency sums.
		if !seen["currency_code"] {
			_ = addColumn("currency_code")
			group = append(group, "currency_code")
		}
		aggregates := append([]domain.ReadAggregate(nil), q.Aggregates...)
		if q.Dataset == "sales_profit" {
			for _, required := range []string{"missing_cost_lines", "incompatible_currency_orders"} {
				present := false
				for _, a := range aggregates {
					if a.Function == "sum" && a.Column == required {
						present = true
					}
				}
				if !present {
					aggregates = append(aggregates, domain.ReadAggregate{Function: "sum", Column: required})
				}
			}
		}

		for _, a := range aggregates {
			fn := a.Function
			if fn != "count" && fn != "sum" && fn != "avg" && fn != "min" && fn != "max" {
				return "", nil, fmt.Errorf("aggregate function is not available")
			}
			col := a.Column
			if fn == "count" && col == "" {
				col = "*"
			} else {
				c, ok := lookup[col]
				if !ok || (fn != "count" && c.Type != "number") {
					return "", nil, fmt.Errorf("aggregate column is not available")
				}
			}
			alias := fn
			if col != "*" {
				alias += "_" + col
			}
			if outputs[alias] {
				return "", nil, fmt.Errorf("duplicate aggregate")
			}
			outputs[alias] = true
			selected = append(selected, fn+"("+col+") AS "+alias)
		}
	} else {
		if len(q.GroupBy) > 0 {
			return "", nil, fmt.Errorf("group_by requires aggregates")
		}
		names := q.Columns
		if len(names) == 0 {
			for _, c := range cols {
				names = append(names, c.Name)
			}
		}
		for _, name := range names {
			if err := addColumn(name); err != nil {
				return "", nil, err
			}
		}
		if !seen["currency_code"] {
			_ = addColumn("currency_code")
		}
		if q.Dataset == "sales_profit" {
			for _, required := range []string{"missing_cost_lines", "incompatible_currency_orders"} {
				if !seen[required] {
					_ = addColumn(required)
				}
			}
		}
	}
	sql := "SELECT " + strings.Join(selected, ",") + " FROM (" + base + ") AS scoped_data"
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	if len(group) > 0 {
		sql += " GROUP BY " + strings.Join(group, ",")
	}
	order := []string{}
	for _, o := range q.OrderBy {
		if !outputs[o.Column] {
			return "", nil, fmt.Errorf("order column is not available")
		}
		dir := " ASC"
		if o.Descending {
			dir = " DESC"
		}
		order = append(order, o.Column+dir)
	}
	if len(order) > 0 {
		sql += " ORDER BY " + strings.Join(order, ",")
	}
	limit := q.Limit
	if limit == 0 {
		limit = 100
	}
	args = append(args, limit)
	sql += fmt.Sprintf(" LIMIT $%d::integer", len(args))
	return sql, args, nil
}
