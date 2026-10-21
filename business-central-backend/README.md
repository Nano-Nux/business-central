# Business Central Backend

## Telegram automation

Only users with the system `merchant` or `owner` role and `tenant.write` may
create or rotate a Telegram pairing code, confirm/cancel a Telegram order, or
change automatic confirmation through tenant APIs. Staff may review Telegram
groups and orders but cannot initiate a connection or approve orders. Platform
administrators retain their separate admin routes.

Set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` of 32–256 letters, numbers, underscores, or hyphens only in the backend environment. Never use `NEXT_PUBLIC_*` for either value.

After deploying the backend with public HTTPS, open **Admin → Telegram groups → Telegram webhook**, enter `https://your-backend-domain/api/v1/webhooks/telegram`, and click **Register webhook**. The backend calls Telegram using its configured token and secret; neither credential is sent to the browser. **Refresh status** shows the registered URL, pending updates, and the last delivery error. Registration replaces the shared bot's previous webhook and preserves pending updates. It subscribes to `message`, `callback_query`, and `my_chat_member` updates. Register again when the URL or secret changes; ordinary deployments do not require re-registration. A public HTTPS `PUBLIC_BASE_URL` pre-fills the form when no webhook is registered; otherwise enter the address manually. Localhost cannot receive Telegram webhook deliveries.

Set `TELEGRAM_BOT_NAME` to the bot's Telegram username, for example
`TELEGRAM_BOT_NAME=NanonuxBusinessCentralBot` (an optional leading `@` is
removed). Restart the backend after changing its environment. The authenticated
`GET /api/v1/telegram/bot` endpoint exposes only this username to the portal,
which uses it for setup instructions and complete, copyable pairing commands.

Orders use `/takeorder [product name] qty=<positive number> [SKU]`. Quantity is required, and at least a name or SKU must be supplied. For SKU-only orders, use `/takeorder qty=2 WC-002`. When both a name and SKU are supplied, both must identify the same variant.

The shorter `qty=` and existing `quantity=` spellings are both supported,
case-insensitively. Use exactly one quantity token per product line; do not
supply both spellings on the same line.

For a customer and multiple products, send one message:

```text
/takeorder
customer=KyawKyaw
wo phone qty=2
travel-mate-p214 qty=1
```

The customer line is optional and appears before products. When included, it
must start with `customer=`. A bare `KyawKyaw` line is treated as a product
missing `qty=` and rejects the message before product lookup. Omit the
entire customer line when no name is needed. Send all lines in one Telegram
message. The customer name is saved on the order and links a new guest in the
shared customer table. Missing names stay
blank/null; customer metadata records `Online-Telegram-Customer` as the source
label. Guest records are never merged by name. Up to 20 product lines become
one draft, one total, and one Confirm/Cancel action. Each line requires quantity
and a name or SKU; repeated variants combine quantities. A failure on any item
rejects the whole order. Confirmation, cancellation, expiry, and message retries
preserve the full order. Existing single-product commands continue to work.
The API adds `customer_name` and `items[]`, using the existing canonical order,
order-line, customer, payment, and billing snapshot columns. Migration `0050`
backfills existing Telegram customer links and orders without payments. Draft
invoices are Pending; merchant confirmation captures the full amount and makes
them Paid. Cancellation/expiry void pending payment. No payment gateway is called;
confirmation is the merchant acknowledgment of payment.

For example, `/takeorder wo phone qty=1` matches the active product named
`wo phone` using its current default-list price. A server failure during order
creation is reported as a server error, not as a missing product. A webhook log
with `SQLSTATE 42601` and `cannot insert multiple commands into a prepared
statement` indicates an order-write failure after product lookup. Order creation,
confirmation/cancellation, and outbox delivery updates execute separate
parameterized statements within their existing transactions.

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
and bot membership events. It also verifies ordering by name and SKU,
confirmation/cancellation, callback consumption, outbox delivery updates, and
rollback when a later draft write fails.

`TestConfiguredDatabaseTelegramMultiProductStock` creates a private schema from
`schema.sql`, so its test database account must permit creating/dropping schemas.
It exercises real reservation/FIFO triggers for several products, duplicate-line
aggregation, customer links/names, Pending/Paid invoices, payment capture/void, tenant isolation, full confirmation/cancellation,
expiry, outbox details, and rollback of partial draft/confirmation writes. It
drops only its generated test schema and never disables ledger protections.

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

Telegram automatic confirmation is saved per group as
`telegram_group_connections.auto_confirm_orders` (BOOLEAN NOT NULL DEFAULT FALSE).
Migration `0051_telegram_auto_confirm` defaults existing groups to OFF; it never
processes existing drafts. `telegram_order_sources.auto_confirmed` records how
an order was confirmed, independent of later setting changes.

When ON, new valid orders are created and confirmed in one database transaction,
using the same payment capture, accounting, and stock-sale logic as manual
confirmation. Successful orders are Confirmed/Paid; their receipts have no manual
action buttons. Any creation/confirmation failure rolls back the entire new order
and returns the error. Failed orders are never automatically retried; sellers
must correct the issue and send a new command. The existing outbox retries only
receipt delivery for successfully committed orders, never the commerce operation.
Turning OFF restores manual confirmation for subsequent orders. Existing pending
orders remain pending, and already confirmed orders remain confirmed.

## Storage stock management ? 2026-10-02

The portal combines receiving and stock checking in Storage (/stock-in redirects there). Only active merchant/owner roles can receive or reduce stock and see original cost/profit. Staff, managers and custom roles cannot modify stock through Storage or the stock-in API, even with legacy stock_in permission. Reductions append audited immutable ADJUSTMENT movements and consume FIFO cost while preserving reservations. Portal reductions queue through deferred API replay; receipts retain typed synchronization with merchant-only role and shop checks. No schema migration is required; native mobile parity remains pending.

## POS Nano

Migration `0053_pos_nano_mode` allows NANO/MINI/SIMPLE/COMPLEX and defaults future merchants to NANO without changing existing modes. Both admin provisioning endpoints default to NANO. Nano reuses Mini standard-variant/Pcs/RETAIL provisioning and direct prices; opening stock still uses the canonical merchant-only stock receipt API.

## Optional checkout customer names

All POS modes (including Nano), temporary-offline checkout, and sales/service/repair
invoices leave missing customer names blank. Invoice APIs return `customer: null`
for unnamed customers; previews, PDF, browser and thermal printing do not insert
a fallback name. Whitespace-only POS names are treated as missing. Existing
explicitly recorded customer names are preserved. No database migration is needed.

## Independent POS delivery payment

See [delivery payment workflow, financial rules, migration and offline behavior](../DELIVERY_PAYMENT.md).

## Name-only sellable-option creation

`POST /catalog/products/:id/variants` requires only `name` in creation input.
Blank SKU generates `OPT-<variant UUID without hyphens>`. Blank base unit and
unit label inherit the product's managed standard option, otherwise the option
with the lowest variant ID. Products with no options use an active PCS/EA unit
if present; otherwise creation returns an actionable base-unit validation error.
Explicit values remain supported and updates preserve existing identifiers.
Typed CATALOG_VARIANT CREATE replay uses the same defaults and stable entity ID.
Stored SKU/base unit remain required; no database or local-schema migration.

Acceptance covers domain defaults, application validation, browser name-only
creation in all four modes, and isolated PostgreSQL creation and replay tests
(`TestConfiguredDatabaseNameOnlyVariant`, `TestConfiguredDatabaseNameOnlyVariantReplay`).

Migration 0055 enables merchant-owner full POS/Telegram transaction edits and
permanent deletion through `PATCH`/`DELETE /pos/orders/:orderId`. These are
atomic, version-checked, idempotent corrections with stock restoration and
owned-history cleanup. No triggers are disabled and no payment provider is
called. See `../API_CONTRACT.md` and `docs/openapi.yaml`. Database regression:
`RUN_DB_TESTS=1 go test ./internal/pos/adapters/outbound/postgres -run TestConfiguredDatabaseTransactionCorrections`. It creates/drops only a private
test schema and requires schema creation privileges.


## AI response currencies

Nanonux AI receives the authenticated merchant's `default_currency_code` in
both query generation and answer formatting. Explicit order/price-list currency
codes take precedence; monetary queries should return currency codes and group
aggregates by currency, without combining currencies or inventing exchange rates.
A merchant-context lookup failure stops generation rather than guessing a currency.
Before answer generation, catalog-approved monetary fields (including monetary
aggregate aliases) become exact, grouped amount-and-currency strings, for example
`150,000.00 MMK`. Record currency takes precedence over the merchant default.
The formatter must preserve currency beside every amount in cards, table cells,
and prose; counts and quantities remain numeric. The provider-failure fallback
uses the same formatted records and displays null amounts as unavailable.
This shared backend behavior applies to portal and online mobile AI chat. Existing
saved responses are unchanged; no API or schema migration is required.

Both AI stages receive the same response-language policy: use the latest user
question's language for explanations, metric labels, table headings and follow-up
suggestions. Earlier answers, English prompt examples, database field names and
merchant currency do not determine the language. Predominantly Myanmar-script
questions additionally receive an explicit Myanmar directive. Currency codes,
numbers, SKUs, proper names and internal tool/query identifiers are preserved.
The provider-failure table uses Myanmar introduction/empty/unavailable text and
common business/financial column labels for Myanmar questions; uncommon catalog
field identifiers remain visible. Other languages use the model's language policy;
the programmatic fallback remains English for non-Myanmar questions.


## Shop-scoped AI reads

See [AI chat security, catalog, financial semantics and client rollout](../AI_CHAT_SECURITY.md). AI tools accept structured read proposals, never raw SQL. Shop selection is mandatory. Chat metadata remains writable by infrastructure; business-data tools are read-only.

The planner can now investigate through up to five sequential reads/corrections
per question. Current-turn results retain query/period/currency provenance and
are untrusted input to subsequent planning. Shared limits cap accepted results at
300 rows/128 KB, planning at 45 seconds, formatting at 25 seconds, and the complete
service request at 85 seconds. Every step rechecks access, and role/scope changes
discard the answer. The separate tool-free formatter and programmatic fallback
return sanitized HTML; partial/limited reads receive a server-generated notice.
The HTTP DTOs, quota unit, database schema and offline behavior are unchanged.

## Nanonux public AI receptionist

The separate `internal/receptionist` module serves public support chat and visitor-confirmed Google Calendar appointments. Admin reviews full conversation and booking history, configures approved knowledge/scheduling, and connects Google Calendar. It is disabled by default and has no merchant data tools. See [setup, API, safety boundaries and verification](internal/receptionist/README.md).
