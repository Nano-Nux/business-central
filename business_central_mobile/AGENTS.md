# Mobile Agent Instructions

- Use Flutter and keep the mobile experience aligned with `business-central-portal`.
- Before implementing an operational feature, add or update its row in the root `PORTAL_MOBILE_PARITY.md`.
- Do not mark a feature complete until the matching portal workflow, design reference, and shared acceptance tests are recorded.
- Treat the backend API and schema as the source of truth for domain data.
- `FULLY_OFFLINE` mode must make zero backend requests for the entire app session. `ONLINE` mode may temporarily lose connectivity and synchronize supported queued operations later.
- Use local SQLite for offline reads and writes; do not replace the offline database with in-memory state.
- Keep the local schema compatible with `business-central-backend/schema.sql` for supported entities.
- Implement synchronization only for `ONLINE` mode, with idempotent operations, retries, durable queues, and explicit conflict handling.
- Test `ONLINE` connected, `ONLINE` temporary-offline, reconnect, retry, duplicate operation, and `FULLY_OFFLINE` no-network scenarios.
- Run `flutter analyze` and `flutter test` before finishing when mobile code exists.
