package domain

import "testing"

func TestParseTakeOrder(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    TakeOrderCommand
		wantErr bool
	}{
		{"normal", "/takeorder electric wheelchair quantity=2", TakeOrderCommand{"electric wheelchair", 2, ""}, false},
		{"bot and sku", "/takeorder@BusinessBot Electric Wheelchair quantity=2 WC-002", TakeOrderCommand{"Electric Wheelchair", 2, "WC-002"}, false},
		{"sku only", "/takeorder quantity=2 WC-002", TakeOrderCommand{"", 2, "WC-002"}, false},
		{"sku only with bot and whitespace", "  /takeorder@BusinessBot  QuAnTiTy=1.5  wc-002  ", TakeOrderCommand{"", 1.5, "wc-002"}, false},
		{"case insensitive keyword", "/takeorder chair QuAnTiTy=1.5", TakeOrderCommand{"chair", 1.5, ""}, false},
		{"missing keyword", "/takeorder chair 2", TakeOrderCommand{}, true},
		{"sku without quantity", "/takeorder WC-002", TakeOrderCommand{}, true},
		{"negative", "/takeorder quantity=-1 WC-002", TakeOrderCommand{}, true},
		{"nan", "/takeorder quantity=NaN WC-002", TakeOrderCommand{}, true},
		{"infinity", "/takeorder quantity=+Inf WC-002", TakeOrderCommand{}, true},
		{"invalid quantity", "/takeorder quantity=abc WC-002", TakeOrderCommand{}, true},
		{"zero", "/takeorder chair quantity=0", TakeOrderCommand{}, true},
		{"two quantities", "/takeorder chair quantity=1 quantity=2", TakeOrderCommand{}, true},
		{"extra", "/takeorder chair quantity=1 SKU extra", TakeOrderCommand{}, true},
		{"missing name and sku", "/takeorder quantity=1", TakeOrderCommand{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseTakeOrder(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error=%v", err)
			}
			if !tt.wantErr && got != tt.want {
				t.Fatalf("got %#v want %#v", got, tt.want)
			}
		})
	}
}
