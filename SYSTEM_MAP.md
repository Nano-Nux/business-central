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
- Portal and mobile should be designed from the same workflow specification and acceptance criteria.
