package application

import (
	"encoding/json"
	"testing"

	posdto "business-central-backend/internal/pos/application/dto"
)

func TestNormalizeShopLogoConvertsGoogleDriveURL(t *testing.T) {
	request, err := normalizeShopLogo(posdto.ShopRequest{Address: json.RawMessage(`{
		"line1":"Main Street",
		"logo_url":"https://drive.google.com/file/d/shop-logo/view?usp=sharing",
		"logo_source_type":"GOOGLE_DRIVE"
	}`)})
	if err != nil {
		t.Fatal(err)
	}
	var address map[string]any
	if err := json.Unmarshal(request.Address, &address); err != nil {
		t.Fatal(err)
	}
	if address["logo_url"] != "https://drive.google.com/uc?export=view&id=shop-logo" {
		t.Fatalf("unexpected logo URL: %v", address["logo_url"])
	}
	if address["line1"] != "Main Street" {
		t.Fatalf("address fields were not preserved: %#v", address)
	}
}
