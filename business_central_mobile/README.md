# Business Central Mobile

Flutter application for merchant owners, managers, and staff. It provides the same dashboard and POS workflows as `business-central-portal`, plus online/offline operation.

## Runtime modes

The app has two explicit runtime modes configured through `.env`.

### `ONLINE`

The app communicates with `business-central-backend` through its APIs. The backend remains authoritative for authentication, permissions, merchant modules, validation, and business state.

If connectivity temporarily disappears, the app may use local SQLite and queue supported operations for later synchronization.

### `FULLY_OFFLINE`

When `.env` marks the application as `FULLY_OFFLINE`, the app does not require internet and must never connect to `business-central-backend`. It operates entirely as an offline application using local SQLite storage. No API request, authentication refresh, upload, background network request, or synchronization is allowed.

The local tables mirror the backend schema for the data required by supported fully offline workflows.

Drift schema version 24 includes typed local promotion/scope/order-promotion
tables, exact order-line discount/tax fields, and an append-only
`local_audit_events` mapping of
the backend `audit_events` boundary. Sensitive local mutations record the
merchant, optional shop, actor membership, action, entity, before/after JSON,
request correlation, and UTC occurrence time. The local audit repository has no
update or delete operation and validates tenant/shop/actor scope before insert.

Device-local thermal printer profiles store Bluetooth addresses, paper width,
font scale, and default selection without entering synchronization.

`local_canonical_records` preserves tenant/shop-scoped backend-shaped payloads,
entity IDs, source versions, and tombstones for workflows that remain disabled
locally; it does not define a competing frontend domain model.

Repair fault presets and default intake duration are stored as ordinary
merchant/shop-scoped `merchant_settings` values through a Riverpod repository.
They match the portal's current browser-local settings behavior; the backend
does not currently expose a canonical repair-specification contract, so these
values are intentionally not synchronized.

In `FULLY_OFFLINE`, the local owner can assign the existing permission
definitions to merchant-scoped roles and enable or disable merchant-enabled
modules for the active shop. These writes require local `rbac.manage`, are
audited, and never enter the ONLINE synchronization queue.

Only `ONLINE` mode synchronizes when connectivity returns. It uses the agreed idempotency, retry, ordering, and conflict rules. Offline changes must never silently disappear.

## Consistency requirement

Portal and mobile must have matching UI/UX workflows and design language. Platform-specific controls are acceptable, but users must experience the same concepts, navigation logic, permissions, validations, and POS outcomes.

Track paired implementation in the repository-level `PORTAL_MOBILE_PARITY.md` and follow the shared design rules in `UI_UX_PARITY.md`.

See the repository-level `BUSINESS_CONTEXT.md`, `SYSTEM_MAP.md`, `DOMAIN_FLOWS.md`, and `ARCHITECTURE.md` before changing mobile behavior.

## Application foundation

The application uses Riverpod for dependency injection and state management.
Configuration is loaded from `.env` before providers are constructed. The
`configurationProvider` is the single source of truth for the runtime mode;
`networkClientProvider` creates a denying adapter for `FULLY_OFFLINE`, so that
mode has no backend transport in its dependency graph. Providers that depend
on merchant, shop, authentication, or synchronization state will be scoped and
invalidated through Riverpod as those contexts change.

`flutter_dotenv` loads environment values, `dio` provides the ONLINE HTTP
transport, `flutter_secure_storage` stores rotating session tokens, `drift`
and `drift_flutter` provide typed SQLite migrations/transactions, `cryptography`
provides Argon2id local password hashing, and `uuid` generates canonical UUID
identifiers. `file_selector` provides native backup file selection and
`share_plus` provides platform share-sheet delivery for encrypted recovery
payloads. The transport boundary is never constructed by the fully-offline
provider graph.

Financial values must use `shared/money.dart` (or a future equivalent exact
decimal type); widgets and repositories must not convert backend money strings
to `double`.

For Android emulator development use `10.0.2.2` instead of `localhost`; for a
physical device use the development computer's LAN address or an HTTPS host.
The configured value is never rewritten by the app. `FULLY_OFFLINE` ignores
`APPLICATION_BACKEND_URL` entirely.

The current authenticated JSON backup/restore service preserves local audit
events, promotion definitions/scopes/codes, order promotion links, and
operational records while intentionally excluding credentials and
authorization assignments. JSON payloads have deterministic SHA-256 checksums,
and password-protected Argon2id/AES-GCM recovery envelopes are available. The
native SQLite file is currently plaintext; local account passwords remain
Argon2id-hashed and recovery exports remain encrypted. Web
uses Drift's browser database backend. The Settings screen provides
password-protected clipboard export/restore plus native file save/open and
platform share-sheet controls.

## Portal WebView mode

Set `APPLICATION_IS_WEBVIEW=true` and provide `APPLICATION_WEBVIEW_URL` to run
the portal inside the Android/iOS system WebView. This mode is an ONLINE portal
host and therefore must point at a reachable portal deployment; it is not the
mobile `FULLY_OFFLINE` runtime.

The WebView injects promise-based scanner and printer bridges used
automatically by the portal. Camera barcode scanning opens Flutter's native
`mobile_scanner` view, so local HTTP portal deployments do not depend on the
browser secure-context camera API. Keyboard/HID barcode scanners continue to
enter codes through the focused portal input.

On startup, the WebView automatically retries transient main-frame navigation
failures for a short bounded window. This allows a persisted portal service
worker to take control after the WebView process restarts during a temporary
outage; users are shown the retry screen only after automatic recovery is
exhausted.

Pulling downward while the portal document is already at the top shows a
pull/release indicator and reloads the current page. The native refresh bridge
suppresses duplicate reload requests until navigation finishes.

The portal renders invoice pixels and ESC/POS data, while Flutter's
`thermal_printer_flutter` implementation handles native Bluetooth permission,
discovery, connection, and printing. Android development HTTP URLs are allowed
by the current debug/release manifest; production should use HTTPS. Camera and
Bluetooth printer behavior must still be verified on representative physical
devices before release.
