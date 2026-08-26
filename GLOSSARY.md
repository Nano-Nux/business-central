# Business Glossary

| Term | Meaning |
|---|---|
| Merchant | A tenant/business using Business Central |
| Platform administrator | User who manages merchants and merchant modules |
| Membership | A user's relationship to a merchant |
| Module | Optional capability enabled for a merchant |
| Service | General work delivered to a customer |
| Repair | Specialized service involving diagnosis and restoration of a device/item |
| Service order | Operational record for general, repair, or clinical service work |
| Canonical order | The shared commercial order aggregate used for POS, online, and service commerce |
| Variant | Sellable and stock-tracked product SKU |
| Location | Warehouse, shop, bin, fulfillment center, transit, or virtual stock location |
| `ONLINE` temporary offline | Connected mobile mode that temporarily uses SQLite during disconnection and later synchronizes |
| `FULLY_OFFLINE` | Mobile runtime selected through `.env` that never connects to the backend or synchronizes |
| Synchronization | Reconciliation of durable mobile operations with backend state in `ONLINE` mode |
| Idempotency | Repeating the same command produces one business result |

Use these terms consistently in APIs, database fields, screens, tests, and documentation.
