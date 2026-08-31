package postgres

import (
	"context"
	"encoding/json"
	"testing"

	authdto "business-central-backend/internal/auth/application/dto"
	servicedto "business-central-backend/internal/services/application/dto"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// nestedTransaction is deliberately inert: this test verifies that an
// idempotent child command reuses the parent transaction before any database
// operation is attempted.
type nestedTransaction struct{}

func (nestedTransaction) Begin(context.Context) (pgx.Tx, error) { return nil, nil }
func (nestedTransaction) Commit(context.Context) error          { return nil }
func (nestedTransaction) Rollback(context.Context) error        { return nil }
func (nestedTransaction) CopyFrom(context.Context, pgx.Identifier, []string, pgx.CopyFromSource) (int64, error) {
	return 0, nil
}
func (nestedTransaction) SendBatch(context.Context, *pgx.Batch) pgx.BatchResults { return nil }
func (nestedTransaction) LargeObjects() pgx.LargeObjects                         { return pgx.LargeObjects{} }
func (nestedTransaction) Prepare(context.Context, string, string) (*pgconn.StatementDescription, error) {
	return nil, nil
}
func (nestedTransaction) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}
func (nestedTransaction) Query(context.Context, string, ...any) (pgx.Rows, error) { return nil, nil }
func (nestedTransaction) QueryRow(context.Context, string, ...any) pgx.Row        { return nil }
func (nestedTransaction) Conn() *pgx.Conn                                         { return nil }

func TestWriteIdempotentReusesParentTransaction(t *testing.T) {
	parent := nestedTransaction{}
	ctx := context.WithValue(context.Background(), transactionContextKey{}, pgx.Tx(parent))
	called := false

	result, err := writeIdempotent(ctx, nil, &authdto.Claims{}, "repair.part", "child-key", map[string]string{"part": "1"}, func(tx pgx.Tx) (string, error) {
		called = true
		if tx != parent {
			t.Fatal("child command did not receive the parent transaction")
		}
		return "created", nil
	})
	if err != nil {
		t.Fatalf("writeIdempotent returned an error: %v", err)
	}
	if !called || result != "created" {
		t.Fatalf("expected child command to run in the parent transaction; called=%v result=%q", called, result)
	}
}

func TestValidRepairStatus(t *testing.T) {
	for _, status := range []string{"RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "REFUNDED"} {
		if !validRepairStatus(status) {
			t.Fatalf("expected %s to be a valid repair status", status)
		}
	}
	for _, status := range []string{"", "DIAGNOSING", "AWAITING_APPROVAL", "IN_REPAIR", "READY", "CANCELLED"} {
		if validRepairStatus(status) {
			t.Fatalf("expected legacy repair status %s to be rejected", status)
		}
	}
}

func TestCanonicalOrderStatusPathUsesLegalPaymentTransitions(t *testing.T) {
	for _, test := range []struct {
		current string
		target  string
		want    []string
	}{
		{current: "DRAFT", target: "PENDING_PAYMENT", want: []string{"PENDING_PAYMENT"}},
		{current: "DRAFT", target: "CONFIRMED", want: []string{"PENDING_PAYMENT", "CONFIRMED"}},
		{current: "PENDING_PAYMENT", target: "CONFIRMED", want: []string{"CONFIRMED"}},
		{current: "PENDING_PAYMENT", target: "FULFILLED", want: []string{"CONFIRMED", "PROCESSING", "FULFILLED"}},
		{current: "DRAFT", target: "FULFILLED", want: []string{"PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "FULFILLED"}},
		{current: "PARTIALLY_FULFILLED", target: "FULFILLED", want: []string{"FULFILLED"}},
	} {
		got, err := canonicalOrderStatusPath(test.current, test.target)
		if err != nil {
			t.Fatalf("canonicalOrderStatusPath(%q, %q): %v", test.current, test.target, err)
		}
		if len(got) != len(test.want) {
			t.Fatalf("canonicalOrderStatusPath(%q, %q) = %#v, want %#v", test.current, test.target, got, test.want)
		}
		for i := range got {
			if got[i] != test.want[i] {
				t.Fatalf("canonicalOrderStatusPath(%q, %q) = %#v, want %#v", test.current, test.target, got, test.want)
			}
		}
	}
	if _, err := canonicalOrderStatusPath("CANCELLED", "FULFILLED"); err == nil {
		t.Fatal("expected a cancelled canonical order to reject payment fulfillment")
	}
}

func TestNormalizeRepairWorkItemsKeepsLegacyPayloadCompatible(t *testing.T) {
	customerID := "customer-1"
	items, err := normalizeRepairWorkItems(servicedto.CreateRepairTicketRequest{
		Device:           servicedto.RepairDeviceRequest{DeviceType: "PHONE"},
		IssueDescription: "Cracked screen",
		CustomerID:       &customerID,
		Note:             stringPtr("intake note"),
	})
	if err != nil {
		t.Fatalf("normalize legacy payload: %v", err)
	}
	if len(items) != 1 || items[0].Type != "DEVICE" || items[0].IssueDescription != "Cracked screen" {
		t.Fatalf("unexpected normalized legacy item: %#v", items)
	}
	if items[0].Device.CustomerID == nil || *items[0].Device.CustomerID != customerID {
		t.Fatalf("customer scope was not copied to the work item")
	}
}

func TestNormalizeRepairWorkItemsKeepsMultipleIssuesAndConditions(t *testing.T) {
	items, err := normalizeRepairWorkItems(servicedto.CreateRepairTicketRequest{
		WorkItems: []servicedto.RepairWorkItemRequest{{
			Device:     servicedto.RepairDeviceRequest{DeviceType: "PHONE"},
			Issues:     []string{" Screen flickers ", "Battery drains", "screen flickers"},
			Conditions: []string{" Scratched frame ", ""},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || len(items[0].Issues) != 2 || items[0].IssueDescription != "Screen flickers" {
		t.Fatalf("issues were not normalized: %#v", items)
	}
	if len(items[0].Conditions) != 1 || items[0].Conditions[0] != "Scratched frame" {
		t.Fatalf("conditions were not normalized: %#v", items[0].Conditions)
	}
}

func TestNormalizeRepairPreset(t *testing.T) {
	preset, err := normalizeRepairPreset(servicedto.RepairPresetRequest{ShopID: " shop-1 ", PresetType: "condition", Value: " Scratched frame "})
	if err != nil {
		t.Fatal(err)
	}
	if preset.ShopID != "shop-1" || preset.PresetType != "CONDITION" || preset.Value != "Scratched frame" {
		t.Fatalf("preset was not normalized: %#v", preset)
	}
}

func TestNormalizeRepairTicketCustomerSharesOneCustomerAcrossWorkItems(t *testing.T) {
	firstCustomer := "customer-1"
	items := []servicedto.RepairWorkItemRequest{
		{Device: servicedto.RepairDeviceRequest{DeviceType: "PHONE", CustomerID: &firstCustomer}, IssueDescription: "Screen"},
		{Device: servicedto.RepairDeviceRequest{DeviceType: "TABLET"}, IssueDescription: "Battery"},
	}
	customerID, err := normalizeRepairTicketCustomer(servicedto.CreateRepairTicketRequest{}, items)
	if err != nil || customerID == nil || *customerID != firstCustomer {
		t.Fatalf("expected the first child customer to become the ticket customer, id=%v err=%v", customerID, err)
	}
	if items[1].Device.CustomerID == nil || *items[1].Device.CustomerID != firstCustomer {
		t.Fatalf("expected the shared customer to be copied to every work item")
	}
}

func TestNormalizeRepairTicketCustomerRejectsDifferentWorkItemCustomers(t *testing.T) {
	firstCustomer := "customer-1"
	secondCustomer := "customer-2"
	_, err := normalizeRepairTicketCustomer(servicedto.CreateRepairTicketRequest{}, []servicedto.RepairWorkItemRequest{
		{Device: servicedto.RepairDeviceRequest{DeviceType: "PHONE", CustomerID: &firstCustomer}, IssueDescription: "Screen"},
		{Device: servicedto.RepairDeviceRequest{DeviceType: "TABLET", CustomerID: &secondCustomer}, IssueDescription: "Battery"},
	})
	if err == nil {
		t.Fatal("expected different work-item customers to be rejected")
	}
}

func TestNormalizeRepairWorkItemsValidatesEveryChild(t *testing.T) {
	_, err := normalizeRepairWorkItems(servicedto.CreateRepairTicketRequest{
		WorkItems: []servicedto.RepairWorkItemRequest{
			{Type: "DEVICE", Device: servicedto.RepairDeviceRequest{DeviceType: "PHONE"}, IssueDescription: "Screen"},
			{Type: "UNSUPPORTED", Device: servicedto.RepairDeviceRequest{DeviceType: "LAPTOP"}, IssueDescription: "Battery"},
		},
	})
	if err == nil {
		t.Fatal("expected unsupported work item type to be rejected")
	}
}

func TestNormalizeRepairWorkItemsRejectsDuplicateClientIDs(t *testing.T) {
	_, err := normalizeRepairWorkItems(servicedto.CreateRepairTicketRequest{
		WorkItems: []servicedto.RepairWorkItemRequest{
			{ID: "11111111-1111-1111-1111-111111111111", Type: "DEVICE", Device: servicedto.RepairDeviceRequest{DeviceType: "PHONE"}, IssueDescription: "Screen"},
			{ID: "11111111-1111-1111-1111-111111111111", Type: "DEVICE", Device: servicedto.RepairDeviceRequest{DeviceType: "TABLET"}, IssueDescription: "Battery"},
		},
	})
	if err == nil {
		t.Fatal("expected duplicate client work item ids to be rejected")
	}
}

func TestNormalizeRepairTicketDetailsUsesFirstWorkItemAsTicketSummary(t *testing.T) {
	firstID := "11111111-1111-1111-1111-111111111111"
	secondID := "22222222-2222-2222-2222-222222222222"
	issue, items, err := normalizeRepairTicketDetails(servicedto.RepairTicketDetailsRequest{
		IssueDescription: "Legacy summary",
		WorkItems: []servicedto.RepairTicketWorkItemDetailsRequest{
			{ID: firstID, IssueDescription: "Phone screen"},
			{ID: secondID, IssueDescription: "Tablet battery"},
		},
	})
	if err != nil {
		t.Fatalf("normalize work-item details: %v", err)
	}
	if issue != "Phone screen" || len(items) != 2 || items[1].ID != secondID {
		t.Fatalf("unexpected normalized details: issue=%q items=%#v", issue, items)
	}
}

func TestNormalizeRepairTicketDetailsRequiresValidChildDetails(t *testing.T) {
	_, _, err := normalizeRepairTicketDetails(servicedto.RepairTicketDetailsRequest{
		WorkItems: []servicedto.RepairTicketWorkItemDetailsRequest{{ID: "not-a-uuid", IssueDescription: "Screen"}},
	})
	if err == nil {
		t.Fatal("expected invalid work-item id to be rejected")
	}
	_, _, err = normalizeRepairTicketDetails(servicedto.RepairTicketDetailsRequest{
		WorkItems: []servicedto.RepairTicketWorkItemDetailsRequest{{
			ID:               "11111111-1111-1111-1111-111111111111",
			IssueDescription: "Screen",
			Device:           &servicedto.RepairDeviceRequest{},
		}},
	})
	if err == nil {
		t.Fatal("expected an edited child device without a type to be rejected")
	}
}

func TestNormalizeRepairServiceItemsKeepsLegacyServiceAlias(t *testing.T) {
	serviceID := "service-1"
	items, err := normalizeRepairServiceItems(servicedto.CreateRepairTicketRequest{ServiceID: &serviceID})
	if err != nil {
		t.Fatalf("normalize legacy service: %v", err)
	}
	if len(items) != 1 || items[0].ServiceID == nil || *items[0].ServiceID != serviceID || items[0].Quantity != "1" {
		t.Fatalf("unexpected normalized service item: %#v", items)
	}
}

func TestNormalizeRepairServiceItemsRejectsAmbiguousOrInvalidItems(t *testing.T) {
	serviceID := "service-1"
	variantID := "variant-1"
	for _, request := range []servicedto.CreateRepairTicketRequest{
		{ServiceItems: []servicedto.RepairServiceItemRequest{{ServiceID: &serviceID, VariantID: &variantID, Quantity: "1"}}},
		{ServiceItems: []servicedto.RepairServiceItemRequest{{ServiceID: &serviceID, Quantity: "0"}}},
	} {
		if _, err := normalizeRepairServiceItems(request); err == nil {
			t.Fatal("expected invalid service item to be rejected")
		}
	}
}

func TestNormalizeRepairServiceItemsRequiresWorkItemAllocationForMultipleDevices(t *testing.T) {
	serviceID := "service-1"
	firstID := "11111111-1111-1111-1111-111111111111"
	secondID := "22222222-2222-2222-2222-222222222222"
	request := servicedto.CreateRepairTicketRequest{
		WorkItems: []servicedto.RepairWorkItemRequest{
			{ID: firstID, Device: servicedto.RepairDeviceRequest{DeviceType: "PHONE"}, IssueDescription: "Screen"},
			{ID: secondID, Device: servicedto.RepairDeviceRequest{DeviceType: "TABLET"}, IssueDescription: "Battery"},
		},
		ServiceItems: []servicedto.RepairServiceItemRequest{{ServiceID: &serviceID, Quantity: "1"}},
	}
	if _, err := normalizeRepairServiceItems(request); err == nil {
		t.Fatal("expected an unallocated service line on a multi-device ticket to be rejected")
	}
	request.ServiceItems[0].WorkItemID = &secondID
	if _, err := normalizeRepairServiceItems(request); err != nil {
		t.Fatalf("expected a service line allocated to a ticket work item to validate: %v", err)
	}
}

func TestCustomFieldDefinitionAndValueValidation(t *testing.T) {
	valueType, options, _, _, err := validateCustomFieldDefinitionRequest(servicedto.CustomFieldDefinitionRequest{
		EntityType: "REPAIR_WORK_ITEM",
		FieldScope: "WORK_ITEM",
		FieldCode:  "battery_health",
		Label:      "Battery health",
		ValueType:  "SELECT",
		Options:    json.RawMessage(`[{"value":"GOOD","label":"Good"}]`),
	})
	if err != nil || valueType != "SELECT" || len(options) == 0 {
		t.Fatalf("expected valid select definition, type=%q options=%s err=%v", valueType, options, err)
	}
	definition := customFieldDefinitionForValidation{FieldCode: "battery_health", ValueType: valueType, Options: options}
	if err := validateCustomFieldValue(definition, json.RawMessage(`"GOOD"`)); err != nil {
		t.Fatalf("expected configured option to validate: %v", err)
	}
	if err := validateCustomFieldValue(definition, json.RawMessage(`"UNKNOWN"`)); err == nil {
		t.Fatal("expected unknown select option to be rejected")
	}
	dateDefinition := customFieldDefinitionForValidation{FieldCode: "purchase_date", ValueType: "DATE"}
	if err := validateCustomFieldValue(dateDefinition, json.RawMessage(`"2026-08-12"`)); err != nil {
		t.Fatalf("expected date-only custom field value to validate: %v", err)
	}
}

func TestGenericServiceFieldDefinitionsApplyToSpecializedRepairEntities(t *testing.T) {
	repairType := "REPAIR"
	definition := customFieldDefinitionForValidation{EntityType: "SERVICE_WORK_ITEM", FieldScope: "WORK_ITEM", ServiceType: &repairType}
	if !customFieldDefinitionApplies(definition, "REPAIR_WORK_ITEM", "WORK_ITEM", "REPAIR") {
		t.Fatal("expected a generic service work-item field to apply to repair")
	}
	if customFieldDefinitionApplies(definition, "REPAIR_TICKET", "TICKET", "REPAIR") {
		t.Fatal("expected a work-item definition not to apply to a ticket")
	}
	if customFieldDefinitionApplies(definition, "REPAIR_WORK_ITEM", "WORK_ITEM", "GENERAL") {
		t.Fatal("expected service-type scoping to be enforced")
	}
}

func TestCustomFieldVisibilityRules(t *testing.T) {
	values := map[string]json.RawMessage{
		"has_insurance": json.RawMessage(`true`),
		"device_type":   json.RawMessage(`"PHONE"`),
	}
	if !customFieldVisible(json.RawMessage(`{"field":"has_insurance","equals":true}`), values) {
		t.Fatal("expected matching visibility rule to show the field")
	}
	if customFieldVisible(json.RawMessage(`{"field":"device_type","equals":"TABLET"}`), values) {
		t.Fatal("expected non-matching visibility rule to hide the field")
	}
	if !customFieldVisible(json.RawMessage(`{"all":[{"field":"has_insurance","equals":true},{"field":"device_type","in":["PHONE","TABLET"]}]}`), values) {
		t.Fatal("expected all visibility conditions to be evaluated")
	}
	if customFieldVisible(json.RawMessage(`{"any":[{"field":"device_type","equals":"LAPTOP"},{"field":"has_insurance","equals":false}]}`), values) {
		t.Fatal("expected any visibility conditions to hide when none match")
	}
}

func TestRepairWorkItemStatusValidation(t *testing.T) {
	for _, status := range []string{"OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"} {
		if !validRepairWorkItemStatus(status) {
			t.Fatalf("expected %s to be valid", status)
		}
	}
	if validRepairWorkItemStatus("READY_FOR_PICKUP") {
		t.Fatal("expected ticket-only status to be rejected for a work item")
	}
}

func TestDeriveRepairParentStatus(t *testing.T) {
	for _, test := range []struct {
		name                                 string
		current                              string
		total, completed, inProgress, cancel int
		want                                 string
	}{
		{name: "new", total: 2, want: "RECEIVED"},
		{name: "working", total: 2, completed: 1, inProgress: 1, want: "IN_PROGRESS"},
		{name: "ready", total: 2, completed: 2, want: "READY_FOR_PICKUP"},
		{name: "completed override", current: "COMPLETED", total: 1, want: "COMPLETED"},
		{name: "refunded override", current: "REFUNDED", total: 1, want: "REFUNDED"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := deriveRepairParentStatus(test.current, test.total, test.completed, test.inProgress, test.cancel); got != test.want {
				t.Fatalf("deriveRepairParentStatus() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestNormalizeRepairWaitingSupportsDaysOrEndDate(t *testing.T) {
	days := 4
	daysValue := daysPtr(days)
	var endDate *string
	if err := normalizeRepairWaiting(&daysValue, &endDate); err != nil {
		t.Fatalf("normalize days: %v", err)
	}
	if endDate != nil {
		t.Fatalf("days-only input should not invent an end date before persistence: %v", *endDate)
	}

	selectedEnd := "2026-09-02"
	var selectedDays *int
	selectedEndPtr := &selectedEnd
	if err := normalizeRepairWaiting(&selectedDays, &selectedEndPtr); err != nil {
		t.Fatalf("normalize end date: %v", err)
	}
	if selectedEndPtr == nil || *selectedEndPtr != selectedEnd {
		t.Fatalf("end date was not preserved: %#v", selectedEndPtr)
	}

	negative := daysPtr(-1)
	if err := normalizeRepairWaiting(&negative, &endDate); err == nil {
		t.Fatal("expected negative waiting days to be rejected")
	}
}

func TestApplyRepairWaitingRangeUsesAllDevices(t *testing.T) {
	repair := servicedto.RepairOrder{WorkItems: []servicedto.RepairWorkItem{
		{WaitingStartDate: "2026-08-27", WaitingEndDate: "2026-08-30"},
		{WaitingStartDate: "2026-08-26", WaitingEndDate: "2026-09-02"},
	}}
	applyRepairWaitingRange(&repair)
	if repair.WaitingStartDate != "2026-08-26" || repair.WaitingEndDate != "2026-09-02" || repair.WaitingDays != 7 {
		t.Fatalf("unexpected ticket waiting range: %#v", repair)
	}
}

func daysPtr(value int) *int { return &value }

func stringPtr(value string) *string { return &value }

func TestExtractUniquePresetValues(t *testing.T) {
	workItems := []servicedto.RepairWorkItemRequest{
		{
			Issues:     []string{" Screen cracked ", "Water Damage", "screen cracked"},
			Conditions: []string{"Scratched body", " Dented corner "},
		},
		{
			Issues:     []string{"WATER DAMAGE", "Battery draining fast", ""},
			Conditions: []string{"scratched body", "Heavy wear"},
		},
	}
	issues, conditions := extractUniquePresetValues(workItems)
	if len(issues) != 3 {
		t.Fatalf("expected 3 unique issues, got %d: %#v", len(issues), issues)
	}
	if issues[0] != "Screen cracked" || issues[1] != "Water Damage" || issues[2] != "Battery draining fast" {
		t.Fatalf("unexpected issues: %#v", issues)
	}
	if len(conditions) != 3 {
		t.Fatalf("expected 3 unique conditions, got %d: %#v", len(conditions), conditions)
	}
	if conditions[0] != "Scratched body" || conditions[1] != "Dented corner" || conditions[2] != "Heavy wear" {
		t.Fatalf("unexpected conditions: %#v", conditions)
	}
}

func TestFilterNewPresetValues(t *testing.T) {
	workItems := []servicedto.RepairWorkItemRequest{
		{
			Issues:     []string{"Screen cracked", "New Issue"},
			Conditions: []string{"Scratched body", "New Condition"},
		},
	}
	existingIssues := map[string]struct{}{
		"screen cracked": {},
	}
	existingConditions := map[string]struct{}{
		"scratched body": {},
	}
	newIssues, newConditions := filterNewPresetValues(workItems, existingIssues, existingConditions)
	if len(newIssues) != 1 || newIssues[0] != "New Issue" {
		t.Fatalf("expected only 'New Issue', got %#v", newIssues)
	}
	if len(newConditions) != 1 || newConditions[0] != "New Condition" {
		t.Fatalf("expected only 'New Condition', got %#v", newConditions)
	}
}


