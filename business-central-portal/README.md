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

## Visual theme

The portal palette is controlled from `app/theme.css`. Change the foundational
`--theme-*` values in that file to recolor every screen; page and component
styles consume those shared tokens rather than defining their own colors.

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
