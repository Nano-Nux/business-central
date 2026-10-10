package postgres

// These joins and calculations are authored by the backend, never by the model.
func init() {
	dOrder := datasets["orders"]
	dOrder.columns = append(dOrder.columns,
		column{Name: "customer_name", Type: "text", expression: "COALESCE(t.billing_address->>'name',(SELECT c.display_name FROM customers c WHERE c.merchant_id=t.merchant_id AND c.id=t.customer_id))"},
		column{Name: "customer_phone", Type: "text", expression: "COALESCE(t.billing_address->>'phone',(SELECT c.phone FROM customers c WHERE c.merchant_id=t.merchant_id AND c.id=t.customer_id))"})
	datasets["orders"] = dOrder
	productName := "(SELECT p.name FROM products p WHERE p.merchant_id=t.merchant_id AND p.id=t.product_id)"
	d := datasets["product_variants"]
	d.columns = append(d.columns, column{Name: "product_name", Type: "text", expression: productName})
	datasets["product_variants"] = d
	for _, name := range []string{"product_prices", "inventory_balances", "inventory_assets", "order_lines"} {
		d := datasets[name]
		d.columns = append(d.columns,
			column{Name: "product_name", Type: "text", expression: "(SELECT p.name FROM product_variants v JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id WHERE v.merchant_id=t.merchant_id AND v.id=t.variant_id)"},
			column{Name: "variant_name", Type: "text", expression: "(SELECT v.name FROM product_variants v WHERE v.merchant_id=t.merchant_id AND v.id=t.variant_id)"},
			column{Name: "sku", Type: "text", expression: "(SELECT v.sku FROM product_variants v WHERE v.merchant_id=t.merchant_id AND v.id=t.variant_id)"})
		if name == "product_prices" {
			d.columns = append(d.columns, column{Name: "is_default", Type: "boolean", expression: "(SELECT p.is_default FROM price_lists p WHERE p.merchant_id=t.merchant_id AND p.id=t.price_list_id)"})
		}
		if name == "inventory_balances" {
			d.columns = append(d.columns, column{Name: "available", Type: "number", expression: "t.quantity_on_hand-t.quantity_reserved"})
		}
		datasets[name] = d
	}
	cost := "COALESCE((SELECT SUM(a.total_cost) FROM order_lines ol JOIN inventory_movements im ON im.merchant_id=ol.merchant_id AND im.order_line_id=ol.id AND im.movement_type='SALE' JOIN inventory_cost_allocations a ON a.merchant_id=im.merchant_id AND a.consumption_movement_id=im.id WHERE ol.merchant_id=t.merchant_id AND ol.order_id=t.id),0)"
	missing := "(SELECT COUNT(*) FROM order_lines ol JOIN product_variants v ON v.merchant_id=ol.merchant_id AND v.id=ol.variant_id WHERE ol.merchant_id=t.merchant_id AND ol.order_id=t.id AND v.is_stock_tracked AND NOT EXISTS (SELECT 1 FROM inventory_movements im JOIN inventory_cost_allocations a ON a.merchant_id=im.merchant_id AND a.consumption_movement_id=im.id WHERE im.merchant_id=ol.merchant_id AND im.order_line_id=ol.id AND im.movement_type='SALE'))"
	compatible := "t.currency_code=(SELECT mc.default_currency_code FROM merchants mc WHERE mc.id=t.merchant_id)"
	datasets["sales_profit"] = dataset{from: "orders t", scope: orderScope("t.id") + " AND t.status NOT IN ('DRAFT','CANCELLED','REFUNDED')", ownerOnly: true, columns: []column{
		{Name: "id", Type: "uuid"}, {Name: "order_number", Type: "text"}, {Name: "created_at", Type: "date"}, {Name: "currency_code", Type: "text"},
		{Name: "revenue", Type: "number", Monetary: true, expression: "t.grand_total-t.shipping_total"},
		{Name: "cost", Type: "number", Monetary: true, expression: "CASE WHEN " + compatible + " THEN " + cost + " ELSE NULL END"},
		{Name: "gross_profit", Type: "number", Monetary: true, expression: "CASE WHEN " + compatible + " THEN t.grand_total-t.shipping_total-(" + cost + ") ELSE NULL END"},
		{Name: "missing_cost_lines", Type: "number", expression: missing},
		{Name: "incompatible_currency_orders", Type: "number", expression: "CASE WHEN " + compatible + " THEN 0 ELSE 1 END"},
	}}
}
