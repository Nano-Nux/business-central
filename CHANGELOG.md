# Changelog

This is the chronological record of meaningful repository and feature changes. Use project-level `IMPLEMENTATION_STATUS.md` for current state and this file for history.

## 2026-09-19

- Added `business_central_pricing_model` to `merchants` table across schema and versioned migration `0043_business_central_pricing_model.sql`.
- Supported 4 pricing models: `Starter` (default), `Growth`, `Professional`, and `Enterprise`.
- Integrated pricing model assignment into platform-admin merchant provisioning (`POST /api/v1/admin/merchants` and `POST /api/v1/admin/merchant-users`), merchant updates (`PATCH /api/v1/admin/merchants/{id}`), and merchant reads (`GET /api/v1/admin/merchants` and `GET /api/v1/merchant`).
- Added pricing model selection UI to platform-admin merchant user creation and edit modal in `business-central-admin`, and displayed pricing model in the merchants directory.

## 2026-08-08

- Backend/portal temporary offline: added typed provisional POS checkout with
  durable complete snapshots, device-local stock reservation, canonical cash
  reconciliation, explicit external-payment authorization limits, audit, and
  ordered change publication.
- Synchronization: added shop-scoped ordered changes, explicit change type,
  persisted pull checkpoints, authorization-change quarantine, and migrations
  `0020`/`0021` to the runtime migration registry.
- Direct writes: shop settings, deliveries, product metadata, repair
  diagnostics, and POS orders publish ordered changes in their transaction.
- PWA validation: expanded shell precaching and added production Playwright
  install/upgrade/offline-launch/mutation/restart/stock-reservation tests.
- Status: the all-workflow objective remains partial; missing policies are
  itemized in `TEMPORARY_OFFLINE_CAPABILITY_MATRIX.md`.

## 2026-08-04

- Added repository-wide business, architecture, workflow, environment, security, module, testing, API, authorization, database, offline-sync, and UI/UX documentation.
- Added project feature inventories and implementation status records.
- Connected repairs to specialized service orders and canonical `SERVICE` orders in the database design.
- Documented the canonical payment relationship: repair → service order → order → payments/refunds.

## Entry format

```text
## YYYY-MM-DD
- Project/feature: change
- Validation: commands or tests
- Follow-up: known limitation or next step
```
