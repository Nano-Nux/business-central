# Mobile Agent Instructions

- `business_central_mobile` serves as the offline-first host container for `business-central-portal` using Flutter WebView and Drift SQLite.
- Do NOT build duplicate pure native Flutter UI screens or competing domain models. All UI, POS workflows, permissions, and staff operations are defined centrally in `business-central-portal`.
- Do NOT add staff PIN screens or diverging mobile authentication; adhere strictly to the unified portal workflows.
- Native data persistence and queries must use Drift SQLite (`AppDatabase` / `app.db`) via the Option A JavaScript Bridge (`BusinessCentralDatabaseChannel` / `window.BusinessCentralNativeDatabase`).
- Retain the 3 internet-only touchpoints:
  1. Silent license validator & heartbeat (`GET /api/v1/merchants/me/status`) for remote merchant lockdown.
  2. OTA portal bundle manager (`GET /api/v1/portal-bundle/version`) and embedded shelf HTTP loopback server.
  3. Cloud disaster recovery backup upload (`POST /api/v1/merchants/:id/backups`) and download (`GET /api/v1/merchants/:id/backups/latest`).
- Always run `flutter analyze` and `flutter test` before finishing any changes. Ensure 0 analysis issues and 100% test pass rate.
