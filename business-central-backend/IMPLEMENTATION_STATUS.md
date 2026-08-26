# Backend Implementation Status

Last reviewed: 2026-08-12

## Current state

- Repair work items persist ordered multi-value issues and optional conditions while retaining `issue_description` as the first-item compatibility alias. Merchant owners manage unique ISSUE and CONDITION presets per shop through tenant-safe CRUD endpoints; invoice and synchronization projections preserve the arrays.
- Repair work items persist automatic waiting start dates and canonical waiting end dates. Requests accept either `waiting_days` or `waiting_end_date`; responses and invoices derive both forms plus the whole-ticket range without duplicate ticket-level columns.

- Repair billing supports catalog labor fees, shop-scoped tax inclusion/rates, repair payment states, notes, and calculated labor/tax/total fields. Repair orders use `total_cost` as their sole cost field.

- Repair ticket billing edits are available to merchant owners through `PATCH /api/v1/repairs/orders/{id}/billing`. Catalog services, labor overrides, per-device prices, and service promotions are recalculated atomically while replacement-part order lines remain intact. The compatibility field and database column remain `additional_fee`. Deposit/final payment and refund records remain canonical; the edit page uses those endpoints rather than overwriting payment status.

- Go module configuration exists.
- `schema.sql` contains the canonical multi-tenant database design.
- The schema contains commerce, service, repair, accounting, synchronization, and optional vertical capabilities.
- Repair is modeled as a specialized service: `repair_orders.service_order_id` remains the ticket-level billing/lifecycle record, while migration `0024_service_work_items_and_forms` adds repeatable `service_order_work_items` and `repair_work_item_devices` rows for device-specific intake data.
- Service work can connect to canonical orders through `service_orders.order_id` with `orders.channel = 'SERVICE'`.
- Payments and refunds remain attached to canonical orders.
- Service billing remains attached to `service_order_billings`.
- Health, authentication, authorization, platform-admin bootstrap, merchant provisioning, and user membership CRUD APIs are implemented; OpenAPI documentation is available at `docs/openapi.yaml` with a local Swagger UI viewer at `docs/index.html`.
- Platform-admin merchant listing and activation/deactivation APIs are implemented. Inactive merchants are rejected during login, refresh, and access-token session validation without deleting the merchant or its memberships.
- Merchant creation now has seeded USD, THB, EUR, and GBP currencies through migration `0004_seed_reference_currencies`; platform administrators can manage platform-wide currencies through `/api/v1/admin/currencies`, while supported currencies remain publicly listable through `/api/v1/currencies`.
- User membership management supports backend role assignment plus active/inactive restoration. DELETE remains a soft deactivation to preserve identity and audit history.
- Merchant role management supports platform-admin create, read, update, and delete operations plus permission-catalogue assignment. System role codes cannot change and system roles cannot be deleted.
- Startup first-admin bootstrap is implemented: when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured, the backend creates a platform administrator only if `user_identities` is empty; otherwise it logs that bootstrap was skipped. `PLATFORM_ADMIN_*` remains supported as a legacy explicit bootstrap.
- The backend now uses context-first DDD + Hexagonal packages: each of `internal/auth`, `internal/catalog`, `internal/pos`, `internal/operations`, `internal/reports`, and `internal/services` owns `domain`, `application`, `ports`, and inbound/outbound adapters; global HTTP composition is under `internal/adapters/inbound/http`, with dependency composition in `cmd/server/main.go`.
- Catalog, POS, pricing, promotion, and inventory use cases apply domain validation before calling outbound ports. Product create/update saves hierarchical category selections atomically and product reads expose assignment IDs/names for portal editing. Domain tests cover product defaults, variant invariants, POS session transitions, pricing normalization, and inventory command requirements.
- Product pricing now has one canonical row per merchant price list and sellable variant. Direct upserts update that row, synchronization rejects duplicate creates, and migration `0027_one_price_per_variant` enforces the invariant in PostgreSQL.
- Merchant POS complexity is stored canonically as SIMPLE or COMPLEX. Migration `0022_pos_complexity_level` preserves existing merchants as COMPLEX and defaults new merchants to SIMPLE. SIMPLE product creation requires a base unit and atomically creates the sole standard variant used by pricing, inventory, and sales.
- Product deletion treats variants and configuration as aggregate children: unused products, including SIMPLE products with a managed standard variant, delete atomically; stock or immutable business-history references reject the complete delete and require deactivation.
- Product variant attributes now have merchant-scoped definition/value CRUD APIs, OpenAPI contracts, versioned synchronization entities, and server-side validation/storage for variant `attributes` values. The portal lets merchants configure reusable values and select them from dropdowns during variant creation, including configurable Color/RAM/length-style fields, and queues the same mutations while temporarily offline.
- Products and variants expose ordered multi-image collections. The catalog API accepts direct URLs, normalizes Google Drive sharing URLs, and sends validated direct uploads to a configured SeaweedFS filer before persisting the public URL. Image mutations are currently online-only.
- Reports and sales analysis use canonical orders, refunds, and FIFO inventory cost allocations. `sales-summary` and `profit-summary` expose profit metrics; `sales-by-day` and `top-products` expose paginated analysis.
- Financial reports apply the selected shop to all canonical order channels, including SERVICE/repair orders through `service_orders.shop_id`. `/api/v1/transaction-history` combines shop-scoped stock events, canonical orders from every channel, successful refunds, and repair deposit/final checkout payments without adding a duplicate transaction table; its detail route resolves events to full canonical order lines, FIFO cost/profit, totals, payments, and refunds. Each line exposes `cost_posted` so clients distinguish a legitimate zero cost from an inventory cost that is still pending fulfillment.
- Stock movement detail resolves the immutable movement to product/SKU, units, source and destination locations, current balances, receipt/purchase-order or checkout-order context, and FIFO allocation rows through `/api/v1/inventory/movements/{id}`.
- The view-only Storage projection exposes RETAIL prices to merchant and staff users, scopes staff balances to their assigned shop, reserves weighted original cost/profit for the Merchant role, and supports global search plus partial per-column filters, sorting, and zero-based pagination. Optional product manufacture/expiration dates are preserved through online and synchronized product edits.
- Services and repairs expose merchant-scoped CRUD APIs. Repair orders reference existing service orders and devices, while child records are constrained by their parent route and merchant scope.
- Portal operations add current-merchant settings, shop-scoped POS catalog and reports, direct product stock-in with explicit or API-reused recent original unit cost, receivable purchase-order lines, server-calculated POS quotes, atomic/idempotent sale checkout, canonical invoices, and single-shop staff assignment. Direct and purchase-order stock receipts are idempotent and create canonical FIFO cost layers; the first receipt for a variant still requires an explicit cost.
- Creating a repair service order also creates its canonical `SERVICE` order. Marking a catalog part `USED` writes the order line, validates any product promotion, and consumes shop inventory in one transaction; completing the repair exposes the pending service invoice.
- Initial repair intake uses one atomic and idempotent `POST /api/v1/repairs/tickets`. Device, canonical/service/repair orders, per-product quantities, authoritative final total, optional payment, and images commit together or roll back together; child POST APIs remain available for later lifecycle changes.
- Multi-device repair intake is backward-compatible: callers may submit `work_items[]` with a stable ID, device, issue, and fee per item; the backend validates every item, creates all devices/work items in the same idempotent transaction, backfills existing tickets as one work item, and returns per-item financial projections. Service/part lines and captured payments are attributed to work items while canonical totals, payments, and refunds remain ticket-owned.
- Service form definitions and values have merchant-scoped CRUD routes under `/api/v1/services/forms`, generic and repair-specific ticket/work-item entity types, form-version increments, stale-version rejection, typed value validation, select-option/range/pattern rules, printable metadata, and tenant-owned entity validation. Repair intake stores validated ticket/work-item fields and returns them in the repair projection; portal rendering, administration, printing, and its PWA outbox preserve the shape. Mobile definition/value synchronization is excluded from this release.
- Repair child records now accept an optional `work_item_id` with tenant-safe parent validation for diagnostics, parts, images, approvals, and warranties; omitted references remain ticket-level, while legacy records are backfilled to their first work item. Work-item status, assignment, device details, issue, notes, and validated fields can be updated through `PATCH /api/v1/repairs/work-items/{id}`. The canonical invoice projection includes all work-item/device details and printable fields.
- Work-item status changes derive the repair parent lifecycle (`RECEIVED`, `IN_PROGRESS`, or `READY_FOR_PICKUP`) and keep the linked service order aligned; explicit terminal parent states remain preserved. Payments remain canonical ticket transactions, with validated work-item allocations and refund-adjusted paid/balance projections; payment state does not gate printing or work-item status.
- Repair tickets may now be completed before the final payment is recorded. Parent completion atomically marks every child work item completed; recording the full final payment also completes the parent, all work items, and the service order, then advances the linked canonical order through legal `PENDING_PAYMENT` -> `CONFIRMED` -> `PROCESSING` -> `FULFILLED` transitions. Work-item update SQL uses explicit PostgreSQL parameter casts to avoid the previous `$3` type-inference 500; online and offline payment paths share the same transition behavior.
- Inventory-backed repair parts recorded as `USED` now advance the canonical service order legally to `CONFIRMED` and post their stock-out movement plus FIFO allocation in the same online or synchronized transaction. Final payment skips already-posted order lines, so it cannot deduct the part twice.
- Atomic repair-ticket intake has a 60-second HTTP request budget because it may create the parent, repeated work items, services, parts, images, and a provisional payment in one transaction. Other service endpoints retain the 15-second request budget.
- Service billings and repair creation accept unscoped promotions. The backend validates service promotion minimums, records canonical order promotions/redemptions, and applies the discount before service billing or repair deposits/final payments; product-scoped promotions remain for product and repair-part lines.
- All collection endpoints accept `query`, `filter`, `page_index`, `page`, and `page_size`; collection metadata reports total records and total pages.
- Temporary-offline synchronization now serves mobile ONLINE and portal PWA
  clients. Optional canonical payload hashes are verified, dependency IDs must
  reference an applied operation on the same tenant-scoped device, reused
  operation IDs must match entity/type/base-version/content, and authoritative
  result payload/version fields make applied/conflicted retries deterministic.
  Migrations through `0026_work_item_financial_allocations` and the OpenAPI
  contract record integrity, repair-draft, shop-scope, and change-type fields.
  Enabled policies are settings, delivery, selected product metadata, repair
  drafts/diagnostics, repeatable repair-ticket aggregate creation, and
  provisional POS checkout; unsupported domains remain explicitly rejected.
- Tenant-scoped `SHOP_SETTINGS` conflicts support explicit, idempotent
  `KEEP_SERVER` and validated `APPLY_CLIENT` resolution. Applying the client
  change allocates a fresh server sequence so every device can pull it.
- `DELIVERY` CREATE/UPDATE/DELETE operations are now a controlled low-risk
  synchronization policy. They require an explicit shop scope, active staff
  assignment, valid payloads, stable client/entity IDs, base-version checks,
  append an ordered change, and reject stale or invalid operations without
  silently overwriting server state.
- `POS_CHECKOUT` reuses the canonical POS transaction with the client operation
  ID as its idempotency key. Active membership/permission/shop scope, prices,
  taxes, promotions, stock, FIFO allocations, audit, payments, numbering, and
  ordered changes commit together. Snapshot differences roll back the attempted
  sale and return a durable review payload. Only cash can be captured; external
  intents require provider authorization.
- Pull changes carry explicit operation type and optional shop scope. Assigned
  staff receive merchant-wide plus assigned-shop changes only, and server/device
  checkpoints advance safely across filtered sequence gaps.
- Normal online writes for shop settings, deliveries, product metadata, repair
  diagnostics, complete repair-ticket intake, and POS orders publish ordered
  changes in their domain transaction. Repair-ticket sync creation validates
  tenant/shop scope, repeatable work items, versioned custom fields, and
  server-authoritative totals. Typed repair child CREATE operations for
  diagnostics, images, approvals, warranties, parts, and cash payments now
  reconcile in dependency order with tenant/work-item scope checks and
  authoritative result payloads. Migration 0026 attributes every billable
  service/part line and device fee to a work item and validates captured
  payment allocations while retaining the canonical ticket payment.

## Remaining migration work

- The context application services currently preserve the existing endpoint-compatible method surface while delegating persistence through each context's outbound port. They should be split into smaller aggregate/table repositories as each bounded context gains new behavior.
- Root context packages expose only thin DTO/type aliases for compatibility with existing admin, portal, mobile, and API tests. Canonical request/response DTOs and new command/query contracts live in each context's `application` package.
- Generated clients
- Domain-specific synchronization for refunds, inventory receiving/transfers/
  adjustments, pricing/promotions, staff/permissions/modules, service billing,
  repair lifecycle deletes, work-item delete operations, mobile dynamic-form
  definition/value synchronization, and reversals

## Update rules

Record completed work with the date, affected package/schema area, and validation performed. Do not mark a feature implemented merely because its database tables exist; distinguish schema, backend behavior, and end-to-end completion.
