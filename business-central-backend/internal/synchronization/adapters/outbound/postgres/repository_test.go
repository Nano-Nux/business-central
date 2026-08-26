package postgres

import (
	"encoding/json"
	"testing"

	posdto "business-central-backend/internal/pos/application/dto"
)

func TestCanonicalPayloadHashIgnoresObjectKeyOrder(t *testing.T) {
	left, err := canonicalPayloadHash(json.RawMessage(`{"tax_rate":"8","include_tax":true}`))
	if err != nil {
		t.Fatalf("canonicalPayloadHash(left) error = %v", err)
	}
	right, err := canonicalPayloadHash(json.RawMessage(`{"include_tax":true,"tax_rate":"8"}`))
	if err != nil {
		t.Fatalf("canonicalPayloadHash(right) error = %v", err)
	}
	if left != right {
		t.Fatalf("hashes differ: %s != %s", left, right)
	}
	if len(left) != 64 {
		t.Fatalf("hash length = %d, want 64", len(left))
	}
}

func TestValidateStockReceiptPayloadAllowsRecentCostFallback(t *testing.T) {
	payload := stockReceiptSyncPayload{
		VariantID:             "variant-1",
		DestinationLocationID: "location-1",
		Quantity:              "2.5",
		EventKey:              "receipt-1",
	}
	if err := validateStockReceiptPayload(payload); err != nil {
		t.Fatalf("cost fallback payload rejected: %v", err)
	}
	payload.UnitCost = "-1"
	if err := validateStockReceiptPayload(payload); err == nil {
		t.Fatal("negative receipt cost accepted")
	}
}

func TestValidateOfflineCheckoutPayload(t *testing.T) {
	valid := offlineCheckoutSyncPayload{
		ShopID:             "shop-1",
		Request:            posdto.CreateSaleRequest{ShopID: "shop-1", PaymentMethod: "CASH", Lines: []posdto.SaleLineRequest{{VariantID: "variant-1", Quantity: "1"}}},
		Snapshot:           offlineCheckoutSnapshot{CurrencyCode: "USD", Subtotal: "10.00", DiscountTotal: "0.00", TaxTotal: "1.00", GrandTotal: "11.00"},
		LineSnapshots:      json.RawMessage(`[{"variant_id":"variant-1"}]`),
		InventorySnapshots: json.RawMessage(`[{"variant_id":"variant-1","quantity_on_hand":"2"}]`),
	}
	if err := validateOfflineCheckoutPayload(valid, "shop-1"); err != nil {
		t.Fatalf("valid checkout rejected: %v", err)
	}
	invalid := valid
	invalid.ShopID = "shop-2"
	if err := validateOfflineCheckoutPayload(invalid, "shop-1"); err == nil {
		t.Fatal("cross-shop checkout payload accepted")
	}
	invalid = valid
	invalid.Snapshot.GrandTotal = ""
	if err := validateOfflineCheckoutPayload(invalid, "shop-1"); err == nil {
		t.Fatal("incomplete checkout snapshot accepted")
	}
}

func TestCanonicalPayloadHashRejectsInvalidJSON(t *testing.T) {
	if _, err := canonicalPayloadHash(json.RawMessage(`{"tax_rate":`)); err == nil {
		t.Fatal("canonicalPayloadHash() expected invalid JSON error")
	}
}

func TestSameOptionalVersion(t *testing.T) {
	one, anotherOne, two := int64(1), int64(1), int64(2)
	for _, test := range []struct {
		name        string
		left, right *int64
		want        bool
	}{
		{name: "both absent", want: true},
		{name: "equal", left: &one, right: &anotherOne, want: true},
		{name: "different", left: &one, right: &two, want: false},
		{name: "one absent", left: &one, want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := sameOptionalVersion(test.left, test.right); got != test.want {
				t.Fatalf("sameOptionalVersion() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestValidateDeliveryPayload(t *testing.T) {
	valid := deliverySyncPayload{ShopID: "shop-1", Name: "Courier", ContactInfo: "555-0100"}
	if err := validateDeliveryPayload(valid, "shop-1"); err != nil {
		t.Fatalf("valid delivery rejected: %v", err)
	}
	for _, test := range []deliverySyncPayload{
		{ShopID: "shop-2", Name: "Courier", ContactInfo: "555-0100"},
		{ShopID: "shop-1", Name: "", ContactInfo: "555-0100"},
		{ShopID: "shop-1", Name: "Courier", ContactInfo: ""},
	} {
		if err := validateDeliveryPayload(test, "shop-1"); err == nil {
			t.Fatalf("invalid delivery payload accepted: %+v", test)
		}
	}
}

func TestValidateCatalogProductPayload(t *testing.T) {
	manufactured := "2026-08-01"
	expires := "2027-08-01"
	if err := validateCatalogProductPayload(catalogProductSyncPayload{Name: "Tea", ProductType: "PHYSICAL", ManufactureDate: &manufactured, ExpiredDate: &expires}); err != nil {
		t.Fatalf("valid product rejected: %v", err)
	}
	invalidDate := "08/01/2026"
	for _, payload := range []catalogProductSyncPayload{{ProductType: "PHYSICAL"}, {Name: "Tea"}, {Name: "Tea", ProductType: "PHYSICAL", ExpiredDate: &invalidDate}} {
		if err := validateCatalogProductPayload(payload); err == nil {
			t.Fatalf("invalid product accepted: %+v", payload)
		}
	}
}

func TestValidateRepairDraftPayload(t *testing.T) {
	valid := repairDraftSyncPayload{ShopID: "shop-1", Priority: "NORMAL", Device: json.RawMessage(`{"device_type":"Phone"}`), IssueDescription: "Screen cracked"}
	if err := validateRepairDraftPayload(valid, "shop-1"); err != nil {
		t.Fatalf("valid repair draft rejected: %v", err)
	}
	for _, payload := range []repairDraftSyncPayload{
		{ShopID: "shop-2", Priority: "NORMAL", Device: valid.Device, IssueDescription: valid.IssueDescription},
		{ShopID: "shop-1", Priority: "NORMAL", Device: valid.Device},
		{ShopID: "shop-1", Priority: "NORMAL", Device: json.RawMessage(`{"model":"Phone"}`), IssueDescription: valid.IssueDescription},
	} {
		if err := validateRepairDraftPayload(payload, "shop-1"); err == nil {
			t.Fatalf("invalid repair draft accepted: %+v", payload)
		}
	}
}

func TestValidateRepairTicketPayload(t *testing.T) {
	valid := repairTicketSyncPayload{
		TicketID: "ticket-1", ShopID: "shop-1", OrderNumber: "REP-1",
		Device: map[string]any{"device_type": "Phone"}, IssueDescription: "Screen cracked",
		WorkItems:     []repairWorkItemSyncPayload{{ID: "11111111-1111-1111-1111-111111111111", Type: "DEVICE", Device: map[string]any{"device_type": "Phone"}, IssueDescription: "Screen cracked"}},
		AdditionalFee: "12.50",
	}
	if err := validateRepairTicketPayload(valid, "shop-1", "ticket-1"); err != nil {
		t.Fatalf("valid repair ticket rejected: %v", err)
	}
	for _, test := range []struct {
		name    string
		payload repairTicketSyncPayload
	}{
		{name: "wrong shop", payload: repairTicketSyncPayload{ShopID: "shop-2", OrderNumber: "REP-1", Device: valid.Device, IssueDescription: "Issue"}},
		{name: "wrong id", payload: repairTicketSyncPayload{TicketID: "ticket-2", ShopID: "shop-1", OrderNumber: "REP-1", Device: valid.Device, IssueDescription: "Issue"}},
		{name: "missing work item device", payload: repairTicketSyncPayload{ShopID: "shop-1", OrderNumber: "REP-1", Device: valid.Device, IssueDescription: "Issue", WorkItems: []repairWorkItemSyncPayload{{IssueDescription: "Issue"}}}},
		{name: "negative fee", payload: repairTicketSyncPayload{ShopID: "shop-1", OrderNumber: "REP-1", Device: valid.Device, IssueDescription: "Issue", AdditionalFee: "-1"}},
		{name: "duplicate work item ids", payload: repairTicketSyncPayload{ShopID: "shop-1", OrderNumber: "REP-1", Device: valid.Device, IssueDescription: "Issue", WorkItems: []repairWorkItemSyncPayload{
			{ID: "11111111-1111-1111-1111-111111111111", Device: valid.Device, IssueDescription: "One"},
			{ID: "11111111-1111-1111-1111-111111111111", Device: valid.Device, IssueDescription: "Two"},
		}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := validateRepairTicketPayload(test.payload, "shop-1", "ticket-1"); err == nil {
				t.Fatal("invalid repair ticket accepted")
			}
		})
	}
}

func TestValidateSyncedCustomFieldValueDateOnly(t *testing.T) {
	definition := syncedCustomFieldDefinition{FieldCode: "purchase_date", ValueType: "DATE"}
	if err := validateSyncedCustomFieldValue(definition, json.RawMessage(`"2026-08-12"`)); err != nil {
		t.Fatalf("expected date-only sync field to validate: %v", err)
	}
}

func TestSyncedCustomFieldVisibilityRules(t *testing.T) {
	values := map[string]json.RawMessage{
		"device_type":   json.RawMessage(`"LAPTOP"`),
		"has_insurance": json.RawMessage(`true`),
	}
	if !syncedCustomFieldVisible(json.RawMessage(`{"field":"device_type","equals":"LAPTOP"}`), values) {
		t.Fatal("expected matching visibility condition to show field")
	}
	if syncedCustomFieldVisible(json.RawMessage(`{"field":"device_type","equals":"PHONE"}`), values) {
		t.Fatal("expected non-matching visibility condition to hide field")
	}
	if !syncedCustomFieldVisible(json.RawMessage(`{"all":[{"field":"device_type","equals":"LAPTOP"},{"field":"has_insurance","equals":true}]}`), values) {
		t.Fatal("expected all visibility conditions to show field")
	}
	if syncedCustomFieldVisible(json.RawMessage(`{"any":[{"field":"device_type","equals":"TABLET"},{"field":"has_insurance","equals":false}]}`), values) {
		t.Fatal("expected any visibility conditions to hide field when none match")
	}
}

func TestValidateRepairDiagnosticPayload(t *testing.T) {
	valid := repairDiagnosticSyncPayload{ShopID: "shop-1", RepairOrderID: "order-1", Diagnosis: "Screen cracked"}
	if err := validateRepairDiagnosticPayload(valid, "shop-1"); err != nil {
		t.Fatalf("valid diagnostic rejected: %v", err)
	}
	if err := validateRepairDiagnosticPayload(repairDiagnosticSyncPayload{ShopID: "shop-2", RepairOrderID: "order-1", Diagnosis: "note"}, "shop-1"); err == nil {
		t.Fatal("wrong-shop diagnostic accepted")
	}
	if err := validateRepairDiagnosticPayload(repairDiagnosticSyncPayload{ShopID: "shop-1", RepairOrderID: "order-1"}, "shop-1"); err == nil {
		t.Fatal("empty diagnostic accepted")
	}
}
