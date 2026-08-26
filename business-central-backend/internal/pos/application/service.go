package application

import (
	"context"
	"encoding/json"
	"strings"

	"business-central-backend/internal/app"
	authdto "business-central-backend/internal/auth/application/dto"
	"business-central-backend/internal/media"
	posdto "business-central-backend/internal/pos/application/dto"
	domainpos "business-central-backend/internal/pos/domain/entities"
	posinbound "business-central-backend/internal/pos/ports/inbound"
	posoutbound "business-central-backend/internal/pos/ports/outbound"
)

type Service struct{ posoutbound.Repository }

func NewService(port posoutbound.Repository) *Service { return &Service{Repository: port} }

func (s *Service) LookupBarcode(ctx context.Context, claims *authdto.Claims, barcode, shopID string) ([]posdto.CatalogItem, error) {
	if strings.TrimSpace(barcode) == "" {
		return []posdto.CatalogItem{}, invalid("barcode is required.")
	}
	return s.Repository.LookupBarcode(ctx, claims, strings.TrimSpace(barcode), shopID)
}

var _ posinbound.POS = (*Service)(nil)

func invalid(message string) error { return app.Validation(message, nil) }

func (s *Service) CreateShop(ctx context.Context, claims *authdto.Claims, request posdto.ShopRequest) (posdto.Shop, error) {
	if err := domainpos.Shop(request.Name, request.Code); err != nil {
		return posdto.Shop{}, invalid("Shop name and code are required.")
	}
	request, err := normalizeShopLogo(request)
	if err != nil {
		return posdto.Shop{}, err
	}
	return s.Repository.CreateShop(ctx, claims, request)
}

func (s *Service) UpdateShop(ctx context.Context, claims *authdto.Claims, id string, request posdto.ShopRequest) (posdto.Shop, error) {
	if err := domainpos.Shop(request.Name, request.Code); err != nil {
		return posdto.Shop{}, invalid("Shop name and code are required.")
	}
	request, err := normalizeShopLogo(request)
	if err != nil {
		return posdto.Shop{}, err
	}
	return s.Repository.UpdateShop(ctx, claims, id, request)
}

func normalizeShopLogo(request posdto.ShopRequest) (posdto.ShopRequest, error) {
	if len(request.Address) == 0 {
		return request, nil
	}
	var address map[string]any
	if err := json.Unmarshal(request.Address, &address); err != nil {
		return posdto.ShopRequest{}, invalid("Shop address must be a valid JSON object.")
	}
	sourceType, hasSource := address["logo_source_type"].(string)
	if !hasSource || strings.TrimSpace(sourceType) == "" {
		return request, nil
	}
	imageURL, _ := address["logo_url"].(string)
	if strings.TrimSpace(imageURL) == "" {
		address["logo_url"] = ""
		address["logo_source_type"] = ""
	} else {
		resolved, err := media.NormalizeURL(media.URLRequest{ImageURL: imageURL, SourceType: sourceType}, true)
		if err != nil {
			return posdto.ShopRequest{}, err
		}
		address["logo_url"] = resolved.ImageURL
		address["logo_source_type"] = resolved.SourceType
	}
	normalized, err := json.Marshal(address)
	if err != nil {
		return posdto.ShopRequest{}, err
	}
	request.Address = normalized
	return request, nil
}

func (s *Service) CreateDelivery(ctx context.Context, claims *authdto.Claims, request posdto.DeliveryRequest) (posdto.Delivery, error) {
	if request.ShopID == "" || request.Name == "" || request.ContactInfo == "" {
		return posdto.Delivery{}, invalid("shop_id, delivery name, and contact info are required.")
	}
	return s.Repository.CreateDelivery(ctx, claims, request)
}
func (s *Service) UpdateDelivery(ctx context.Context, claims *authdto.Claims, id string, request posdto.DeliveryRequest) (posdto.Delivery, error) {
	if request.ShopID == "" || request.Name == "" || request.ContactInfo == "" {
		return posdto.Delivery{}, invalid("shop_id, delivery name, and contact info are required.")
	}
	return s.Repository.UpdateDelivery(ctx, claims, id, request)
}

func (s *Service) UpdateCustomer(ctx context.Context, claims *authdto.Claims, id string, request posdto.CustomerRequest) (posdto.Customer, error) {
	if strings.TrimSpace(request.DisplayName) == "" {
		return posdto.Customer{}, invalid("Customer name is required.")
	}
	request.CustomerType = strings.ToUpper(strings.TrimSpace(request.CustomerType))
	if request.CustomerType != "RETAIL" && request.CustomerType != "WHOLESALE" && request.CustomerType != "GUEST" {
		return posdto.Customer{}, invalid("Customer type must be RETAIL, WHOLESALE, or GUEST.")
	}
	return s.Repository.UpdateCustomer(ctx, claims, id, request)
}

func (s *Service) CreateTerminal(ctx context.Context, claims *authdto.Claims, request posdto.TerminalRequest) (posdto.Terminal, error) {
	if err := domainpos.Terminal(request.ShopID, request.Name); err != nil {
		return posdto.Terminal{}, invalid("shop_id and terminal name are required.")
	}
	return s.Repository.CreateTerminal(ctx, claims, request)
}

func (s *Service) UpdateTerminal(ctx context.Context, claims *authdto.Claims, id string, request posdto.TerminalRequest) (posdto.Terminal, error) {
	if err := domainpos.Terminal(request.ShopID, request.Name); err != nil {
		return posdto.Terminal{}, invalid("shop_id and terminal name are required.")
	}
	return s.Repository.UpdateTerminal(ctx, claims, id, request)
}

func (s *Service) CreateSession(ctx context.Context, claims *authdto.Claims, request posdto.SessionRequest) (posdto.Session, error) {
	if err := domainpos.Session(request.ShopID, request.MembershipID, request.Status); err != nil {
		return posdto.Session{}, invalid("shop_id and membership_id are required, and status must be OPEN or CLOSED.")
	}
	if _, err := domainpos.NewSession(request.Status); err != nil {
		return posdto.Session{}, invalid("status must be OPEN or CLOSED.")
	}
	return s.Repository.CreateSession(ctx, claims, request)
}

func (s *Service) UpdateSession(ctx context.Context, claims *authdto.Claims, id string, request posdto.SessionRequest) (posdto.Session, error) {
	if err := domainpos.ValidateStatus(request.Status); err != nil {
		return posdto.Session{}, invalid("status must be OPEN or CLOSED.")
	}
	return s.Repository.UpdateSession(ctx, claims, id, request)
}

func (s *Service) CreateSale(ctx context.Context, claims *authdto.Claims, request posdto.CreateSaleRequest) (posdto.SaleOrder, error) {
	if err := domainpos.Sale(len(request.Lines), request.PaymentMethod, request.IdempotencyKey); err != nil {
		return posdto.SaleOrder{}, invalid("At least one line, a supported payment method, and an idempotency key are required.")
	}
	for _, line := range request.Lines {
		if line.VariantID == "" || line.Quantity == "" {
			return posdto.SaleOrder{}, invalid("Every sale line requires variant_id and quantity.")
		}
	}
	return s.Repository.CreateSale(ctx, claims, request)
}

func (s *Service) CreateRefund(ctx context.Context, claims *authdto.Claims, orderID string, request posdto.CreateRefundRequest) (posdto.Refund, error) {
	if err := domainpos.Refund(request.PaymentID, request.Amount, request.IdempotencyKey); err != nil {
		return posdto.Refund{}, invalid("payment_id, a positive amount, and an idempotency_key are required.")
	}
	return s.Repository.CreateRefund(ctx, claims, orderID, request)
}

func (s *Service) QuoteSale(ctx context.Context, claims *authdto.Claims, request posdto.CreateSaleRequest) (posdto.SaleQuote, error) {
	if len(request.Lines) == 0 {
		return posdto.SaleQuote{}, invalid("At least one sale line is required.")
	}
	for _, line := range request.Lines {
		if line.VariantID == "" || line.Quantity == "" {
			return posdto.SaleQuote{}, invalid("Every sale line requires variant_id and quantity.")
		}
	}
	return s.Repository.QuoteSale(ctx, claims, request)
}
