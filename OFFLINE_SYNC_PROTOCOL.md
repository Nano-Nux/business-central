# Offline Synchronization Protocol

This document describes the backend-authoritative temporary-offline contract
for the `business_central_mobile` ONLINE runtime and the installable
`business-central-portal` PWA. The portal has no FULLY_OFFLINE runtime.
Mobile FULLY_OFFLINE remains a permanent local-only deployment and never uses
this protocol.

## Operating modes

| Mode | Backend requests | Data source |
|---|---:|---|
| `ONLINE` and connected | Allowed through the central network gate | Backend plus SQLite cache |
| `ONLINE` and temporarily disconnected | Forbidden until confirmed connectivity returns | SQLite plus durable queue |
| `ONLINE` and synchronizing | Allowed only after connectivity and authentication are restored | Queue plus backend reconciliation |
| `FULLY_OFFLINE` | Forbidden for the complete session | SQLite only |
| Portal PWA connected | Allowed | Backend plus tenant/membership-scoped IndexedDB cache |
| Portal PWA temporarily disconnected | Paused after a confirmed transport failure | IndexedDB cache plus the durable supported-operation outbox |
| Portal PWA synchronizing | Allowed after connectivity and authentication return | IndexedDB outbox plus backend reconciliation |

The mobile network gate blocks API calls, refresh, uploads, analytics, and
background synchronization while disconnected. FULLY_OFFLINE dependency
injection returns a denying transport and a no-op synchronization worker; it
does not construct an authenticated API client or connectivity monitor.
The portal treats browser Background Sync as an optional wake-up hint only.
It always retries in the foreground on launch, confirmed reconnect, and manual
request because Background Sync is not consistently available across browsers.

## Versioned backend contract

The backend exposes these authenticated routes under `/api/v1`:

- `POST /sync/handshake` registers or reactivates a tenant-scoped device and
  opens an idempotent client session. The response exchanges protocol version,
  schema compatibility, device identity, session identity, and current server
  sequence.
- `POST /sync/push` accepts up to 100 operations and returns one result for
  each operation. `operation_id` is the idempotency key. Reusing it for the
  same entity returns the original result; reusing it for another entity is a
  conflict.
- `POST /sync/pull` returns ordered changes after a client checkpoint. The
  client advances its checkpoint only after the change page is applied in the
  same SQLite transaction.

Enabled policies are `SHOP_SETTINGS` `UPDATE`, shop-scoped `DELIVERY`
`CREATE`/`UPDATE`/`DELETE`, merchant-scoped `CATALOG_PRODUCT`
`CREATE`/`UPDATE`/`DELETE` for basic product metadata (including optional manufacture/expiration dates) and category assignments,
merchant-scoped `CATALOG_CATEGORY` `CREATE`/`UPDATE`/`DELETE`, intake-only `REPAIR_DRAFT` `CREATE`/`UPDATE`/`DELETE`, append-only
merchant-scoped `CATALOG_VARIANT` `CREATE`/`UPDATE`/`DELETE` with parent-product dependencies,
merchant-scoped `CATALOG_ATTRIBUTE_DEFINITION` and `CATALOG_ATTRIBUTE_OPTION`
`CREATE`/`UPDATE`/`DELETE` with definition dependencies and server validation of
variant attribute assignments,
merchant-scoped `PRODUCT_PRICE` `CREATE`/`UPDATE`/`DELETE` with deterministic composite-key identities,
merchant-scoped `PRICE_LIST` `CREATE`/`UPDATE`/`DELETE` with explicit child-price safeguards,
merchant-scoped `CATALOG_UNIT` and `CATALOG_CONVERSION` `CREATE`/`UPDATE`/`DELETE`
with dependency ordering and canonical foreign-key validation,
`REPAIR_DIAGNOSTIC`, `REPAIR_IMAGE`, `REPAIR_PART`, `REPAIR_APPROVAL`,
`REPAIR_WARRANTY`, and cash-only `REPAIR_PAYMENT` `CREATE`, plus shop-scoped
`POS_CHECKOUT` `CREATE`. A repair ticket `CREATE` is an aggregate operation:
the backend creates every supplied work item in the same transaction and keeps
client-supplied work-item UUIDs stable for dependent child operations. Child
operations carry the parent ticket and optional `work_item_id`, validate both
tenant/shop scope and parent membership, and publish authoritative result
payloads. Catalog-part promotions and external payment methods remain online-only.
Repair aggregate payloads may carry `waiting_days` or `waiting_end_date` per
work item. The authoritative result contains automatic start dates, canonical
end dates, derived day counts, and the derived whole-ticket range.
The portal replays its deferred child API requests after the parent and maps
nested canonical IDs; mobile queues typed child operations behind the parent.
Replaying an inventory-backed repair part in `USED` state posts its canonical
stock-out and FIFO allocation during the part transaction. The client-side
quantity reduction is provisional until that replay succeeds, but neither the
online nor replay path waits for final payment to consume the part.
After the local repair aggregate and outbox operation commit together, clients
render the projected ticket in the active repair list immediately. While its
create operation remains unresolved, an older server read must not erase that
local projection; synchronization continues in the background and replaces it
with the canonical result after success.
Direct shop-scoped stock receipts use `STOCK_RECEIPT` `CREATE`; purchase-order
receiving, batch/expiry receipts, transfers, and adjustments remain unsupported
offline. Receipt payloads may omit `unit_cost`; during replay the backend reuses
the merchant variant's latest canonical receipt cost. A first receipt without a
cost is rejected for review instead of creating a zero-cost layer.

`CATALOG_PRODUCT` deletion removes the product's variants and configuration as
one aggregate when they have no stock or immutable business-history references.
The server returns `DELETE_REJECTED` and preserves the complete aggregate when
any protected reference exists.

Checkout includes complete provisional commercial, line, payment-intent, and
inventory snapshots. The backend revalidates membership/shop scope and reruns
canonical pricing, tax, promotion, stock, and FIFO rules inside a savepoint.
It commits one cash sale or rolls the attempt back and persists a visible
review result. External payment intents never create a captured payment.

Direct online shop settings, deliveries, product metadata, product lifecycle,
category lifecycle, variant lifecycle, variant-attribute definition/option
lifecycle, product-price lifecycle, price-list lifecycle,
repair diagnostics, and orders publish the same ordered entity changes as
synchronized writes. The current portal's deferred promotion, merchant,
service-catalog, repair-order, repair-work-item, repair-part, repair-image, and
repair-payment
requests replay the exact API mutation with a stable `Idempotency-Key`; those
endpoints persist the key transactionally and return the original result on a
same-request retry.
`sync_changes.shop_id` filters assigned-shop downloads without hiding
merchant-wide changes. Purchase-order receiving, transfers, adjustments,
refunds, permissions, modules, promotion definitions, approvals, and remaining
lifecycle commands
remain explicitly unsupported offline; they must never be silently client-wins.

Clients may send a canonical JSON SHA-256 `payload_hash` and a
`dependency_operation_id`. The backend verifies a supplied hash, prevents an
operation identifier from being reused for different content, requires a
dependency to be applied on the same tenant-scoped device, and persists the
authoritative result payload/version so an idempotent replay returns the same
business result instead of the original client projection.

## Local database

The Drift database is currently schema version 13. It includes the canonical
sync metadata needed by the current policy: `OperationQueue`,
`SyncCheckpoints`, `SyncDevices`, `SyncSessions`, and `SyncEntityVersions`.
Merchant settings include `shop_id` so cached tax and receipt values cannot
leak between shops. Migrations are forward-only and preserve pending rows.

The portal IndexedDB database starts at schema version 1. Its resource,
entity, operation, and metadata stores are scoped by both merchant and
membership. It stores cached collection timestamps, canonical entity
versions, a merchant checkpoint, stable browser-device identity, durable
operation payload hashes and dependencies, retry state, and authoritative
conflict details. Cached records are removed when the user explicitly signs
out, and sign-out requires confirmation before unresolved operations are
discarded. Authentication expiry no longer erases a scope. When authorization,
membership, permission, or shop assignment changes, stale read projections are
removed while unresolved operation projections are retained and marked
`BLOCKED` for explicit review.

The portal asks the browser to persist origin storage when that API is
available, inspects usage/quota, and warns users when storage is best-effort or
nearly full. Time-window dashboard and financial-report reads use stable,
tenant-scoped snapshot keys. Cached data is used only for network
unavailability; authorization and backend errors remain visible and never
silently reveal a stale snapshot. Collection and detail views publish stale
state to the workspace shell, which shows the saved timestamp and triggers a
foreground revalidation after reconnect or sync completion.

## Operation queue

Each supported temporary-offline mutation is written in the same local
database transaction as its local domain change. Mobile uses SQLite and the
portal uses IndexedDB. Queue rows include:

```text
operation_id, merchant_id, shop_id, device_id, entity_type, entity_id,
operation_type, payload, payload_hash, base_version, client_created_at,
dependency_operation_id, status, retry_count, next_retry_at, last_error
```

Durable statuses are `PENDING`, `SYNCING`, `SYNCED`, `REJECTED`, `FAILED`,
`CONFLICT`, and `BLOCKED` where supported by the client.
`operation_id` is generated once and remains stable across retries. The queue
survives process termination and is merchant-scoped in every query. The
worker sends dependency-ready operations in creation order, uses bounded
exponential retry delays for transport/server failures, and leaves permanent
validation/authorization failures visible instead of retrying forever.

`POS_CHECKOUT` persists one provisional entity and its operation atomically.
Line snapshots include stable product/variant/unit identity, names, SKU,
barcode, quantity, shown unit price/subtotal, and stock snapshot. Commercial
snapshots include currency, subtotal, discounts, tax, delivery, and total.
Payment state distinguishes provisional cash from pending external
authorization. Unresolved checkouts reserve stock on that device.

## Synchronization sequence

```text
confirmed connectivity
  -> authenticated session refresh if required
  -> handshake/version exchange
  -> upload dependency-ready queue rows
  -> record applied/rejected/conflict results
  -> download ordered changes after local checkpoint
  -> apply each page in one local-database transaction
  -> save entity versions and advance checkpoint
```

The mobile worker is Riverpod-managed and started only for the authenticated
ONLINE workspace. The portal worker is React-managed and starts only for an
authenticated merchant membership with IndexedDB available. Reconnect events
trigger both workers; concurrent runs are serialized. A partial pull resumes
from the last committed checkpoint. The backend also persists each device
checkpoint and advances across shop-filtered sequence gaps without exposing
filtered payloads. Applying an accepted settings result and
a downloaded settings change updates the local shop and shop-scoped settings
projection before its entity version and checkpoint are committed.

## Conflict policy

Editable settings, product metadata, product lifecycle, deliveries, and repair drafts use
optimistic version checking. A queued update carries the
cached `base_version`; if the server version changed, the backend stores an
open `sync_conflicts` row and returns `CONFLICT` with the authoritative server
payload. The mobile or portal row remains visible as `CONFLICT` for explicit
resolution. Checkout is append-only: mismatched totals or stock are rejected
with the authoritative quote, and the provisional transaction remains visible.
External payment intents are rejected with `PAYMENT_AUTHORIZATION_REQUIRED`
and no captured side effect. Other financial, inventory, approval, permission,
module, promotion, and lifecycle mutations remain online-only.

For the enabled `SHOP_SETTINGS` policy, an authenticated user can explicitly
keep the server copy or apply the validated client change over the latest
version. Resolution is tenant- and shop-scoped and idempotent. Applying the
client change allocates a fresh server sequence and emits a pullable change;
keeping the server copy records the discarded local intent without modifying
the domain entity.

## FULLY_OFFLINE policy

FULLY_OFFLINE local workflows use their local domain services and do not create
queue rows for backend synchronization. Local POS, inventory, services,
repairs, settings, pricing, reports, history, and backup behavior are governed
by the local authorization and schema documentation. External payment capture,
remote activation, background uploads, and automatic mode switching are not
available.

The portal must never expose or infer a FULLY_OFFLINE mode. When a workflow has
no approved temporary-offline backend policy, the portal leaves the action
visibly unavailable while disconnected instead of putting it into a generic
queue.

## Required evidence

- Backend `go test ./...` passes after the synchronization bounded context,
  migration, OpenAPI paths, and direct shop-change publication are added.
- Mobile `dart run build_runner build`, `dart format lib test`,
  `flutter analyze`, and `flutter test` pass for schema 13, queue durability,
  shop-scoped settings, and the FULLY_OFFLINE no-op worker.
- Portal `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`
  cover scoped cache
  isolation, stable/coalesced operation identity, payload hashing, checkpoint
  commits, conflict visibility, logout cleanup, service-worker installation,
  offline launch, service-worker upgrade, mutation non-interception,
  provisional checkout restart persistence and stock reservation, reconnect,
  and idempotent replay behavior.
- Android APK verification remains environment-blocked when the local Android
  NDK lacks `source.properties`; this is an SDK installation issue, not a
  Flutter source compilation error.
