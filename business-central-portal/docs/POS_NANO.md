# POS Nano

`NANO` is the default POS mode for new merchants created by the admin application
or either backend merchant provisioning endpoint. Migration `0053_pos_nano_mode`
changes the database default and allowed values without rewriting existing
merchant modes. Mini, Simple and Complex remain selectable in Admin → Users.
All users in a merchant share its POS mode.

Nano provides these core sidebar entries, subject to existing permissions:

1. POS
2. Products & storage (`/products-and-storage`)
3. Promotions (merchant only)
4. Transaction history
5. Reports (merchant only, `tenant.read`)
6. Customers & deliveries (`/customers-and-deliveries`)
7. Staff accounts (`/staff-accounts`, merchant only, `membership.manage`)
8. Settings

Invoices open through Transaction History > Actions > View invoice, using the
existing detail popup, download and printing workflow. Transaction History
remains available as a configured landing page for users with `tenant.read`.
Reports retains the existing Financial Reports workflow and selected-shop scope.
Merchants with `tenant.read` can open `/reports` directly, from the sidebar, or
as a configured landing page. Staff retain the existing merchant-only restriction.

Enabled shop services retain their pages. Repair, its catalog and its presets
remain available when the selected shop enables `repair`. Nano uses standard
repair intake and retains all existing repair data and state transitions.
Nanonux AI and Automations appear under AI only when Admin enables the merchant
AI setting (`ai_assistant_enabled`), with existing role and permission filtering.
Disabled AI/automation links (including subpages) redirect to an available core
page. The legacy guide is omitted; dashboard links redirect to Reports for
merchants with read access or an available core page for staff. Shop selection honors
an accessible configured Nano landing page, otherwise choosing the first
available core page (normally POS).

## Products and stock

Products & storage uses one responsive table for product management and stock,
with one row per selling variant. Search/barcode scanning, status/type filters
and product pagination share that table. It shows classification, unit, stock,
RETAIL price, original cost, profit, status and dates alongside edit, delete,
pack-size and Adjust stock actions in a three-dot menu on each row. The menu
supports keyboard navigation and closes after selection, outside click or Escape. Stock and valuation come from Storage;
variant IDs associate rows with products, including duplicate product names.
Products without variants remain visible for editing and pack setup. Collection
reads include all backend pages; failures show a stock error rather than zero.
Staff retain the existing read-only Storage table. Owners can create/edit products and increase/reduce
stock. Staff see the read-only storage workflow, without product creation,
original cost, or profit. Backend authorization remains authoritative.

Nano creates the same managed standard variant as Mini, with the default Pcs
unit and RETAIL price list. New Product and Edit Product group the name,
barcode and category under Product details and prices under Pricing. Category
selection uses a compact dropdown; Add a category expands inline creation.
Photo, brand, dates and description stay under an expandable More details
section. Under Brand, Add a brand expands a name-only form using the existing
merchant-scoped brand creation endpoint. The new active brand is automatically
selected without submitting or clearing the product form. Failed creation shows
an error and keeps the entered brand name available for retry. Active status
remains visible. Embedded mobile shares these controls.

Edit Product loads each selling variant's current RETAIL price directly from
the canonical price list and saves changed amounts through `/pricing/prices`,
including explicit pack variants created in other modes. Unchanged prices are
preserved. The Pack sizes action opens Sellable options in Nano, Mini and Simple; Complex
retains Variants. Add sellable option creates another canonical variant of the
same product. Stock conversion then sets the larger-pack/smaller-unit ratio;
see [Stock conversion](STOCK_CONVERSION.md). The dialog links to conversion
with the product preselected. Nano omits Manage prices; other modes retain it. Original cost editing remains available for the managed standard variant.

Optional opening stock is available during creation; normal stock changes use
the row's Adjust stock action. The single dialog offers Add stock and Remove
stock; additions use receipts with optional original cost, while removals
require a reason and use audited reductions. Opening-stock retries stay in the product
form after a partial receipt failure. Nano hides stock-location selectors and
uses the current shop's active location, preferring SHOP then location ID,
matching canonical POS ordering. It never falls back to another shop; missing
locations prevent stock submission. Other POS modes retain location selection.
A positive opening quantity requires an original price
before creation. The product and its variant are committed through the catalog
API; stock is then recorded through the canonical stock receipt API/outbox.
These are separate operations: a receipt failure preserves the product and
keeps the form open for retry. The retry edits the saved product and reuses the
receipt event key while its payload is unchanged. Locally recorded stock is
shown as pending backend validation through the shared synchronization UI.
Receipts and reductions never overwrite an inventory balance directly.

Like the existing simplified product forms, Nano product creation/editing
requires a backend connection. Existing Storage offline receipt/reduction
behavior is reused. Mode changes retain variants, prices, balances, stock
history and pack rules, including products created in Complex mode.

## Customers and deliveries

The combined entry opens Customers. A responsive top navigation switches
between Customers and Deliveries using their existing routes; the Deliveries
tab requires `tenant.write`. Existing customer details, delivery options and
POS selection remain unchanged.

## Mobile and validation

The embedded mobile portal shares these pages. Native Flutter screen parity
is pending and recorded in `PORTAL_MOBILE_PARITY.md`; this change adds no native
network calls or SQLite schema changes. FULLY_OFFLINE behavior is unchanged.

`lib/navigation.test.ts` verifies core pages, permissions, service availability
and landing options. `e2e/nano.spec.ts` covers desktop/mobile product creation,
optional categories, opening stock, stock reductions, receipt retry identity,
customer/delivery navigation, staff controls and AI redirects. Reports acceptance
covers direct links and sidebar navigation at desktop/mobile widths and the
existing staff restriction. Backend domain
tests validate all four modes and the new default. PostgreSQL migration
acceptance requires `RUN_DB_TESTS=1` and `DATABASE_URL` and uses a temporary
merchant table rather than changing real tenant data.

### Column filters

Nano and Mini Products & storage tables include a filter in every data-column
header. Text and numbers accept partial matches, Status selects Active or
Inactive, and dates accept full or partial `YYYY-MM-DD` values. Filters combine
with the product search and status/type tabs and apply before pagination across
all loaded product/variant rows. Cost and profit filters retain merchant-only
visibility. Clear filters resets the header controls; controls remain available
when no rows match. Embedded mobile shares this presentation.
