# System Map

```text
Platform administrator ── business-central-admin ──┐
                                                   │
Merchant / manager / staff ── business-central-portal ── business-central-backend
                              business_central_mobile ────┘

Public visitors ── business-central-public-facing
```

## Ownership

| Project | Owns | Must not own |
|---|---|---|
| Backend | APIs, authentication, authorization, domain rules, module rules, persistence, sync protocol | UI-only behavior or a second source of truth |
| Admin | Platform administration UI and merchant/module management UI | Merchant operational workflows or duplicated business rules |
| Portal | Web dashboard/POS experience for merchant users | Backend business decisions |
| Mobile | Native dashboard/POS, local SQLite, `ONLINE`-mode queue/sync client, `FULLY_OFFLINE` local runtime | A different business workflow or backend connection in `FULLY_OFFLINE` mode |
| Public-facing | Marketing and public landing content | Authenticated merchant operations |

## Communication

- Admin, portal, and mobile communicate with the backend through its APIs.
- The backend is authoritative for permissions, module enablement, validation, state transitions, and persistent data.
- In `ONLINE` mode, mobile communicates with the backend and can temporarily use local SQLite while disconnected; synchronization reconciles local changes after connectivity returns.
- In `FULLY_OFFLINE` mode, selected by mobile `.env`, mobile has no backend connection or synchronization path and operates only on local SQLite.
- When embedded in mobile WebView mode (Option A), the Portal UI connects via `window.BusinessCentralDatabaseChannel` (JavaScript Bridge) to native Drift SQLite (`app.db`), retaining identical UI/UX workflows without requiring mobile-specific PIN entry screens.
- Mobile offline-first architecture operates with exactly 3 internet-only touchpoints:
  1. Activation / Heartbeat: `GET /api/v1/merchants/me/status` silently validates status and remotely locks the mobile app if the merchant is suspended in Admin.
  2. OTA Bundle Updater: `GET /api/v1/portal-bundle/version` checks for new versions and serves local assets via embedded loopback server.
  3. Disaster Recovery Backup: `POST /api/v1/merchants/:id/backups` and `GET /api/v1/merchants/:id/backups/latest` for off-site cloud storage and restore.
- All core business operations (catalog, customers, inventory, checkout, invoices, printing, scanning) execute 100% locally offline.
- Portal and mobile should be designed from the same workflow specification and acceptance criteria.
