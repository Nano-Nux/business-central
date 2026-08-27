# Portal Implementation Status

Last reviewed: 2026-08-27

The portal is a responsive Next.js 16.3 PWA connected only to `business-central-backend`. It contains no embedded business records or client-side invoice store. Prices, promotions, permissions, stock, reports, repair consumption, orders, and invoices are backend-authoritative and tenant-scoped.

Implemented areas:

- merchant-wide payment-type CRUD under Settings and shared active payment-type selection across POS checkout, repair intake, repair final payments, and repair billing edits; DIGITAL is marked as future improvement and excluded from operational selectors;

- merchant/staff login, role redirect, refresh rotation, and protected navigation;
- shop-scoped merchant/staff dashboards and POS;
- categories, products/variants, units/conversions, price lists/prices, and promotions;
- online product and variant single-image editing through direct URL, Google Drive URL, or backend-managed SeaweedFS upload; shop logos use the same SeaweedFS media endpoint online and can be selected offline for durable reconnect upload; SIMPLE product images are never assigned to the managed Standard variant;
- purchase-order-backed stock receipt and immutable movement history;
- transactional POS with an authoritative pre-payment quote, invoice preview, promotion reduction breakdown, and checkout payment flow;
- sales/profit reporting based on canonical orders and FIFO allocations;
- Nanonux-inspired Financial Reports tabs and breakdown summaries across all canonical order channels for the selected shop;
- separate Transaction History route for shop-scoped stock events, all-channel transactions, refunds, and repair checkout payments; unfulfilled stock-tracked lines explicitly show FIFO cost, profit, and margin as pending instead of reporting zero cost and overstated profit;
- responsive view-only Storage stock checking for merchant and staff, with visual category hierarchy, RETAIL pricing, optional product manufacture/expiration dates, staff shop-scoped balances, merchant-only cost/profit, global search, per-column partial filters/sorting, page-size selection, and zero-based indexed pagination;
- shared responsive table styling and accessible numbered pagination with result ranges across transaction, inventory, catalog, customer, invoice, repair, staff, brand, service, delivery, unit, and conversion listings;
- repair tickets created through one atomic/idempotent aggregate POST with shop-stock parts, independent quantities, backend-priced `service_items[]`, service-total promotions, optional payment/images, ticket-level or per-work-item parts/images, repair-part promotions, and backward-compatible repeatable `work_items[]` intake;
- persisted printer footer/tax/receipt settings, history detail links, and repair-ticket final-total/deposit flow;
- staff creation, activation, and single-shop assignment;
- canonical invoices with stored currency, backend-projected repair kind/status/payment state, every normalized repair service/part line, printable work-item/device fields, PDF, browser print, and image-first Bluetooth ESC/POS output;
- merchant/shop and printer settings;
- embedded mobile WebView detection for native camera barcode/IMEI scanning over local HTTP and native Bluetooth ESC/POS printer transport, while preserving browser scanning and keyboard/HID input outside the app;
- shop logo resizing to a 240px maximum, shop-controlled printed-logo visibility, offline shop-logo previews with scoped outbox storage and reconnect upload to SeaweedFS, default-off shop settings for device type and brand on repair invoice previews/prints, canonical customer history, merchant-owner-only customer/delivery/repair-ticket edit routes, POS checkout metadata fields, and repair invoice footer/layout updates;
- the merchant-owner repair edit page now exposes service lines, labor and per-device prices, promotion removal/change, lifecycle status, payment targets, and inline refunds. The UI label maps to the unchanged `additional_fee` API/database field; billing is recalculated by the backend and payment status remains ledger-derived;
- repair devices expose synchronized waiting-day and waiting-end-date inputs with an automatic start date; ticket CRUD and invoice outputs derive the whole-ticket period from the earliest device start through the latest device end;
- install manifest, production service worker, offline shell, and raster install icons.
- production service-worker shell dependency precaching plus optional Background
  Sync client wake-up; foreground launch/reconnect/manual synchronization does
  not depend on Background Sync support.
- core workspace and visited navigation shells survive an offline browser
  restart; the service worker never caches authenticated API responses.
- merchant- and membership-scoped IndexedDB resource/entity caches with saved
  timestamps, durable outbox operations, canonical SHA-256 payload hashes,
  stable/coalesced operation IDs, dependencies, retries, checkpoints, entity
  versions, and authoritative conflict details;
- portal-owned deferred-request replay for currently exposed mutations without
  a typed server sync entity. Deferred requests use the same atomic local
  projection/outbox commit, stable idempotency key, dependency ordering,
  local-to-canonical ID mapping, retry/backoff, and durable rejection/conflict
  state. This keeps the portal scope self-contained and does not add unused
  backend APIs.
- authenticated offline session restoration, cached merchant/shop workspace
  hydration, live online/offline/reconnecting/syncing status, pending/rejected/
  conflict visibility, manual sync, permission-change cleanup, and explicit
  confirmation before sign-out discards unresolved operations.
- stable offline dashboard and financial-report snapshots, network-only cache
  fallback (authorization/server errors are surfaced), browser persistence
  requests, quota inspection, and storage-pressure warnings.
- all stage-one read-only views, including transaction and stock detail pages,
  use durable tenant-scoped snapshots. Dynamic date/search views use stable
  cache keys, cached views announce their saved timestamp globally, and
  reconnect/sync refreshes revalidate them automatically.
- merchant/shop profile, tax, receipt, footer, logo, contact, and shop timezone
  settings use the durable local projection and reconnect replay path.
- settings conflicts expose explicit keep-server and confirmed apply-client
  actions; both persist the backend's authoritative payload/version locally.
- printer footer-note changes use the same versioned `SHOP_SETTINGS` outbox as
  tax and receipt settings, including offline persistence and reconnect sync.
- delivery-option create and removal use the same durable outbox with stable
  entity IDs, shop scope, dependency ordering, and backend version checks.
- product creation, metadata edits (name, description, type, active state, and
  categories), and deletion use a durable merchant-scoped outbox, stable local
  IDs, backend entity versions, dependency ordering, and explicit rejection for
  referenced products.
- category creation, hierarchy edits, and deletion use the same durable outbox;
  child-category dependencies are ordered, versions are optimistic, and
  deletion of a category with children remains a visible server rejection.
- variant/SKU creation, edits, and deletion use a durable merchant-scoped
  outbox with parent-product dependencies, optimistic entity versions, and
  explicit rejection when canonical stock or transaction references prevent
  deletion.
- unit and unit-conversion creation, edits, and deletion use durable typed
  outbox operations with optimistic versions, parent-unit dependencies, and
  visible rejection when canonical product or stock references prevent unit
  deletion.
- price-list creation, edits, and deletion use a durable outbox with optimistic
  versions and explicit rejection when child prices exist; product-price
  upsert/deletion uses deterministic composite-key `sync_id` values and queued
  operations depend on pending list creation. The pricing form excludes
  variants that already have a price in the selected list, while the backend
  remains authoritative for duplicate rejection. Inventory effects remain
  online-only.
- repair ticket creation, diagnostics, status changes, image uploads, stock-part
  consumption, repair-catalog edits, and cash payments commit durable local
  projections. A newly queued ticket is inserted into the active repair list
  immediately with a pending-sync indicator; foreground synchronization does
  not block form dismissal or replace that projection with an older server
  list. Stock quantities are reserved locally and dependent child
  operations replay after a ticket create succeeds. Non-cash repair payment
  types remain pending while offline.
- inventory-backed repair parts reduce the local stock projection immediately
  and the backend posts the canonical stock-out/FIFO allocation when the Used
  part transaction succeeds; stock consumption is independent of final payment.
- repeatable repair work items and backend-defined ticket/work-item fields are
  rendered by the portal, preserved in the deferred create projection, and
  included in printable invoice details. Intake photos and parts, diagnostics,
  images, cash payments, and work-item status changes carry work-item
  references and replay behind the parent ticket; online approval and warranty
  follow-up is available from the ticket detail view. Billing and payments
  remain canonical at ticket level while lines, fees, and captured payment
  portions are attributed to each work item.
- repair work items accept ordered repeatable issues and optional repeatable
  conditions. Preview, PDF, browser print, and Bluetooth output omit empty
  conditions. Merchant owners manage separate shop-scoped Issue presets and
  Condition presets below Repairs; choosing one copies its text into the
  selected intake field without linking the ticket to mutable preset data.
- intake-only `REPAIR_DRAFT` remains supported for drafts created by older
  clients; current portal intake uses the complete durable repair-ticket policy.
- append-only repair diagnostics can be queued offline against an existing
  shop-scoped repair order; the backend validates the order, membership scope,
  and stable diagnostic identifier before applying it.
- POS CASH-category checkout can be completed provisionally offline. IndexedDB commits
  the complete receipt projection and typed operation together, reserves
  device-local stock across page/browser restart, and links an accepted result
  to the canonical order. ONLINE types remain pending while offline and
  are never shown as captured. Price/tax/promotion/stock differences remain a
  durable rejected review item.
- direct non-batch stock receiving can be queued offline for an assigned shop;
  the canonical synchronization path validates location, membership, variant
  tracking, optional recent-cost reuse, and FIFO-triggered inventory effects.
  Staff do not enter or see unit costs in the stock-in/history list workflow;
  the first receipt for a variant must still be initialized with an explicit
  cost by a merchant. The current portal exposes
  no transfer, adjustment, purchase-order, batch, or expiry mutation screen.
- promotion definitions, product scopes, promotion codes, and repair service
  catalog records use deferred replay with stable idempotency keys and visible
  rejection/conflict states.
- deferred promotion, merchant, service-catalog, repair-order, repair-part,
  repair-image, and repair-payment replays are protected by tenant-scoped
  backend idempotency transactions; an ambiguous online POS sale reuses its
  original idempotency key when it is converted to a queued checkout.
- POS and repair offline payments are limited to provisional CASH-category
  choices or explicitly pending ONLINE choices; the portal exposes refunds as read-only, so
  no refund mutation is queued.
- authorization changes quarantine unresolved rows as `BLOCKED` while removing
  stale readable projections; refresh-token expiry no longer silently deletes
  the queue.
- interrupted `SYNCING` operations are recovered to `PENDING` when a scoped
  synchronization run starts, and persisted retry deadlines trigger automatic
  foreground retries while the browser is online.
- production browser tests now cover service-worker install/upgrade, offline
  cold launch, mutation non-interception, and offline checkout persistence and
  local stock effects; the owned-server runner exits deterministically on
  Windows.

Current validation includes 31 Vitest files / 85 tests, ESLint, TypeScript, a
Next.js production build, backend
`go test ./...` unit/in-process coverage, and 4 passing production Playwright
tests for multi-device repair allocation, service-worker install/upgrade,
offline cold-launch, browser-restart, mutation non-interception, and
local-stock recovery.
The configured PostgreSQL connection was rechecked successfully: `psql`
authenticated to the Aiven target, and `RUN_DB_TESTS=1
RUN_API_DB_TESTS=1 go test ./...` passed, including migration and HTTP API
integration coverage. Long-duration offline, storage-eviction, and multi-tab
browser drills remain manual follow-ups.
