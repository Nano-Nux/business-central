package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/services/application/dto"
	"github.com/jackc/pgx/v5"
)

func allocateRepairPayment(ctx context.Context, tx pgx.Tx, merchantID, repairOrderID, paymentID, amountText string, requested []dto.WorkItemPaymentAllocationRequest) ([]dto.WorkItemPaymentAllocation, error) {
	amount, err := strconv.ParseFloat(amountText, 64)
	if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) || amount <= 0 {
		return nil, app.Validation("Payment amount must be greater than zero.", nil)
	}
	amount = serviceMoney(amount)
	items, err := listRepairWorkItemsTx(ctx, tx, merchantID, repairOrderID)
	if err != nil {
		return nil, err
	}
	balances := map[string]float64{}
	for _, item := range items {
		balances[item.ID], _ = strconv.ParseFloat(item.Financials.Balance, 64)
	}
	allocations := []dto.WorkItemPaymentAllocation{}
	if len(requested) > 0 {
		seen := map[string]bool{}
		total := 0.0
		for _, allocation := range requested {
			value, parseErr := strconv.ParseFloat(allocation.Amount, 64)
			workItemID := strings.TrimSpace(allocation.WorkItemID)
			value = serviceMoney(value)
			balance, exists := balances[workItemID]
			if parseErr != nil || math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 || !exists || seen[workItemID] || value-balance > 0.021 {
				return nil, app.Validation("Payment allocations must identify unique work items and cannot exceed their balances.", nil)
			}
			seen[workItemID] = true
			total += value
			allocations = append(allocations, dto.WorkItemPaymentAllocation{WorkItemID: workItemID, Amount: fmt.Sprintf("%.2f", value)})
		}
		if math.Abs(total-amount) > 0.005 {
			return nil, app.Validation("Work-item payment allocations must equal the payment amount.", nil)
		}
	} else {
		remaining := serviceMoney(amount)
		for _, item := range items {
			if remaining <= 0 {
				break
			}
			value := math.Min(balances[item.ID], remaining)
			if value <= 0 {
				continue
			}
			value = serviceMoney(value)
			allocations = append(allocations, dto.WorkItemPaymentAllocation{WorkItemID: item.ID, Amount: fmt.Sprintf("%.2f", value)})
			remaining = serviceMoney(remaining - value)
		}
		if remaining > 0.005 && remaining <= 0.021 && len(allocations) > 0 {
			last := &allocations[len(allocations)-1]
			lastValue, _ := strconv.ParseFloat(last.Amount, 64)
			last.Amount = fmt.Sprintf("%.2f", serviceMoney(lastValue+remaining))
			remaining = 0
		}
		if remaining > 0.005 {
			return nil, app.Validation("Payment could not be allocated within the work-item balances.", nil)
		}
	}
	for _, allocation := range allocations {
		if _, err := tx.Exec(ctx, `INSERT INTO service_work_item_payment_allocations(merchant_id,payment_id,work_item_id,amount) VALUES($1::uuid,$2::uuid,$3::uuid,$4)`, merchantID, paymentID, allocation.WorkItemID, allocation.Amount); err != nil {
			return nil, err
		}
	}
	return allocations, nil
}

func validRepairWorkItemStatus(status string) bool {
	switch status {
	case "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED":
		return true
	default:
		return false
	}
}

func deriveRepairParentStatus(current string, total, completed, inProgress, cancelled int) string {
	if current == "COMPLETED" || current == "REFUNDED" {
		return current
	}
	if total > 0 && completed == total {
		return "READY_FOR_PICKUP"
	}
	if inProgress > 0 || completed > 0 || cancelled > 0 {
		return "IN_PROGRESS"
	}
	return "RECEIVED"
}

func validateRepairWorkItem(tx pgx.Tx, ctx context.Context, merchantID, repairOrderID string, workItemID *string) error {
	if workItemID == nil || strings.TrimSpace(*workItemID) == "" {
		return nil
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM repair_orders ro JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid AND wi.id=$3::uuid)`, merchantID, repairOrderID, *workItemID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return app.Validation("The work item does not belong to this repair ticket.", nil)
	}
	return nil
}

func validateServiceOrderWorkItem(tx pgx.Tx, ctx context.Context, merchantID, serviceOrderID string, workItemID *string) error {
	if workItemID == nil || strings.TrimSpace(*workItemID) == "" {
		return nil
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM service_order_work_items WHERE merchant_id=$1::uuid AND service_order_id=$2::uuid AND id=$3::uuid)`, merchantID, serviceOrderID, *workItemID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return app.Validation("The work item does not belong to this service order.", nil)
	}
	return nil
}

func listRepairWorkItemsTx(ctx context.Context, tx pgx.Tx, merchantID, repairOrderID string) ([]dto.RepairWorkItem, error) {
	rows, err := tx.Query(ctx, `SELECT wi.id,wi.service_order_id,wi.sequence_number,wi.item_type,wi.status,wi.form_version,wi.summary,
		d.id,d.merchant_id,d.customer_id,d.device_type,d.manufacturer,d.model,d.serial_number,d.metadata,d.created_at,
		wid.issue_description,wid.issues,wid.conditions,wid.notes,wid.additional_fee::text,wid.waiting_start_date::text,wid.waiting_end_date::text,(wid.waiting_end_date-wid.waiting_start_date)::int,wid.custom_fields,
		finance.subtotal::text,finance.discount_total::text,finance.tax_amount::text,finance.total::text,finance.paid::text,GREATEST(finance.total-finance.paid,0)::text
		FROM repair_orders ro
		JOIN service_order_work_items wi ON wi.merchant_id=ro.merchant_id AND wi.service_order_id=ro.service_order_id
		JOIN repair_work_item_devices wid ON wid.merchant_id=wi.merchant_id AND wid.work_item_id=wi.id
		JOIN repair_devices d ON d.merchant_id=wid.merchant_id AND d.id=wid.repair_device_id
		JOIN LATERAL (`+workItemFinancialSQL+`) finance ON TRUE
		WHERE ro.merchant_id=$1::uuid AND ro.id=$2::uuid ORDER BY wi.sequence_number`, merchantID, repairOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []dto.RepairWorkItem{}
	for rows.Next() {
		var item dto.RepairWorkItem
		var fields, issues, conditions json.RawMessage
		if err := rows.Scan(&item.ID, &item.ServiceOrderID, &item.SequenceNumber, &item.Type, &item.Status, &item.FormVersion, &item.Summary,
			&item.Device.ID, &item.Device.MerchantID, &item.Device.CustomerID, &item.Device.DeviceType, &item.Device.Manufacturer,
			&item.Device.Model, &item.Device.SerialNumber, &item.Device.Metadata, &item.Device.CreatedAt,
			&item.IssueDescription, &issues, &conditions, &item.Note, &item.AdditionalFee, &item.WaitingStartDate, &item.WaitingEndDate, &item.WaitingDays, &fields,
			&item.Financials.Subtotal, &item.Financials.DiscountTotal, &item.Financials.TaxAmount, &item.Financials.Total, &item.Financials.Paid, &item.Financials.Balance); err != nil {
			return nil, err
		}
		if err := decodeRepairLists(&item, issues, conditions); err != nil {
			return nil, err
		}
		item.Fields = map[string]json.RawMessage{}
		if len(fields) > 0 && string(fields) != "null" {
			if err := json.Unmarshal(fields, &item.Fields); err != nil {
				return nil, err
			}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

const workItemFinancialSQL = `
	SELECT gross.subtotal,
		ROUND(CASE WHEN totals.subtotal > 0 THEN totals.discount_total * gross.subtotal / totals.subtotal ELSE 0 END,2) AS discount_total,
		ROUND(CASE WHEN totals.subtotal > 0 THEN totals.tax_amount * gross.subtotal / totals.subtotal ELSE 0 END,2) AS tax_amount,
		gross.subtotal
		- ROUND(CASE WHEN totals.subtotal > 0 THEN totals.discount_total * gross.subtotal / totals.subtotal ELSE 0 END,2)
		+ ROUND(CASE WHEN totals.subtotal > 0 THEN totals.tax_amount * gross.subtotal / totals.subtotal ELSE 0 END,2) AS total,
		ROUND(COALESCE((SELECT SUM(allocation.amount * GREATEST(payment.amount - COALESCE((SELECT SUM(refund.amount) FROM refunds refund WHERE refund.merchant_id=payment.merchant_id AND refund.payment_id=payment.id AND refund.status='SUCCEEDED'),0),0) / NULLIF(payment.amount,0)) FROM service_work_item_payment_allocations allocation
			JOIN payments payment ON payment.merchant_id=allocation.merchant_id AND payment.id=allocation.payment_id
			WHERE allocation.merchant_id=wi.merchant_id AND allocation.work_item_id=wi.id AND payment.status='CAPTURED'),0),2) AS paid
	FROM LATERAL (SELECT wid.additional_fee + COALESCE((SELECT SUM(item.quantity*item.unit_price) FROM service_order_items item WHERE item.merchant_id=wi.merchant_id AND item.work_item_id=wi.id AND item.status<>'CANCELLED'),0) AS subtotal) gross
	CROSS JOIN LATERAL (SELECT COALESCE(canonical.subtotal,0) AS subtotal,COALESCE(canonical.discount_total,0) AS discount_total,COALESCE(canonical.tax_total,0) AS tax_amount FROM service_orders service_order LEFT JOIN orders canonical ON canonical.merchant_id=service_order.merchant_id AND canonical.id=service_order.order_id WHERE service_order.merchant_id=wi.merchant_id AND service_order.id=wi.service_order_id) totals`

func (r *Repository) UpdateRepairWorkItem(ctx context.Context, c *authdto.Claims, id string, x dto.RepairWorkItemUpdateRequest) (dto.RepairWorkItem, error) {
	if x.Status != "" && !validRepairWorkItemStatus(x.Status) {
		return dto.RepairWorkItem{}, app.Validation("Work item status is invalid.", nil)
	}
	if x.Issues != nil {
		normalized, err := normalizeRepairTextList(*x.Issues, "issues")
		if err != nil {
			return dto.RepairWorkItem{}, err
		}
		x.Issues = &normalized
		if len(normalized) == 0 {
			return dto.RepairWorkItem{}, app.Validation("A work item requires at least one issue.", nil)
		}
		first := normalized[0]
		x.IssueDescription = &first
	}
	// Older clients update only the singular compatibility field. Keep the
	// canonical ordered list in sync so later reads cannot retain a stale issue.
	if x.Issues == nil && x.IssueDescription != nil {
		normalized, err := normalizeRepairTextList([]string{*x.IssueDescription}, "issues")
		if err != nil {
			return dto.RepairWorkItem{}, err
		}
		if len(normalized) == 0 {
			return dto.RepairWorkItem{}, app.Validation("Work item issue description cannot be empty.", nil)
		}
		x.Issues = &normalized
		first := normalized[0]
		x.IssueDescription = &first
	}
	if x.Conditions != nil {
		normalized, err := normalizeRepairTextList(*x.Conditions, "conditions")
		if err != nil {
			return dto.RepairWorkItem{}, err
		}
		x.Conditions = &normalized
	}
	if x.IssueDescription != nil && strings.TrimSpace(*x.IssueDescription) == "" {
		return dto.RepairWorkItem{}, app.Validation("Work item issue description cannot be empty.", nil)
	}
	if x.Device != nil && strings.TrimSpace(x.Device.DeviceType) == "" {
		return dto.RepairWorkItem{}, app.Validation("A work item device type is required.", nil)
	}
	if x.WaitingDays != nil || x.WaitingEndDate != nil {
		if err := normalizeRepairWaiting(&x.WaitingDays, &x.WaitingEndDate); err != nil {
			return dto.RepairWorkItem{}, app.Validation(err.Error(), nil)
		}
	}
	if x.Fields != nil {
		for code, raw := range x.Fields {
			if strings.TrimSpace(code) == "" || len(raw) == 0 || !json.Valid(raw) {
				return dto.RepairWorkItem{}, app.Validation("Work item custom fields must contain valid JSON values.", nil)
			}
		}
	}
	return write(ctx, r.pool, c, func(tx pgx.Tx) (dto.RepairWorkItem, error) {
		var serviceOrderID, serviceType string
		if err := tx.QueryRow(ctx, `SELECT wi.service_order_id,so.service_type FROM service_order_work_items wi JOIN service_orders so ON so.merchant_id=wi.merchant_id AND so.id=wi.service_order_id WHERE wi.merchant_id=$1::uuid AND wi.id=$2::uuid`, c.MerchantID, id).Scan(&serviceOrderID, &serviceType); err != nil {
			return dto.RepairWorkItem{}, err
		}
		if x.Fields != nil {
			if _, err := validateAndStoreCustomFields(ctx, tx, c.MerchantID, "REPAIR_WORK_ITEM", "WORK_ITEM", serviceType, id, x.Fields); err != nil {
				return dto.RepairWorkItem{}, err
			}
		}
		if x.Device != nil {
			meta := x.Device.Metadata
			if len(meta) == 0 {
				meta = json.RawMessage(`{}`)
			}
			if !json.Valid(meta) {
				return dto.RepairWorkItem{}, app.Validation("Device metadata must be valid JSON.", nil)
			}
			if _, err := tx.Exec(ctx, `UPDATE repair_devices d SET customer_id=$3::uuid,device_type=$4::text,manufacturer=$5::text,model=$6::text,serial_number=$7::text,metadata=$8::jsonb WHERE d.merchant_id=$1::uuid AND d.id=(SELECT repair_device_id FROM repair_work_item_devices WHERE merchant_id=$1::uuid AND work_item_id=$2::uuid)`, c.MerchantID, id, x.Device.CustomerID, x.Device.DeviceType, x.Device.Manufacturer, x.Device.Model, x.Device.SerialNumber, meta); err != nil {
				return dto.RepairWorkItem{}, err
			}
		}
		fieldsJSON := []byte(nil)
		if x.Fields != nil {
			var err error
			fieldsJSON, err = json.Marshal(x.Fields)
			if err != nil {
				return dto.RepairWorkItem{}, err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE service_order_work_items SET status=COALESCE(NULLIF($3::text,''),status),summary=COALESCE($4::text,summary),assigned_membership_id=COALESCE($5::uuid,assigned_membership_id),updated_at=now(),form_version=CASE WHEN $6::jsonb IS NULL THEN form_version ELSE GREATEST(form_version,COALESCE((SELECT max(form_version) FROM custom_field_definitions WHERE merchant_id=$1::uuid AND entity_type='REPAIR_WORK_ITEM' AND field_scope='WORK_ITEM' AND is_active),form_version)) END WHERE merchant_id=$1::uuid AND id=$2::uuid`, c.MerchantID, id, x.Status, x.Summary, x.AssignedMembershipID, fieldsJSON); err != nil {
			return dto.RepairWorkItem{}, err
		}
		var issuesJSON, conditionsJSON []byte
		if x.Issues != nil {
			issuesJSON, _ = json.Marshal(*x.Issues)
		}
		if x.Conditions != nil {
			conditionsJSON, _ = json.Marshal(*x.Conditions)
		}
		if x.IssueDescription != nil || x.Issues != nil || x.Conditions != nil || x.Note != nil || x.Fields != nil || x.WaitingDays != nil || x.WaitingEndDate != nil {
			if _, err := tx.Exec(ctx, `UPDATE repair_work_item_devices SET issue_description=COALESCE($3::text,issue_description),issues=COALESCE($4::jsonb,issues),conditions=COALESCE($5::jsonb,conditions),notes=COALESCE($6::text,notes),custom_fields=COALESCE($7::jsonb,custom_fields),waiting_end_date=CASE WHEN $8::text IS NOT NULL THEN $8::date WHEN $9::int IS NOT NULL THEN waiting_start_date+$9::int ELSE waiting_end_date END WHERE merchant_id=$1::uuid AND work_item_id=$2::uuid`, c.MerchantID, id, x.IssueDescription, issuesJSON, conditionsJSON, x.Note, fieldsJSON, x.WaitingEndDate, x.WaitingDays); err != nil {
				return dto.RepairWorkItem{}, err
			}
		}
		if x.Status != "" {
			if err := syncRepairParentLifecycle(ctx, tx, c.MerchantID, serviceOrderID); err != nil {
				return dto.RepairWorkItem{}, err
			}
		}
		return scanRepairWorkItem(ctx, tx, c.MerchantID, id, serviceOrderID)
	})
}

func syncRepairParentLifecycle(ctx context.Context, tx pgx.Tx, merchantID, serviceOrderID string) error {
	var repairOrderID, currentRepairStatus, currentServiceStatus string
	if err := tx.QueryRow(ctx, `SELECT ro.id,ro.status,so.status
		FROM repair_orders ro JOIN service_orders so ON so.merchant_id=ro.merchant_id AND so.id=ro.service_order_id
		WHERE ro.merchant_id=$1::uuid AND ro.service_order_id=$2::uuid FOR UPDATE`, merchantID, serviceOrderID).
		Scan(&repairOrderID, &currentRepairStatus, &currentServiceStatus); err != nil {
		return err
	}
	var total, completed, inProgress, cancelled int
	if err := tx.QueryRow(ctx, `SELECT count(*)::int,
		count(*) FILTER (WHERE status='COMPLETED')::int,
		count(*) FILTER (WHERE status='IN_PROGRESS')::int,
		count(*) FILTER (WHERE status='CANCELLED')::int
		FROM service_order_work_items WHERE merchant_id=$1::uuid AND service_order_id=$2::uuid`, merchantID, serviceOrderID).
		Scan(&total, &completed, &inProgress, &cancelled); err != nil {
		return err
	}
	parentStatus := deriveRepairParentStatus(currentRepairStatus, total, completed, inProgress, cancelled)
	if parentStatus != currentRepairStatus {
		if _, err := tx.Exec(ctx, `UPDATE repair_orders SET status=$3::text,completed_at=CASE WHEN $3::text='COMPLETED' THEN COALESCE(completed_at,now()) ELSE completed_at END WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, repairOrderID, parentStatus); err != nil {
			return err
		}
	}
	serviceStatus := "OPEN"
	if parentStatus == "COMPLETED" {
		serviceStatus = "COMPLETED"
	} else if parentStatus == "REFUNDED" {
		serviceStatus = "CANCELLED"
	} else if parentStatus == "IN_PROGRESS" || parentStatus == "READY_FOR_PICKUP" {
		serviceStatus = "IN_PROGRESS"
	}
	if currentServiceStatus != "COMPLETED" && currentServiceStatus != "CANCELLED" && currentServiceStatus != serviceStatus {
		if _, err := tx.Exec(ctx, `UPDATE service_orders SET status=$3::text WHERE merchant_id=$1::uuid AND id=$2::uuid`, merchantID, serviceOrderID, serviceStatus); err != nil {
			return err
		}
	}
	return nil
}

func scanRepairWorkItem(ctx context.Context, tx pgx.Tx, merchantID, id, serviceOrderID string) (dto.RepairWorkItem, error) {
	var item dto.RepairWorkItem
	var fields, issues, conditions json.RawMessage
	err := tx.QueryRow(ctx, `SELECT wi.id,wi.service_order_id,wi.sequence_number,wi.item_type,wi.status,wi.form_version,wi.summary,
		d.id,d.merchant_id,d.customer_id,d.device_type,d.manufacturer,d.model,d.serial_number,d.metadata,d.created_at,
		wid.issue_description,wid.issues,wid.conditions,wid.notes,wid.additional_fee::text,wid.waiting_start_date::text,wid.waiting_end_date::text,(wid.waiting_end_date-wid.waiting_start_date)::int,wid.custom_fields
		FROM service_order_work_items wi JOIN repair_work_item_devices wid ON wid.merchant_id=wi.merchant_id AND wid.work_item_id=wi.id JOIN repair_devices d ON d.merchant_id=wid.merchant_id AND d.id=wid.repair_device_id
		WHERE wi.merchant_id=$1::uuid AND wi.id=$2::uuid AND wi.service_order_id=$3::uuid`, merchantID, id, serviceOrderID).Scan(
		&item.ID, &item.ServiceOrderID, &item.SequenceNumber, &item.Type, &item.Status, &item.FormVersion, &item.Summary,
		&item.Device.ID, &item.Device.MerchantID, &item.Device.CustomerID, &item.Device.DeviceType, &item.Device.Manufacturer, &item.Device.Model, &item.Device.SerialNumber, &item.Device.Metadata, &item.Device.CreatedAt,
		&item.IssueDescription, &issues, &conditions, &item.Note, &item.AdditionalFee, &item.WaitingStartDate, &item.WaitingEndDate, &item.WaitingDays, &fields)
	if err != nil {
		return item, err
	}
	if err := decodeRepairLists(&item, issues, conditions); err != nil {
		return item, err
	}
	item.Fields = map[string]json.RawMessage{}
	if len(fields) > 0 && string(fields) != "null" {
		if err := json.Unmarshal(fields, &item.Fields); err != nil {
			return item, err
		}
	}
	return item, nil
}

func decodeRepairLists(item *dto.RepairWorkItem, issues, conditions json.RawMessage) error {
	item.Issues = []string{}
	item.Conditions = []string{}
	if len(issues) > 0 && string(issues) != "null" {
		if err := json.Unmarshal(issues, &item.Issues); err != nil {
			return err
		}
	}
	if len(item.Issues) == 0 && strings.TrimSpace(item.IssueDescription) != "" {
		item.Issues = []string{item.IssueDescription}
	}
	if len(conditions) > 0 && string(conditions) != "null" {
		if err := json.Unmarshal(conditions, &item.Conditions); err != nil {
			return err
		}
	}
	return nil
}
