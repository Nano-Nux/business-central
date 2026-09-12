# Business Central Portal

Next.js progressive web application for merchant owners and shop-assigned
staff. It provides daily dashboards, catalog and inventory operations, POS,
repairs, reports, invoices, promotions, account management, and settings.

Available features, views, and actions depend on the authenticated user's role/permissions and the merchant's enabled modules. The backend is authoritative for these decisions.

The portal and `business_central_mobile` must use the same terminology, workflows, validations, permissions, and business outcomes. Changes to one should be reviewed against the other.

The current requirement-by-requirement offline status and release blockers are
recorded in `../TEMPORARY_OFFLINE_CAPABILITY_MATRIX.md`.

Track paired implementation in the repository-level `PORTAL_MOBILE_PARITY.md` and follow the shared design rules in `UI_UX_PARITY.md`.

## Run locally

Create `.env` (or override it with `.env.local`) and point the portal at the canonical backend:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_FILE_SERVER_URL=http://localhost:8888
```

Then install, validate, and run the portal:

```powershell
npm ci
npm run lint
npm run build
npm start
```

Authentication tokens are refreshed through the backend's rotating refresh
token flow. The service worker caches the application shell and static assets,
but never caches authenticated API responses.

## Visual themes and layouts

The portal appearance is organized into two independent, modular categories:
1. **Themes (Color Palettes)** under the root-level `themes/` directory:
   - `themes/default-theme/`: High-contrast architectural monochrome palette ("Monochrome Precision").
     - `theme.css`: Core grayscale tokens, borders, and neutral badge styling.
     - `index.css`: Theme entrypoint.
   - `themes/visual-clean-theme/`: Modern, vibrant workspace palette ("Visual Clean") featuring royal sapphire brand actions, emerald revenue highlights, warm amber metrics, ruby danger alerts, amethyst categories, and pure white cards on a crisp cool-slate canvas.
     - `theme.css`: Core brand palettes, HSL tokens, and base gradients.
     - `login.css`: Branded authentication screens and login backdrop.
     - `shell.css`: Topbar navigation, active shop selectors, and status indicators.
     - `components.css`: Buttons, search inputs, badges, and modals.
     - `pos.css`: Visual accents for POS cart cards, total badges, and checkout buttons.
     - `products.css`: Catalog stock pill badges and pricing highlights.
     - `repairs.css`: Intake status tags, device diagnosis chips, and photo uploads.
     - `invoices-settings.css`: Financial summaries, invoice previews, and settings cards.
     - `index.css`: Theme entrypoint aggregating all visual modules.
2. **Layouts (Workspace Structures)** under the root-level `layouts/` directory (at the same level with `themes/`):
   - `layouts/default-layout/`: Standard balanced workspace with full-width 250px sidebar and comfortable desktop proportions.
     - `shell.css`: Standard 250px navigation drawer and spacious main content canvas.
     - `pos.css`: Standard 2-column POS register with comfortable catalog card geometry (`minmax(155px, 1fr)`).
     - `index.css`: Layout entrypoint.
   - `layouts/compact-layout/`: Space-saving 72px icon-rail navigation and dense scan-first POS catalog grid, maximizing screen real-estate for registers and smaller laptops.
     - `shell.css`: Streamlined 72px icon rail with floating tooltips and condensed header margins.
     - `pos.css`: High-density catalog grid (`minmax(130px, 1fr)`), compact cart item spacing, and sticky bottom checkout summary.
     - `index.css`: Layout entrypoint.

Available themes and layouts are imported in `app/globals.css`:

```css
/* Color Themes */
@import "../themes/default-theme/index.css";
@import "../themes/visual-clean-theme/index.css";

/* Workspace Layouts */
@import "../layouts/default-layout/index.css";
@import "../layouts/compact-layout/index.css";
```

The active theme is selected via `[data-theme="..."]` and the active layout via `[data-layout="..."]` on the root `<html>` element.

### Complete Independence
**Theme and Layout are 100% orthogonal and independent**:
- Changing your color theme preserves your active layout.
- Changing your workspace layout preserves your active color theme.
- Any theme works seamlessly with any layout.

Users can choose their preferred theme and layout in the workspace under **Settings → Theme & Layout** (`/settings/theme`), which features dedicated category tabs for **Theme (Colors)** and **Layout (Structure)** and is universally accessible to all user roles (Merchants, Managers, and Staff).

### Multi-Tier Storage & Mobile Backward Compatibility

Preferences are stored client-side under independent keys (`bc.theme` and `bc.layout`) with no backend database schema required. To guarantee robust persistence across all client environments—especially for clients running older mobile applications who do not update their mobile binary every time—storage uses a resilient multi-tier engine:

| Tier | Mechanism | Purpose / Durability |
|---|---|---|
| **Tier 1** | LocalStorage | Instant synchronous read/write (`bc.theme`, `theme`, `bc_theme` & `bc.layout`, `layout`, `bc_layout`). |
| **Tier 2** | Persistent Cookies | 1-year persistent cookie (`max-age=31536000; SameSite=Lax`) preserved by Android `CookieManager` and iOS `WKHTTPCookieStore` across WebView process kills. |
| **Tier 3** | IndexedDB Fallback | `bc_theme_fallback` database with `settings` store, providing durable disk persistence for sandboxed WebViews. |
| **Tier 4** | Memory Cache | In-memory session cache guarding against restricted WebView environments that throw `SecurityError`. |
| **Tier 5** | Native SQLite Bridge | Communicates with Flutter's `NativeStorageBridge` (`BusinessCentralStorageChannel`) with 400ms timeout safeguards. |

#### Backward Compatibility Strategy for Un-updated Mobile WebViews:
1. **Dual/Triple-Key Companion Writes**: Every theme change synchronously writes `bc.theme`, `theme`, and `bc_theme`. Every layout change writes `bc.layout`, `layout`, and `bc_layout`. Older client scripts or extensions querying legacy keys continue to find the correct value.
2. **Legacy Key & Nickname Normalization**: Reading handles legacy nicknames (`"default"`, `"monochrome"` $\rightarrow$ `default-theme`; `"clean"`, `"visual-clean"` $\rightarrow$ `visual-clean-theme`; `"compact"`, `"rail"` $\rightarrow$ `compact-layout`) and parses legacy JSON configurations (`{"theme": "...", "layout": "..."}`).
3. **Cross-Tier Auto-Healing**: When a preference is resolved from a fallback tier (e.g. cookie or legacy key), the engine automatically heals and rewrites canonical keys across all higher tiers.
4. **Seamless Upgrade Migration**: When a user on an older mobile app version eventually updates the application, `setupDelayedBridgeListener` receives the `business-central-native-storage-ready` event and automatically syncs existing preferences into native SQLite (`appMetadata` table).

## Temporary offline PWA operation

The portal remains an ONLINE, backend-authoritative client; it has no
FULLY_OFFLINE runtime. A production service worker precaches the login/offline
shell and its hashed Next.js assets. Authenticated collection reads are cached
in merchant- and membership-scoped IndexedDB records and show their saved
timestamp while disconnected. Dashboard and financial-report requests use
stable snapshot keys so rolling date query strings do not prevent recovery
after restart. The portal requests persistent browser storage when supported,
reports quota pressure, and warns when the browser grants only best-effort
storage. Every cached view displays a global saved-data indicator while it is
stale and automatically revalidates after synchronization.

Supported offline mutations use either the canonical backend sync protocol or
the portal deferred-request policy. In both cases the local projection and a
payload-hashed durable outbox operation commit together, survive browser
restart/refresh/service-worker updates, and synchronize on reconnect. Typed
operations use `/sync/handshake`, `/sync/push`, and `/sync/pull`; deferred
operations replay their exact portal API request with a stable idempotency key,
dependency ordering, local-ID remapping, retry handling, and visible
rejection/conflict states. The workspace header exposes online, offline,
reconnecting, syncing, rejected, and conflict states. Browser Background Sync
is optional; launch, reconnect, and manual foreground synchronization are
authoritative.

POS checkout has a dedicated temporary-offline policy. It atomically stores a
provisional receipt, complete line/totals/payment/inventory snapshots, and a
typed `POS_CHECKOUT` operation. Pending checkout quantities reduce available
stock on that device. Merchant CASH-category types are provisional; ONLINE
types remain pending and are never displayed as captured offline. On reconnect
the backend revalidates scope and recalculates the canonical aggregate; a
mismatch remains visible for review and a match links the provisional ID to the
canonical order.

The approved offline exceptions remain authentication, logout, registration,
password reset, user-account/role/permission management, and third-party
payment authorization. Staff/account controls stay online-only. External
payment authorization is represented as pending and is never displayed as
captured. All other mutations currently exposed by the portal—including shop
and merchant settings, catalog/pricing, deliveries, stock receipts, promotion
definitions/scopes/codes, repair catalog/tickets/status/parts/images/cash
payments, and POS checkout—persist locally first and synchronize later. They
never enter a client-wins queue: API conflicts and validation failures remain
durable and visible for review.

All direct image files follow the shop-logo rule, including product, variant,
and repair images. The portal resizes the selected file and stores it in the
scoped IndexedDB outbox while disconnected. On reconnect, the portal uploads
the file through `/media/images/upload` to the backend's SeaweedFS-backed media
service using the authenticated backend session, replaces the queued marker with the returned relative `/media/...`
path, and then synchronizes the resource update. The database never stores the
file-server hostname or port. The portal prefixes relative media paths only at
render time using `NEXT_PUBLIC_FILE_SERVER_URL`; external image URLs and data
URLs remain unchanged. In production, set that value to the stable public file
hostname, for example `https://business-central-file.nanonux.com`.
SeaweedFS service credentials belong only to the backend and must not be added
to any `NEXT_PUBLIC_*` variable.

## Bluetooth receipt printing

The printer settings page checks Web Bluetooth availability, opens the browser
device chooser, connects to a compatible BLE GATT thermal printer, and stores
the selected paper width and pixel font size in each shop's backend-persisted settings (with a
shop-scoped local copy for offline use). Invoice content is first rendered to a
monochrome bitmap and then encoded as an ESC/POS raster image.

Web Bluetooth requires a secure context (`https://`, except localhost) and a
supported Chromium browser. Browser Web Bluetooth supports BLE GATT devices;
printers that expose only Bluetooth Classic/SPP require a native bridge and
cannot be connected directly from this web application.

When the portal is hosted inside `business_central_mobile` WebView mode, the
page automatically uses the injected Flutter printer bridge instead of Web
Bluetooth. Receipt layout and ESC/POS raster generation remain portal-owned,
while device discovery, Android permission handling, connection, and byte
transport use the mobile app's `thermal_printer_flutter` integration. This also
supports compatible Bluetooth Classic printers exposed by that native library.

The embedded portal also uses the injected Flutter scanner bridge for live
camera barcode and IMEI/serial capture. That bridge opens the native
`mobile_scanner` view and therefore works when a development portal is served
from a local HTTP address. Outside the mobile WebView, browser camera scanning
still requires a secure context; keyboard/HID barcode scanners work as focused
text input in both modes.

An early UUID compatibility fallback supports older system WebViews that expose
Web Crypto without `crypto.randomUUID()`. IndexedDB-backed temporary-offline
work also remains available when a WebView omits the optional Storage Manager
quota and persistence-reporting API.
