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

1. **Themes (Color Palettes & Custom Brand Engine)** under the root-level `themes/` directory:
   - **Full 12-Hue Chromatic Spectrum Presets**:
     - `themes/ruby-crimson-theme/` ($0^\circ$ Red): Bold scarlet red actions (`#dc2626`), velvet rose tint (`#fef2f2`), luxury jewelry & automotive.
     - `themes/sunset-coral-theme/` ($20^\circ$ Coral): Warm sunset coral actions (`#ea580c`), radiant golden honey metrics, and warm peach canvas (`#fff9f5`).
     - `themes/amber-honey-theme/` ($40^\circ$ Amber): Warm golden amber honey (`#d97706`), toasted biscuit canvas (`#fffdf7`), bakeries & artisanal craft.
     - `themes/citrus-gold-theme/` ($55^\circ$ Gold): Radiant Tuscan gold highlights (`#ca8a04`), champagne warmth, cheerful energetic boutiques.
     - `themes/lime-zest-theme/` ($80^\circ$ Lime): Electric lime and matcha green actions (`#65a30d`), fresh organic canvas (`#fbfef5`), wellness & grocers.
     - `themes/nordic-calm-theme/` ($130^\circ$ Sage): Scandinavian sage green (`#2d6a4f`), warm terracotta accents (`#c2410c`), warm linen cream (`#fbf9f5`).
     - `themes/emerald-luxe-theme/` ($150^\circ$ Pine): Deep botanical pine (`#064e3b`), emerald accents (`#059669`), champagne gold, luxury ivory (`#f4faf6`).
     - `themes/ocean-teal-theme/` ($175^\circ$ Teal): Coastal marine teal (`#0d9488`), seafoam mint, cool azure, glacier-cyan canvas (`#f0fdfa`).
     - `themes/glacier-cyan-theme/` ($195^\circ$ Cyan): Arctic electric cyan actions (`#0284c7`), cool azure highlights, icy glacier canvas (`#f0f9ff`).
     - `themes/visual-clean-theme/` ($220^\circ$ Sapphire): Royal sapphire actions (`#2563eb`), emerald revenue (`#059669`), warm amber, cool-slate canvas (`#f4f6fb`).
     - `themes/royal-indigo-theme/` ($245^\circ$ Indigo): Deep galactic indigo (`#4f46e5`), ultramarine highlights, corporate SaaS & legal establishments.
     - `themes/amethyst-purple-theme/` ($275^\circ$ Violet): Regal velvet purple (`#7c3aed`), lavender accents, beauty, cosmetics, luxury fashion.
     - `themes/fuchsia-rose-theme/` ($330^\circ$ Magenta): Vibrant fuchsia rose (`#db2777`), magenta blossom, florists, salons, and lifestyle boutiques.
   - **Artisanal, Earthy & Botanical Specialties**:
     - `themes/copper-patina-theme/`: Burnished metallic copper (`#c2410c`) and oxidized verdigris seafoam (`#14b8a6`) with weathered stone canvas (`#f8faf7`).
     - `themes/lavender-dusk-theme/`: Gentle Provençal lilac (`#8b5cf6`), misty violet shadows (`#a78bfa`), and evening twilight canvas (`#faf8ff`).
     - `themes/clay-terracotta-theme/`: Tuscan baked earthenware terracotta (`#9a3412`), adobe clay tones (`#c2410c`), and warm travertine canvas (`#faf6f0`).
     - `themes/matcha-pistachio-theme/`: Ceremonial matcha green (`#3f6212`), pistachio milk highlights (`#65a30d`), and herbal silk paper canvas (`#f7faf2`).
     - `themes/sandstone-dune-theme/`: Desert sandstone and camel dune brass (`#854d0e`), warm adobe canvas, and wind-swept golden metrics (`#ca8a04`).
     - `themes/plum-wine-theme/`: Rich Bordeaux wine (`#831843`), velvety cassis (`#9d174d`), and rose quartz parchment canvas (`#fdf4f7`).
     - `themes/slate-steel-theme/`: Battleship slate (`#1e293b`), cold steel (`#475569`), brushed nickel (`#cbd5e1`), and industrial precision canvas (`#f8fafc`).
     - `themes/neo-mint-theme/`: Bio-tech neo-mint (`#10b981`), clinical eucalyptus (`#059669`), deep botanical pine (`#064e3b`), and fresh mint wash canvas (`#f0fdf4`).
   - **Dark, Night & Celestial Modes**:
     - `themes/midnight-dark-theme/`: Deep obsidian slate canvas (`#090d16`), dark cards (`#131926`), electric cyan (`#38bdf8`), luminous mint (`#34d399`).
     - `themes/synthwave-neon-theme/`: Retro-futuristic cyberpunk violet (`#0c0a17`), glowing amethyst/magenta gradient, fluorescent cyan (`#06b6d4`).
     - `themes/espresso-dark-theme/`: Zero-blue-light coffee lounge: roasted espresso (`#14100e`), walnut cards (`#1e1814`), warm honey amber (`#f59e0b`).
     - `themes/aurora-borealis-theme/`: Arctic dark polar night canvas (`#031417`), glowing aurora emerald ribbons (`#10b981`), celestial cyan (`#06b6d4`), and polar frost (`#a7f3d0`).
     - `themes/charcoal-gold-theme/`: Ultra-luxurious black-tie matte charcoal obsidian canvas (`#09090b`), 24K bullion gold accents (`#eab308`), and champagne gilded highlights (`#fef08a`).
   - **Monochrome & High-Contrast**:
     - `themes/default-theme/`: High-contrast architectural monochrome palette ("Monochrome Precision").
     - `themes/high-contrast-theme/`: Ultra-accessible WCAG 2.1 AAA high-contrast theme with stark 2px solid jet-black borders, deep 100% black ink (`#000000`), and high-visibility gold focus rings (`#facc15`).
   - **Merchant-Scoped 5-Color Custom Themes & Brand Studio**:
     - Custom themes created by a merchant or manager are persisted in PostgreSQL via backend REST APIs (`/api/v1/custom-themes`) with strict Row Level Security (RLS) scoped by `merchant_id`.
     - Every member in the merchant's organization (merchant owners, managers, and staff) has read access to view, preview, and activate any of the merchant's custom themes across their workspace sessions.
     - Enforces the strict **5-Color Setup**: Primary Brand, Secondary / Hover, Accent Tone, Border & Divider, and Canvas Surface.
     - Includes the 5-Color Brand Studio with real-time interactive preview, quick spectrum presets, and one-click auto-harmonization from any primary color.

> **5-Color Palette Guarantee**: Every single theme in Business Central has a standardized 5-color palette setup (`previewColors` array or explicit 5-color tokens: Primary, Secondary, Accent, Border, Canvas) representing its primary brand, secondary/hover tone, dark ink/contrast foundation, border/line token, and surface/canvas background.

2. **Layouts (Workspace Structures & Densities)** under the root-level `layouts/` directory (at the same level with `themes/`):
   > Layouts represent structural density, navigation ergonomics, and workspace geometry. They are **not** divided into "desktop vs mobile". Instead, **every layout is fully responsive across Desktop ($\ge 1025\text{px}$), Tablet ($641\text{px} - 1024\text{px}$), and Mobile ($\le 640\text{px}$)**:
   - `layouts/default-layout/`: Standard balanced workspace with spacious density across all viewports.
     - `shell.css`: 250px full sidebar on Desktop; smooth off-canvas drawer on Tablet and Mobile (`transform: translateX(-105%)`).
     - `pos.css`: 2-column balanced register grid on Desktop (`minmax(0, 1fr) 410px`) and Tablet (`minmax(0, 1fr) 340px`); clean stacked catalog and fluid mobile cart on Mobile.
     - `index.css`: Layout entrypoint.    - `layouts/compact-layout/`: Streamlined, high-density workspace maximizing data visibility across all viewports.
      - `shell.css`: 72px icon rail on Desktop; compact 240px drawer on Tablet; high-density 80vw drawer and condensed header on Mobile.
      - `pos.css`: High-density 2-column register on Desktop and Tablet (`minmax(0, 1fr) 310px`); scan-first dense catalog grid (`repeat(auto-fill, minmax(110px, 1fr))`) and compact mobile cart bar on Mobile.
      - `index.css`: Layout entrypoint.
    - `layouts/modern-executive-layout/`: Ultra-premium floating island architecture with glassmorphic command deck, elevated capsule navigation, spatial card depth, and ergonomic high-yield registers ("Million Dollar UI").
      - `shell.css`: Floating island sidebar (`border-radius: 20px`, glassmorphic blur) on Desktop; floating glass topbar; elevated capsule navigation; responsive off-canvas drawer on Tablet and Mobile.
      - `pos.css`: Ergonomic split-canvas register with tactile product tiles (`border-radius: 16px`), pill price chips, round steppers, and sticky glassmorphic checkout terminal.
      - `pages.css`: Comprehensive high-end styling across Dashboard KPI cards, Products & Catalog tables, Repairs Kanban columns & job cards, Invoices rows, and Settings tabs.
      - `index.css`: Layout entrypoint.

Available themes and layouts are imported in `app/globals.css`:

```css
/* Color Themes */
@import "../themes/default-theme/index.css";
@import "../themes/visual-clean-theme/index.css";
@import "../themes/nordic-calm-theme/index.css";
@import "../themes/emerald-luxe-theme/index.css";
@import "../themes/sunset-coral-theme/index.css";
@import "../themes/ocean-teal-theme/index.css";
@import "../themes/midnight-dark-theme/index.css";
@import "../themes/synthwave-neon-theme/index.css";
@import "../themes/espresso-dark-theme/index.css";
@import "../themes/high-contrast-theme/index.css";
@import "../themes/ruby-crimson-theme/index.css";
@import "../themes/amber-honey-theme/index.css";
@import "../themes/citrus-gold-theme/index.css";
@import "../themes/lime-zest-theme/index.css";
@import "../themes/glacier-cyan-theme/index.css";
@import "../themes/royal-indigo-theme/index.css";
@import "../themes/amethyst-purple-theme/index.css";
@import "../themes/fuchsia-rose-theme/index.css";
@import "../themes/copper-patina-theme/index.css";
@import "../themes/lavender-dusk-theme/index.css";
@import "../themes/clay-terracotta-theme/index.css";
@import "../themes/matcha-pistachio-theme/index.css";
@import "../themes/sandstone-dune-theme/index.css";
@import "../themes/plum-wine-theme/index.css";
@import "../themes/slate-steel-theme/index.css";
@import "../themes/aurora-borealis-theme/index.css";
@import "../themes/charcoal-gold-theme/index.css";
@import "../themes/neo-mint-theme/index.css";
@import "../themes/custom-color-theme/index.css";

/* Workspace Layouts */
@import "../layouts/default-layout/index.css";
@import "../layouts/compact-layout/index.css";
@import "../layouts/modern-executive-layout/index.css";
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

| Tier       | Mechanism            | Purpose / Durability                                                                                                                                       |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tier 1** | LocalStorage         | Instant synchronous read/write (`bc.theme`, `theme`, `bc_theme` & `bc.layout`, `layout`, `bc_layout`).                                                     |
| **Tier 2** | Persistent Cookies   | 1-year persistent cookie (`max-age=31536000; SameSite=Lax`) preserved by Android `CookieManager` and iOS `WKHTTPCookieStore` across WebView process kills. |
| **Tier 3** | IndexedDB Fallback   | `bc_theme_fallback` database with `settings` store, providing durable disk persistence for sandboxed WebViews.                                             |
| **Tier 4** | Memory Cache         | In-memory session cache guarding against restricted WebView environments that throw `SecurityError`.                                                       |
| **Tier 5** | Native SQLite Bridge | Communicates with Flutter's `NativeStorageBridge` (`BusinessCentralStorageChannel`) with 400ms timeout safeguards.                                         |

#### Backward Compatibility Strategy for Un-updated Mobile WebViews:

1. **Dual/Triple-Key Companion Writes**: Every theme change synchronously writes `bc.theme`, `theme`, and `bc_theme`. Every layout change writes `bc.layout`, `layout`, and `bc_layout`. Older client scripts or extensions querying legacy keys continue to find the correct value.
2. **Legacy Key & Nickname Normalization**: Reading handles legacy nicknames (`"default"`, `"monochrome"` $\rightarrow$ `default-theme`; `"clean"`, `"visual-clean"` $\rightarrow$ `visual-clean-theme`; `"compact"`, `"rail"` $\rightarrow$ `compact-layout`; `"modern"`, `"executive"`, `"million"`, `"deluxe"` $\rightarrow$ `modern-executive-layout`) and parses legacy JSON configurations (`{"theme": "...", "layout": "..."}`).
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
