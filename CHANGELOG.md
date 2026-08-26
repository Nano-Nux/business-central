# Changelog

This is the chronological record of meaningful repository and feature changes. Use project-level `IMPLEMENTATION_STATUS.md` for current state and this file for history.

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
