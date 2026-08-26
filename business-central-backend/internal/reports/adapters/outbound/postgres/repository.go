package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/reports/application/dto"
	"business-central-backend/internal/reports/ports/outbound"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ outbound.Repository = (*Repository)(nil)

func begin(ctx context.Context, pool *pgxpool.Pool, claims *authdto.Claims) (pgx.Tx, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)", claims.IdentityID, claims.MerchantID); err != nil {
		tx.Rollback(ctx)
		return nil, err
	}
	return tx, nil
}

func orderScope(claims *authdto.Claims, query app.ListQuery, alias string) (string, []any) {
	where := []string{alias + ".merchant_id = $1", alias + ".status NOT IN ('DRAFT','CANCELLED')"}
	args := []any{claims.MerchantID}
	add := func(expression string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(expression, len(args)))
	}
	if claims.MembershipID != "" {
		add(`EXISTS(SELECT 1 FROM user_memberships um
                    LEFT JOIN locations scope_location ON scope_location.merchant_id=`+alias+`.merchant_id AND scope_location.id=`+alias+`.fulfillment_location_id
                    LEFT JOIN service_orders scope_service ON scope_service.merchant_id=`+alias+`.merchant_id AND scope_service.order_id=`+alias+`.id
                   WHERE um.merchant_id=`+alias+`.merchant_id AND um.id=$%d
                     AND (um.shop_id IS NULL OR COALESCE(scope_service.shop_id,scope_location.shop_id)=um.shop_id))`, claims.MembershipID)
	}
	if raw := query.Filter("from"); raw != "" {
		if value, err := time.Parse(time.RFC3339, raw); err == nil {
			add(alias+".created_at >= $%d", value)
		}
	}
	if raw := query.Filter("to"); raw != "" {
		if value, err := time.Parse(time.RFC3339, raw); err == nil {
			add(alias+".created_at < $%d", value)
		}
	}
	if value := query.Filter("channel"); value != "" {
		add(alias+".channel = $%d", value)
	}
	if value := query.Filter("status"); value != "" {
		where[1] = alias + ".status = $" + fmt.Sprint(len(args)+1)
		args = append(args, value)
	}
	if value := query.Filter("shop_id"); value != "" {
		expression := `EXISTS(SELECT 1 FROM locations report_location
                    LEFT JOIN service_orders report_service ON report_service.merchant_id=` + alias + `.merchant_id AND report_service.order_id=` + alias + `.id
                   WHERE report_location.merchant_id=` + alias + `.merchant_id
                     AND report_location.id=` + alias + `.fulfillment_location_id
                     AND COALESCE(report_service.shop_id,report_location.shop_id)=$%d
                  UNION ALL
                  SELECT 1 FROM service_orders report_service_only
                   WHERE report_service_only.merchant_id=` + alias + `.merchant_id
                     AND report_service_only.order_id=` + alias + `.id
	                     AND report_service_only.shop_id=$%d)`
		args = append(args, value, value)
		where = append(where, fmt.Sprintf(expression, len(args)-1, len(args)))
	}
	return strings.Join(where, " AND "), args
}

func filterTime(query app.ListQuery, name string) *time.Time {
	value, err := time.Parse(time.RFC3339, query.Filter(name))
	if err != nil {
		return nil
	}
	utc := value.UTC()
	return &utc
}

func (r *Repository) SalesSummary(ctx context.Context, claims *authdto.Claims, query app.ListQuery) (dto.SalesSummary, error) {
	where, args := orderScope(claims, query, "o")
	tx, err := begin(ctx, r.pool, claims)
	if err != nil {
		return dto.SalesSummary{}, err
	}
	defer tx.Rollback(ctx)
	statement := `WITH sales AS (
        SELECT COUNT(DISTINCT o.id) AS order_count,
               COUNT(DISTINCT o.id) FILTER (WHERE o.channel='POS') AS pos_order_count,
               COUNT(DISTINCT o.id) FILTER (WHERE o.channel='SERVICE' AND o.status='FULFILLED') AS repair_count,
               COALESCE(SUM(ol.quantity),0) AS item_quantity,
               COALESCE(SUM(ol.quantity * ol.unit_price),0) AS gross_sales,
               COALESCE(SUM(ol.discount_amount),0) AS discounts,
               COALESCE(SUM(ol.tax_amount),0) AS tax,
               COALESCE(SUM(ol.line_total),0) AS net_sales
          FROM orders o JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id
         WHERE ` + where + `),
    refunds AS (
        SELECT COALESCE(SUM(r.amount),0) AS refunds
          FROM refunds r JOIN orders o ON o.merchant_id=r.merchant_id AND o.id=r.order_id
         WHERE ` + where + ` AND r.status='SUCCEEDED'
    ), costs AS (
        SELECT COALESCE(SUM(a.total_cost),0) AS cogs
          FROM inventory_cost_allocations a
          JOIN inventory_movements m ON m.merchant_id=a.merchant_id AND m.id=a.consumption_movement_id
          JOIN order_lines ol ON ol.merchant_id=m.merchant_id AND ol.id=m.order_line_id
          JOIN orders o ON o.merchant_id=ol.merchant_id AND o.id=ol.order_id
         WHERE ` + where + `)
    SELECT sales.order_count, sales.pos_order_count, sales.repair_count, sales.item_quantity, sales.gross_sales, sales.discounts,
           sales.tax, sales.net_sales, refunds.refunds, costs.cogs,
           sales.net_sales-refunds.refunds-costs.cogs AS gross_profit,
           CASE WHEN sales.net_sales-refunds.refunds = 0 THEN 0
                ELSE ROUND(((sales.net_sales-refunds.refunds-costs.cogs) /
                            (sales.net_sales-refunds.refunds))*100, 2) END AS gross_margin
      FROM sales CROSS JOIN refunds CROSS JOIN costs`
	var result dto.SalesSummary
	err = tx.QueryRow(ctx, statement, args...).Scan(&result.OrderCount, &result.POSOrderCount, &result.RepairCount, &result.ItemQuantity, &result.GrossSales, &result.Discounts, &result.Tax, &result.NetSales, &result.Refunds, &result.CostOfGoodsSold, &result.GrossProfit, &result.GrossMargin)
	result.From = filterTime(query, "from")
	result.To = filterTime(query, "to")
	if err == nil {
		err = tx.Commit(ctx)
	}
	return result, err
}

func (r *Repository) SalesByDay(ctx context.Context, claims *authdto.Claims, query app.ListQuery) ([]dto.SalesByDay, int, error) {
	where, args := orderScope(claims, query, "o")
	tx, err := begin(ctx, r.pool, claims)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	countSQL := `SELECT COUNT(*) FROM (SELECT DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC') FROM orders o WHERE ` + where + ` GROUP BY 1) days`
	var total int
	if err := tx.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	base := `WITH sales AS (
        SELECT DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC') AS day,
               COUNT(DISTINCT o.id) AS order_count,
               COALESCE(SUM(ol.quantity),0) AS item_quantity,
               COALESCE(SUM(ol.line_total),0) AS net_sales
          FROM orders o JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id
         WHERE ` + where + ` GROUP BY 1
    ), refunds_by_day AS (
        SELECT DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC') AS day,
               COALESCE(SUM(rf.amount),0) AS refunds
          FROM orders o JOIN refunds rf ON rf.merchant_id=o.merchant_id AND rf.order_id=o.id
         WHERE ` + where + ` AND rf.status='SUCCEEDED' GROUP BY 1
    ), costs_by_day AS (
        SELECT DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC') AS day,
               COALESCE(SUM(a.total_cost),0) AS cogs
          FROM orders o
          JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id
          JOIN inventory_movements m ON m.merchant_id=ol.merchant_id AND m.order_line_id=ol.id
          JOIN inventory_cost_allocations a ON a.merchant_id=m.merchant_id AND a.consumption_movement_id=m.id
         WHERE ` + where + ` GROUP BY 1
    )
    SELECT s.day, s.order_count, s.item_quantity, s.net_sales,
           COALESCE(r.refunds,0), COALESCE(c.cogs,0),
           s.net_sales-COALESCE(r.refunds,0)-COALESCE(c.cogs,0)
      FROM sales s LEFT JOIN refunds_by_day r ON r.day=s.day
                   LEFT JOIN costs_by_day c ON c.day=s.day
     ORDER BY s.day DESC LIMIT $` + fmt.Sprint(len(args)+1) + ` OFFSET $` + fmt.Sprint(len(args)+2)
	args = append(args, query.PageSize, query.PageIndex*query.PageSize)
	rows, err := tx.Query(ctx, base, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []dto.SalesByDay{}
	for rows.Next() {
		var item dto.SalesByDay
		if err := rows.Scan(&item.Day, &item.OrderCount, &item.ItemQuantity, &item.NetSales, &item.Refunds, &item.CostOfGoodsSold, &item.GrossProfit); err != nil {
			return nil, 0, err
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return result, total, nil
}

func (r *Repository) TopProducts(ctx context.Context, claims *authdto.Claims, query app.ListQuery) ([]dto.TopProduct, int, error) {
	where, args := orderScope(claims, query, "o")
	tx, err := begin(ctx, r.pool, claims)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	search := ""
	if query.Search != "" {
		args = append(args, "%"+query.Search+"%")
		search = " AND (p.name ILIKE $" + fmt.Sprint(len(args)) + " OR v.name ILIKE $" + fmt.Sprint(len(args)) + " OR v.sku ILIKE $" + fmt.Sprint(len(args)) + ")"
	}
	countSQL := `SELECT COUNT(*) FROM (SELECT ol.variant_id FROM orders o JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id JOIN product_variants v ON v.merchant_id=ol.merchant_id AND v.id=ol.variant_id JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id WHERE ` + where + ` AND ol.variant_id IS NOT NULL` + search + ` GROUP BY ol.variant_id) x`
	var total int
	if err := tx.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	base := `WITH sales AS (
        SELECT p.id AS product_id, v.id AS variant_id, p.name AS product_name,
               v.name AS variant_name, v.sku,
               COALESCE(SUM(ol.quantity),0) AS item_quantity,
               COALESCE(SUM(ol.line_total),0) AS net_sales
          FROM orders o JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id
          JOIN product_variants v ON v.merchant_id=ol.merchant_id AND v.id=ol.variant_id
          JOIN products p ON p.merchant_id=v.merchant_id AND p.id=v.product_id
         WHERE ` + where + ` AND ol.variant_id IS NOT NULL` + search + `
         GROUP BY p.id,v.id,p.name,v.name,v.sku
    ), costs AS (
        SELECT ol.variant_id, COALESCE(SUM(a.total_cost),0) AS cogs
          FROM orders o
          JOIN order_lines ol ON ol.merchant_id=o.merchant_id AND ol.order_id=o.id
          JOIN inventory_movements m ON m.merchant_id=ol.merchant_id AND m.order_line_id=ol.id
          JOIN inventory_cost_allocations a ON a.merchant_id=m.merchant_id AND a.consumption_movement_id=m.id
         WHERE ` + where + ` AND ol.variant_id IS NOT NULL
         GROUP BY ol.variant_id
    )
    SELECT s.product_id,s.variant_id,s.product_name,s.variant_name,s.sku,s.item_quantity,s.net_sales,
           COALESCE(c.cogs,0),s.net_sales-COALESCE(c.cogs,0)
      FROM sales s LEFT JOIN costs c ON c.variant_id=s.variant_id
     ORDER BY s.net_sales DESC LIMIT $` + fmt.Sprint(len(args)+1) + ` OFFSET $` + fmt.Sprint(len(args)+2)
	args = append(args, query.PageSize, query.PageIndex*query.PageSize)
	rows, err := tx.Query(ctx, base, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	result := []dto.TopProduct{}
	for rows.Next() {
		var item dto.TopProduct
		if err := rows.Scan(&item.ProductID, &item.VariantID, &item.ProductName, &item.VariantName, &item.SKU, &item.ItemQuantity, &item.NetSales, &item.CostOfGoodsSold, &item.GrossProfit); err != nil {
			return nil, 0, err
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return result, total, nil
}
