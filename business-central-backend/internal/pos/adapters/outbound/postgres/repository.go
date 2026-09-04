package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	posoutbound "business-central-backend/internal/pos/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ pool *pgxpool.Pool }

func NewService(pool *pgxpool.Pool) *Service { return &Service{pool: pool} }
func ctxSQL(ctx context.Context, tx pgx.Tx, c *authdto.Claims) error {
	_, err := tx.Exec(ctx, `SELECT set_config('app.auth_mode','',true),set_config('app.user_id',$1,true),set_config('app.merchant_id',$2,true)`, c.IdentityID, c.MerchantID)
	return err
}
func valid(v string) bool { return strings.TrimSpace(v) != "" }
func optionalText(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return strings.TrimSpace(*value)
}

func (s *Service) ListLocations(ctx context.Context, c *authdto.Claims) ([]Location, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)) SELECT l.id,l.shop_id,l.code,l.name,l.location_type,l.is_active FROM locations l CROSS JOIN x WHERE l.merchant_id=$1::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid)) ORDER BY l.name`, c.MerchantID, c.IdentityID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Location{}
	for rows.Next() {
		var item Location
		if err := rows.Scan(&item.ID, &item.ShopID, &item.Code, &item.Name, &item.LocationType, &item.IsActive); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) ListCatalog(ctx context.Context, c *authdto.Claims, shopID string) ([]CatalogItem, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS (
		SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)
	) SELECT pv.id,p.id,p.name,pv.name,pv.sku,COALESCE((SELECT br.code FROM barcode_registry br WHERE br.merchant_id=p.merchant_id AND br.product_id=p.id AND br.is_active ORDER BY br.is_primary DESC,br.created_at LIMIT 1),pv.barcode),pv.base_unit_id,
		COALESCE(price.amount,0)::text,COALESCE(price.currency_code,m.default_currency_code),
		COALESCE((SELECT sum(ib.quantity_on_hand) FROM inventory_balances ib JOIN locations il ON il.merchant_id=ib.merchant_id AND il.id=ib.location_id WHERE ib.merchant_id=pv.merchant_id AND ib.variant_id=pv.id AND il.shop_id=COALESCE((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid),NULLIF($4,'')::uuid,il.shop_id)),0)::text,
		pv.is_stock_tracked
	FROM product_variants pv
	JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id
	JOIN merchants m ON m.id=pv.merchant_id
	CROSS JOIN x
	LEFT JOIN LATERAL (
		SELECT pp.amount,pl.currency_code FROM product_prices pp
		JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id
		WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default
		  AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now())
		ORDER BY pp.valid_from DESC LIMIT 1
	) price ON true
		WHERE pv.merchant_id=$1::uuid AND p.is_active AND (NULLIF($4,'')::uuid IS NULL OR EXISTS(SELECT 1 FROM shops s WHERE s.merchant_id=$1::uuid AND s.id=NULLIF($4,'')::uuid AND s.is_active)) ORDER BY p.name,pv.name`, c.MerchantID, c.IdentityID, c.MembershipID, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []CatalogItem{}
	for rows.Next() {
		var item CatalogItem
		if err := rows.Scan(&item.ID, &item.ProductID, &item.ProductName, &item.Name, &item.SKU, &item.Barcode, &item.BaseUnitID, &item.Price, &item.CurrencyCode, &item.QuantityOnHand, &item.IsStockTracked); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) LookupBarcode(ctx context.Context, c *authdto.Claims, barcode, shopID string) ([]CatalogItem, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS (SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)), matches AS (
SELECT br.code,br.product_id,br.variant_id,br.asset_id,br.batch_id,
CASE WHEN br.asset_id IS NOT NULL THEN 'STOCK' WHEN br.variant_id IS NOT NULL THEN 'VARIANT' ELSE 'PRODUCT' END AS match_type
FROM barcode_registry br CROSS JOIN x WHERE br.merchant_id=$1::uuid AND br.normalized_code=lower(trim($4)) AND br.is_active
), resolved AS (
SELECT m.*,COALESCE(m.asset_id,ia.id) AS resolved_asset_id,COALESCE(m.variant_id,ia.variant_id,ib.variant_id,pv.id) AS resolved_variant_id
FROM matches m LEFT JOIN inventory_assets ia ON ia.merchant_id=$1::uuid AND ia.id=m.asset_id LEFT JOIN inventory_batches ib ON ib.merchant_id=$1::uuid AND ib.id=m.batch_id LEFT JOIN product_variants pv ON pv.merchant_id=$1::uuid AND pv.product_id=m.product_id
)
SELECT r.resolved_variant_id,p.id,p.name,pv.name,pv.sku,COALESCE(pv.barcode,r.code),pv.base_unit_id,
COALESCE(price.amount,0)::text,COALESCE(price.currency_code,me.default_currency_code),
COALESCE((SELECT sum(ib2.quantity_on_hand) FROM inventory_balances ib2 JOIN locations il ON il.merchant_id=ib2.merchant_id AND il.id=ib2.location_id WHERE ib2.merchant_id=pv.merchant_id AND ib2.variant_id=pv.id AND (NULLIF($5,'')::uuid IS NULL OR il.shop_id=NULLIF($5,'')::uuid)),0)::text,pv.is_stock_tracked,r.resolved_asset_id,r.match_type
FROM resolved r JOIN product_variants pv ON pv.merchant_id=$1::uuid AND pv.id=r.resolved_variant_id JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id JOIN merchants me ON me.id=pv.merchant_id
LEFT JOIN LATERAL (SELECT pp.amount,pl.currency_code FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now()) ORDER BY pp.valid_from DESC LIMIT 1) price ON true
WHERE p.is_active AND (r.resolved_asset_id IS NULL OR EXISTS (SELECT 1 FROM inventory_assets av JOIN locations al ON al.merchant_id=av.merchant_id AND al.id=av.location_id WHERE av.merchant_id=$1::uuid AND av.id=r.resolved_asset_id AND av.status='ACTIVE' AND (NULLIF($5,'')::uuid IS NULL OR al.shop_id=NULLIF($5,'')::uuid))) ORDER BY p.name,pv.name`, c.MerchantID, c.IdentityID, c.MembershipID, barcode, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []CatalogItem{}
	for rows.Next() {
		var item CatalogItem
		if err := rows.Scan(&item.ID, &item.ProductID, &item.ProductName, &item.Name, &item.SKU, &item.Barcode, &item.BaseUnitID, &item.Price, &item.CurrencyCode, &item.QuantityOnHand, &item.IsStockTracked, &item.StockAssetID, &item.BarcodeMatch); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type saleLine struct {
	variantID, assetID, description, unitID, quantity, unitPrice string
	stockTracked, eligible                                       bool
	gross, discount                                              float64
}

func (s *Service) ListInvoices(ctx context.Context, c *authdto.Claims) ([]Invoice, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT o.id,o.order_number,COALESCE(cu.display_name,'Walk-in customer'),cu.phone,m.name,s.name,s.id,NULLIF(s.address->>'logo_url',''),COALESCE(NULLIF(s.address->>'show_logo_in_printed_invoice','')::boolean,TRUE),o.currency_code,o.created_at,
		CASE WHEN o.status='REFUNDED' THEN 'Refunded' WHEN EXISTS(SELECT 1 FROM payments p WHERE p.merchant_id=o.merchant_id AND p.order_id=o.id AND p.status='CAPTURED') THEN 'Paid' ELSE 'Pending' END,
		CASE WHEN ro_repair.id IS NOT NULL THEN 'repair' WHEN so_service.id IS NOT NULL THEN 'service' ELSE 'pos' END,
		ro_repair.status,ro_repair.payment_status,
		o.subtotal::text,o.discount_total::text,o.tax_total::text,o.grand_total::text,o.delivery_name,o.shipping_total::text,o.delivery_contact,COALESCE(ro_repair.note,o.note),o.payment_type,COALESCE(ps.tax_label,'Tax'),COALESCE(ps.receipt_note,''),COALESCE(s.footer_note,'')
		FROM orders o JOIN merchants m ON m.id=o.merchant_id
		LEFT JOIN customers cu ON cu.merchant_id=o.merchant_id AND cu.id=o.customer_id
		LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
		LEFT JOIN shops s ON s.merchant_id=l.merchant_id AND s.id=l.shop_id
		LEFT JOIN payment_settings ps ON ps.merchant_id=o.merchant_id AND ps.shop_id=s.id
		LEFT JOIN service_orders so_service ON so_service.merchant_id=o.merchant_id AND so_service.order_id=o.id
		LEFT JOIN repair_orders ro_repair ON ro_repair.merchant_id=so_service.merchant_id AND ro_repair.service_order_id=so_service.id
		WHERE o.merchant_id=$1::uuid AND o.status<>'DRAFT'
		AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($2,'')::uuid) IS NULL OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($2,'')::uuid))
		ORDER BY o.created_at DESC LIMIT 500`, c.MerchantID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	invoices := []Invoice{}
	for rows.Next() {
		var invoice Invoice
		if err = rows.Scan(&invoice.ID, &invoice.Number, &invoice.Customer, &invoice.CustomerPhone, &invoice.MerchantName, &invoice.ShopName, &invoice.ShopID, &invoice.ShopLogoURL, &invoice.ShowShopLogo, &invoice.CurrencyCode, &invoice.CreatedAt, &invoice.Status, &invoice.Kind, &invoice.TicketStatus, &invoice.PaymentStatus, &invoice.Subtotal, &invoice.DiscountTotal, &invoice.TaxTotal, &invoice.GrandTotal, &invoice.DeliveryName, &invoice.DeliveryFee, &invoice.DeliveryContact, &invoice.Note, &invoice.PaymentType, &invoice.TaxLabel, &invoice.ReceiptNote, &invoice.FooterNote); err != nil {
			rows.Close()
			return nil, err
		}
		invoices = append(invoices, invoice)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for index := range invoices {
		lineQuery := `SELECT description,quantity::text,unit_price::text,NULL::uuid FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2 ORDER BY line_number`
		if invoices[index].Kind == "repair" {
			lineQuery = `SELECT soi.description,soi.quantity::text,soi.unit_price::text,soi.work_item_id
				FROM service_order_items soi
				JOIN service_orders so ON so.merchant_id=soi.merchant_id AND so.id=soi.service_order_id
				WHERE soi.merchant_id=$1::uuid AND so.order_id=$2::uuid
				ORDER BY soi.id`
		}
		lineRows, lineErr := tx.Query(ctx, lineQuery, c.MerchantID, invoices[index].ID)
		if lineErr != nil {
			return nil, lineErr
		}
		items := []InvoiceLine{}
		for lineRows.Next() {
			var item InvoiceLine
			if lineErr = lineRows.Scan(&item.Name, &item.Quantity, &item.UnitPrice, &item.WorkItemID); lineErr != nil {
				lineRows.Close()
				return nil, lineErr
			}
			items = append(items, item)
		}
		lineErr = lineRows.Err()
		lineRows.Close()
		if lineErr != nil {
			return nil, lineErr
		}
		invoices[index].Items = items
		if invoices[index].Kind == "repair" && len(items) == 0 {
			legacyRows, legacyErr := tx.Query(ctx, `SELECT description,quantity::text,unit_price::text,NULL::uuid FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2 ORDER BY line_number`, c.MerchantID, invoices[index].ID)
			if legacyErr != nil {
				return nil, legacyErr
			}
			for legacyRows.Next() {
				var item InvoiceLine
				if legacyErr = legacyRows.Scan(&item.Name, &item.Quantity, &item.UnitPrice, &item.WorkItemID); legacyErr != nil {
					legacyRows.Close()
					return nil, legacyErr
				}
				invoices[index].Items = append(invoices[index].Items, item)
			}
			legacyErr = legacyRows.Err()
			legacyRows.Close()
			if legacyErr != nil {
				return nil, legacyErr
			}
		}
		workRows, workErr := tx.Query(ctx, `SELECT wi.id,wi.sequence_number,wi.item_type,wi.status,wi.form_version,d.device_type,d.manufacturer,d.model,d.serial_number,wid.issue_description,wid.issues,wid.conditions,wid.notes,
			COALESCE((SELECT jsonb_object_agg(fd.field_code,cfv.value ORDER BY fd.display_order,fd.field_code)
				FROM custom_field_values cfv JOIN custom_field_definitions fd ON fd.merchant_id=cfv.merchant_id AND fd.id=cfv.definition_id
				WHERE cfv.merchant_id=wi.merchant_id AND cfv.entity_type='REPAIR_WORK_ITEM' AND cfv.entity_id=wi.id AND fd.printable), '{}'::jsonb),
			wid.additional_fee::text,wid.waiting_start_date::text,wid.waiting_end_date::text,(wid.waiting_end_date-wid.waiting_start_date)::int,finance.subtotal::text,finance.discount_total::text,finance.tax_amount::text,finance.total::text,finance.paid::text,GREATEST(finance.total-finance.paid,0)::text
			FROM service_orders so JOIN repair_orders ro ON ro.merchant_id=so.merchant_id AND ro.service_order_id=so.id
			JOIN orders o ON o.merchant_id=so.merchant_id AND o.id=so.order_id
			JOIN service_order_work_items wi ON wi.merchant_id=so.merchant_id AND wi.service_order_id=so.id
			JOIN repair_work_item_devices wid ON wid.merchant_id=wi.merchant_id AND wid.work_item_id=wi.id
			JOIN repair_devices d ON d.merchant_id=wid.merchant_id AND d.id=wid.repair_device_id
			JOIN LATERAL (SELECT gross.subtotal,
				ROUND(CASE WHEN COALESCE(o.subtotal,0)>0 THEN COALESCE(o.discount_total,0)*gross.subtotal/o.subtotal ELSE 0 END,2) discount_total,
				ROUND(CASE WHEN COALESCE(o.subtotal,0)>0 THEN COALESCE(o.tax_total,0)*gross.subtotal/o.subtotal ELSE 0 END,2) tax_amount,
				gross.subtotal-ROUND(CASE WHEN COALESCE(o.subtotal,0)>0 THEN COALESCE(o.discount_total,0)*gross.subtotal/o.subtotal ELSE 0 END,2)+ROUND(CASE WHEN COALESCE(o.subtotal,0)>0 THEN COALESCE(o.tax_total,0)*gross.subtotal/o.subtotal ELSE 0 END,2) total,
				ROUND(COALESCE((SELECT SUM(a.amount * GREATEST(p.amount - COALESCE((SELECT SUM(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status='SUCCEEDED'),0),0) / NULLIF(p.amount,0)) FROM service_work_item_payment_allocations a JOIN payments p ON p.merchant_id=a.merchant_id AND p.id=a.payment_id WHERE a.merchant_id=wi.merchant_id AND a.work_item_id=wi.id AND p.status='CAPTURED'),0),2) paid
				FROM LATERAL (SELECT wid.additional_fee+COALESCE((SELECT SUM(item.quantity*item.unit_price) FROM service_order_items item WHERE item.merchant_id=wi.merchant_id AND item.work_item_id=wi.id AND item.status<>'CANCELLED'),0) subtotal) gross) finance ON TRUE
			WHERE so.merchant_id=$1::uuid AND so.order_id=$2::uuid ORDER BY wi.sequence_number`, c.MerchantID, invoices[index].ID)
		if workErr != nil {
			return nil, workErr
		}
		for workRows.Next() {
			var work InvoiceWorkItem
			var issues, conditions json.RawMessage
			if workErr = workRows.Scan(&work.ID, &work.SequenceNumber, &work.Type, &work.Status, &work.FormVersion, &work.DeviceType, &work.Manufacturer, &work.Model, &work.SerialNumber, &work.IssueDescription, &issues, &conditions, &work.Note, &work.Fields, &work.AdditionalFee, &work.WaitingStartDate, &work.WaitingEndDate, &work.WaitingDays, &work.Subtotal, &work.DiscountTotal, &work.TaxAmount, &work.Total, &work.Paid, &work.Balance); workErr != nil {
				workRows.Close()
				return nil, workErr
			}
			if workErr = json.Unmarshal(issues, &work.Issues); workErr != nil {
				workRows.Close()
				return nil, workErr
			}
			if workErr = json.Unmarshal(conditions, &work.Conditions); workErr != nil {
				workRows.Close()
				return nil, workErr
			}
			if len(work.Fields) == 0 {
				work.Fields = json.RawMessage(`{}`)
			}
			invoices[index].WorkItems = append(invoices[index].WorkItems, work)
		}
		workErr = workRows.Err()
		workRows.Close()
		if workErr != nil {
			return nil, workErr
		}
		if len(invoices[index].WorkItems) > 0 {
			invoices[index].WaitingStartDate = invoices[index].WorkItems[0].WaitingStartDate
			invoices[index].WaitingEndDate = invoices[index].WorkItems[0].WaitingEndDate
			for _, work := range invoices[index].WorkItems[1:] {
				if work.WaitingStartDate < invoices[index].WaitingStartDate {
					invoices[index].WaitingStartDate = work.WaitingStartDate
				}
				if work.WaitingEndDate > invoices[index].WaitingEndDate {
					invoices[index].WaitingEndDate = work.WaitingEndDate
				}
			}
			start, _ := time.Parse(time.DateOnly, invoices[index].WaitingStartDate)
			end, _ := time.Parse(time.DateOnly, invoices[index].WaitingEndDate)
			invoices[index].WaitingDays = int(end.Sub(start).Hours() / 24)
		}
		var ticketFields json.RawMessage
		if workErr = tx.QueryRow(ctx, `SELECT COALESCE(jsonb_object_agg(fd.field_code,cfv.value ORDER BY fd.display_order,fd.field_code),'{}'::jsonb)
			FROM service_orders so JOIN repair_orders ro ON ro.merchant_id=so.merchant_id AND ro.service_order_id=so.id
			JOIN custom_field_values cfv ON cfv.merchant_id=ro.merchant_id AND cfv.entity_type='REPAIR_TICKET' AND cfv.entity_id=ro.id
			JOIN custom_field_definitions fd ON fd.merchant_id=cfv.merchant_id AND fd.id=cfv.definition_id
			WHERE so.merchant_id=$1::uuid AND so.order_id=$2::uuid AND fd.printable`, c.MerchantID, invoices[index].ID).Scan(&ticketFields); workErr != nil {
			return nil, workErr
		}
		invoices[index].TicketFields = ticketFields
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return invoices, nil
}

const customerSelect = `SELECT cu.id,cu.merchant_id,cu.customer_number,cu.customer_type,cu.display_name,cu.email,cu.phone,cu.loyalty_identifier,cu.metadata,
	(SELECT COUNT(*) FROM orders o LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id WHERE o.merchant_id=cu.merchant_id AND o.customer_id=cu.id AND (scope.shop_id IS NULL OR l.shop_id=scope.shop_id)),
	(SELECT COUNT(*) FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=cu.merchant_id AND ro.customer_id=cu.id AND (scope.shop_id IS NULL OR so.shop_id=scope.shop_id)),
	cu.created_at,cu.updated_at FROM customers cu`

func scanCustomer(row pgx.Row) (Customer, error) {
	var item Customer
	err := row.Scan(&item.ID, &item.MerchantID, &item.CustomerNumber, &item.CustomerType, &item.DisplayName, &item.Email, &item.Phone, &item.LoyaltyIdentifier, &item.Metadata, &item.OrderCount, &item.RepairCount, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (s *Service) ListCustomers(ctx context.Context, c *authdto.Claims) ([]Customer, error) {
	rows, err := s.pool.Query(ctx, `WITH scope AS (
		SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true),
		(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) shop_id
	) `+customerSelect+` CROSS JOIN scope WHERE cu.merchant_id=$1::uuid
	AND (scope.shop_id IS NULL OR EXISTS(SELECT 1 FROM orders o LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id WHERE o.merchant_id=cu.merchant_id AND o.customer_id=cu.id AND l.shop_id=scope.shop_id)
	OR EXISTS(SELECT 1 FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=cu.merchant_id AND ro.customer_id=cu.id AND so.shop_id=scope.shop_id))
	ORDER BY cu.display_name`, c.MerchantID, c.IdentityID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Customer{}
	for rows.Next() {
		item, scanErr := scanCustomer(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) GetCustomer(ctx context.Context, c *authdto.Claims, id string) (Customer, error) {
	return scanCustomer(s.pool.QueryRow(ctx, `WITH scope AS (
		SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true),
		(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) shop_id
	) `+customerSelect+` CROSS JOIN scope WHERE cu.merchant_id=$1::uuid AND cu.id=$4::uuid
	AND (scope.shop_id IS NULL OR EXISTS(SELECT 1 FROM orders o LEFT JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id WHERE o.merchant_id=cu.merchant_id AND o.customer_id=cu.id AND l.shop_id=scope.shop_id)
	OR EXISTS(SELECT 1 FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id WHERE ro.merchant_id=cu.merchant_id AND ro.customer_id=cu.id AND so.shop_id=scope.shop_id))`, c.MerchantID, c.IdentityID, c.MembershipID, id))
}

func (s *Service) UpdateCustomer(ctx context.Context, c *authdto.Claims, id string, r CustomerRequest) (Customer, error) {
	if _, err := s.pool.Exec(ctx, `WITH scope AS (SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true))
		UPDATE customers SET customer_type=$4,display_name=$5,email=$6,phone=$7,loyalty_identifier=$8,updated_at=now()
		FROM scope WHERE merchant_id=$1::uuid AND id=$3::uuid`, c.MerchantID, c.IdentityID, id, r.CustomerType, strings.TrimSpace(r.DisplayName), optionalText(r.Email), optionalText(r.Phone), optionalText(r.LoyaltyIdentifier)); err != nil {
		return Customer{}, err
	}
	return s.GetCustomer(ctx, c, id)
}

func money(value float64) float64 { return math.Round(value*100) / 100 }

func optionalMoney(value string) (float64, error) {
	if strings.TrimSpace(value) == "" {
		return 0, nil
	}
	v, err := strconv.ParseFloat(value, 64)
	if err != nil || v < 0 {
		return 0, app.Validation("Money values must be zero or greater.", nil)
	}
	return money(v), nil
}

func selectedPaymentType(ctx context.Context, tx pgx.Tx, merchantID, paymentTypeID, legacyMethod string) (string, string, string, error) {
	var id, name, category string
	if strings.TrimSpace(paymentTypeID) != "" {
		if err := tx.QueryRow(ctx, `SELECT id,name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active`, merchantID, paymentTypeID).Scan(&id, &name, &category); err != nil {
			return "", "", "", app.NewError("VALIDATION_ERROR", "The selected payment type is not available for this merchant.", 400)
		}
	} else if strings.EqualFold(strings.TrimSpace(legacyMethod), "CASH") {
		if err := tx.QueryRow(ctx, `SELECT id,name,category_code FROM payment_types WHERE merchant_id=$1::uuid AND category_code='CASH' AND is_active ORDER BY CASE WHEN name='Cash' THEN 0 ELSE 1 END,created_at LIMIT 1`, merchantID).Scan(&id, &name, &category); err != nil {
			return "", "", "", app.NewError("VALIDATION_ERROR", "Create an active cash payment type before checkout.", 400)
		}
	} else {
		return "", "", "", app.NewError("VALIDATION_ERROR", "Select an active merchant payment type.", 400)
	}
	if category == "DIGITAL" {
		return "", "", "", app.NewError("FUTURE_IMPROVEMENT", "Digital payment types are reserved for a future improvement and cannot be used yet.", 409)
	}
	return id, name, category, nil
}

func (s *Service) QuoteSale(ctx context.Context, c *authdto.Claims, r CreateSaleRequest) (SaleQuote, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SaleQuote{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return SaleQuote{}, err
	}
	var currency string
	if err = tx.QueryRow(ctx, `SELECT default_currency_code FROM merchants WHERE id=$1`, c.MerchantID).Scan(&currency); err != nil {
		return SaleQuote{}, err
	}
	type quoteLine struct {
		variantID string
		gross     float64
	}
	lines := make([]quoteLine, 0, len(r.Lines))
	subtotal := 0.0
	for _, requested := range r.Lines {
		quantity, parseErr := strconv.ParseFloat(requested.Quantity, 64)
		if parseErr != nil || quantity <= 0 {
			return SaleQuote{}, app.Validation("Sale quantities must be greater than zero.", nil)
		}
		var priceText string
		if err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT pp.amount FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now()) ORDER BY pp.valid_from DESC LIMIT 1),0)::text FROM product_variants pv JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id WHERE pv.merchant_id=$1::uuid AND pv.id=$2 AND p.is_active`, c.MerchantID, requested.VariantID).Scan(&priceText); err != nil {
			return SaleQuote{}, app.Validation("A sale item is missing, inactive, or unavailable.", nil)
		}
		price, _ := strconv.ParseFloat(priceText, 64)
		gross := money(quantity * price)
		subtotal = money(subtotal + gross)
		lines = append(lines, quoteLine{requested.VariantID, gross})
	}
	if subtotal <= 0 {
		return SaleQuote{}, app.Validation("The sale total must be greater than zero. Add prices to the default price list.", nil)
	}
	discount := 0.0
	if strings.TrimSpace(r.PromotionID) != "" {
		var typ, valueText, minimumText string
		if err = tx.QueryRow(ctx, `SELECT promotion_type,value::text,minimum_subtotal::text FROM promotions WHERE merchant_id=$1::uuid AND id=$2 AND is_active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) AND (usage_limit IS NULL OR redemption_count<usage_limit)`, c.MerchantID, r.PromotionID).Scan(&typ, &valueText, &minimumText); err != nil {
			return SaleQuote{}, app.Validation("The selected promotion is not available.", nil)
		}
		minimum, _ := strconv.ParseFloat(minimumText, 64)
		if subtotal < minimum {
			return SaleQuote{}, app.Validation("The order does not meet the promotion minimum.", nil)
		}
		eligibleSubtotal := 0.0
		for _, line := range lines {
			var eligible bool
			if err = tx.QueryRow(ctx, `SELECT promotion_applies_to_variant($1,$2,$3)`, c.MerchantID, r.PromotionID, line.variantID).Scan(&eligible); err != nil {
				return SaleQuote{}, err
			}
			if eligible {
				eligibleSubtotal += line.gross
			}
		}
		if eligibleSubtotal <= 0 {
			return SaleQuote{}, app.Validation("The promotion does not apply to an item in this order.", nil)
		}
		value, _ := strconv.ParseFloat(valueText, 64)
		if typ == "PERCENTAGE" {
			discount = money(eligibleSubtotal * value / 100)
		} else {
			discount = money(math.Min(value, eligibleSubtotal))
		}
	}
	manualDiscount, err := optionalMoney(r.ManualPromotion)
	if err != nil {
		return SaleQuote{}, err
	}
	shipping, err := optionalMoney(r.DeliveryFee)
	if err != nil {
		return SaleQuote{}, err
	}
	if manualDiscount > subtotal-discount {
		return SaleQuote{}, app.Validation("The manual promotion cannot exceed the remaining subtotal.", nil)
	}
	shopID := strings.TrimSpace(r.ShopID)
	if c.MembershipID != "" {
		var assignedShopID *string
		if err = tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, c.MembershipID).Scan(&assignedShopID); err != nil {
			return SaleQuote{}, err
		}
		if assignedShopID != nil {
			shopID = *assignedShopID
		}
	}
	var includeTax bool
	var taxRate float64
	if shopID != "" {
		if err = tx.QueryRow(ctx, `SELECT COALESCE(include_tax,FALSE),COALESCE(tax_rate,0) FROM payment_settings WHERE merchant_id=$1::uuid AND shop_id=$2::uuid`, c.MerchantID, shopID).Scan(&includeTax, &taxRate); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return SaleQuote{}, err
		}
	}
	taxTotal := 0.0
	if includeTax {
		taxTotal = money((subtotal - discount - manualDiscount) * taxRate / 100)
	}
	grand := money(subtotal - discount - manualDiscount + taxTotal + shipping)
	if grand <= 0 {
		return SaleQuote{}, app.Validation("The payment total must be greater than zero.", nil)
	}
	return SaleQuote{CurrencyCode: currency, Subtotal: fmt.Sprintf("%.2f", subtotal), DiscountTotal: fmt.Sprintf("%.2f", discount+manualDiscount), TaxTotal: fmt.Sprintf("%.2f", taxTotal), GrandTotal: fmt.Sprintf("%.2f", grand)}, nil
}

func (s *Service) CreateSale(ctx context.Context, c *authdto.Claims, r CreateSaleRequest) (SaleOrder, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SaleOrder{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return SaleOrder{}, err
	}
	result, err := CreateSaleWithTx(ctx, tx, c, r)
	if err != nil {
		return SaleOrder{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return SaleOrder{}, err
	}
	return result, nil
}

// CreateSaleWithTx applies the complete canonical POS aggregate inside the
// caller's transaction. Synchronization uses this entry point so the business
// mutation, audit record, idempotency result, and ordered changes cannot commit
// independently after an ambiguous network failure.
func CreateSaleWithTx(ctx context.Context, tx pgx.Tx, c *authdto.Claims, r CreateSaleRequest) (SaleOrder, error) {
	requestBody, err := json.Marshal(r)
	if err != nil {
		return SaleOrder{}, err
	}
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'pos.sale',$2,'PROCESSING',jsonb_build_object('request',$3::jsonb),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, r.IdempotencyKey, requestBody).Scan(&inserted)
	if err == pgx.ErrNoRows {
		var status string
		var stored json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT status,response_body FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='pos.sale' AND idempotency_key=$2 FOR UPDATE`, c.MerchantID, r.IdempotencyKey).Scan(&status, &stored); err != nil {
			return SaleOrder{}, err
		}
		var record struct {
			Request json.RawMessage `json:"request"`
			Result  SaleOrder       `json:"result"`
		}
		if err = json.Unmarshal(stored, &record); err != nil {
			return SaleOrder{}, err
		}
		storedRequest, _ := json.Marshal(record.Request)
		currentRequest, _ := json.Marshal(json.RawMessage(requestBody))
		if string(storedRequest) != string(currentRequest) {
			return SaleOrder{}, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different sale.", 409)
		}
		if status == "COMPLETED" {
			return record.Result, nil
		}
		return SaleOrder{}, app.NewError("IDEMPOTENCY_CONFLICT", "This sale is already being processed.", 409)
	}
	if err != nil {
		return SaleOrder{}, err
	}

	locationID := strings.TrimSpace(r.LocationID)
	var assignedShopID *string
	if c.MembershipID != "" {
		if err = tx.QueryRow(ctx, `SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, c.MembershipID).Scan(&assignedShopID); err != nil {
			return SaleOrder{}, err
		}
	}
	if assignedShopID != nil {
		r.ShopID = *assignedShopID
		locationID = ""
	}
	if locationID != "" {
		err = tx.QueryRow(ctx, `SELECT id FROM locations WHERE merchant_id=$1::uuid AND id=$2 AND is_active`, c.MerchantID, locationID).Scan(&locationID)
	} else if strings.TrimSpace(r.ShopID) != "" {
		err = tx.QueryRow(ctx, `SELECT id FROM locations WHERE merchant_id=$1::uuid AND shop_id=$2 AND is_active ORDER BY CASE location_type WHEN 'SHOP' THEN 0 ELSE 1 END,id LIMIT 1`, c.MerchantID, r.ShopID).Scan(&locationID)
	} else {
		err = tx.QueryRow(ctx, `SELECT id FROM locations WHERE merchant_id=$1::uuid AND is_active ORDER BY CASE location_type WHEN 'SHOP' THEN 0 ELSE 1 END,id LIMIT 1`, c.MerchantID).Scan(&locationID)
	}
	if err != nil {
		return SaleOrder{}, app.NewError("VALIDATION_ERROR", "An active stock location is required before making a POS sale.", 400)
	}
	if err = tx.QueryRow(ctx, `SELECT COALESCE(shop_id::text,'') FROM locations WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, locationID).Scan(&r.ShopID); err != nil {
		return SaleOrder{}, err
	}
	if r.ShopID == "" {
		return SaleOrder{}, app.Validation("POS checkout requires a shop-owned stock location.", nil)
	}
	var currency string
	if err = tx.QueryRow(ctx, `SELECT default_currency_code FROM merchants WHERE id=$1`, c.MerchantID).Scan(&currency); err != nil {
		return SaleOrder{}, err
	}
	lines := make([]saleLine, 0, len(r.Lines))
	subtotal := 0.0
	for _, requested := range r.Lines {
		quantity, parseErr := strconv.ParseFloat(requested.Quantity, 64)
		if parseErr != nil || quantity <= 0 {
			return SaleOrder{}, app.Validation("Sale quantities must be greater than zero.", nil)
		}
		var line saleLine
		line.variantID = requested.VariantID
		line.quantity = strconv.FormatFloat(quantity, 'f', 6, 64)
		err = tx.QueryRow(ctx, `SELECT pv.name,pv.base_unit_id,pv.is_stock_tracked,COALESCE((SELECT pp.amount FROM product_prices pp JOIN price_lists pl ON pl.merchant_id=pp.merchant_id AND pl.id=pp.price_list_id WHERE pp.merchant_id=pv.merchant_id AND pp.variant_id=pv.id AND pl.is_default AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now()) ORDER BY pp.valid_from DESC LIMIT 1),0)::text FROM product_variants pv JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id WHERE pv.merchant_id=$1::uuid AND pv.id=$2 AND p.is_active`, c.MerchantID, requested.VariantID).Scan(&line.description, &line.unitID, &line.stockTracked, &line.unitPrice)
		if err != nil {
			return SaleOrder{}, app.NewError("VALIDATION_ERROR", "A sale item is missing, inactive, or not available to this merchant.", 400)
		}
		price, parseErr := strconv.ParseFloat(line.unitPrice, 64)
		if parseErr != nil || price < 0 {
			return SaleOrder{}, app.Validation("A sale item has an invalid price.", nil)
		}
		line.gross = money(quantity * price)
		subtotal = money(subtotal + line.gross)
		if strings.TrimSpace(requested.AssetID) != "" {
			line.assetID = strings.TrimSpace(requested.AssetID)
			var assetStatus string
			if err = tx.QueryRow(ctx, `SELECT status FROM inventory_assets WHERE merchant_id=$1::uuid AND id=$2::uuid AND variant_id=$3::uuid AND (location_id IS NULL OR location_id=$4::uuid)`, c.MerchantID, line.assetID, line.variantID, locationID).Scan(&assetStatus); err != nil || assetStatus != "ACTIVE" {
				return SaleOrder{}, app.NewError("VALIDATION_ERROR", "The scanned stock item is not available at this shop.", 400)
			}
			if quantity != 1 {
				return SaleOrder{}, app.Validation("A stock item barcode can only be sold as one item.", nil)
			}
		}
		lines = append(lines, line)
	}
	if subtotal <= 0 {
		return SaleOrder{}, app.Validation("The sale total must be greater than zero. Add prices to the default price list.", nil)
	}

	discountTotal := 0.0
	if strings.TrimSpace(r.PromotionID) != "" {
		var promotionType, value, minimum string
		err = tx.QueryRow(ctx, `SELECT promotion_type,value::text,minimum_subtotal::text FROM promotions WHERE merchant_id=$1::uuid AND id=$2 AND is_active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()) AND (usage_limit IS NULL OR redemption_count<usage_limit) FOR UPDATE`, c.MerchantID, r.PromotionID).Scan(&promotionType, &value, &minimum)
		if err != nil {
			return SaleOrder{}, app.NewError("VALIDATION_ERROR", "The selected promotion is not available.", 400)
		}
		minimumValue, _ := strconv.ParseFloat(minimum, 64)
		if subtotal < minimumValue {
			return SaleOrder{}, app.Validation("The order does not meet the promotion minimum.", nil)
		}
		eligibleSubtotal := 0.0
		eligibleIndexes := []int{}
		for index := range lines {
			if err = tx.QueryRow(ctx, `SELECT promotion_applies_to_variant($1,$2,$3)`, c.MerchantID, r.PromotionID, lines[index].variantID).Scan(&lines[index].eligible); err != nil {
				return SaleOrder{}, err
			}
			if lines[index].eligible {
				eligibleSubtotal += lines[index].gross
				eligibleIndexes = append(eligibleIndexes, index)
			}
		}
		if len(eligibleIndexes) == 0 {
			return SaleOrder{}, app.Validation("The promotion does not apply to an item in this order.", nil)
		}
		promotionValue, _ := strconv.ParseFloat(value, 64)
		if promotionType == "PERCENTAGE" {
			discountTotal = money(eligibleSubtotal * promotionValue / 100)
		} else {
			discountTotal = money(math.Min(promotionValue, eligibleSubtotal))
		}
		remaining := discountTotal
		for position, index := range eligibleIndexes {
			amount := remaining
			if position < len(eligibleIndexes)-1 {
				amount = money(discountTotal * lines[index].gross / eligibleSubtotal)
				remaining = money(remaining - amount)
			}
			lines[index].discount = amount
		}
	}
	manualDiscount, err := optionalMoney(r.ManualPromotion)
	if err != nil {
		return SaleOrder{}, err
	}
	shipping, err := optionalMoney(r.DeliveryFee)
	if err != nil {
		return SaleOrder{}, err
	}
	if manualDiscount > subtotal-discountTotal {
		return SaleOrder{}, app.Validation("The manual promotion cannot exceed the remaining subtotal.", nil)
	}
	discountTotal = money(discountTotal + manualDiscount)
	if manualDiscount > 0 && len(lines) > 0 {
		lines[0].discount = money(lines[0].discount + manualDiscount)
	}
	var includeTax bool
	var taxRate float64
	if err = tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0) FROM locations l LEFT JOIN payment_settings ps ON ps.merchant_id=l.merchant_id AND ps.shop_id=l.shop_id WHERE l.merchant_id=$1::uuid AND l.id=$2`, c.MerchantID, locationID).Scan(&includeTax, &taxRate); err != nil {
		return SaleOrder{}, err
	}
	taxTotal := 0.0
	if includeTax {
		taxTotal = money((subtotal - discountTotal) * taxRate / 100)
	}
	grandTotal := money(subtotal - discountTotal + taxTotal + shipping)
	if grandTotal <= 0 {
		return SaleOrder{}, app.Validation("The payment total must be greater than zero.", nil)
	}
	paymentTypeID, paymentTypeName, _, err := selectedPaymentType(ctx, tx, c.MerchantID, r.PaymentTypeID, r.PaymentMethod)
	if err != nil {
		return SaleOrder{}, err
	}
	orderID := uuid.NewString()
	if strings.TrimSpace(r.CustomerID) == "" && strings.TrimSpace(r.CustomerName) != "" && strings.TrimSpace(r.CustomerPhone) != "" {
		if err = tx.QueryRow(ctx, `SELECT id FROM customers WHERE merchant_id=$1::uuid AND phone=$2 ORDER BY created_at LIMIT 1`, c.MerchantID, strings.TrimSpace(r.CustomerPhone)).Scan(&r.CustomerID); err == pgx.ErrNoRows {
			err = tx.QueryRow(ctx, `INSERT INTO customers(merchant_id,customer_number,display_name,phone) VALUES($1,'POS-'||substring(uuid_generate_v4()::text,1,8),$2,$3) RETURNING id`, c.MerchantID, strings.TrimSpace(r.CustomerName), strings.TrimSpace(r.CustomerPhone)).Scan(&r.CustomerID)
		}
		if err != nil {
			return SaleOrder{}, err
		}
	}
	orderNumber := fmt.Sprintf("POS-%s-%s", time.Now().UTC().Format("20060102-150405"), strings.ToUpper(uuid.NewString()[:4]))
	var deliveryName, deliveryContact *string
	if strings.TrimSpace(r.DeliveryID) != "" {
		if err = tx.QueryRow(ctx, `SELECT d.name,d.contact_info FROM deliveries d JOIN locations l ON l.merchant_id=d.merchant_id AND l.shop_id=d.shop_id WHERE d.merchant_id=$1::uuid AND d.id=$2::uuid AND d.is_active AND l.id=$3`, c.MerchantID, r.DeliveryID, locationID).Scan(&deliveryName, &deliveryContact); err != nil {
			return SaleOrder{}, app.Validation("The selected delivery is not available for this shop.", nil)
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,customer_id,fulfillment_location_id,order_number,channel,status,currency_code,subtotal,discount_total,tax_total,shipping_total,grand_total,delivery_id,delivery_name,delivery_contact,note,payment_type_id,payment_type,placed_at) VALUES($1,$2,NULLIF($3,'')::uuid,$4,$5,'POS','DRAFT',$6,$7,$8,$9,$10,$11,NULLIF($12,'')::uuid,$13,$14,$15,$16,$17,now())`, orderID, c.MerchantID, r.CustomerID, locationID, orderNumber, currency, money(subtotal), money(discountTotal), taxTotal, shipping, grandTotal, r.DeliveryID, deliveryName, deliveryContact, strings.TrimSpace(r.Note), paymentTypeID, paymentTypeName)
	if err != nil {
		return SaleOrder{}, err
	}
	lineIDs := make([]string, len(lines))
	for index, line := range lines {
		lineIDs[index] = uuid.NewString()
		lineTax := 0.0
		if includeTax {
			lineTax = money((line.gross - line.discount) * taxRate / 100)
		}
		_, err = tx.Exec(ctx, `INSERT INTO order_lines(id,merchant_id,order_id,line_number,variant_id,asset_id,unit_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::uuid,$7,$8,$9,$10,$11,$12,$13)`, lineIDs[index], c.MerchantID, orderID, index+1, line.variantID, line.assetID, line.unitID, line.description, line.quantity, line.unitPrice, money(line.discount), lineTax, money(line.gross-line.discount+lineTax))
		if err != nil {
			return SaleOrder{}, err
		}
	}
	if strings.TrimSpace(r.PromotionID) != "" {
		_, err = tx.Exec(ctx, `INSERT INTO order_promotions(merchant_id,order_id,promotion_id,discount_amount) VALUES($1,$2,$3,$4)`, c.MerchantID, orderID, r.PromotionID, money(discountTotal))
		if err != nil {
			return SaleOrder{}, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO promotion_redemptions(merchant_id,promotion_id,order_id) VALUES($1,$2,$3)`, c.MerchantID, r.PromotionID, orderID)
		if err != nil {
			return SaleOrder{}, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status='PENDING_PAYMENT' WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID); err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO payments(merchant_id,order_id,payment_type_id,method,status,amount,idempotency_key,captured_at) VALUES($1,$2,$3,$4,'CAPTURED',$5,$6,now())`, c.MerchantID, orderID, paymentTypeID, paymentTypeName, grandTotal, r.IdempotencyKey); err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status='CONFIRMED' WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID); err != nil {
		return SaleOrder{}, err
	}
	fulfillmentID := uuid.NewString()
	if _, err = tx.Exec(ctx, `INSERT INTO fulfillments(id,merchant_id,order_id,location_id,status) VALUES($1,$2,$3,$4,'PENDING')`, fulfillmentID, c.MerchantID, orderID, locationID); err != nil {
		return SaleOrder{}, err
	}
	for index, line := range lines {
		if _, err = tx.Exec(ctx, `INSERT INTO fulfillment_lines(merchant_id,fulfillment_id,order_line_id,quantity) VALUES($1,$2,$3,$4)`, c.MerchantID, fulfillmentID, lineIDs[index], line.quantity); err != nil {
			return SaleOrder{}, err
		}
		if line.stockTracked {
			var movementID string
			if err = tx.QueryRow(ctx, `INSERT INTO inventory_movements(merchant_id,variant_id,movement_type,source_location_id,quantity,unit_id,entered_quantity,order_line_id,event_key) VALUES($1,$2,'SALE',$3,$4,$5,$4,$6,$7) RETURNING id`, c.MerchantID, line.variantID, locationID, line.quantity, line.unitID, lineIDs[index], "pos-sale:"+orderID+":"+strconv.Itoa(index+1)).Scan(&movementID); err != nil {
				return SaleOrder{}, err
			}
			if line.assetID != "" {
				if _, err = tx.Exec(ctx, `INSERT INTO inventory_movement_assets(merchant_id,movement_id,asset_id) VALUES($1::uuid,$2::uuid,$3::uuid)`, c.MerchantID, movementID, line.assetID); err != nil {
					return SaleOrder{}, err
				}
				if _, err = tx.Exec(ctx, `UPDATE inventory_assets SET status='SOLD' WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, line.assetID); err != nil {
					return SaleOrder{}, err
				}
			}
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status='PROCESSING' WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID); err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE fulfillments SET status='DELIVERED',shipped_at=now() WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, fulfillmentID); err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status='FULFILLED' WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID); err != nil {
		return SaleOrder{}, err
	}
	created := time.Now().UTC()
	if err = tx.QueryRow(ctx, `SELECT created_at FROM orders WHERE merchant_id=$1::uuid AND id=$2`, c.MerchantID, orderID).Scan(&created); err != nil {
		return SaleOrder{}, err
	}
	result := SaleOrder{ID: orderID, OrderNumber: orderNumber, Status: "FULFILLED", CurrencyCode: currency, Subtotal: fmt.Sprintf("%.2f", subtotal), DiscountTotal: fmt.Sprintf("%.2f", discountTotal), TaxTotal: fmt.Sprintf("%.2f", taxTotal), GrandTotal: fmt.Sprintf("%.2f", grandTotal), CreatedAt: created}
	responseBody, err := json.Marshal(map[string]any{"request": r, "result": result})
	if err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=201,response_body=$3 WHERE merchant_id=$1::uuid AND scope='pos.sale' AND idempotency_key=$2`, c.MerchantID, r.IdempotencyKey, responseBody); err != nil {
		return SaleOrder{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,actor_membership_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,NULLIF($2,'')::uuid,'POS_CHECKOUT','orders',$3::uuid,$4::jsonb)`, c.MerchantID, c.MembershipID, orderID, responseBody); err != nil {
		return SaleOrder{}, err
	}
	if _, err = publishSyncChange(ctx, tx, c.MerchantID, r.ShopID, "ORDER", orderID, "CREATE", responseBody); err != nil {
		return SaleOrder{}, err
	}
	return result, nil
}

func (s *Service) CreateRefund(ctx context.Context, c *authdto.Claims, orderID string, r CreateRefundRequest) (Refund, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Refund{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return Refund{}, err
	}
	requestBody, err := json.Marshal(r)
	if err != nil {
		return Refund{}, err
	}
	var inserted bool
	err = tx.QueryRow(ctx, `INSERT INTO idempotency_keys(merchant_id,scope,idempotency_key,status,response_body,expires_at) VALUES($1,'pos.refund',$2,'PROCESSING',jsonb_build_object('request',$3::jsonb),now()+interval '24 hours') ON CONFLICT(merchant_id,scope,idempotency_key) DO NOTHING RETURNING true`, c.MerchantID, r.IdempotencyKey, requestBody).Scan(&inserted)
	if err == pgx.ErrNoRows {
		var status string
		var stored json.RawMessage
		if err = tx.QueryRow(ctx, `SELECT status,response_body FROM idempotency_keys WHERE merchant_id=$1::uuid AND scope='pos.refund' AND idempotency_key=$2 FOR UPDATE`, c.MerchantID, r.IdempotencyKey).Scan(&status, &stored); err != nil {
			return Refund{}, err
		}
		var record struct {
			Request json.RawMessage `json:"request"`
			Result  Refund          `json:"result"`
		}
		if err = json.Unmarshal(stored, &record); err != nil {
			return Refund{}, err
		}
		storedRequest, _ := json.Marshal(record.Request)
		currentRequest, _ := json.Marshal(json.RawMessage(requestBody))
		if string(storedRequest) != string(currentRequest) {
			return Refund{}, app.NewError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different refund.", 409)
		}
		if status == "COMPLETED" {
			if err = tx.Commit(ctx); err != nil {
				return Refund{}, err
			}
			return record.Result, nil
		}
		return Refund{}, app.NewError("IDEMPOTENCY_CONFLICT", "This refund is already being processed.", 409)
	}
	if err != nil {
		return Refund{}, err
	}

	var paymentAmount, paymentStatus, refundedAmount string
	err = tx.QueryRow(ctx, `SELECT p.amount::text,p.status,COALESCE((SELECT sum(rf.amount) FROM refunds rf WHERE rf.merchant_id=p.merchant_id AND rf.payment_id=p.id AND rf.status NOT IN ('FAILED','CANCELLED')),0)::text
		FROM payments p JOIN orders o ON o.merchant_id=p.merchant_id AND o.id=p.order_id
		JOIN locations l ON l.merchant_id=o.merchant_id AND l.id=o.fulfillment_location_id
		WHERE p.merchant_id=$1::uuid AND p.id=$2::uuid AND p.order_id=$3::uuid
		  AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid) IS NULL OR l.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($4,'')::uuid))
		FOR UPDATE`, c.MerchantID, r.PaymentID, orderID, c.MembershipID).Scan(&paymentAmount, &paymentStatus, &refundedAmount)
	if err != nil {
		return Refund{}, pgx.ErrNoRows
	}
	if paymentStatus != "CAPTURED" && paymentStatus != "PARTIALLY_REFUNDED" {
		return Refund{}, app.Validation("Only captured payments can be refunded.", nil)
	}
	amount, parseErr := strconv.ParseFloat(strings.TrimSpace(r.Amount), 64)
	if parseErr != nil || amount <= 0 {
		return Refund{}, app.Validation("Refund amount must be greater than zero.", nil)
	}
	paid, _ := strconv.ParseFloat(paymentAmount, 64)
	refunded, _ := strconv.ParseFloat(refundedAmount, 64)
	amount = money(amount)
	if amount > money(paid-refunded) {
		return Refund{}, app.Validation("Refund amount exceeds the remaining captured payment.", nil)
	}
	refundID := strings.TrimSpace(r.RefundID)
	if refundID == "" {
		refundID = uuid.NewString()
	}
	var result Refund
	err = tx.QueryRow(ctx, `INSERT INTO refunds(id,merchant_id,payment_id,order_id,amount,status,reason) VALUES($1,$2,$3,$4,$5,'SUCCEEDED',NULLIF($6,'')) RETURNING id,payment_id,order_id,status,amount::text,reason,created_at`, refundID, c.MerchantID, r.PaymentID, orderID, amount, strings.TrimSpace(r.Reason)).Scan(&result.ID, &result.PaymentID, &result.OrderID, &result.Status, &result.Amount, &result.Reason, &result.CreatedAt)
	if err != nil {
		return Refund{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET status=CASE WHEN (SELECT COALESCE(sum(rf.amount),0) FROM refunds rf WHERE rf.merchant_id=orders.merchant_id AND rf.order_id=orders.id AND rf.status='SUCCEEDED') >= orders.grand_total THEN 'REFUNDED' ELSE orders.status END WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, orderID); err != nil {
		return Refund{}, err
	}
	responseBody, err := json.Marshal(map[string]any{"request": r, "result": result})
	if err != nil {
		return Refund{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE idempotency_keys SET status='COMPLETED',response_status=201,response_body=$3 WHERE merchant_id=$1::uuid AND scope='pos.refund' AND idempotency_key=$2`, c.MerchantID, r.IdempotencyKey, responseBody); err != nil {
		return Refund{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Refund{}, err
	}
	return result, nil
}

func (s *Service) ListShops(ctx context.Context, c *authdto.Claims) ([]Shop, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2::text,true),set_config('app.merchant_id',$1::text,true)) SELECT s.id,s.merchant_id,s.business_type_id,COALESCE(bt.name,''),s.name,s.code,s.address,s.timezone,s.is_active,COALESCE((SELECT array_agg(sm.module_code ORDER BY sm.module_code) FROM shop_modules sm WHERE sm.merchant_id=s.merchant_id AND sm.shop_id=s.id),ARRAY[]::text[]),COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0)::text,COALESCE(ps.tax_label,'Tax'),COALESCE(ps.receipt_note,''),COALESCE(s.footer_note,''),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=s.merchant_id AND entity_type='SHOP_SETTINGS' AND entity_id=s.id),0) FROM shops s LEFT JOIN business_types bt ON bt.id=s.business_type_id LEFT JOIN payment_settings ps ON ps.merchant_id=s.merchant_id AND ps.shop_id=s.id CROSS JOIN x WHERE s.merchant_id=$1::uuid AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL OR s.id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid)) ORDER BY s.name`, c.MerchantID, c.IdentityID, c.MembershipID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Shop{}
	for rows.Next() {
		var v Shop
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.BusinessTypeID, &v.BusinessTypeName, &v.Name, &v.Code, &v.Address, &v.Timezone, &v.IsActive, &v.ModuleCodes, &v.IncludeTax, &v.TaxRate, &v.TaxLabel, &v.ReceiptNote, &v.FooterNote, &v.SyncVersion); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Service) ListDeliveries(ctx context.Context, c *authdto.Claims, shopID string) ([]Delivery, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT d.id,d.merchant_id,d.shop_id,d.name,d.contact_info,d.is_active,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='DELIVERY' AND entity_id=d.id),0),d.created_at FROM deliveries d CROSS JOIN x WHERE d.merchant_id=$1::uuid AND d.shop_id=$4::uuid AND d.is_active AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL OR d.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid)) ORDER BY d.name`, c.MerchantID, c.IdentityID, c.MembershipID, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Delivery{}
	for rows.Next() {
		var item Delivery
		if err := rows.Scan(&item.ID, &item.MerchantID, &item.ShopID, &item.Name, &item.ContactInfo, &item.IsActive, &item.SyncVersion, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) GetDelivery(ctx context.Context, c *authdto.Claims, id string) (Delivery, error) {
	var item Delivery
	err := s.pool.QueryRow(ctx, `WITH x AS (SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT d.id,d.merchant_id,d.shop_id,d.name,d.contact_info,d.is_active,COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=d.merchant_id AND entity_type='DELIVERY' AND entity_id=d.id),0),d.created_at FROM deliveries d CROSS JOIN x WHERE d.merchant_id=$1::uuid AND d.id=$4::uuid AND d.is_active AND ((SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid) IS NULL OR d.shop_id=(SELECT shop_id FROM user_memberships WHERE merchant_id=$1::uuid AND id=NULLIF($3,'')::uuid))`, c.MerchantID, c.IdentityID, c.MembershipID, id).Scan(&item.ID, &item.MerchantID, &item.ShopID, &item.Name, &item.ContactInfo, &item.IsActive, &item.SyncVersion, &item.CreatedAt)
	return item, err
}
func (s *Service) CreateDelivery(ctx context.Context, c *authdto.Claims, r DeliveryRequest) (Delivery, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Delivery{}, err
	}
	defer tx.Rollback(ctx)
	if err := ctxSQL(ctx, tx, c); err != nil {
		return Delivery{}, err
	}
	var item Delivery
	err = tx.QueryRow(ctx, `INSERT INTO deliveries(merchant_id,shop_id,name,contact_info,is_active) SELECT $1::uuid,$2::uuid,$3,$4,COALESCE($5,true) WHERE EXISTS (SELECT 1 FROM shops WHERE merchant_id=$1::uuid AND id=$2::uuid AND is_active) RETURNING id,merchant_id,shop_id,name,contact_info,is_active,created_at`, c.MerchantID, r.ShopID, strings.TrimSpace(r.Name), strings.TrimSpace(r.ContactInfo), r.IsActive).Scan(&item.ID, &item.MerchantID, &item.ShopID, &item.Name, &item.ContactInfo, &item.IsActive, &item.CreatedAt)
	if err != nil {
		return Delivery{}, err
	}
	version, err := bumpSyncEntityVersion(ctx, tx, c.MerchantID, "DELIVERY", item.ID)
	if err != nil {
		return Delivery{}, err
	}
	item.SyncVersion = version
	payload, err := json.Marshal(item)
	if err != nil {
		return Delivery{}, err
	}
	if _, err := publishSyncChangeAtVersion(ctx, tx, c.MerchantID, item.ShopID, "DELIVERY", item.ID, version, "CREATE", payload); err != nil {
		return Delivery{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Delivery{}, err
	}
	return item, err
}
func (s *Service) UpdateDelivery(ctx context.Context, c *authdto.Claims, id string, r DeliveryRequest) (Delivery, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Delivery{}, err
	}
	defer tx.Rollback(ctx)
	if err := ctxSQL(ctx, tx, c); err != nil {
		return Delivery{}, err
	}
	var item Delivery
	err = tx.QueryRow(ctx, `UPDATE deliveries d SET shop_id=$2::uuid,name=$3,contact_info=$4,is_active=COALESCE($5,d.is_active),updated_at=now() WHERE d.merchant_id=$1::uuid AND d.id=$6::uuid RETURNING d.id,d.merchant_id,d.shop_id,d.name,d.contact_info,d.is_active,d.created_at`, c.MerchantID, r.ShopID, strings.TrimSpace(r.Name), strings.TrimSpace(r.ContactInfo), r.IsActive, id).Scan(&item.ID, &item.MerchantID, &item.ShopID, &item.Name, &item.ContactInfo, &item.IsActive, &item.CreatedAt)
	if err != nil {
		return Delivery{}, err
	}
	version, err := bumpSyncEntityVersion(ctx, tx, c.MerchantID, "DELIVERY", item.ID)
	if err != nil {
		return Delivery{}, err
	}
	item.SyncVersion = version
	payload, err := json.Marshal(item)
	if err != nil {
		return Delivery{}, err
	}
	if _, err := publishSyncChangeAtVersion(ctx, tx, c.MerchantID, item.ShopID, "DELIVERY", item.ID, version, "UPDATE", payload); err != nil {
		return Delivery{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Delivery{}, err
	}
	return item, err
}
func (s *Service) DeleteDelivery(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := ctxSQL(ctx, tx, c); err != nil {
		return err
	}
	var deliveryID, shopID string
	if err := tx.QueryRow(ctx, `UPDATE deliveries SET is_active=FALSE,updated_at=now() WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,shop_id`, c.MerchantID, id).Scan(&deliveryID, &shopID); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]any{"id": deliveryID, "shop_id": shopID, "is_active": false})
	version, err := bumpSyncEntityVersion(ctx, tx, c.MerchantID, "DELIVERY", deliveryID)
	if err != nil {
		return err
	}
	if _, err := publishSyncChangeAtVersion(ctx, tx, c.MerchantID, shopID, "DELIVERY", deliveryID, version, "DELETE", payload); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func bumpSyncEntityVersion(ctx context.Context, tx pgx.Tx, merchantID, entityType, entityID string) (int64, error) {
	var version int64
	err := tx.QueryRow(ctx, `
		INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at)
		VALUES($1::uuid,$2,$3::uuid,1,now())
		ON CONFLICT (merchant_id,entity_type,entity_id)
		DO UPDATE SET version=sync_entity_versions.version+1,updated_at=now()
		RETURNING version`, merchantID, entityType, entityID).Scan(&version)
	return version, err
}

func publishSyncChange(ctx context.Context, tx pgx.Tx, merchantID, shopID, entityType, entityID, operationType string, payload []byte) (int64, error) {
	version, err := bumpSyncEntityVersion(ctx, tx, merchantID, entityType, entityID)
	if err != nil {
		return 0, err
	}
	return publishSyncChangeAtVersion(ctx, tx, merchantID, shopID, entityType, entityID, version, operationType, payload)
}

func publishSyncChangeAtVersion(ctx context.Context, tx pgx.Tx, merchantID, shopID, entityType, entityID string, version int64, operationType string, payload []byte) (int64, error) {
	var sequence int64
	if err := tx.QueryRow(ctx, `SELECT nextval('sync_server_sequence_seq')`).Scan(&sequence); err != nil {
		return 0, err
	}
	_, err := tx.Exec(ctx, `INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload) VALUES($1::uuid,NULLIF($2,'')::uuid,$3,$4,$5::uuid,$6,$7,$8::jsonb)`, merchantID, strings.TrimSpace(shopID), sequence, entityType, entityID, version, operationType, payload)
	return sequence, err
}
func (s *Service) GetShop(ctx context.Context, c *authdto.Claims, id string) (Shop, error) {
	var v Shop
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$3::text,true),set_config('app.merchant_id',$1::text,true)) SELECT s.id,s.merchant_id,s.business_type_id,COALESCE(bt.name,''),s.name,s.code,s.address,s.timezone,s.is_active,COALESCE((SELECT array_agg(sm.module_code ORDER BY sm.module_code) FROM shop_modules sm WHERE sm.merchant_id=s.merchant_id AND sm.shop_id=s.id),ARRAY[]::text[]),COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0)::text,COALESCE(ps.tax_label,'Tax'),COALESCE(ps.receipt_note,''),COALESCE(s.footer_note,''),COALESCE((SELECT version FROM sync_entity_versions WHERE merchant_id=s.merchant_id AND entity_type='SHOP_SETTINGS' AND entity_id=s.id),0) FROM shops s LEFT JOIN business_types bt ON bt.id=s.business_type_id LEFT JOIN payment_settings ps ON ps.merchant_id=s.merchant_id AND ps.shop_id=s.id CROSS JOIN x WHERE s.merchant_id=$1::uuid AND s.id=$2::uuid`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.BusinessTypeID, &v.BusinessTypeName, &v.Name, &v.Code, &v.Address, &v.Timezone, &v.IsActive, &v.ModuleCodes, &v.IncludeTax, &v.TaxRate, &v.TaxLabel, &v.ReceiptNote, &v.FooterNote, &v.SyncVersion)
	return v, err
}
func (s *Service) CreateShop(ctx context.Context, c *authdto.Claims, r ShopRequest) (Shop, error) {
	if !valid(r.Name) || !valid(r.Code) {
		return Shop{}, pgx.ErrNoRows
	}
	a := r.Address
	if len(a) == 0 {
		a = json.RawMessage(`{}`)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Shop{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return Shop{}, err
	}
	var v Shop
	err = tx.QueryRow(ctx, `INSERT INTO shops(merchant_id,business_type_id,name,code,address,timezone,is_active) VALUES($1,$2::uuid,$3,$4,$5,$6,COALESCE($7,true)) RETURNING id,merchant_id,business_type_id,name,code,address,timezone,is_active`, c.MerchantID, r.BusinessTypeID, strings.TrimSpace(r.Name), strings.TrimSpace(r.Code), string(a), r.Timezone, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.BusinessTypeID, &v.Name, &v.Code, &v.Address, &v.Timezone, &v.IsActive)
	if err != nil {
		return Shop{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO locations(merchant_id,shop_id,code,name,location_type,is_active) VALUES($1,$2,$3,$4,'SHOP',COALESCE($5,true))`, c.MerchantID, v.ID, "SHOP-"+strings.TrimSpace(r.Code), strings.TrimSpace(r.Name)+" stock", r.IsActive); err != nil {
		return Shop{}, err
	}
	if v.BusinessTypeID != nil {
		if err = tx.QueryRow(ctx, `SELECT name FROM business_types WHERE id=$1::uuid`, *v.BusinessTypeID).Scan(&v.BusinessTypeName); err != nil {
			return Shop{}, err
		}
	}
	if err = replaceShopModules(ctx, tx, c.MerchantID, v.ID, r.ModuleCodes); err != nil {
		return Shop{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO payment_settings(merchant_id,shop_id,include_tax,tax_rate) VALUES($1,$2,COALESCE($3,FALSE),COALESCE(NULLIF($4,'')::numeric,0)) ON CONFLICT (merchant_id,shop_id) DO UPDATE SET include_tax=COALESCE($3,payment_settings.include_tax),tax_rate=COALESCE(NULLIF($4,'')::numeric,payment_settings.tax_rate)`, c.MerchantID, v.ID, r.IncludeTax, r.TaxRate); err != nil {
		return Shop{}, err
	}
	if r.IncludeTax != nil {
		v.IncludeTax = *r.IncludeTax
	}
	if r.TaxRate != nil {
		v.TaxRate = *r.TaxRate
	}
	v.ModuleCodes = r.ModuleCodes
	if err = tx.Commit(ctx); err != nil {
		return Shop{}, err
	}
	return v, nil
}
func (s *Service) UpdateShop(ctx context.Context, c *authdto.Claims, id string, r ShopRequest) (Shop, error) {
	if !valid(r.Name) || !valid(r.Code) {
		return Shop{}, pgx.ErrNoRows
	}
	a := r.Address
	if len(a) == 0 {
		a = json.RawMessage(`{}`)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Shop{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return Shop{}, err
	}
	var v Shop
	err = tx.QueryRow(ctx, `UPDATE shops SET business_type_id=COALESCE($3::uuid,business_type_id),name=$4,code=$5,address=$6,timezone=$7,is_active=COALESCE($8,is_active),footer_note=COALESCE($9,footer_note) WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING id,merchant_id,business_type_id,name,code,address,timezone,is_active,footer_note`, c.MerchantID, id, r.BusinessTypeID, strings.TrimSpace(r.Name), strings.TrimSpace(r.Code), string(a), r.Timezone, r.IsActive, r.FooterNote).Scan(&v.ID, &v.MerchantID, &v.BusinessTypeID, &v.Name, &v.Code, &v.Address, &v.Timezone, &v.IsActive, &v.FooterNote)
	if err != nil {
		return Shop{}, err
	}
	if r.ModuleCodes != nil {
		if err = replaceShopModules(ctx, tx, c.MerchantID, id, r.ModuleCodes); err != nil {
			return Shop{}, err
		}
	}
	if v.BusinessTypeID != nil {
		if err = tx.QueryRow(ctx, `SELECT name FROM business_types WHERE id=$1::uuid`, *v.BusinessTypeID).Scan(&v.BusinessTypeName); err != nil {
			return Shop{}, err
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO payment_settings(merchant_id,shop_id,include_tax,tax_rate,tax_label,receipt_note) VALUES($1,$2,COALESCE($3,FALSE),COALESCE(NULLIF($4,'')::numeric,0),COALESCE(NULLIF($5,''),'Tax'),COALESCE($6,'')) ON CONFLICT (merchant_id,shop_id) DO UPDATE SET include_tax=COALESCE($3,payment_settings.include_tax),tax_rate=COALESCE(NULLIF($4,'')::numeric,payment_settings.tax_rate),tax_label=COALESCE($5,payment_settings.tax_label),receipt_note=COALESCE($6,payment_settings.receipt_note)`, c.MerchantID, id, r.IncludeTax, r.TaxRate, r.TaxLabel, r.ReceiptNote); err != nil {
		return Shop{}, err
	}
	if r.IncludeTax != nil {
		v.IncludeTax = *r.IncludeTax
	}
	if r.TaxRate != nil {
		v.TaxRate = *r.TaxRate
	}
	if r.TaxLabel != nil {
		v.TaxLabel = *r.TaxLabel
	}
	if r.ReceiptNote != nil {
		v.ReceiptNote = *r.ReceiptNote
	}
	v.ModuleCodes = r.ModuleCodes
	if err = tx.QueryRow(ctx, `SELECT COALESCE(ps.include_tax,FALSE),COALESCE(ps.tax_rate,0)::text,COALESCE(ps.tax_label,'Tax'),COALESCE(ps.receipt_note,'') FROM payment_settings ps WHERE ps.merchant_id=$1::uuid AND ps.shop_id=$2::uuid`, c.MerchantID, id).Scan(&v.IncludeTax, &v.TaxRate, &v.TaxLabel, &v.ReceiptNote); err != nil {
		return Shop{}, err
	}
	syncPayload, err := json.Marshal(map[string]any{
		"id":           v.ID,
		"merchant_id":  v.MerchantID,
		"name":         v.Name,
		"code":         v.Code,
		"address":      v.Address,
		"timezone":     v.Timezone,
		"is_active":    v.IsActive,
		"footer_note":  v.FooterNote,
		"include_tax":  v.IncludeTax,
		"tax_rate":     v.TaxRate,
		"tax_label":    v.TaxLabel,
		"receipt_note": v.ReceiptNote,
	})
	if err != nil {
		return Shop{}, err
	}
	newVersion, err := recordShopSettingsChange(ctx, tx, c.MerchantID, id, syncPayload)
	if err != nil {
		return Shop{}, err
	}
	v.SyncVersion = newVersion
	if err = tx.Commit(ctx); err != nil {
		return Shop{}, err
	}
	return v, nil
}

func recordShopSettingsChange(ctx context.Context, tx pgx.Tx, merchantID, shopID string, payload []byte) (int64, error) {
	var currentVersion int64
	err := tx.QueryRow(ctx, `SELECT version FROM sync_entity_versions WHERE merchant_id=$1::uuid AND entity_type='SHOP_SETTINGS' AND entity_id=$2::uuid FOR UPDATE`, merchantID, shopID).Scan(&currentVersion)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	newVersion := currentVersion + 1
	if _, err := tx.Exec(ctx, `
		INSERT INTO sync_entity_versions(merchant_id,entity_type,entity_id,version,updated_at)
		VALUES($1::uuid,'SHOP_SETTINGS',$2::uuid,$3,now())
		ON CONFLICT (merchant_id,entity_type,entity_id) DO UPDATE SET version=EXCLUDED.version,updated_at=now()`, merchantID, shopID, newVersion); err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO sync_changes(merchant_id,shop_id,server_sequence,entity_type,entity_id,entity_version,operation_type,payload)
		VALUES($1::uuid,$2::uuid,nextval('sync_server_sequence_seq'),'SHOP_SETTINGS',$2::uuid,$3,'UPDATE',$4::jsonb)`, merchantID, shopID, newVersion, payload)
	return newVersion, err
}

func replaceShopModules(ctx context.Context, tx pgx.Tx, merchantID, shopID string, modules []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM shop_modules WHERE merchant_id=$1::uuid AND shop_id=$2::uuid`, merchantID, shopID); err != nil {
		return err
	}
	for _, module := range modules {
		module = strings.TrimSpace(strings.ToLower(module))
		if module == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO shop_modules(merchant_id,shop_id,module_code) VALUES($1::uuid,$2::uuid,$3)`, merchantID, shopID, module); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) DeleteShop(ctx context.Context, c *authdto.Claims, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM locations WHERE merchant_id=$1::uuid AND shop_id=$2::uuid`, c.MerchantID, id); err != nil {
		return err
	}
	r, err := tx.Exec(ctx, `DELETE FROM shops WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return tx.Commit(ctx)
}

func (s *Service) ListTerminals(ctx context.Context, c *authdto.Claims, shopID string) ([]Terminal, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT t.id,t.merchant_id,t.shop_id,t.name,t.device_identifier,t.is_active,t.created_at FROM pos_terminals t CROSS JOIN x WHERE t.merchant_id=$1::uuid AND t.shop_id=$3 ORDER BY t.name`, c.MerchantID, c.IdentityID, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Terminal{}
	for rows.Next() {
		var v Terminal
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.Name, &v.DeviceIdentifier, &v.IsActive, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) CreateTerminal(ctx context.Context, c *authdto.Claims, r TerminalRequest) (Terminal, error) {
	if !valid(r.ShopID) || !valid(r.Name) {
		return Terminal{}, pgx.ErrNoRows
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Terminal{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return Terminal{}, err
	}
	var v Terminal
	err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(merchant_id,shop_id,name,device_identifier,is_active) VALUES($1,$2,$3,$4,COALESCE($5,true)) RETURNING id,merchant_id,shop_id,name,device_identifier,is_active,created_at`, c.MerchantID, r.ShopID, strings.TrimSpace(r.Name), r.DeviceIdentifier, r.IsActive).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.Name, &v.DeviceIdentifier, &v.IsActive, &v.CreatedAt)
	if err != nil {
		return Terminal{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Terminal{}, err
	}
	return v, nil
}
func (s *Service) GetTerminal(ctx context.Context, c *authdto.Claims, id string) (Terminal, error) {
	var v Terminal
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT t.id,t.merchant_id,t.shop_id,t.name,t.device_identifier,t.is_active,t.created_at FROM pos_terminals t CROSS JOIN x WHERE t.merchant_id=$1::uuid AND t.id=$2`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.Name, &v.DeviceIdentifier, &v.IsActive, &v.CreatedAt)
	return v, err
}
func (s *Service) UpdateTerminal(ctx context.Context, c *authdto.Claims, id string, r TerminalRequest) (Terminal, error) {
	var v Terminal
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$7,true),set_config('app.merchant_id',$1,true)) UPDATE pos_terminals t SET shop_id=$3,name=$4,device_identifier=$5,is_active=COALESCE($6,t.is_active) FROM x WHERE t.merchant_id=$1::uuid AND t.id=$2 RETURNING t.id,t.merchant_id,t.shop_id,t.name,t.device_identifier,t.is_active,t.created_at`, c.MerchantID, id, r.ShopID, strings.TrimSpace(r.Name), r.DeviceIdentifier, r.IsActive, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.Name, &v.DeviceIdentifier, &v.IsActive, &v.CreatedAt)
	return v, err
}
func (s *Service) DeleteTerminal(ctx context.Context, c *authdto.Claims, id string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM pos_terminals t USING x WHERE t.merchant_id=$1::uuid AND t.id=$2`, c.MerchantID, id, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Service) ListSessions(ctx context.Context, c *authdto.Claims, shopID string) ([]Session, error) {
	rows, err := s.pool.Query(ctx, `WITH x AS(SELECT set_config('app.user_id',$2,true),set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.shop_id,p.terminal_id,p.membership_id,p.status,p.opened_at,p.closed_at,p.opening_cash::text,p.expected_cash::text,p.counted_cash::text,p.variance::text FROM pos_sessions p CROSS JOIN x WHERE p.merchant_id=$1::uuid AND p.shop_id=$3 ORDER BY p.opened_at DESC`, c.MerchantID, c.IdentityID, shopID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var v Session
		if err := rows.Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.TerminalID, &v.MembershipID, &v.Status, &v.OpenedAt, &v.ClosedAt, &v.OpeningCash, &v.ExpectedCash, &v.CountedCash, &v.Variance); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Service) CreateSession(ctx context.Context, c *authdto.Claims, r SessionRequest) (Session, error) {
	if !valid(r.ShopID) || !valid(r.MembershipID) {
		return Session{}, pgx.ErrNoRows
	}
	status := r.Status
	if status == "" {
		status = "OPEN"
	}
	cash := r.OpeningCash
	if cash == "" {
		cash = "0"
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback(ctx)
	if err = ctxSQL(ctx, tx, c); err != nil {
		return Session{}, err
	}
	var v Session
	err = tx.QueryRow(ctx, `INSERT INTO pos_sessions(merchant_id,shop_id,terminal_id,membership_id,status,opening_cash,expected_cash,counted_cash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,merchant_id,shop_id,terminal_id,membership_id,status,opened_at,closed_at,opening_cash::text,expected_cash::text,counted_cash::text,variance::text`, c.MerchantID, r.ShopID, r.TerminalID, r.MembershipID, status, cash, r.ExpectedCash, r.CountedCash).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.TerminalID, &v.MembershipID, &v.Status, &v.OpenedAt, &v.ClosedAt, &v.OpeningCash, &v.ExpectedCash, &v.CountedCash, &v.Variance)
	if err != nil {
		return Session{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Session{}, err
	}
	return v, nil
}
func (s *Service) GetSession(ctx context.Context, c *authdto.Claims, id string) (Session, error) {
	var v Session
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) SELECT p.id,p.merchant_id,p.shop_id,p.terminal_id,p.membership_id,p.status,p.opened_at,p.closed_at,p.opening_cash::text,p.expected_cash::text,p.counted_cash::text,p.variance::text FROM pos_sessions p CROSS JOIN x WHERE p.merchant_id=$1::uuid AND p.id=$2`, c.MerchantID, id, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.TerminalID, &v.MembershipID, &v.Status, &v.OpenedAt, &v.ClosedAt, &v.OpeningCash, &v.ExpectedCash, &v.CountedCash, &v.Variance)
	return v, err
}
func (s *Service) UpdateSession(ctx context.Context, c *authdto.Claims, id string, r SessionRequest) (Session, error) {
	status := r.Status
	if status == "" {
		status = "CLOSED"
	}
	var v Session
	err := s.pool.QueryRow(ctx, `WITH x AS(SELECT set_config('app.user_id',$6,true),set_config('app.merchant_id',$1,true)) UPDATE pos_sessions p SET status=$3,expected_cash=$4,counted_cash=$5,closed_at=CASE WHEN $3='OPEN' THEN NULL ELSE COALESCE(p.closed_at,now()) END FROM x WHERE p.merchant_id=$1::uuid AND p.id=$2 RETURNING p.id,p.merchant_id,p.shop_id,p.terminal_id,p.membership_id,p.status,p.opened_at,p.closed_at,p.opening_cash::text,p.expected_cash::text,p.counted_cash::text,p.variance::text`, c.MerchantID, id, status, r.ExpectedCash, r.CountedCash, c.IdentityID).Scan(&v.ID, &v.MerchantID, &v.ShopID, &v.TerminalID, &v.MembershipID, &v.Status, &v.OpenedAt, &v.ClosedAt, &v.OpeningCash, &v.ExpectedCash, &v.CountedCash, &v.Variance)
	return v, err
}
func (s *Service) DeleteSession(ctx context.Context, c *authdto.Claims, id string) error {
	r, err := s.pool.Exec(ctx, `WITH x AS(SELECT set_config('app.user_id',$3,true),set_config('app.merchant_id',$1,true)) DELETE FROM pos_sessions p USING x WHERE p.merchant_id=$1::uuid AND p.id=$2`, c.MerchantID, id, c.IdentityID)
	if err != nil {
		return err
	}
	if r.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// Repository adapts PostgreSQL persistence to the bounded context's outbound port.
type Repository = Service

func NewRepository(pool *pgxpool.Pool) *Service {
	return NewService(pool)
}

var _ posoutbound.Repository = (*Service)(nil)
