package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"business-central-backend/internal/app"
	tdto "business-central-backend/internal/telegram/application/dto"
	"business-central-backend/internal/telegram/domain"
	"business-central-backend/internal/telegram/ports/outbound"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type draftItem struct {
	variantID, name, sku, unitID, currency, price, lineID string
	stockTracked                                          bool
	quantity                                              float64
}

func (r *Repository) CreateDraft(ctx context.Context, in outbound.DraftInput) (outbound.DraftResult, error) {
	if len(in.Items) == 0 || len(in.Items) > domain.MaxOrderItems {
		return outbound.DraftResult{}, app.NewError("VALIDATION_ERROR", "An order requires 1–20 product lines.", 400)
	}
	g, err := r.groupService(ctx, in.ConnectionID)
	if err != nil {
		return outbound.DraftResult{}, err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	defer tx.Rollback(ctx)
	if err = setService(ctx, tx, g.MerchantID, ""); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	var autoConfirm bool
	err = tx.QueryRow(ctx, `SELECT auto_confirm_orders FROM telegram_group_connections WHERE merchant_id=$1::uuid AND id=$2::uuid AND connection_status='ACTIVE' FOR SHARE`, g.MerchantID, g.ID).Scan(&autoConfirm)
	if err != nil {
		return outbound.DraftResult{}, noRows(err, "Active Telegram group")
	}
	var locationID string
	err = tx.QueryRow(ctx, `SELECT id FROM locations WHERE merchant_id=$1::uuid AND shop_id=$2::uuid AND is_active ORDER BY CASE location_type WHEN 'SHOP' THEN 0 ELSE 1 END,id LIMIT 1`, g.MerchantID, g.ShopID).Scan(&locationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return outbound.DraftResult{}, app.NewError("NO_LOCATION", "The shop has no active inventory location.", 409)
	}
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	items := []draftItem{}
	byVariant := map[string]int{}
	for index, input := range in.Items {
		if !domain.ValidQuantity(input.Quantity) {
			return outbound.DraftResult{}, app.NewError("VALIDATION_ERROR", fmt.Sprintf("Item %d: %s", index+1, domain.ErrInvalidQuantity), 400)
		}
		rows, queryErr := tx.Query(ctx, `SELECT pv.id,p.name,pv.sku,pv.base_unit_id,pv.is_stock_tracked,pl.currency_code,pp.amount::text
		FROM product_variants pv
		JOIN products p ON p.merchant_id=pv.merchant_id AND p.id=pv.product_id AND p.is_active
		JOIN price_lists pl ON pl.merchant_id=pv.merchant_id AND pl.is_default
		JOIN product_prices pp ON pp.merchant_id=pv.merchant_id AND pp.price_list_id=pl.id AND pp.variant_id=pv.id AND pp.valid_from<=now() AND (pp.valid_until IS NULL OR pp.valid_until>now())
		WHERE pv.merchant_id=$1::uuid AND ($2<>'' OR $3<>'')
		AND ($2='' OR lower(regexp_replace(trim(p.name),'\s+',' ','g'))=$2 OR lower(regexp_replace(trim(pv.name),'\s+',' ','g'))=$2)
		AND ($3='' OR lower(pv.sku)=lower($3)) ORDER BY pv.id LIMIT 3`, g.MerchantID, domain.NormalizeName(input.ProductName), input.SKU)
		if queryErr != nil {
			return outbound.DraftResult{}, app.Internal(queryErr)
		}
		matches := []draftItem{}
		for rows.Next() {
			var item draftItem
			if err = rows.Scan(&item.variantID, &item.name, &item.sku, &item.unitID, &item.stockTracked, &item.currency, &item.price); err != nil {
				rows.Close()
				return outbound.DraftResult{}, app.Internal(err)
			}
			matches = append(matches, item)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return outbound.DraftResult{}, app.Internal(err)
		}
		label := input.ProductName
		if label == "" {
			label = input.SKU
		}
		if len(matches) == 0 {
			return outbound.DraftResult{}, app.NewError("PRODUCT_NOT_FOUND", fmt.Sprintf("Item %d (%s) was not found with a current default price.", index+1, label), 404)
		}
		if len(matches) > 1 {
			return outbound.DraftResult{}, app.NewError("AMBIGUOUS_PRODUCT", fmt.Sprintf("Item %d (%s) matches multiple variants. Add its SKU.", index+1, label), 409)
		}
		item := matches[0]
		if len(items) > 0 && item.currency != items[0].currency {
			return outbound.DraftResult{}, app.NewError("CURRENCY_MISMATCH", "All products in an order must use the same currency.", 409)
		}
		if existing, ok := byVariant[item.variantID]; ok {
			combined := math.Round((items[existing].quantity+input.Quantity)*1000000) / 1000000
			if !domain.ValidQuantity(combined) {
				return outbound.DraftResult{}, app.NewError("VALIDATION_ERROR", fmt.Sprintf("The combined quantity for %s is too large.", item.name), 400)
			}
			items[existing].quantity = combined
		} else {
			item.quantity, item.lineID = input.Quantity, uuid.NewString()
			byVariant[item.variantID] = len(items)
			items = append(items, item)
		}
	}
	// Every draft locks stock in the same variant order. Repeated products have
	// already been combined, so availability is checked against their full quantity.
	locked := append([]draftItem(nil), items...)
	sort.Slice(locked, func(i, j int) bool { return locked[i].variantID < locked[j].variantID })
	for _, item := range locked {
		if !item.stockTracked {
			continue
		}
		var available float64
		err = tx.QueryRow(ctx, `SELECT (quantity_on_hand-quantity_reserved)::float8 FROM inventory_balances WHERE merchant_id=$1::uuid AND location_id=$2::uuid AND variant_id=$3::uuid FOR UPDATE`, g.MerchantID, locationID, item.variantID).Scan(&available)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && available <= 0) {
			return outbound.DraftResult{}, app.NewError("NO_STOCK", fmt.Sprintf("There is no more stock for %s (%s).", item.name, item.sku), 409)
		}
		if err != nil {
			return outbound.DraftResult{}, app.Internal(err)
		}
		if item.quantity > available {
			return outbound.DraftResult{}, app.NewError("INSUFFICIENT_STOCK", fmt.Sprintf("Only %g is available for %s (%s).", available, item.name, item.sku), 409)
		}
	}
	orderID := uuid.NewString()
	var orderNumber string
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, g.MerchantID+":telegram-order-number"); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	err = tx.QueryRow(ctx, `SELECT 'TG-'||to_char(now(),'YYYYMMDD')||'-'||lpad((count(*)+1)::text,4,'0') FROM orders WHERE merchant_id=$1::uuid AND channel='TELEGRAM' AND created_at::date=current_date`, g.MerchantID).Scan(&orderNumber)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	customerName := strings.TrimSpace(in.CustomerName)
	var name *string
	if customerName != "" {
		name = &customerName
	}
	var customerID string
	err = tx.QueryRow(ctx, `INSERT INTO customers(merchant_id,customer_number,customer_type,display_name,metadata) VALUES($1,'TG-'||$2::text,'GUEST',$3,'{"source":"TELEGRAM","label":"Online-Telegram-Customer"}'::jsonb) RETURNING id`, g.MerchantID, orderID, customerName).Scan(&customerID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	billing, err := json.Marshal(map[string]*string{"name": name})
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO orders(id,merchant_id,fulfillment_location_id,order_number,channel,status,currency_code,billing_address,customer_id,payment_type,placed_at) VALUES($1,$2,$3,$4,'TELEGRAM','DRAFT',$5,$6,$7,'Telegram',now())`, orderID, g.MerchantID, locationID, orderNumber, items[0].currency, billing, customerID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	order := tdto.Order{ID: orderID, MerchantID: g.MerchantID, ShopID: g.ShopID, ConnectionID: g.ID, GroupTitle: g.GroupTitle, OrderNumber: orderNumber, Status: "DRAFT", PaymentStatus: "Pending", CurrencyCode: items[0].currency, CustomerName: name, Items: []tdto.OrderItem{}, TelegramUserID: in.UserID, TelegramChatID: in.ChatID, CreatedAt: time.Now().UTC(), ExpiresAt: in.ExpiresAt}
	for index, item := range items {
		quantity := strconv.FormatFloat(item.quantity, 'f', 6, 64)
		var lineTotal string
		err = tx.QueryRow(ctx, `INSERT INTO order_lines(id,merchant_id,order_id,line_number,variant_id,unit_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,round($8::numeric*$9::numeric,2)) RETURNING line_total::text`, item.lineID, g.MerchantID, orderID, index+1, item.variantID, item.unitID, item.name, quantity, item.price).Scan(&lineTotal)
		if err != nil {
			return outbound.DraftResult{}, app.Internal(err)
		}
		if item.stockTracked {
			_, err = tx.Exec(ctx, `INSERT INTO inventory_reservations(merchant_id,order_line_id,location_id,variant_id,quantity,reservation_key) VALUES($1,$2,$3,$4,$5::numeric,$6)`, g.MerchantID, item.lineID, locationID, item.variantID, quantity, "telegram-order:"+orderID+":"+item.lineID)
			if err != nil {
				return outbound.DraftResult{}, app.Internal(err)
			}
		}
		order.Items = append(order.Items, tdto.OrderItem{LineNumber: index + 1, VariantID: item.variantID, SKU: item.sku, Description: item.name, Quantity: quantity, UnitPrice: item.price, LineTotal: lineTotal})
	}
	err = tx.QueryRow(ctx, `UPDATE orders SET subtotal=(SELECT sum(line_total) FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2::uuid),grand_total=(SELECT sum(line_total) FROM order_lines WHERE merchant_id=$1::uuid AND order_id=$2::uuid) WHERE merchant_id=$1::uuid AND id=$2::uuid RETURNING grand_total::text`, g.MerchantID, orderID).Scan(&order.GrandTotal)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	setLegacyItem(&order)
	_, err = tx.Exec(ctx, `INSERT INTO payments(merchant_id,order_id,method,status,amount,idempotency_key) SELECT merchant_id,id,'Telegram','PENDING',grand_total,'telegram-payment:'||id::text FROM orders WHERE merchant_id=$1::uuid AND id=$2::uuid AND grand_total>0`, g.MerchantID, orderID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	confirmID, cancelID := uuid.NewString(), uuid.NewString()
	_, err = tx.Exec(ctx, `INSERT INTO telegram_order_sources(merchant_id,shop_id,order_id,telegram_group_connection_id,telegram_chat_id,telegram_message_id,telegram_user_id,telegram_update_id,confirmation_callback_id,cancellation_callback_id,original_command,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, g.MerchantID, g.ShopID, orderID, g.ID, in.ChatID, in.MessageID, in.UserID, in.UpdateID, confirmID, cancelID, in.OriginalCommand, in.ExpiresAt)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO telegram_callback_tokens(id,merchant_id,connection_id,order_id,action,token_hash,expires_at) VALUES($1,$2,$3,$4,'CONFIRM',$5,$6),($7,$2,$3,$4,'CANCEL',$8,$6)`, confirmID, g.MerchantID, g.ID, orderID, in.ConfirmTokenHash, in.ExpiresAt, cancelID, in.CancelTokenHash)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(merchant_id,event_type,aggregate_type,aggregate_id,event_key,payload) VALUES($1::uuid,'TELEGRAM_ORDER_CREATED','ORDER',$2::uuid,'telegram-order-created:'||($2::uuid)::text,jsonb_build_object('connection_id',$3::text))`, g.MerchantID, orderID, g.ID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO audit_events(merchant_id,action,entity_type,entity_id,after_data) VALUES($1::uuid,'TELEGRAM_DRAFT_ORDER_CREATED','ORDER',$2::uuid,jsonb_build_object('connection_id',$3::text,'telegram_user_id',$4::bigint))`, g.MerchantID, orderID, g.ID, in.UserID)
	if err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	if autoConfirm {
		if _, err = tx.Exec(ctx, `UPDATE telegram_order_sources SET auto_confirmed=true WHERE merchant_id=$1::uuid AND order_id=$2::uuid`, g.MerchantID, orderID); err != nil {
			return outbound.DraftResult{}, app.Internal(err)
		}
		order, err = r.transitionOrder(ctx, tx, nil, orderID, "CONFIRM", "AUTOMATIC", in.UserID, true)
		if err != nil {
			return outbound.DraftResult{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return outbound.DraftResult{}, app.Internal(err)
	}
	return outbound.DraftResult{Order: order, ConfirmCallbackID: confirmID, CancelCallbackID: cancelID}, nil
}

// Preserve the existing first-item fields for older clients. Current clients
// render Items, which is authoritative for multi-product orders.
func setLegacyItem(order *tdto.Order) {
	if len(order.Items) == 0 {
		return
	}
	item := order.Items[0]
	order.Description, order.Quantity, order.UnitPrice = item.Description, item.Quantity, item.UnitPrice
}
