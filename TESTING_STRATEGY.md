# Testing Strategy

## Backend

- Domain tests for aggregates, invariants, and state transitions
- Application/use-case tests
- HTTP handler and contract tests
- Repository and PostgreSQL integration tests
- Tenant-isolation and authorization tests
- Idempotency and concurrency tests
- Service and repair lifecycle tests
- Payment, refund, inventory, and accounting tests

## Admin and portal

- Type checking and linting
- Component and form validation tests
- Route and permission tests
- API integration tests
- PWA install/update and offline-shell tests
- Production Playwright tests using `next build && next start`; dev mode is not
  accepted as offline evidence
- Portal IndexedDB tenant/membership isolation and secure cleanup tests
- Durable outbox identity, canonical payload hash, coalescing, dependency,
  retry, rejection, and conflict tests
- Offline session restore, cached-read timestamp, reconnect, browser restart,
  duplicate replay, checkpoint atomicity, service-worker upgrade, and storage
  quota/eviction tests
- Stage-one collection and detail snapshots must prove stable cache-key
  recovery for rolling date/search URLs, transport-only stale fallback, stale
  indicator publication, and automatic foreground revalidation after sync.
- POS checkout tests must verify atomic provisional projection/outbox storage,
  complete snapshots, refresh/page-restart survival, device-local stock
  reservation, pending external authorization, canonical linking, and durable
  mismatch/rejection payloads.

## Client synchronization

The mobile suite must verify that temporary-offline settings mutations update
SQLite and the durable queue in one transaction, preserve merchant/shop/device
scope, retain stable operation IDs and payload hashes, retry only transient
failures with bounded backoff, surface rejected/conflicted rows, apply pull
pages before advancing checkpoints, and construct no synchronization worker
or transport in FULLY_OFFLINE mode. Backend tests cover handshake scope,
operation idempotency, unsupported-operation rejection, optimistic settings
conflicts, ordered changes, and tenant isolation.

The portal suite applies the same contract to IndexedDB: the local projection
and operation row commit together, operation identity and payload hashes remain
stable across restart/retry, cached reads never cross merchant or membership
scope, push results remain visible, and a pull checkpoint advances only with
its applied entity page. Background Sync is tested only as an enhancement;
foreground recovery is the required path.
- Merchant-module feature visibility tests

## Mobile

- Flutter analysis and unit/widget tests
- SQLite migration tests
- Online API tests
- Offline network-hard-stop tests
- Queue persistence and retry tests
- Conflict and reconciliation tests
- Portal/mobile parity tests
- Feature-matrix checks against `PORTAL_MOBILE_PARITY.md`

The current mobile slice includes configuration, network-denial, Drift
transaction, merchant-scope, password-hashing, local setup/login, widget, and
ONLINE auth refresh tests. Operational workflow tests remain required as each
portal/backend feature is paired.

## Required business scenarios

- User with each role sees only permitted features
- Disabled module cannot be used through UI or API
- POS sale updates order, payment, fulfillment, and inventory correctly
- Repair progresses through diagnosis, approval, parts, completion, billing, and warranty
- Duplicate commands do not duplicate payments, orders, or inventory movements
- Offline mobile operation makes no backend request
- Reconnection handles retry, duplicate operations, and conflicts safely

## Completion standard

A feature is not complete when only its table or screen exists. It must have backend behavior, authorization, client behavior, error handling, tests, and updated implementation records.
