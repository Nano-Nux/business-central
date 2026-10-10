# Stock conversion

NANO, MINI, SIMPLE and COMPLEX share one product-first workflow. An owner with
`tenant.write` selects an active product, chooses its larger pack and smaller
unit, enters the number of smaller units inside one larger pack, and saves the
pack size. Both options are distinct, stock-tracked canonical variants of the
same product. Separately created products cannot be converted into each other.

For example, Cotton wool has Large pack and Small packet sellable options:
`1 Large pack = 30 Small packets`. Saving the relationship does not move stock.
Converting 2 Large packs consumes 2 source units and produces 60 destination
units, conserving the source FIFO cost through the existing backend operation.

Select an active product directly from the Product list to load its sellable
options. Pack setup and conversion appear in separate cards, side by side on
wide screens and stacked on smaller screens. The stock preview shows each
option's before/after balance, with recent conversions listed below. If an option is
missing, Add sellable option opens the existing catalog editor without losing
the selected product or larger pack. NANO, MINI and SIMPLE use sellable-option
terminology; COMPLEX retains variant terminology in its catalog editor. Every
option keeps its own inventory and price; configure selling prices through the
existing product/pricing workflow before selling a newly created option.

Products, options and locations load all collection pages. Loading failures
have separate error and retry states rather than appearing as empty selections.
Stock automatically uses the selected shop, matching POS and Storage. No
additional stock-location selector is shown. The canonical location is resolved
within that shop only (SHOP first, then ID); without one, conversion is disabled.
Preview balances use quantity formatting: `5.000000` becomes `5`, while
`5.250000` becomes `5.25`. A merchant or staff
member with `tenant.write` may convert using a saved relationship; read-only
users may view data but cannot configure or apply a conversion. Backend
permissions, eligibility, available stock and tenant/shop scope remain authoritative.

Convert stock shows the output quantity before preview. Confirmation requires
an authoritative before/after preview for the selected rule, shop, location and
quantity. Changing any selection invalidates that preview. Failed apply attempts
retain the same idempotency key while the payload is unchanged. History refreshes
after success.

Stock conversion is a main navigation entry in Simple and Complex. Nano and
Mini access it through the product Pack sizes / Sellable options dialog, which
links to `/stock-conversions?product_id=<id>` to preserve context. It is omitted
from main navigation and landing-page choices in Nano and Mini.

The embedded mobile portal shares this UI. Native temporary-offline and
FULLY_OFFLINE conversion remain pending; this refactor adds no backend API or
schema changes and does not add native networking or synchronization. Pack-size
saving and stock conversion require connectivity.

Acceptance: `e2e/stock-conversions.spec.ts` exercises all four modes at desktop
and mobile widths, option creation, same-product selections, later product pages,
ratio saving, preview invalidation, shop-scoped locations, permissions, error
recovery and idempotent conversion retry. `lib/navigation.test.ts` covers Nano
navigation and permission-filtered landing options.

## Optional sellable-option fields

Only the sellable-option name is required in the editor. Blank SKU is generated
by the backend as `OPT-<variant UUID without hyphens>`. Base unit and unit label
inherit the product's standard/default option when left blank. Manual overrides,
barcode, image and attributes remain optional; inventory tracking starts enabled.
Blank fields in edit mode retain the saved SKU and units. Products without a
default option use an active PCS/EA unit; if none exists, select a base unit.
The same rules apply to typed synchronization. Database constraints and schema
remain unchanged. Name-only creation is tested in all four modes.
