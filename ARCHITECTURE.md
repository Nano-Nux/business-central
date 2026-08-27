# Business Central Canonical Architecture

This is a fresh-build commerce architecture. The project has no production data or compatibility obligations, so the schema intentionally removes legacy duplicate models.

## Canonical ownership

| Concern | System of record | Boundary |
|---|---|---|
| Tenant | `merchants` | Every operational row has exactly one `merchant_id` |
| Shop business classification | `business_types` and `shops.business_type_id` | Each shop selects one platform-managed business type; detailed catalog/unit/pricing configuration is future work |
| Authentication | `user_identities` | Email, password hash, lock state, and login tracking exist only here |
| Membership | `user_memberships` | Links an identity to one merchant and stores the tenant profile |
| Authorization | `roles`, `permissions`, `membership_roles` | Roles are tenant-owned and memberships receive permissions |
| Customer | `customers` | One customer master supports POS, online, CRM, loyalty, service, and guests |
| Product | `products`, `product_variants` | A variant is the sellable and stock-tracked SKU |
| Stock location | `locations` | Warehouses, bins, shops, stock rooms, fulfillment centers, transit, and virtual locations |
| Inventory | `inventory_movements` | Immutable movement ledger; `inventory_balances` is a derived/current balance |
| Costing | `inventory_cost_layers`, `inventory_cost_allocations` | Receipt layers are consumed FIFO and are traceable to sale movements |
| Purchasing | `purchase_orders` â†’ `goods_receipts` | Receipt lines are the only origin of normal inventory cost layers |
| Order | `orders` | One order aggregate for POS, online, wholesale, phone, and marketplace channels |

`merchants.pos_complexity_level` controls catalog workflow, not the canonical
model. `COMPLEX` exposes normal multi-variant setup. `SIMPLE` presents products
directly while the backend atomically creates and maintains one standard
`product_variants` row for pricing, stock, orders, and reporting.
| Payment | `payment_type_categories`, `payment_types`, `payments`, `refunds` | Merchants configure payment types once per tenant; payments belong to orders and retain the selected type/name snapshot; refunds belong to payments and orders |
| Accounting boundary | `accounting_events` | Every financial/valuation event is posted through an explicit event |

## Authentication and authorization

`user_identities` is the sole credential authority. A membership never stores an email, password hash, failed-attempt count, or login timestamp. A single identity can have one membership per merchant. Authorization is evaluated from the membership's tenant roles and permissions.

The platform-admin RLS path is based on the database role `platform_admin`, not a session variable. Application connections must set only `app.merchant_id`; they must not be members of `platform_admin`.

## Customer lifecycle

1. Create one `customers` row for a person or business within a merchant.
2. Optionally link it to a registered `user_identities` row.
3. Guest checkout creates a customer with `customer_type = 'GUEST'`; the order stores immutable billing/shipping snapshots.
4. POS, ecommerce, CRM, loyalty, and service records reference the same customer ID.
5. Addresses are reusable customer records; order addresses remain historical JSON snapshots.

There is no separate shop customer, ecommerce customer, or patient customer master in this commerce core.

## Order lifecycle

`orders` is authoritative for all channels:

```text
DRAFT â†’ PENDING_PAYMENT â†’ CONFIRMED â†’ PROCESSING
                                      â†“
                         PARTIALLY_FULFILLED â†’ FULFILLED
```

Cancellation is allowed before fulfillment. Refund completion is represented by `refunds` and the order eventually transitions to `REFUNDED`. Channel-specific behavior belongs in application services or future extension tables; it does not create another order aggregate.

`order_lines` are the commercial quantities. `fulfillments` and `fulfillment_lines` record physical fulfillment. `payments` and `refunds` record money movement.

Service work uses the same canonical `orders` aggregate with `channel = 'SERVICE'`. A `service_orders` row may link one-to-one to the canonical order, and a `repair_orders` row is a one-to-one specialized service order with `service_type = 'REPAIR'`. Therefore repair payments and refunds remain attached to the canonical order, while service billing remains attached to `service_orders`.

Service orders may contain repeatable `service_order_work_items`. A work item
represents the operational subject being serviced and may be specialized by a
module, such as `repair_work_item_devices` for device intake and issue data.
The repair order remains the ticket-level billing/lifecycle boundary, so work
items never create competing orders or payments. Billable service and part
lines reference their work item, device fees are stored with the repair work
item, and `service_work_item_payment_allocations` assigns portions of a
canonical captured payment to child work without changing payment ownership.

## Inventory flow

Repair device work items own ordered `issues[]` and `conditions[]` text
collections. The legacy `issue_description` is retained as the first-issue
alias for older clients. Merchant-managed repair presets are tenant-owned and
shop-scoped; presets autofill intake but never replace values stored on a
ticket.

Each repair device work item also owns an automatic `waiting_start_date` and a
canonical `waiting_end_date`. Clients may enter either a non-negative number of
calendar days or the end date; the backend derives the other representation.
The parent ticket waiting period is a read projection from the earliest child
start through the latest child end and is never entered independently.

All stock is represented by a product variant at a location:

```text
Purchase order line
    â†’ goods receipt line
    â†’ RECEIPT inventory movement
    â†’ FIFO cost layer
    â†’ inventory balance
```

Transfers use one immutable movement with both `source_location_id` and `destination_location_id`. Sales use a source location and an order line. Receipts use a destination location and a receipt line. The movement trigger updates balances and allocates sale quantities against the oldest available cost layers.

`inventory_cost_allocations` proves which location-specific receipt or transfer layers funded a sale. A transfer consumes source-location layers and creates destination-location layers with `transferred_from_layer_id`. A return must reference the original consumption movement and restores every original allocation as a new cost layer. Reversal records preserve the original movement instead of mutating it.

## Purchasing traceability

The required chain is enforced by tenant-safe foreign keys:

```text
purchase_order_lines.id
  â†’ goods_receipt_lines.purchase_order_line_id
  â†’ inventory_movements.receipt_line_id
  â†’ inventory_cost_layers.receipt_line_id
  â†’ inventory_cost_allocations.cost_layer_id
  â†’ inventory_cost_allocations.consumption_movement_id
  â†’ inventory_movements.order_line_id
```

Receipt insertion locks and increments the purchase-order line's received quantity and rejects over-receipt.

## Accounting ownership

Operational domains do not write journal lines implicitly. They emit one immutable `accounting_events` record per business event. Accounting services create one `journal_entries` record per accounting event and post balanced `journal_lines` using tenant-safe account references.

Expected event ownership:

- Order confirmation: revenue/receivable event
- Payment capture: cash/receivable event
- Refund completion: refund liability/cash event
- Inventory receipt: inventory/clearing event
- Inventory sale: cost-of-goods-sold/inventory event using FIFO allocation totals
- Purchase invoicing: payable/clearing event

This keeps accounting integration explicit, idempotent, and auditable.

## Multi-tenancy

Every tenant-owned table includes `merchant_id`. Cross-tenant references use composite foreign keys beginning with `merchant_id`. RLS is enabled and forced on tenant-owned tables. The only bypass is membership in the database role `platform_admin`; there is no application-controlled bypass setting.

## Deliberately removed legacy models

The replacement schema does not retain duplicate `sales`, `ecommerce_orders`, `shop_customers`, `ecommerce_customer_accounts`, `warehouse_inventory`, or `warehouse_inventory_movements` tables. POS and ecommerce are channels on the canonical order and inventory models.

## Backend code layers

The Go backend implements the conceptual architecture context-first. Each
bounded context owns its domain rules, use cases, ports, and adapters:

```text
internal/<bounded-context>/
    domain/                 entities, value objects, events, domain services
    application/            commands, queries, DTOs, use-case services
    ports/inbound/           inbound use-case contracts
    ports/outbound/          persistence and integration contracts
    adapters/inbound/http/   transport handlers and route registration
    adapters/outbound/       PostgreSQL and future integration adapters
```

Current contexts are `auth`, `catalog`, `pos`, `operations`, `reports`, and
`services`. Shared image URL normalization and upload validation live in
`internal/media`; its outbound storage port is implemented by the SeaweedFS
adapter and reused by catalog, shop, and repair workflows. Resource application
services remain responsible for validating and persisting the returned URL.
Direct uploads are validated as real image content, capped at 500 KB and a
240-by-240-pixel bounding box before the storage adapter is invoked.
The global
`internal/adapters/inbound/http` package is only the delivery composition
root: it creates the Fiber app, middleware, health checks, Swagger serving, and
connects each context's route registrar. It does not contain feature handlers.

The composition root is `cmd/server/main.go`. It constructs each context's
PostgreSQL adapter, wraps it with the context application service, and injects
the resulting inbound use case into that context's HTTP adapter. Dependencies
flow inward: inbound adapters call application ports, application services
depend on domain rules and outbound ports, and outbound adapters implement
those ports.

The domain packages are pure Go and contain validation, defaults, and state
transitions for identity, catalog, POS, pricing/promotion, and inventory
commands. Tenant context remains an application concern and is enforced again
by PostgreSQL RLS and tenant-safe foreign keys. Root package DTO aliases remain
only as a compatibility seam for existing clients and tests; canonical DTOs
live inside their bounded context's `application/dto` package.
