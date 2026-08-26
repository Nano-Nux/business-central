# Mobile SQLite schema and backend mapping

The mobile database uses Drift with forward-only migrations and schema version
metadata. SQLite foreign-key enforcement is enabled on every open. The schema
is a deliberate SQLite adaptation, not a copy of PostgreSQL DDL: JSON values
are stored as validated text, UUIDs and UTC timestamps are stored as text, and
tenant/shop scope is enforced by repository methods and tests.

| Backend table | Mobile table | Current use | Scope rule |
|---|---|---|---|
| `merchants` | `merchants` | Fully-offline owner setup | Every read/write identifies the merchant |
| `shops` | `shops` | Initial shop context and FULLY_OFFLINE profile/timezone settings | Queries require merchant ID |
| device-local printer profiles | `local_printer_profiles` | Bluetooth/network/USB pairing and thermal paper/font configuration | Queries require merchant and selected shop IDs; pairing addresses never synchronize |
| remaining canonical entities | `local_canonical_records` | Payload-preserving merchant/shop cache for disabled workflows such as customers, purchasing, fulfillment, accounting, promotions, files, and sync changes; stores entity type, ID, version, and tombstones | Repository requires merchant scope and validates optional shop scope; this is not a second typed domain model |
| `locations` | `locations` | Initial shop stock location and ONLINE inventory location cache | Queries require merchant and selected shop IDs; shop ID is retained |
| `user_identities` | `user_identities` | Local owner credential | Email is normalized and unique locally |
| `user_memberships` | `user_memberships` | Identity-to-merchant/shop scope | Active staff/manager rows must retain assigned shop |
| `roles`, `permissions`, `membership_roles`, `role_permissions` | same names | Local authorization foundation | Role lookup is merchant-scoped |
| `modules`, `merchant_modules`, `shop_modules` | same names | Module gating foundation | Disabled modules must not expose workflows |
| `merchant_settings` | `merchant_settings` | Shop-scoped tax labels, tax rates, receipt notes, initial receipt settings, and portal-local repair fault presets/default duration | Merchant and shop IDs are mandatory for operational settings; repair specifications remain local because no backend contract exists |
| `sync_devices` | `sync_devices` | Device identity foundation | Device is unique within merchant |
| `sync_checkpoints` | `sync_checkpoints` | Reconciliation foundation | Merchant and scope key are part of the key |
| `sync_sessions` | `sync_sessions` | Durable server synchronization session metadata | Merchant and device scope |
| `sync_entity_versions` | `sync_entity_versions` | Optimistic base versions and last reconciled payloads | Merchant and entity scope |
| mobile queue contract | `operation_queue` | Durable ONLINE temporary-offline work and encrypted backup/recovery export | Merchant and optional shop are mandatory fields; restore preserves status, retry, dependency, hash, and base-version metadata |
| `catalog_categories`, `products`, `product_categories` | `cached_catalog_categories`, `cached_catalog_products`, `cached_catalog_product_categories` | Merchant-scoped ONLINE read cache and FULLY_OFFLINE local catalog truth | Repository rejects cross-merchant rows and reads/writes require merchant ID |
| `product_variants` | `cached_catalog_variants` | Merchant-scoped ONLINE variant cache and FULLY_OFFLINE local catalog truth | Product ownership and merchant scope are checked before every write |
| `promotions`, `promotion_codes`, `promotion_products` | `local_promotions`, `local_promotion_codes`, `local_promotion_scopes` | FULLY_OFFLINE promotion definitions, schedules, usage limits, codes, product/variant scopes, and POS eligibility | Every row is merchant-scoped; promotion variants must belong to the supplied product |
| `unit_definitions`, `unit_conversions` | `local_measurement_units`, `local_measurement_conversions` | FULLY_OFFLINE unit and conversion administration | Every row is merchant-scoped; conversions require two local units and numeric factors |
| shop delivery options | `local_deliveries` | FULLY_OFFLINE delivery-option administration and POS selection | Every row is merchant/shop scoped; selected order delivery IDs are stored locally |
| local POS orders, lines, payments, and promotion links | `local_orders`, `local_order_lines`, `local_payments`, `local_refunds`, `local_order_promotions` | FULLY_OFFLINE exact quote, completed checkout, captured payment projection, refund projection, and applied promotion history; order lines retain exact discount and tax amounts | Every row is merchant/shop scoped; checkout, promotion redemption, and payment record are one SQLite transaction; no external capture is performed |
| local inventory ledger and FIFO costing | `local_inventory_movements`, `local_inventory_cost_layers`, `local_inventory_cost_allocations` | FULLY_OFFLINE stock receiving, FIFO layer creation, POS stock-out, purchase-order/receipt/batch/expiry context, cost allocation, and movement detail | Merchant/shop scope, unique event key, balance changes, layers, and allocations share a transaction |
| local service workflows | `local_service_records` | FULLY_OFFLINE service catalog, shop orders, items, appointments, notes, and standalone billing | Every row is merchant-scoped; orders and child rows retain shop/parent scope; no external payment or backend reconciliation claim |
| local repair workflows | `local_repair_records` | FULLY_OFFLINE repair intake, diagnostics, payments, parts, images, approvals, warranties, and lifecycle status | Every row is merchant/shop/parent scoped; child-specific fields use typed columns or validated JSON metadata; local payments are records only and do not capture external funds |
| `audit_events` | `local_audit_events` | Append-only audit trail for sensitive FULLY_OFFLINE setup, authentication, staff, inventory, POS, and repair actions | Merchant scope is mandatory; optional shop and actor membership are validated before insertion; repository exposes no update/delete operation |
| local pricing | `local_price_lists`, `local_prices` | FULLY_OFFLINE price-list and variant-price CRUD used by local POS | Merchant scope and variant ownership are checked; local price writes do not reconcile to backend price history |
| reports and transaction history | pending read-cache tables | ONLINE backend-authoritative reads only | Do not recompute or persist financial truth until freshness/invalidation rules are specified |
| remaining canonical tables | pending migrations | Not yet exercised by a mobile workflow | Must be added before feature completion |

Schema changes must add a migration, preserve existing rows and pending queue
entries, update this mapping, and include a migration test. Schema version 24
includes category ordering, local measurement units and conversions, local POS
order/payment/refund tables (including refund idempotency keys), the local inventory ledger and FIFO cost
layer/allocation tables, local service records, local repair records, local
pricing, shop timezone, and append-only local audit events. The current owner setup
creates CORE, POS, INVENTORY, SERVICES, and REPAIR module rows;
FULLY_OFFLINE local catalog, POS, delivery, inventory, reporting, history, backup,
service, repair, and settings workflows are available after setup, while
offline delivery and accounting parity remain unclaimed.
