# Changelog

This is the chronological record of meaningful repository and feature changes. Use project-level `IMPLEMENTATION_STATUS.md` for current state and this file for history.

## 2026-09-23

- `business_central_mobile` and `business-central-portal` Full Integration & Bridge Hardening (`business_central_mobile`, `business-central-portal`):
  - **Bridge Script Injection & Chaining**: Hardened bridge script injection across all 5 JavaScript channels (`BusinessCentralDatabaseChannel`, `BusinessCentralStorageChannel`, `BusinessCentralPrinterChannel`, `BusinessCentralScannerChannel`, `BusinessCentralRefreshChannel`, `NativeFileSelectorBridge`). Bridge scripts are injected on both `onPageStarted` and `onPageFinished` to eliminate early React 19 hydration race conditions. Added resolver chaining (`prevResolver`) and defensive `typeof` checks to ensure callback resolvers are never overwritten or dropped.
  - **Database Bridge Parity**:
    - Fixed SQLite unique constraint error during offline customer update in `NativeDatabaseBridge`: customer updates now check for existing `LocalCanonicalRecords` by `(merchant_id, 'customer', entity_id)` to preserve the existing record UUID and creation timestamp upon upsert.
    - Resolved POS inventory movement key collisions on multi-line checkouts with identical variants: switched eventKey from `pos_sale_${orderId}_${variantId}` to `pos_sale_${orderId}_${lineId}` so multiple lines for the same SKU/variant receive distinct inventory deductions.
    - Supported `provisional_id` fallback when `id` is not pre-assigned on POS order checkout.
    - Added variant barcode and SKU searching to `getProducts` so hardware scanners and SKU lookups locate items directly from the SQLite catalog.
    - Added `deleteProduct` and `getOrder` operations across both Dart `NativeDatabaseBridge` and TypeScript `nativeDb`.
    - Harmonized theme and layout persistence with bidirectional companion key synchronization (`bc.theme` $\leftrightarrow$ `theme`, `bc.layout` $\leftrightarrow$ `layout`).
  - **Auth & Silent License Validator Linkage**: Synchronized `bc.access_token` and `bc.merchant_id` to `nativeStorageBridge()` upon login/session hydration in `auth.tsx`, linking portal credentials directly to the mobile background `SilentLicenseValidator` without duplicate auth prompts.
  - **Asset Serving & Navigation**: Added MIME type mappings (`.webp`, `.woff`, `.woff2`, `.ttf`, `.wasm`) to the embedded static HTTP server in `PortalBundleManager`. Allowed `about:` URL schemes in `WebViewNavigationPolicy`. Added automatic fallback to `.env.example` when `.env` is absent.
  - **Verification & Testing**: Added 7 comprehensive test cases in `native_database_bridge_test.dart` and 2 in `native-database.test.ts`. Passed 100% of all 63 Dart tests, 100% of all 171 portal tests, `flutter analyze` (0 issues), `npx tsc --noEmit` (0 errors), `dart format` (clean), and `prettier --check` (clean).

- Stock History Staff Detail Guard & Transaction History Stock Removal in `business-central-backend` and `business-central-portal` (`repository.go`, `components/operations-pages.tsx`, `components/history-detail-page.tsx`, `components/transaction-history-page.tsx`, `themes/default-theme/components.css`):
  - Hid "Detail button" in Stock History (`/stock-movements`) for staff accounts: table now shows only immutable reference codes to staff, while merchant administrators see the modern `.history-detail-btn` pill button with eye icon. Added access restriction guard in `MovementDetailPage` preventing staff from viewing wholesale FIFO cost allocations and ledger breakdowns.
  - Completely removed all stock movement rows (both stock-in receipts and stock-out sale movements) from Transaction History (`/transaction-history` and backend `transactionHistoryBase` query): all inventory movements are now exclusively segregated into Stock History (`/stock-movements`). Transaction History is focused purely on canonical customer transactions (`TRANSACTION` sales orders, `REFUND` customer returns, and `REPAIR_CHECKOUT` service payments).
  - Replaced the previous "Stock events" stat card with a dedicated "Refunds" stat card tracking customer returns, and removed `STOCK_IN`/`STOCK_OUT` from the event filter dropdown.
  - Fixed customer column fallback bug in `transaction-history-page.tsx`: walk-in orders with unrecorded phone numbers now fall back to `"No phone recorded"` instead of mistakenly printing the order description string into both the customer and product columns.
  - Redesigned "View detail" action from a generic text link into a distinct, modern pill button (`.history-detail-btn`) with an eye icon (`<Icon name="eye" size={13} />`), subtle border, soft surface tint, and smooth hover elevation with brand border/color transition.

- Reports & Financial Children Pages in `business-central-portal` (`components/reports-page.tsx`, `components/transaction-history-page.tsx`, `components/history-detail-page.tsx`, `themes/default-theme/components.css`, `themes/default-theme/refinements.css`, `themes/default-theme/responsive.css`):
  - Made the main `/reports` page and all its sub-views/tabs (*Overview*, *Per day / Daily Summary*, *Per week / Weekly Summary*, *Per month / Monthly Summary*), plus linked children (*Transaction history* `/transaction-history`, *Transaction detail* `/transaction-history/[id]`, and *Stock movement detail* `/stock-movements/[id]`) fully mobile responsive across all viewport sizes (iPhone 375px/390px, narrow 320px, tablet 768px).
  - Fixed 1027px viewport blowout bug in Sales Analysis chart when viewing multi-day ranges (30/90 days): wrapped `.report-chart` in a fluid horizontally scrollable container with `min-width: 0`, `max-width: 100%`, and set `min-width: 32px` per `.report-bar` with touch panning and subtle scrollbar.
  - Implemented smooth, touch-friendly horizontal scrolling on `.report-tabs` with hidden scrollbar and `flex-shrink: 0` pill buttons, eliminating tab truncation on mobile.
  - Redesigned `.report-summary-metrics` on mobile into a clean, adaptive 3-column chip grid (collapsing to single column on narrow <=360px screens) with distinct white cards, subtle borders, and truncation safeguards.
  - Enhanced `.report-table` with sticky first columns (pinned period label with background and subtle elevation shadow), allowing effortless left-to-right swiping across all financial metrics (Transactions, Revenue, COGS, Gross profit, Average order) without losing date context.
  - Added responsive grid and full-width stacking for `history-toolbar` search and filter selects, eliminating orphaned or misaligned dropdowns.
  - Formatted `.transaction-financial-grid` into a compact 2x2 grid on mobile viewports down to 340px, saving vertical space while preserving readability.
  - Added sticky first column support for `.history-table` and `.transaction-detail-table`.
  - Audited with automated multi-viewport Playwright script across 375px, 320px, and 768px viewports with zero horizontal overflow blowout detected (`scrollWidth === window.innerWidth`).
  - Passed all 169 Vitest unit tests, `tsc --noEmit`, and ESLint.
- Catalog Main Hub in `business-central-portal` (`app/(workspace)/catalog/page.tsx`, `themes/default-theme/products.css`):
  - Elevated the primary "Products" card to span the full row (`grid-column: 1 / -1`) at the top of `.catalog-grid` for clear visual prominence over secondary taxonomy and pricing modules (*Categories*, *Brands*, *Units*, *Unit conversions*, *Pricing*).
  - Styled "Products" with a distinct, rich Royal Blue to Electric Azure gradient (`#1e40af` to `#2563eb` to `#0284c7`), frosted glass icon container, high-contrast typography, `PRIMARY CATALOG` badge, and interactive `Open products →` action button.
  - Added responsive adaptations for mobile viewports (`@media (max-width: 640px)`) with circular chevron control.
  - Added multi-language translations (`products_title`, `primary_catalog`, `open_products`, and context-aware descriptions) in English, Thai, and Burmese (`en.ts`, `th.ts`, `my.ts`).
- Repair Main Hub in `business-central-portal` (`components/repair-hub-page.tsx`, `themes/default-theme/repairs.css`):
  - Made the primary "Repair desk" card span the full row (`grid-column: 1 / -1`) across `.settings-grid` for clear visual prominence over secondary modules.
  - Styled "Repair desk" with a distinct, rich emerald-teal gradient (`#059669` to `#0d9488` to `#047857`), frosted glass icon container, crisp high-contrast typography, `PRIMARY DESK` badge, and interactive `Open desk →` action button.
  - Added responsive adaptations for mobile viewports (`@media (max-width: 640px)`) with comfortable text breathing room and circular icon action button.
  - Added multi-language translations (`primary_desk`, `open_desk`) in English, Thai, and Burmese (`en.ts`, `th.ts`, `my.ts`).

## 2026-09-22

- Added per-merchant AI usage limits and query tracking (`ai_usage_limit`, default `50`, and `ai_usage_count`) across canonical schema and versioned migration `0047_ai_merchant_usage_limit.sql`.
- Backend enforcement:
  - Added atomic quota check in `internal/ai/application/service.go` returning HTTP 403 `AI_USAGE_LIMIT_EXCEEDED` when `ai_usage_count >= ai_usage_limit`.
  - Added `GET /api/v1/ai/usage` endpoint for merchant clients to inspect quota status.
  - Added usage count increment on successful AI responses.
  - Sanitized `updateCurrentMerchant` in `internal/auth/adapters/inbound/http/handler.go` to prevent tenant users from altering their own limit or count.
- Admin app (`business-central-admin`):
  - Added AI Usage badge (`AI Usage: <count>/<limit>`) and "Edit Limit" action to merchants directory (`/merchants`).
  - Added modal dialog for platform administrators to adjust merchant limit and optionally reset usage count.
- Portal app (`business-central-portal`):
  - Added AI usage indicators to AI Assistant workspace (`/ai-assistant`), displaying query meter in header and sidebar.
  - Disabled chat input, voice recording, and send buttons with clear guidance when merchant quota is reached.
- In POS-mini mode, removed the `code` input field from the repair service creation modal in `business-central-portal` (`components/repair-catalog-page.tsx`) and updated offline repair catalog types.
- Made `code` optional in `business-central-backend`:
  - Dropped `NOT NULL` constraint on `service_catalog.code` via migration `0048_optional_service_catalog_code.sql` and updated `schema.sql`.
  - Updated `ServiceDefinitionRequest.Code` to optional `*string` and removed `code` requirement in `CreateServiceCatalog` and `UpdateServiceCatalog`.
  - Updated queries in `repository.go` (`ListServiceCatalog`, `CreateServiceCatalog`, `UpdateServiceCatalog`, `resolveRepairServiceItems`) with `COALESCE(code, '')` to handle null codes safely.
- Refactored repair ticket creation modal form UI in `business-central-portal` (`components/repairs-page.tsx`, `themes/default-theme/products.css`):
  - POS-Mini (`Fast Intake`): Single-screen streamlined intake for primary contact, device, and pricing with expandable advanced options drawer, plus multi-device intake support (`+ Add another device to this ticket`) with dynamic price aggregation.
  - POS-Simple (`Standard Intake`): Structured 3-card layout separating Customer & Device, Services & Parts, and Payment & Pricing.
  - POS-Complex (`Enterprise Depot`): Multi-device ticket builder with section navigation pills (`1. Customer & Devices`, `2. Services & Parts`, `3. Payment & Total`), searchable inventory parts picker, and itemized billing breakdown.
- Implemented full mobile responsiveness across all repair ticket CRUD UI touchpoints:
  - Create modal: Full-width sheet on mobile (`100vw`, 0 horizontal overflow blowout), sticky footer action buttons, safe-area inset padding, and horizontally scrollable step tabs.
  - Read (Desk / Hub): Adaptive summary metric cards, fluid search & filter toolbar, touch-friendly `.repair-row-actions` buttons, and horizontal table container.
  - Read (Ticket Details Drawer): Stacked customer & financials header, 2-column mobile status grid, and responsive subforms (diagnostics, parts, warranties, payments).
  - Update (`/repairs/[id]/edit`): Single-column mobile stacking, responsive financial metrics grid, and sticky bottom save bar.
  - Sub-modals: Full-width responsive dialogs for "Record final payment", "Use stock part", and thermal invoice print preview.
- Validation: Ran Playwright multi-device repair E2E test (passed), mobile responsive E2E test across all CRUD actions on iPhone 13 viewport (`375x812`, 0 blowout, passed), TypeScript type check (`npx tsc --noEmit`, passed), ESLint (passed), and portal unit tests (39 test files, 169 unit tests passed).
- Validation: Ran `go test ./...` in `business-central-backend` (all passed), `npx tsc --noEmit` and `npm test` in `business-central-portal` (all passed).

## 2026-09-19

- Added `business_central_pricing_model` to `merchants` table across schema and versioned migration `0043_business_central_pricing_model.sql`.
- Supported 4 pricing models: `Starter` (default), `Growth`, `Professional`, and `Enterprise`.
- Integrated pricing model assignment into platform-admin merchant provisioning (`POST /api/v1/admin/merchants` and `POST /api/v1/admin/merchant-users`), merchant updates (`PATCH /api/v1/admin/merchants/{id}`), and merchant reads (`GET /api/v1/admin/merchants` and `GET /api/v1/merchant`).
- Added pricing model selection UI to platform-admin merchant user creation and edit modal in `business-central-admin`, and displayed pricing model in the merchants directory.
- Added "Nanonux Ai Assistant" (AI name: "Nanonux AI") for natural language and voice-driven business intelligence and merchant database querying.
  - Implemented Gemini tool calling (`gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`) and response humanizer (`gemma-4-31b`, fallback `gemma-4-27b`) with read-only SQL validation and semantic HTML output.
  - Added user-scoped conversation tracking (`ai_conversations`, `ai_messages`) preventing cross-user history sharing.
  - Added platform admin toggle (`ai_assistant_enabled` on `merchants`, migration `0044_ai_assistant.sql`) and merchant-level staff permission toggle (`ai.chat`, default off).
  - Built full-featured interactive chat workspace in `business-central-portal` (`/ai-assistant`) with voice speech recognition, MediaRecorder transcription, conversation history, and rich HTML tables.

## 2026-08-08

- Backend/portal temporary offline: added typed provisional POS checkout with
  durable complete snapshots, device-local stock reservation, canonical cash
  reconciliation, explicit external-payment authorization limits, audit, and
  ordered change publication.
- Synchronization: added shop-scoped ordered changes, explicit change type,
  persisted pull checkpoints, authorization-change quarantine, and migrations
  `0020`/`0021` to the runtime migration registry.
- Direct writes: shop settings, deliveries, product metadata, repair
  diagnostics, and POS orders publish ordered changes in their transaction.
- PWA validation: expanded shell precaching and added production Playwright
  install/upgrade/offline-launch/mutation/restart/stock-reservation tests.
- Status: the all-workflow objective remains partial; missing policies are
  itemized in `TEMPORARY_OFFLINE_CAPABILITY_MATRIX.md`.

## 2026-08-04

- Added repository-wide business, architecture, workflow, environment, security, module, testing, API, authorization, database, offline-sync, and UI/UX documentation.
- Added project feature inventories and implementation status records.
- Connected repairs to specialized service orders and canonical `SERVICE` orders in the database design.
- Documented the canonical payment relationship: repair → service order → order → payments/refunds.

## Entry format

```text
## YYYY-MM-DD
- Project/feature: change
- Validation: commands or tests
- Follow-up: known limitation or next step
```
