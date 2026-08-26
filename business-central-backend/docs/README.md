# Backend API documentation

`openapi.yaml` is the contract-first OpenAPI document for the Business Central
backend. It records the API versioning, authentication convention, response
envelopes, required error codes, and idempotency behavior from the repository
API contract.

The document includes the implemented health, authentication, platform-admin
merchant provisioning, user membership, catalog, POS, inventory, pricing,
promotion, reporting, service, and repair endpoints. Add an operation only
when its handler, authorization, tenant isolation, and tests are implemented.
Shop-scoped delivery CRUD is available through `/api/v1/shops/:shopId/deliveries`
and `/api/v1/deliveries`; POS orders persist customer, delivery, fee, note, and
payment metadata for invoice rendering.

## View in Swagger UI

When the backend is running, open <http://localhost:8080/swagger/>. The
backend serves both this UI and `openapi.yaml` at `/swagger/openapi.yaml`.

CORS is configured with `CORS_ORIGIN` in `.env`. It defaults to `*` and the
current development configuration allows all browser origins.

All persisted record timestamps use PostgreSQL `TIMESTAMPTZ`, and backend
database connections are explicitly set to UTC (GMT). Clients should convert
UTC timestamps to the user's local timezone for display.

Platform-admin provisioning uses `POST /api/v1/admin/merchants`. Set
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` to create the first platform
administrator automatically. Startup checks `user_identities` first and
creates the default admin only when no user exists. If a user already exists,
the default-admin creation is skipped. The endpoint creates the merchant and
its default Manager and Staff roles in one transaction; it does not create a
user account. The admin creates manager and staff users through
`POST /api/v1/users`.

The admin Add User flow uses `POST /api/v1/admin/merchant-users` for the
default Merchant role. This atomically creates a merchant, its system roles,
the owner user, membership, and owner role assignment. Creating users with
other roles requires an existing merchant.

`PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` remain supported as a
legacy explicit bootstrap when the `ADMIN_*` variables are not set.

Platform administrators manage platform-wide currencies with
`/api/v1/admin/currencies` (`GET`, `POST`, `GET /:code`, `PATCH /:code`, and
`DELETE /:code`). The public `GET /api/v1/currencies` endpoint remains
available for merchant-creation forms. A currency cannot be deleted while it
is referenced by merchant or financial records.

Platform administrators manage merchant roles under
`/api/v1/admin/merchants/{merchantId}/roles`. Custom roles support create,
read, update, and delete operations plus assignments from the permission
catalogue returned by `/api/v1/admin/permissions`. Default system roles can be
renamed and have their permissions updated, but their stable codes cannot be
changed and they cannot be deleted.

Catalog products and product variants, units, and unit conversions are exposed
through merchant-scoped CRUD endpoints under `/api/v1/catalog`, `/api/v1/units`,
and `/api/v1/unit-conversions`. Every query is constrained by the authenticated
merchant ID, including foreign-key references between products, variants, and
units.

Supporting catalog CRUD is also available for brands, categories, product
category assignments, product images, and variant inventory policies. Product
create/update requests may include `category_ids`; those assignments are saved
atomically with the product, and product reads return both `category_ids` and
`category_names` for editing and display.

Shop CRUD is available under `/api/v1/shops`. The operational POS API exposes
shop-scoped catalog reads, authoritative quotes, atomic order checkout, and
canonical invoice reads. Staff requests are constrained to the shop assigned
to their membership, even if a different shop ID is submitted.

Inventory movement APIs are available under `/api/v1/inventory`. The
receivable-lines endpoint discovers the remaining quantities on issued or
partially received purchase orders. Stock-in accepts either one of those order
lines or a direct product variant and records the receipt, inventory balance,
and FIFO cost layer atomically. Direct stock-in is limited to tracked,
non-batch variants; batch-tracked stock continues through purchase-order
receiving so batch details remain traceable. An omitted `unit_cost` reuses the
merchant variant's most recent receipt cost; the first receipt still requires
an explicit cost. Pricing setup is under
`/api/v1/pricing`, and promotion setup is under `/api/v1/promotions`.

Sales analysis is available under `/api/v1/reports`. Sales summaries and
profit summaries use canonical orders, refunds, and inventory cost
allocations. Daily sales and top-product reports are paginated and calculate
cost of goods sold and gross profit from the inventory ledger.

The cross-module transaction history is available at
`/api/v1/transaction-history`. It is a shop-scoped chronological read across
stock events, canonical orders from every channel, successful refunds, and
repair deposit/final checkout payments. It is intentionally separate from the
stock movement ledger and from financial report aggregates. The
`/api/v1/transaction-history/{id}` detail read resolves the event to its
canonical order and returns line item names/SKUs, quantities, checkout prices,
FIFO costs and profit, totals, payments, and refunds.

The immutable inventory ledger has a separate complete detail read at
`/api/v1/inventory/movements/{id}`. It resolves product, variant, unit and
location names, current balances, receipt/purchase-order or checkout-order
context, and every FIFO cost allocation associated with that movement.

The view-only `/api/v1/inventory/storage` endpoint powers the portal Storage
page. It returns one row per variant with hierarchical catalog paths, aggregate
stock, the current RETAIL price, optional product manufacture/expiry dates, and
merchant-only original price/profit values. It accepts `sort=field:asc` or
`sort=field:desc`; its column filters are case-insensitive partial matches.

The general services module is under `/api/v1/services`; it covers service
categories, service catalog entries, service prices, service orders, items,
appointments, notes, and billings. Repairs are under `/api/v1/repairs`; they
cover repair devices, repair orders, diagnostics, stock-backed parts,
product-scoped promotions, approvals, and warranties. Creating a repair also
creates its service and canonical SERVICE order relationship. Completing the
repair moves the canonical order to pending payment so it appears as an
invoice.

Portal repair intake uses `POST /api/v1/repairs/tickets`, an atomic aggregate
command equivalent to POS checkout's transaction boundary. It creates the
device, canonical/service/repair records, initial parts with independent
quantities, optional payment, and images together. The request is idempotent;
any failure rolls back all of those records.

All collection endpoints accept the same query contract:

- `query`: case-insensitive text search over the endpoint's searchable fields.
- `filter`: comma- or semicolon-separated equality filters, for example
  `filter=status:OPEN,is_active:true`.
- `page_index`: zero-based page index; `page` remains accepted as a legacy
  one-based alias.
- `page_size`: number of records per page, from 1 to 100, defaulting to 10.

Collection responses return `meta.page_index`, `meta.page_size`,
`meta.total`, and `meta.total_pages`.

For a standalone static view, start a local static server from the backend
directory:

```powershell
python -m http.server 8081 --directory docs
```

Then open <http://localhost:8081>. The page loads Swagger UI from the pinned
Swagger UI CDN bundle and renders `openapi.yaml`.

For CI or before committing a contract change, lint the document with an
OpenAPI 3-compatible linter, for example:

```powershell
npx @redocly/cli lint docs/openapi.yaml
```
