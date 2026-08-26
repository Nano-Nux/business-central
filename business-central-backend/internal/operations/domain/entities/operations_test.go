package entities

import "testing"

func TestNewPriceListNormalizesCurrency(t *testing.T) {
	priceList, err := NewPriceList("retail", "usd")
	if err != nil {
		t.Fatal(err)
	}
	if priceList.CurrencyCode != "USD" {
		t.Fatalf("currency = %q", priceList.CurrencyCode)
	}
}

func TestStockInRequiresEventKey(t *testing.T) {
	if err := StockIn("po", "line", "variant", "location", "1", "2", ""); err == nil {
		t.Fatal("expected event key validation error")
	}
}

func TestStockInAllowsDirectReceipt(t *testing.T) {
	if err := StockIn("", "", "variant", "location", "3", "12.50", "event"); err != nil {
		t.Fatalf("direct receipt validation failed: %v", err)
	}
}

func TestStockInAllowsCostFallback(t *testing.T) {
	if err := StockIn("", "", "variant", "location", "3", "", "event"); err != nil {
		t.Fatalf("receipt cost fallback validation failed: %v", err)
	}
}

func TestStockInRequiresCompletePurchaseOrderReference(t *testing.T) {
	if err := StockIn("po", "", "variant", "location", "1", "2", "event"); err == nil {
		t.Fatal("expected incomplete purchase order reference to fail")
	}
}

func TestStockInRejectsInvalidQuantityAndCost(t *testing.T) {
	if err := StockIn("", "", "variant", "location", "0", "2", "event"); err == nil {
		t.Fatal("expected zero quantity to fail")
	}
	if err := StockIn("", "", "variant", "location", "1", "-1", "event"); err == nil {
		t.Fatal("expected negative unit cost to fail")
	}
}
