# Business Context

Business Central is a multi-tenant platform for merchants with different business types. A platform administrator creates and manages merchants. Each merchant can have different optional modules enabled, such as repair, based on the merchant's business needs.

## Actors

- **Platform administrator**: manages merchants, configuration, and enabled modules through the admin application.
- **Merchant owner**: operates a merchant and manages its users and business data.
- **Manager**: performs operational work allowed by the merchant's permissions.
- **Staff**: performs day-to-day work allowed by assigned permissions.
- **Customer**: buys products or receives services from a merchant.

Manager and staff access the portal and mobile application. Their available views, actions, and data are controlled by role and permission.

## Merchant modules

Modules are capabilities enabled for a merchant. Module enablement is controlled by the admin application and enforced by the backend. A client must not assume every merchant has every module enabled.

Example: a repair merchant may have the repair module enabled, while a normal retail merchant may not.

## Canonical concepts

Use the canonical models in `ARCHITECTURE.md` and `ERD.md`: `merchants` is the tenant boundary; `customers` is the shared customer master; `products` and `product_variants` represent catalog and sellable SKUs; `orders` is the canonical order aggregate; and `locations`, `inventory_movements`, and `inventory_balances` represent stock.

Do not introduce separate customer, order, or inventory masters for individual channels or applications.

## Client expectations

The portal and mobile application must provide the same business workflow and user experience. They must share terminology, navigation concepts, role and permission behavior, validation, state transitions, POS workflow, and module-based feature availability.

Mobile supports two runtime modes. In `ONLINE` mode it normally connects to the backend and may temporarily operate offline using local SQLite, then synchronize when connectivity returns. In `FULLY_OFFLINE` mode, selected through the mobile `.env` configuration, it never connects to the backend and operates entirely from local SQLite. The fully offline mode does not perform synchronization.
