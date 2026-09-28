# Business Central Backend

## Telegram automation

Set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` of 32–256 letters, numbers, underscores, or hyphens only in the backend environment. Never use `NEXT_PUBLIC_*` for either value.

After deploying the backend with public HTTPS, open **Admin → Telegram groups → Telegram webhook**, enter `https://your-backend-domain/api/v1/webhooks/telegram`, and click **Register webhook**. The backend calls Telegram using its configured token and secret; neither credential is sent to the browser. **Refresh status** shows the registered URL, pending updates, and the last delivery error. Registration replaces the shared bot's previous webhook and preserves pending updates. It subscribes to `message`, `callback_query`, and `my_chat_member` updates. Register again when the URL or secret changes; ordinary deployments do not require re-registration. A public HTTPS `PUBLIC_BASE_URL` pre-fills the form when no webhook is registered; otherwise enter the address manually. Localhost cannot receive Telegram webhook deliveries.

Set `TELEGRAM_BOT_NAME` to the bot's Telegram username, for example
`TELEGRAM_BOT_NAME=NanonuxBusinessCentralBot` (an optional leading `@` is
removed). Restart the backend after changing its environment. The authenticated
`GET /api/v1/telegram/bot` endpoint exposes only this username to the portal,
which uses it for setup instructions and complete, copyable pairing commands.

Orders use `/takeorder [product name] quantity=<positive number> [SKU]`. Quantity is required, and at least a name or SKU must be supplied. For SKU-only orders, use `/takeorder quantity=2 WC-002`. When both a name and SKU are supplied, both must identify the same variant.

Migration `0049_telegram_automation` adds the `TELEGRAM` order channel, shop-group connections, hashed one-time pairing codes, observed users, source metadata, callback tokens, update deduplication, tenant constraints, and RLS. Final message edits use `outbox_events` retry. Telegram does not expose an exact group creation date or a complete member list; only connected/first-seen dates, counts, administrators, and observed users are shown when available.

Webhook troubleshooting: a delivery error with `SQLSTATE 42P08` or `commit
unexpectedly resulted in rollback` indicates a backend database failure, not an
incorrect webhook URL. Pairing replies distinguish invalid/expired/used codes,
an already connected group, and server failures. Failed pairing transactions
leave the code unconsumed. After deploying a fix, generate a fresh pairing code
and send a new `/connect` command; previously seen update IDs are deduplicated.
Orders sent in unconnected groups receive setup instructions. Handled business
rejections acknowledge the webhook with HTTP 200; server/provider failures still
return an error. Telegram's last delivery error is historical and can remain
visible after successful deliveries.

The PostgreSQL pairing/membership regression test requires an initialized test
database with the Telegram schema: set `RUN_DB_TESTS=1` and `DATABASE_URL`, then
run `go test ./internal/telegram/...`. It checks successful pairing, one-time
code consumption, duplicate groups, database error classification, rollback,
and bot membership events.

The Go Fiber backend is the only main backend for Business Central. All client APIs, authentication, authorization, merchant-module rules, domain behavior, persistence, and mobile synchronization protocols belong here.

The architecture is Hexagonal Architecture combined with Domain-Driven Design. Keep domain logic independent from HTTP and database adapters.

The code follows these dependency boundaries:

```text
internal/adapters/inbound/http       global Fiber composition, middleware, health, Swagger
        │
        ├── internal/<context>/adapters/inbound/http
        │       ↓
        ├── internal/<context>/application
        │       ↓
        ├── internal/<context>/domain
        │       ↓
        └── internal/<context>/ports/outbound ← internal/<context>/adapters/outbound/postgres
```

`cmd/server/main.go` is the composition root. It creates PostgreSQL adapters,
application use cases, and injects them into the HTTP adapter. The application
ports preserve the current API DTOs for compatibility while the domain layer
owns validation, defaults, and lifecycle invariants. Each bounded context has
its own `domain`, `application`, `ports`, and `adapters` packages; new
endpoints should add dedicated command/query types instead of expanding the
compatibility DTOs.

See the repository-level `BUSINESS_CONTEXT.md`, `SYSTEM_MAP.md`, `DOMAIN_FLOWS.md`, `ARCHITECTURE.md`, and `ERD.md` before changing behavior or schema.

`schema.sql` is the database contract, not the complete backend implementation. Domain use cases, API handlers, authentication, authorization, integrations, and synchronization belong in the Go backend code. When changing this file, update the affected feature and implementation records.

## API documentation

The contract-first OpenAPI document is [docs/openapi.yaml](docs/openapi.yaml),
and [docs/index.html](docs/index.html) provides a Swagger UI viewer. The
document contains the implemented health, authentication, and user membership
operations. See [docs/README.md](docs/README.md) for local viewing and
validation commands.

## Image storage

Direct image uploads (including product, variant, shop-logo, and repair images)
use the shared SeaweedFS media service. Start the included local
master, volume server, and filer with:

```powershell
docker compose -f compose.seaweedfs.yml up -d
```

Portal uploads are resized proportionally to fit within 240 by 240 pixels
before submission. The backend independently rejects files over 500 KB,
invalid or mismatched image content, and decoded dimensions above 240 pixels,
so SeaweedFS only receives validated reduced images.

`SEAWEEDFS_FILER_URL` is the backend-to-filer address and
`SEAWEEDFS_FILER_AUTHORIZATION` is an optional complete HTTP `Authorization`
header value, for example `Bearer <service-token>`. It is sent only by the
backend to the filer during uploads and must never be placed in a `NEXT_PUBLIC_`
portal variable. The filer-side proxy or authentication layer must validate
this header; SeaweedFS will not accept an arbitrary header unless its endpoint
is configured to enforce it.
The backend stores uploaded media as a relative `/media/...` object path in
resource image records. The browser-facing file-server hostname is not stored
in PostgreSQL, so changing domains or ports does not require rewriting image
data. When the backend runs in Docker, use `http://seaweed-filer:8888` for the
internal filer URL. The portal prefixes stored paths at render time with its
`NEXT_PUBLIC_FILE_SERVER_URL`; external URLs and Google Drive URLs remain
absolute. Image receipts use canvas and therefore require cross-origin image
access from the configured file-server origin.

For a brand-new PostgreSQL database, set `AUTO_INIT_SCHEMA=true` for the first
startup only. This explicitly applies the canonical `schema.sql`; leave it
false afterward and use migrations for future changes.
The schema seeds the initial `USD`, `THB`, `EUR`, and `GBP` reference
currencies, and migration `0004_seed_reference_currencies` backfills them for
databases initialized before that seed was added.

To bootstrap the first platform administrator, set `ADMIN_EMAIL` and
`ADMIN_PASSWORD` in `.env`. On startup, the backend checks `user_identities`
and creates this account only when no user exists. If a user already exists,
startup skips the default-admin creation. The admin can then log in without a
merchant and call `POST /api/v1/admin/merchants`. The request creates the
merchant and its default Manager and Staff roles, but no user account. The
admin then selects a merchant with `X-Merchant-ID` and creates manager and
staff users through `POST /api/v1/users`. Merchant managers can also create
manager and staff users within their own merchant; cross-merchant creation is
blocked.

`PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` remain supported as a
legacy explicit bootstrap when the `ADMIN_*` variables are not set.
