# API Contract

This document defines the contract between `business-central-backend` and the admin, portal, and mobile clients. The backend is the authority for business behavior, validation, permissions, merchant modules, and state transitions.

## Current status

Repair work-item requests and responses expose canonical `issues[]` and
`conditions[]` collections (maximum 20 values of 500 characters each).
`issue_description` remains the first-issue compatibility alias. Shop-scoped
merchant-managed presets use `GET/POST /api/v1/repairs/presets` and
`PATCH/DELETE /api/v1/repairs/presets/{id}` with `preset_type` equal to
`ISSUE` or `CONDITION`.
Device waiting time accepts either `waiting_days` or `waiting_end_date`.
Responses return the automatic `waiting_start_date`, canonical end date, and
derived day count. Repair-order and invoice projections return the derived
whole-ticket range using the earliest work-item start and latest work-item end.

The API runtime includes health, authentication, authorization, platform-admin
merchant management, merchant-owner onboarding, user membership, catalog, pricing,
promotion, inventory, transactional POS, invoice, reporting, service, and repair endpoints. Platform administrators
use `GET /api/v1/admin/merchants` and `PATCH /api/v1/admin/merchants/{id}` to
inspect and change merchant state. Setting `is_active` to `false` is a
deactivation (not deletion); the backend rejects login, refresh, and existing
access-token validation for memberships belonging to that merchant.
Supported currencies are returned by `GET /api/v1/currencies`; merchant
creation must use one of those currency codes. Platform administrators load
and manage merchant roles under `/api/v1/admin/merchants/{id}/roles`, load the
permission catalogue from `GET /api/v1/admin/permissions`, and send selected
role IDs in user create/update requests. Shops are tenant-scoped resources
under `/api/v1/shops`; platform administrators select their merchant scope

Business types are platform reference data. Public reads use
`GET /api/v1/business-types`; platform administrators manage them through
`GET/POST /api/v1/admin/business-types` and
`GET/PATCH/DELETE /api/v1/admin/business-types/{id}`. Shop create/update
requests accept `business_type_id`, and shop responses include
`business_type_id` and `business_type_name`. The business type currently only
classifies a shop; relationships to catalog, units, conversions, price lists,
and product variants are intentionally deferred.
with `X-Merchant-ID`.
The admin Add User flow uses `POST /api/v1/admin/merchant-users` when the
selected account role is Merchant. This atomically creates the merchant,
default roles, owner user, membership, and owner role assignment. Other roles
require an existing merchant scope.

Portal operations include the current merchant at `/api/v1/merchant`, shop-aware
sellable inventory at `/api/v1/pos/catalog`, authoritative totals at
`POST /api/v1/pos/quote`, atomic/idempotent checkout at `POST /api/v1/pos/orders`,
canonical POS refunds at `POST /api/v1/pos/orders/{orderId}/refunds`,
canonical invoices at `/api/v1/invoices` (including the selected shop's optional
`shop_logo_url` and `show_shop_logo` print preference), and receivable purchase-order lines at
`/api/v1/inventory/receivable-lines`. Staff inventory, repair, invoice, and report
reads are constrained to the membership's assigned shop.
Customer master reads are available at `/api/v1/customers` and
`/api/v1/customers/{id}`. Only memberships carrying the system `owner` or
`merchant` role may update customers, delivery options, or repair ticket intake
details. Repair intake details use `PATCH /api/v1/repairs/orders/{id}/details`
so staff lifecycle/status operations remain separate and cannot modify those
merchant-owned fields.

Merchant payment types are tenant-wide rather than shop-scoped. Authenticated
users read the fixed `CASH`, `ONLINE`, and `DIGITAL` categories from
`GET /api/v1/payment-type-categories` and active merchant choices from
`GET /api/v1/payment-types?active_only=true`. Membership managers use
`POST /api/v1/payment-types` and `PATCH/DELETE /api/v1/payment-types/{id}`.
Used types cannot be deleted or moved to another category and must be made inactive or replaced. POS and repair payment
commands select an active `payment_type_id`; CASH and ONLINE types are
captured without additional type configuration, while DIGITAL returns
`FUTURE_IMPROVEMENT` until its integration contract is implemented.
Merchant owners can update the ticket billing boundary through
`PATCH /api/v1/repairs/orders/{id}/billing`. The request replaces catalog
service lines, labor fee, work-item prices (using the unchanged `additional_fee` field), and the current service
promotion; the backend recalculates canonical subtotal, discount, tax, total,
and work-item financial projections while preserving replacement-part lines.
Payment status is not overwritten by this command: deposit/final payment and
refund endpoints remain the source of truth for moving between unpaid,
deposit-paid, and paid states.
The details command accepts optional `work_items[]` entries containing an
existing work-item `id`, issue description, note, waiting time, and optional device
identifiers (`device_type`, manufacturer, model, and serial number). When
supplied, all entries must belong to the ticket, each child intake record is
updated atomically, and the parent issue summary follows the first work item.
`POST /api/v1/repairs/tickets` accepts a repeatable `work_items[]` array. Each
work item carries its subject/device, issue, optional note, and dynamic field
payload. The response returns `work_items[]`, `service_items[]`, and typed child
arrays for parts, diagnostics, approvals, warranties, and images, together with
ticket custom fields and form version. The legacy singular `device` and
`issue_description` fields remain compatibility aliases and normalize to the
first work item. Images may remain ticket-level. On multi-work-item tickets,
every billable service and part identifies its work item; single-work-item
legacy requests are allocated automatically. Each work item exposes subtotal,
discount, tax, total, paid, and balance projections. Payments remain canonical
ticket-level records and accept allocations whose sum must equal the payment;
online requests may omit allocations and use deterministic balance allocation.
Updating a work-item status derives the parent repair lifecycle through
`RECEIVED`, `IN_PROGRESS`, and `READY_FOR_PICKUP`; explicit parent terminal
states remain preserved. Printing is read-only and does not require payment.
Moving a repair ticket to `COMPLETED` does not require a final payment. The
parent completion command marks every child work item `COMPLETED` atomically;
the final payment endpoint remains available as an optional later operation.
When no payment has been captured and no inventory part has been consumed, the
linked canonical order remains in `PENDING_PAYMENT` rather than being forced
directly from `DRAFT` to `FULFILLED`. Adding a stock-tracked repair part as
`USED` advances the canonical order legally to `CONFIRMED` and atomically posts
the stock-out/FIFO allocation; this inventory effect does not wait for payment.
A later final payment remains valid after completion and advances
the canonical order through its legal lifecycle (`CONFIRMED`, `PROCESSING`,
then `FULFILLED`). When a full final payment is recorded before manual
completion, that payment closes the parent repair ticket, every work item, and
the service order atomically. The repair ticket does not otherwise require
payment in order to be completed.

Service forms use merchant-scoped versioned definitions at
`/api/v1/services/forms/definitions` and values at
`/api/v1/services/forms/values/{entityType}/{entityId}`. Generic
`SERVICE_TICKET` and `SERVICE_WORK_ITEM` definitions apply across GENERAL,
REPAIR, and CLINICAL service orders, while specialized repair definitions may
extend or override them. Value writes validate the referenced tenant-owned
entity and service type. Definitions declare the supported field type and scope,
options, validation rules, visibility metadata, ordering, section, and
printability. Repair ticket and work-item commands validate submitted field
values against the active definition version and return the stored field
map. Work-item child records may reference `work_item_id`; omitting it keeps
the legacy ticket-level association.
`GET /api/v1/transaction-history` is the unified operational history read. It
combines stock-in/out and other stock events, canonical orders from every
channel, successful refunds, and repair deposit/final checkout/refund payments. It is
distinct from `/api/v1/inventory/movements` (the stock ledger) and from
`/api/v1/reports` (financial aggregates). Its `filter` supports `event_type`,
`from`, `to`, `status`, and `shop_id`; shop-scoped users cannot escape their
assigned shop. Financial report queries also apply the selected `shop_id` to
every canonical order channel, including SERVICE/repair orders through
`service_orders.shop_id`.
`GET /api/v1/transaction-history/{id}` returns the tenant-scoped detail record
for one history entry.

Canonical invoice responses identify their projection with `kind`. Repair
invoices include `ticket_status`, `payment_status`, the derived ticket waiting
range, every printable work-item device/issue/waiting projection, and printable
ticket fields in the same response, so
clients do not need to join repair orders and devices to render a ticket.
`POST /api/v1/inventory/stock-in` also supports direct stock-in without a
purchase order by accepting a tracked variant, destination, quantity, optional
original unit cost, and event key. When `unit_cost` is omitted, the backend
reuses the most recent receipt cost for that merchant-owned variant. The first
stock-in for a variant must include `unit_cost`. Direct receipts create
canonical FIFO cost layers; purchase-order identifiers must still be supplied
together when that workflow is used.
Service billing creation accepts an optional `promotion_id`; unscoped promotions
can reduce a service total and are reflected in the canonical SERVICE order.
Repair creation accepts the same field and applies the reduction to the repair
balance before deposits or final checkout. Product-scoped promotions remain
available for product lines and repair stock parts, while they are rejected for
service-only totals.
POS quotes expose the authoritative `currency_code`, and invoice records expose
the currency stored on their canonical order. Clients must use those values for
all monetary display and printing instead of assuming a tenant-independent
currency.
Shop settings persist `footer_note`; payment settings persist `tax_label` and
`receipt_note`, and invoice responses include those values for receipt output.

POS checkout and repair payments capture active merchant payment types in the
`CASH` and `ONLINE` categories. Temporary-offline capture remains limited to
`CASH`; an offline ONLINE intent stays pending for an online retry. `DIGITAL`
returns `FUTURE_IMPROVEMENT` and is never captured.

Product requests and reads also support an optional product-level `barcode`.
Catalog barcode administration uses `POST /api/v1/catalog/barcodes` with
`code`, `target_type` (`PRODUCT`, `VARIANT`, `ASSET`, or `BATCH`), and
`target_id`; `DELETE /api/v1/catalog/barcodes/{id}` removes an assignment.
Barcode resolution uses `GET /api/v1/pos/barcode-lookup?barcode=...&shop_id=...`
and searches product, variant, and active stock-asset registry entries.
Stock-asset matches return `stock_asset_id`; POS sale lines may carry
`asset_id`, which the backend validates against the selected shop and marks
sold during checkout.
`GET /api/v1/inventory/assets` returns tenant- and membership-shop-scoped
serialized stock assets with their current asset barcode identity. Asset barcode
assignment uses the catalog barcode endpoint with `target_type: ASSET`.

Catalog product reads expose `category_ids` and `category_names`. Product create
and update requests may send `category_ids` to save the complete category
selection atomically. Omitting this field during update preserves existing
assignments; sending an empty array removes them.

Product and variant reads expose ordered `images[]` collections. URL submissions
use `source_type: URL`; Google Drive submissions use `source_type: GOOGLE_DRIVE`
and the backend converts sharing links to viewable URLs before persistence.
Multipart image uploads accept JPEG, PNG, WebP, or GIF files up to 10 MB, store
the file through the configured SeaweedFS filer, and persist its public URL.
Products and variants both support multiple images. The portal currently edits
only the first image; in POS SIMPLE mode that image belongs to the product and
the managed Standard variant receives no image.

Merchants expose `pos_complexity_level` as `SIMPLE` or `COMPLEX`. New merchants
default to `SIMPLE`; merchants that existed before migration `0022` remain
`COMPLEX`. A SIMPLE product create must include `standard_variant.base_unit_id`
and may include `standard_variant.attributes` and `is_stock_tracked`. The backend
creates the product and its sole standard variant atomically. Separate variant
create/delete operations are rejected for SIMPLE merchants. COMPLEX merchants
retain the existing product-then-variant workflow unchanged.

Deleting a product deletes its variant aggregate and configuration records when
the product is unused. The delete returns `409 DELETE_REJECTED` when stock,
purchasing, sales, repair, or other immutable business history references any
variant; clients should offer deactivation in that case.

The contract-first OpenAPI document is available at
[`business-central-backend/docs/openapi.yaml`](business-central-backend/docs/openapi.yaml),
with a local Swagger UI viewer at
[`business-central-backend/docs/index.html`](business-central-backend/docs/index.html).
It contains reusable schemas and conventions plus the implemented health,
authentication, platform-admin merchant, and user membership paths.

## General rules

- Use versioned routes, initially `/api/v1/...`.
- Use JSON for request and response bodies unless a file upload requires multipart form data.
- Every merchant-owned request must resolve a merchant context from authenticated membership or an explicitly authorized platform-admin operation.
- Clients must not calculate authoritative totals, permissions, inventory balances, or lifecycle transitions independently.
- Use UUIDs for identifiers and ISO 8601 timestamps in UTC.

## Response shape

Successful single-resource response:

```json
{
  "data": {},
  "meta": {}
}
```

Successful collection response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "page_size": 25,
    "total": 0
  }
}
```

Error response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "fields": {}
  },
  "request_id": "uuid"
}
```

## Required error codes

At minimum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `MODULE_DISABLED`, `OFFLINE_OPERATION_REJECTED`, `FUTURE_IMPROVEMENT`, and `INTERNAL_ERROR`.

## Authentication

Authentication uses short-lived bearer access tokens and rotating refresh tokens. Login, refresh, current-user, logout, lockout, and inactive-merchant checks are implemented by the backend. Credentials belong only to `user_identities`; merchant membership and permissions come from membership tables.

## Idempotency

Client retries for payment, order, inventory, repair, merchant, promotion,
service-catalog, and synchronization commands must use an idempotency key. The
backend must return the original result for a repeated key with the same
request and reject reuse with a different request. Deferred portal requests
carry the stable `Idempotency-Key` HTTP header; the backend records it in the
same tenant-scoped transaction as the business effect. POS refunds and repair
refunds additionally validate the captured payment's remaining refundable
amount and the authenticated membership's shop scope; repair refunds must
reference a payment allocated to the requested repair order.

## Client synchronization

The authenticated backend synchronization contract is available under
`/api/v1/sync`:

- `POST /sync/handshake` registers a merchant-scoped device and opens a client
  session while exchanging protocol/schema versions.
- `POST /sync/push` accepts ordered operations with `operation_id`, entity
  identity, optional `base_version`, and JSON payload. Results are explicitly
  `APPLIED`, `REJECTED`, or `CONFLICT`.
- `POST /sync/pull` returns ordered server changes after a durable sequence
  checkpoint.

Enabled operations are `SHOP_SETTINGS` `UPDATE`, `DELIVERY`
`CREATE`/`UPDATE`/`DELETE`, `CATALOG_PRODUCT` metadata `UPDATE` (including optional
`manufacture_date` and `expired_date` in `YYYY-MM-DD` form), `REPAIR_DRAFT`
`CREATE`/`UPDATE`/`DELETE`, repair aggregate `REPAIR_TICKET` `CREATE`, child
`REPAIR_DIAGNOSTIC`, `REPAIR_IMAGE`, `REPAIR_PART`, `REPAIR_APPROVAL`,
`REPAIR_WARRANTY`, and cash-only `REPAIR_PAYMENT` `CREATE`, and `POS_CHECKOUT`
`CREATE`. Repair child operations are dependency-ordered behind the parent,
validate tenant, shop, repair-order, and optional work-item scope, and return
authoritative IDs/totals. Checkout is shop-scoped and append-only: cash may be recorded
provisionally, the server replays the canonical aggregate with the operation ID
as its idempotency key, and a total, stock, payment, or authorization mismatch
is returned for review without silently altering the provisional transaction.
Other financial, inventory, payment/refund, approval, permission, module,
promotion-eligibility, and lifecycle operations return explicit rejection
until their domain-specific temporary-offline policies are implemented. See
`OFFLINE_SYNC_PROTOCOL.md` and the generated backend OpenAPI document for the
request/response schemas.

## API change process

Update this document, backend tests, client integration code, and affected feature records together. Breaking changes require a new API version or an explicit migration plan.
