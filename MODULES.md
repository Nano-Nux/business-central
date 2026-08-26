# Merchant Modules

Modules are capabilities enabled per merchant through `modules` and `merchant_modules`. The backend enforces module availability; clients use the result to control navigation and feature presentation.

## Initial module catalogue

| Module code | Purpose | Status |
|---|---|---|
| `CORE` | Authentication, merchant, customer, catalog, orders, and platform foundations | Required |
| `POS` | Point-of-sale operations | Planned |
| `INVENTORY` | Stock, locations, movements, and costing | Planned |
| `SERVICE` | General service catalog, appointments, service orders, and billing | Schema available; runtime planned |
| `REPAIR` | Device repair, diagnostics, approvals, parts, and warranties | Backend and portal runtime implemented; mobile parity remains a separate release gate |
| `ACCOUNTING` | Accounting events, journals, and financial extensions | Schema available; runtime planned |
| `CLINICAL` | Patient and clinical service capabilities | Optional/deferred |

Module codes are subject to backend implementation review. Do not hard-code module availability in clients.

## Enablement rules

- A disabled module cannot be accessed through the API or client.
- Module settings belong to the merchant and module.
- Enabling a module must be audited.
- Disabling a module must define behavior for existing records.
- Module dependencies must be declared before implementation.
