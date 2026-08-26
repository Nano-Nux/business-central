package postgres

import posdto "business-central-backend/internal/pos/application/dto"

// DTO mappings are kept at the outbound boundary so application contracts do
// not depend on database adapter types.
type Shop = posdto.Shop
type Location = posdto.Location
type Terminal = posdto.Terminal
type Session = posdto.Session
type ShopRequest = posdto.ShopRequest
type Delivery = posdto.Delivery
type DeliveryRequest = posdto.DeliveryRequest
type Customer = posdto.Customer
type CustomerRequest = posdto.CustomerRequest
type TerminalRequest = posdto.TerminalRequest
type SessionRequest = posdto.SessionRequest
type CatalogItem = posdto.CatalogItem
type CreateSaleRequest = posdto.CreateSaleRequest
type CreateRefundRequest = posdto.CreateRefundRequest
type SaleOrder = posdto.SaleOrder
type SaleQuote = posdto.SaleQuote
type Refund = posdto.Refund
type Invoice = posdto.Invoice
type InvoiceLine = posdto.InvoiceLine
type InvoiceWorkItem = posdto.InvoiceWorkItem
