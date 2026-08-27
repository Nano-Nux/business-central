# Portal Temporary-Offline Capability Matrix

Last verified: 2026-08-10

Overall status: **complete for the current portal surface**. Every portal mutation is either backed by a typed durable reconciliation policy or the portal deferred-request policy. The only offline exceptions are authentication/session actions, user-account/role/permission management, and third-party payment authorization. Broader backend capabilities without a portal mutation surface remain outside this objective.

Validation evidence abbreviations:

- `B-U`: `go test ./...` and `go vet ./...`
- `B-DB`: uncached `RUN_DB_TESTS=1 go test -count=1 ./internal/database -v`
- `B-API`: uncached `RUN_API_DB_TESTS=1 go test -count=1 ./internal/adapters/inbound/http -v`
- `B-OAS`: Redocly validation of `docs/openapi.yaml`
- `P-U`: `npm test` (Vitest)
- `P-T`: `npx tsc --noEmit` and `npm run lint`
- `P-B`: `npm run build`
- `P-E2E`: production Playwright service-worker/offline tests

| Feature | Offline behavior | Backend implementation | Portal implementation | Tests | Validation evidence | Status |
|---|---|---|---|---|---|---|
| Install, shell, and navigation | Complete static route shell is precached; visited/dynamic navigation falls back to cached shell | No API response caching required | Service worker v4 precaches every static operational route and never handles mutations/API responses | Real browser install, offline cold launch, upgrade, mutation non-interception | P-B, P-E2E | Complete |
| Authentication/session restoration | Last authenticated scoped session can open cached data; reconnect revalidates tokens and membership | Login, refresh rotation, `/auth/me`, active merchant/membership validation | Network failure retains offline session; expiry preserves unresolved rows; changed authorization quarantines rows as `BLOCKED` | IndexedDB quarantine test; existing auth tests | B-API, P-U, P-T | Partial — no device reauthentication factor for prolonged offline use |
| Cached collections/details and stale UI | Previously synchronized screens load with saved timestamp only after transport failure | Existing read APIs remain authoritative | Merchant/membership-scoped resource/detail cache and global stale state | Cache isolation, stable-key, fallback tests; shell browser test | P-U, P-E2E | Complete for implemented portal reads |
| Dashboards | Previously saved shop dashboard snapshots are readable; no writes | Canonical reporting APIs | Stable rolling-window cache keys and reconnect refresh | Cached-query tests | P-U, P-B | Complete (read-only workflow) |
| Merchants and shops | Cached workspace reads; shop tax/receipt/profile subset, including shop-logo selection, can queue | `SHOP_SETTINGS` update with version/scope validation and ordered publication; direct image files are uploaded to SeaweedFS during reconnect materialization | Atomic settings projection/outbox, local logo preview, and conflict UI | Settings, image materialization, conflict, scope tests | B-U, P-U | Partial — merchant and full shop CRUD remain online-only |
| Tax and receipt settings | Read/edit offline with optimistic version conflict resolution | Transactional settings apply, keep-server/apply-client, direct-write publication | Dedicated offline settings policy and projection | Backend sync and portal IndexedDB tests | B-U, P-U | Complete |
| Staff, roles, permissions, modules | Cached navigation remains available; mutations are blocked; authorization changes quarantine old projections | Revalidated at sync; permission revocation returns rejection | No generic queue; staff/account/shop-assignment controls are disabled offline and the API rejects offline mutations | Quarantine test; backend auth suite | B-U, P-U | Complete for current portal surface (write policies remain online-only) |
| Customers/contact | Cached customer history is readable; customer snapshots can be captured in provisional checkout | Canonical customer resolution occurs during checkout | Read cache plus checkout snapshot | Checkout persistence test | P-U, P-E2E | Partial — standalone customer mutations absent |
| Delivery options | Cached list; create/delete queue with stable IDs and dependencies | Typed create/update/delete policy with shop/version checks and direct publication | Atomic create/delete projection/outbox | Delivery dependency test | B-U, P-U | Partial — portal update recovery UI is incomplete |
| Categories | Cached hierarchy is readable; create/update/delete persist locally and synchronize with parent dependencies | `CATALOG_CATEGORY` create/update/delete, optimistic versions, direct-write publication, and visible child-category delete rejection | Durable local projections/outbox, parent dependency ordering, optimistic version payloads, and tombstone handling | Category queue/dependency/tombstone tests | B-U, P-U | Partial — product/category assignment and broader catalog policies remain separate |
| Products | Cached catalog; basic create/update/delete and first-image changes can queue with stable local IDs and optimistic versions | `CATALOG_PRODUCT` create/update/delete, version conflict, tombstone publication, explicit delete rejection, and public image URL persistence | Typed lifecycle operations with local projections, dependency ordering, restart-safe outbox, and deferred shared-media upload | Catalog and image synchronization tests | B-U, P-U | Partial — pricing and category CRUD remain separate |
| Variants and SKUs | Cached reads support POS; create/update/delete and first-image changes persist locally and synchronize after parent products | `CATALOG_VARIANT` create/update/delete, merchant scope, optimistic versions, dependency validation, public image URL persistence, direct publication, and visible reference rejection | Durable variant projection/outbox with parent-product and image dependency ordering and tombstones | Variant queue/dependency and image synchronization tests | B-U, P-U | Partial — prices, inventory policy, and stock mutations remain separate |
| Units and conversions | Cached definitions; create/update/delete persist locally and synchronize with conversion parent dependencies | `CATALOG_UNIT` and `CATALOG_CONVERSION` create/update/delete, optimistic versions, direct publication, canonical validation, and visible foreign-key rejection | Durable unit/conversion projections and outboxes; conversions depend on pending unit creation | Unit/conversion queue and dependency tests | B-U, P-U | Partial — unit deletion and broader inventory-unit assignment policies remain constrained by canonical references |
| Pricing and price lists | Cached prices feed catalog; price-list and product-price create/update/delete persist locally with deterministic identities | `PRICE_LIST` and `PRODUCT_PRICE` create/update/delete, optimistic versions, direct publication, canonical validation, and explicit rejection of deleting lists that contain prices | Durable list/price projections and outboxes; price operations depend on pending list creation | Pricing/list identity and queue tests | B-U, P-U | Partial — broader promotion/pricing reconciliation remains online-only |
| Promotions | Cached active definitions can produce a provisional snapshot; server always recalculates | Canonical eligibility/redemption during reconciliation | Provisional calculation; mismatch becomes durable review | Checkout snapshot tests | B-U, P-U | Partial — definition/scope/code writes and accept/revise flow missing |
| Locations and inventory snapshots | Cached POS/location data readable; checkout saves inventory snapshots | Shop/location and stock validation during checkout | Complete line/on-hand snapshots | Checkout unit/browser tests | P-U, P-E2E | Partial |
| Stock receiving / PO receiving | Direct non-batch stock receipt can persist locally and update cached on-hand; purchase-order/batch receiving remains blocked | `STOCK_RECEIPT` create validates membership/location/variant scope and idempotency, reuses the latest canonical receipt cost when omitted, rejects a costless first receipt, and applies the canonical FIFO trigger path; purchase-order receipts remain online-only | Durable shop-scoped receipt outbox and optimistic catalog projection | Stock receipt queue/recent-cost tests; backend sync/full suite | B-U, P-U | Partial — purchase-order, batch/expiry, and multi-line receiving policies remain online-only |
| Transfers and adjustments | Cached movements readable; no portal mutation screen is exposed | Canonical ledger constraints exist | No offline mutation surface; movement history remains read-only | Cached movement/detail tests | B-U, P-U | Complete (read-only portal workflow; future mutation UI requires a new policy) |
| Stock movements | Cached immutable list/detail readable | Canonical ledger/detail APIs | Stable detail cache keys | Cached detail tests | P-U | Complete (read-only workflow) |
| POS cart and checkout | Catalog/cart/customer/delivery/promotion/tax available offline; checkout persists a provisional receipt and reserves local stock | Typed `POS_CHECKOUT`; permission/shop revalidation; canonical pricing/tax/promotion/stock/FIFO; idempotency; audit; ordered `ORDER` and checkout changes | Atomic IndexedDB projection/outbox, stable provisional ID, full snapshots, receipt, restart list, canonical link | Three Vitest checkout tests and real browser restart/stock-reservation test; backend validation/payment tests | B-U, P-U, P-E2E | Partial — PostgreSQL end-to-end checkout replay/concurrency and accept/revise flow remain |
| Payments | POS exposes Cash, Card, and QR selection; cash is provisional and Card/QR remain pending authorization | Only cash can be captured; external methods return `PAYMENT_AUTHORIZATION_REQUIRED` without effects | Dropdown selection is wired into checkout; receipt labels provisional/pending authorization | Backend payment-method unit test; portal intent test | B-U, P-U | Partial — provider authorization/resume flow missing, not payment UI |
| Refunds and reversals | Cached history readable; no portal refund/reversal mutation surface is exposed | Canonical refund remains backend-authoritative | No offline queue; history/detail is read-only | Transaction history/detail coverage | B-U, P-U | Complete (read-only portal workflow; future refund UI requires a financial policy) |
| Orders, invoices, receipts | Cached canonical reads; provisional checkout remains visible and links after acceptance | Canonical numbering allocated only on accepted checkout; direct order change publication | Provisional receipt says pending and uses no fake number | Browser persistence test | B-U, P-E2E | Partial — rejected checkout correction workflow incomplete |
| Transaction history and reports | Previously synchronized history/reports readable with stale timestamp | Canonical shop-scoped queries | Stable cached collection/detail snapshots | Existing resource tests/build | P-U, P-B | Complete (read-only workflow) |
| Service catalog/orders/appointments/notes/billing | Cached reads; mutations blocked; no non-repair service mutation screen is exposed | Canonical service APIs only | Repair catalog controls are disabled offline; no generic queue | Connected tests only | B-U, P-U | Complete for current portal surface (future service mutations require a policy) |
| Repair drafts/intake | Intake-only draft can create/update/delete; priced completion stays blocked | `REPAIR_DRAFT` policy excludes prices, parts, images and payment effects | Durable aggregate intake projection preserves per-device waiting dates/day counts and derives the ticket range; draft queue remains narrower | Draft, waiting-date, and aggregate intake tests | B-U, P-U | Partial |
| Repair diagnostics | Existing-ticket diagnostic is append-only offline | Stable ID, shop/order validation, direct/sync ordered publication | Typed diagnostic queue | Diagnostic tests | B-U, P-U | Complete for diagnostic creation |
| Repair images, parts, status, approvals, warranties | Cached ticket readable; repair image creates, parts, and supported lifecycle children queue locally | Canonical lifecycle/stock APIs; uploaded images persist browser-public URLs | Deferred child mutations with dependency ordering; image bytes materialize through shared media upload before replay | Deferred image synchronization and connected tests | B-U, P-U | Partial — unsupported lifecycle updates remain online-only |
| Repair payments/refunds/checkout/inventory consumption | Cached records readable; mutations blocked | Canonical financial/inventory transaction exists | No offline queue; payment and inventory controls are explicitly disabled offline | Connected tests only | B-U, P-U | Complete for current portal surface (financial/inventory effects remain online-only) |
| Ordered changes and checkpoints | Pull applies visible changes in order and advances atomically | Explicit operation type, optional shop scope, persisted device checkpoint, safe filtered-gap advance | Entity page and checkpoint commit in one IndexedDB transaction; interrupted `SYNCING` rows are requeued on the next scoped run and retry deadlines are automatically scheduled while online | Backend service tests, migration integration, portal checkpoint/recovery tests | B-U, B-DB, B-OAS, P-U | Partial — broad direct-write publication audit is not complete for every domain table |
| Conflicts, rejections, and recovery | Durable visible states; settings conflict actions; checkout-specific authoritative quote/payment message | Conflict/rejection payloads persist and replay | Sync panel and POS review surface | Conflict/rejection tests | B-U, P-U | Partial — acknowledgement/revise/reversal flows vary by domain and remain missing |
| Multi-tab, quota, eviction, upgrades | Web Locks serialize supported browsers across tabs; quota/persistence warning; SW upgrade tested | Idempotency protects duplicate server effects when Web Locks are unavailable | Same-tab promise coalescing plus origin-wide Web Lock; cache loss is reported | Storage unit tests; SW upgrade browser test | P-U, P-E2E | Partial — explicit eviction restoration drill remains missing |
| Logout, device reuse, scope cleanup | Explicit confirmation required before unresolved discard; changed authorization quarantines | Sync revalidates active membership, permission and shop | Tenant/membership scope keys; stale projections removed without deleting unresolved operations | Isolation/quarantine tests | B-U, P-U | Partial — durable encrypted-at-rest browser storage is not available in web platform implementation |

## Current portal-surface audit corrections

The 2026-08-10 portal audit supersedes the older partial labels in the table
above for currently exposed mutations. Merchant/shop profile edits, promotion
definitions/scopes/codes, repair catalog/ticket/status/part/image/cash-payment
mutations, and POS quote/preview now use the portal deferred-request outbox.
They persist local projections first, replay in dependency order with stable
idempotency keys, remap local IDs after creates, retry transport failures, and
retain visible rejection/conflict states. Staff/account management and
third-party payment authorization remain the only mutation exceptions.

The catalog and pricing rows above should be read with the implementation
increments documented in `IMPLEMENTATION_STATUS.md`: product variants/SKUs,
unit definitions/conversions, price lists, product prices, and direct stock
receipts have typed offline policies and tests. Promotion definition/scope/code
writes, repair mutations, and images now use deferred portal policies. The
current portal has no transfer, adjustment, purchase-order, batch, or expiry
mutation screen; those are outside the portal surface rather than unclassified
offline gaps.

## Remaining domain limitations

The remaining non-offline actions are the approved exceptions: authentication,
logout, registration, password reset, user-account/role/permission management,
and third-party payment authorization. The portal does not expose transfer,
adjustment, purchase-order, batch, expiry, refund, approval, warranty, or other
future mutation screens, so no offline policy is invented for them.

The current portal mutation audit covers every `post`, `patch`, and `remove`
call site: supported operations use either the typed or deferred durable
outbox, while approved-exception actions remain explicitly online-only and are
centrally rejected before any network request when disconnected.

The 2026-08-10 replay audit also verified that deferred request headers survive
retry and token refresh. Promotion, merchant, service-catalog, repair-order,
repair-part, repair-image, and repair-payment endpoints now persist the stable
`Idempotency-Key` in the existing tenant-scoped idempotency store in the same
transaction as their business effect. POS fallback queues reuse the key sent
by the original online request after an ambiguous response. Automated evidence
is 18 Vitest files / 46 tests, 3 passing production Playwright tests, portal
TypeScript/build/lint, and backend `go test ./...` with the configured
PostgreSQL migration/API tests enabled. The configured PostgreSQL connection
was rechecked successfully; long-duration/multi-tab/eviction drills remain
manual follow-ups.
