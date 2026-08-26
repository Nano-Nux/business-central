# Business Central

Business Central is a multi-tenant business management platform for merchant administration, operational dashboards, POS, inventory and commerce workflows, and a future public marketing site.

## Projects

| Project | Purpose | Technology |
|---|---|---|
| `business-central-backend` | Main and only backend; APIs, authentication, authorization, domain rules, and persistence | Go, Fiber |
| `business-central-admin` | Platform administration: merchant CRUD and merchant module enablement | Next.js, PWA |
| `business-central-portal` | Merchant, manager, and staff dashboard plus POS | Next.js, PWA |
| `business_central_mobile` | Same operational dashboard/POS as the portal, with online/offline support and sync | Flutter, SQLite |
| `business-central-public-facing` | Public Business Central advertisement/landing page | Next.js |

The public-facing site is intentionally not an immediate development priority.

## Read first

1. `BUSINESS_CONTEXT.md` — business concepts and rules
2. `SYSTEM_MAP.md` — project boundaries and ownership
3. `DOMAIN_FLOWS.md` — important end-to-end workflows
4. `ARCHITECTURE.md` and `ERD.md` — backend and database design
5. The README and `AGENTS.md` inside the project being changed

For implementation work, also consult:

- `API_CONTRACT.md`
- `AUTHORIZATION_MATRIX.md`
- `DATABASE_DEVELOPMENT.md`
- `OFFLINE_SYNC_PROTOCOL.md`
- `UI_UX_PARITY.md`
- `PORTAL_MOBILE_PARITY.md`
- `TESTING_STRATEGY.md`
- `TEMPORARY_OFFLINE_CAPABILITY_MATRIX.md`
- `MODULES.md`
- `REQUIREMENTS.md`

Each project also has:

- `FEATURES.md` — feature inventory with `Implemented`, `Partial`, `Planned`, or `Out of scope` status.
- `IMPLEMENTATION_STATUS.md` — evidence-based implementation snapshot, next increments, and limitations.

Keep these files current so planned work is not mistaken for working functionality.

## Core principle

The backend is the system of record for `ONLINE` mobile deployments and web clients. Mobile `ONLINE` mode may temporarily use local SQLite and synchronize later. Mobile `FULLY_OFFLINE` mode is a separate `.env`-selected product mode that operates only on local SQLite and never connects to or synchronizes with the backend.
