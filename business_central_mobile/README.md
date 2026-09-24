# Business Central Mobile

Flutter offline-first container for merchant owners, managers, and staff. Following the architectural convergence, `business_central_mobile` embeds `business-central-portal` inside a hardened WebView shell backed by a native Drift SQLite database and native hardware bridges, providing 100% UI/UX and workflow parity with zero duplicate native screen implementations.

## Architecture Overview

```
+-------------------------------------------------------------+
|               business-central-portal (Next.js)              |
|        Unified UI, POS, Inventory, Settings, and Auth       |
+-------------------------------------------------------------+
                              |
                     JavaScript Bridges
                              |
    +-------------------------+-------------------------+
    |                         |                         |
[Database Channel]     [Hardware Bridges]      [Storage Bridge]
window.BusinessCentral- Native Printer, Scanner,  Theme & Layout
NativeDatabase          File Selector           Persistence
    |                         |                         |
+-------------------------+-------------------------+
|                  business_central_mobile                    |
|                                                             |
|  - Drift SQLite (app.db): Offline schema, atomic checkout, |
|    audit events, canonical records, metadata                |
|  - Native thermal printing (ESC/POS over Bluetooth)         |
|  - Native camera barcode scanner (mobile_scanner)           |
|  - Embedded shelf HTTP loopback server (OTA portal bundle)  |
|  - Silent License Validator & Remote Lockdown Heartbeat     |
|  - Cloud Disaster Recovery (Argon2id/AES-GCM Encrypted)     |
+-------------------------------------------------------------+
```

## Runtime Operation & Storage Bridge

The mobile container operates offline-first using local SQLite (`AppDatabase` / `app.db`):

- **Option A JavaScript Bridge (`BusinessCentralDatabaseChannel`)**:
  The embedded portal accesses local Drift SQLite directly via `window.BusinessCentralNativeDatabase`:
  - `saveSettings` / `getSettings`: Stored in `AppMetadata`.
  - `saveProduct` / `getProduct`: Full catalog syncing into `CachedCatalogProducts` and `CachedCatalogVariants`.
  - `saveCustomer` / `getCustomer`: Canonical customer records in `LocalCanonicalRecords`.
  - `atomicCheckout`: High-integrity offline transaction that creates local order, line items, and deducts variant stock in SQLite atomically.
  - `query` / `execute`: Raw parameterized SQL execution for extensions and custom views.

- **Native Storage Bridge (`BusinessCentralStorageChannel`)**:
  Exposes `window.BusinessCentralNativeStorage` for seamless theme and layout preference persistence into `AppMetadata`:
  - `bc.theme` $\leftrightarrow$ `theme` companion synchronization.
  - `bc.layout` $\leftrightarrow$ `layout` companion synchronization.

- **Unified Flow (No Separate Staff PINs)**:
  Mobile shares the identical auth, role, and operational flows with `business-central-portal`. No separate staff PIN screens or competing native domain models exist.

## Hardware & Peripheral Bridges

- **Thermal Printing (`BusinessCentralPrinterChannel`)**:
  Injected as `window.BusinessCentralNativePrinter`. Relies on `thermal_printer_flutter` for native Bluetooth discovery, connection, and raw ESC/POS byte printing.
- **Barcode Scanning (`BusinessCentralScannerChannel`)**:
  Injected as `window.BusinessCentralNativeScanner`. Launches native camera scanning via `mobile_scanner`, avoiding browser secure-context camera limitations on local HTTP origins.
- **Native File Selector (`BusinessCentralFileSelectorChannel`)**:
  Injected as `window.BusinessCentralNativeFileSelector` for native file picking and export dialogs.

## The 3 Internet-Only Touchpoints

While daily checkout, inventory, and operations run fully offline without any backend connection, mobile retains three strictly defined internet touchpoints:

1. **Silent License Validator & Heartbeat**:
   Periodically pings `GET /api/v1/merchants/me/status` when network is available. If the platform administrator marks the merchant as `SUSPENDED` (or backend returns `401 Unauthorized`), mobile instantly triggers a full-screen lockdown modal to enforce license compliance.
2. **OTA Portal Bundle Manager & Embedded Server**:
   Checks `GET /api/v1/portal-bundle/version` for portal static web app updates. Downloads and verifies bundle tarballs, serving them locally offline via an embedded shelf HTTP server on `127.0.0.1:<port>`.
3. **Cloud Disaster Recovery Backup**:
   Generates deterministic, password-protected Argon2id/AES-GCM encrypted database backups (`LocalEncryptedBackupService`). Uploads backups to `POST /api/v1/merchants/:id/backups` and restores via `GET /api/v1/merchants/:id/backups/latest` for seamless device replacement and disaster recovery.

## Testing & Quality

Run analyzer and unit tests:

```bash
flutter analyze
flutter test
```

All 58 tests verify:
- Native Database Bridge schema mutations & atomic transactions.
- Native Storage Bridge companion keys and persistence.
- Hardware bridges (printer, scanner, file picker).
- Silent license lockdown & unlock transitions.
- Embedded shelf HTTP static bundle serving and version detection.
- Argon2id/AES-GCM encrypted backup round-trips.
- WebView navigation policies, internal origin confinement, and retry mechanisms.
