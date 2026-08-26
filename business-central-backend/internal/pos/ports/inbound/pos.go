package inbound

import (
	"context"

	authdto "business-central-backend/internal/auth/application/dto"
	posdto "business-central-backend/internal/pos/application/dto"
)

type POS interface {
	ListCatalog(context.Context, *authdto.Claims, string) ([]posdto.CatalogItem, error)
	LookupBarcode(context.Context, *authdto.Claims, string, string) ([]posdto.CatalogItem, error)
	CreateSale(context.Context, *authdto.Claims, posdto.CreateSaleRequest) (posdto.SaleOrder, error)
	CreateRefund(context.Context, *authdto.Claims, string, posdto.CreateRefundRequest) (posdto.Refund, error)
	QuoteSale(context.Context, *authdto.Claims, posdto.CreateSaleRequest) (posdto.SaleQuote, error)
	ListInvoices(context.Context, *authdto.Claims) ([]posdto.Invoice, error)
	ListCustomers(context.Context, *authdto.Claims) ([]posdto.Customer, error)
	GetCustomer(context.Context, *authdto.Claims, string) (posdto.Customer, error)
	UpdateCustomer(context.Context, *authdto.Claims, string, posdto.CustomerRequest) (posdto.Customer, error)
	ListShops(context.Context, *authdto.Claims) ([]posdto.Shop, error)
	ListLocations(context.Context, *authdto.Claims) ([]posdto.Location, error)
	GetShop(context.Context, *authdto.Claims, string) (posdto.Shop, error)
	CreateShop(context.Context, *authdto.Claims, posdto.ShopRequest) (posdto.Shop, error)
	UpdateShop(context.Context, *authdto.Claims, string, posdto.ShopRequest) (posdto.Shop, error)
	DeleteShop(context.Context, *authdto.Claims, string) error
	ListDeliveries(context.Context, *authdto.Claims, string) ([]posdto.Delivery, error)
	GetDelivery(context.Context, *authdto.Claims, string) (posdto.Delivery, error)
	CreateDelivery(context.Context, *authdto.Claims, posdto.DeliveryRequest) (posdto.Delivery, error)
	UpdateDelivery(context.Context, *authdto.Claims, string, posdto.DeliveryRequest) (posdto.Delivery, error)
	DeleteDelivery(context.Context, *authdto.Claims, string) error
	ListTerminals(context.Context, *authdto.Claims, string) ([]posdto.Terminal, error)
	GetTerminal(context.Context, *authdto.Claims, string) (posdto.Terminal, error)
	CreateTerminal(context.Context, *authdto.Claims, posdto.TerminalRequest) (posdto.Terminal, error)
	UpdateTerminal(context.Context, *authdto.Claims, string, posdto.TerminalRequest) (posdto.Terminal, error)
	DeleteTerminal(context.Context, *authdto.Claims, string) error
	ListSessions(context.Context, *authdto.Claims, string) ([]posdto.Session, error)
	GetSession(context.Context, *authdto.Claims, string) (posdto.Session, error)
	CreateSession(context.Context, *authdto.Claims, posdto.SessionRequest) (posdto.Session, error)
	UpdateSession(context.Context, *authdto.Claims, string, posdto.SessionRequest) (posdto.Session, error)
	DeleteSession(context.Context, *authdto.Claims, string) error
}
