package domain

import (
	"strings"
	"testing"
)

func TestParseTakeOrder(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    TakeOrderItem
		wantErr bool
	}{
		{"normal", "/takeorder electric wheelchair quantity=2", TakeOrderItem{"electric wheelchair", 2, ""}, false},
		{"bot and sku", "/takeorder@BusinessBot Electric Wheelchair quantity=2 WC-002", TakeOrderItem{"Electric Wheelchair", 2, "WC-002"}, false},
		{"sku only", "/takeorder quantity=2 WC-002", TakeOrderItem{"", 2, "WC-002"}, false},
		{"sku only with bot and whitespace", "  /takeorder@BusinessBot  QuAnTiTy=1.5  wc-002  ", TakeOrderItem{"", 1.5, "wc-002"}, false},
		{"case insensitive keyword", "/takeorder chair QuAnTiTy=1.5", TakeOrderItem{"chair", 1.5, ""}, false},
		{"missing keyword", "/takeorder chair 2", TakeOrderItem{}, true},
		{"sku without quantity", "/takeorder WC-002", TakeOrderItem{}, true},
		{"negative", "/takeorder quantity=-1 WC-002", TakeOrderItem{}, true},
		{"nan", "/takeorder quantity=NaN WC-002", TakeOrderItem{}, true},
		{"infinity", "/takeorder quantity=+Inf WC-002", TakeOrderItem{}, true},
		{"invalid quantity", "/takeorder quantity=abc WC-002", TakeOrderItem{}, true},
		{"zero", "/takeorder chair quantity=0", TakeOrderItem{}, true},
		{"too precise", "/takeorder chair quantity=0.0000001", TakeOrderItem{}, true},
		{"six decimals", "/takeorder chair quantity=0.000001", TakeOrderItem{"chair", 0.000001, ""}, false},
		{"two quantities", "/takeorder chair quantity=1 quantity=2", TakeOrderItem{}, true},
		{"extra", "/takeorder chair quantity=1 SKU extra", TakeOrderItem{}, true},
		{"missing name and sku", "/takeorder quantity=1", TakeOrderItem{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseTakeOrder(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error=%v", err)
			}
			if !tt.wantErr && (len(got.Items) != 1 || got.Items[0] != tt.want) {
				t.Fatalf("got %#v want %#v", got, tt.want)
			}
		})
	}
}

func TestParseCustomerAndMultipleProducts(t *testing.T) {
	got, err := ParseTakeOrder("/takeorder@Bot\r\ncustomer=မနှင်း\r\nwo phone quantity=1\r\nquantity=2 LAPTOP\r\n")
	if err != nil || got.CustomerName != "မနှင်း" || len(got.Items) != 2 || got.Items[0].ProductName != "wo phone" || got.Items[1].SKU != "LAPTOP" || got.Items[1].Quantity != 2 {
		t.Fatalf("incorrect multi-product order: %+v %v", got, err)
	}
	for _, input := range []string{
		"/takeorder\ncustomer=\nphone quantity=1",
		"/takeorder\ncustomer=A\ncustomer=B\nphone quantity=1",
		"/takeorder\nphone quantity=1\ncustomer=A",
		"/takeorder\ncustomer=A",
		"/takeorder\ncustomer=" + strings.Repeat("a", 256) + "\nphone quantity=1",
		"/takeorder\nphone quantity=1\nother quantity=0",
		"/takeorder\n" + strings.Repeat("phone quantity=1\n", 21),
	} {
		if _, err := ParseTakeOrder(input); err == nil {
			t.Fatalf("invalid multi-product order accepted: %q", input)
		}
	}
	if _, err := ParseTakeOrder("/takeorder\n" + strings.Repeat("phone quantity=1\n", 20)); err != nil {
		t.Fatalf("20 lines rejected: %v", err)
	}
}
