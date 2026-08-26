# Admin Features

| Feature | Status | Notes |
|---|---|---|
| Next.js application shell | Implemented | Business Central admin shell with backend-backed dashboard |
| Progressive web application | Planned | PWA behavior and installability are not implemented yet |
| Administrator authentication | Implemented | Backend JWT login and platform-admin claim required |
| Merchant management | Implemented | No standalone merchant page; Add User with the default Merchant role atomically creates a merchant and its owner user, with POS SIMPLE (default) or COMPLEX workflow selection |
| Merchant module enablement | Planned | Enable or disable modules such as repair |
| Merchant settings | Planned | Configure module-specific settings |
| User administration | Implemented | Merchant-scoped user create, list, edit, deactivate/reactivate, password update, and multi-role dropdown assignment through backend APIs |
| Role administration | Implemented | Merchant-scoped custom role CRUD, system-role editing protections, and permission dropdown assignment through backend APIs |
| Currency administration | Implemented | Platform currency CRUD through protected backend APIs |
| Business type administration | Implemented | Platform business type CRUD and shop-level assignment; detailed catalog/unit/pricing configuration is planned |
| Shop administration | Implemented | Shop CRUD scoped by selected merchant and `X-Merchant-ID` |
| Audit visibility | Planned | Display relevant merchant/module changes |
