# Nanonux AI chat security and scope

AI chat is an online-only, shop-scoped read interface. The model is not an
authorization boundary and cannot execute SQL or modify business records.

## Data flow

1. Authenticate the merchant membership, require `ai.chat` and merchant AI enablement.
2. Require the selected `shop_id`; verify the shop is active, belongs to the tenant,
   and is permitted by the current active membership and authenticated identity.
3. Verify existing conversation ownership and exact shop equality. A conversation
   never moves to another shop, including when the user explicitly requests it.
4. Reserve one usage unit atomically before query generation. Provider failures or
   rejected model requests consume the reserved unit because a model call was attempted.
5. The planner proposes `read_shop_data` with a dataset, approved columns, AND filters,
   aggregates, grouping, ordering and a maximum of 100 rows. It cannot supply SQL,
   expressions, joins, arbitrary functions, tenant/shop IDs, or a write operation.
6. The backend compiles fixed projections and scope relationships, binds every value,
   checks membership again, and executes a PostgreSQL READ ONLY transaction. Tenant
   context is set in transactions, including chat metadata queries, for RLS support.
7. A separate formatter has no tools. It receives approved results, the question,
   and merchant currency, with user/database content marked as untrusted data.
8. The server sanitizes HTML before storage and again on history reads. The portal
   also sanitizes responses and resets chat state when merchant/membership/shop/permissions change.

## Approved catalog

`internal/ai/adapters/outbound/postgres/catalog.go` explicitly projects operational
columns from 112 tables, with one additional `sales_profit` analytical dataset.
New tables and columns are unavailable until reviewed and added to this catalog.
Coverage includes catalog/units/prices, sales/order lines/payments/refunds,
stock/serials/assets/cost layers/purchasing, customers/customer addresses and CRM,
delivery options, promotions, ecommerce, service/repair, and shop cash activity.

Shop-owned data is scoped directly, through locations, or through the originating
order, service order, customer activity, purchase order, or ecommerce store.
Customers are available only when linked to orders or service orders in this shop.
Catalog, unit, pricing, promotion and service-catalog records have no shop ownership
in the canonical schema and are explicitly merchant-shared references. They may be
used inside the current shop, without exposing another shop's operational activity.

Credentials, platform/employee/user identities, memberships, employee contacts,
roles/permissions, payroll, login/guest/Telegram pairing tokens, provider secrets,
integration configuration, arbitrary JSON metadata/payloads, audit/outbox/sync data,
and unrestricted file payloads are excluded. Supplier business names may be read;
supplier contact fields are excluded. Customer and delivery contact fields are allowed.
Banking and expenses without a provable canonical shop relationship are unavailable.
Repair and Telegram datasets require the corresponding merchant and shop module.

Staff retain existing cost/profit restrictions. Restricted datasets and columns are
absent from their catalog and denied by the compiler in projections, filters,
aggregates, grouping, and ordering. Default projections never expand to `SELECT *`.
Stored responses generated with financial access are hidden after a role downgrade;
legacy assistant messages with no permission marker are conservatively hidden from
staff. Assistant answers and database records are not replayed to the planner.

## Financial semantics

Currency is supplied to both AI stages. Recorded row currencies take precedence.
Aggregates include currency grouping automatically. No exchange rate is invented.
Before humanization, the application formats catalog-approved monetary fields
and their non-count aggregate aliases as exact amount-and-currency strings.
Explicit record currency takes precedence over the merchant default. The model
is instructed to preserve currency beside every monetary value in cards, table
cells and prose. Counts, quantities and percentages remain unchanged; null money
remains unavailable. The HTML fallback preserves these formatted values too.
This reduces model formatting errors but does not guarantee model compliance.
`sales_profit` uses recorded sale FIFO allocations, excludes delivery charges and
DRAFT/CANCELLED/REFUNDED orders, and marks stock lines without cost allocations. Cost/profit is null for orders
whose recorded currency differs from the merchant base cost currency; every profit
result includes incompatibility/missing-cost indicators, including aggregates.
It is gross sales profit, not net profit or a replacement for the Reports return/
expense accounting workflow. The formatter must explain incomplete costs. Tables
without a recorded currency use the merchant base currency; linked price lists,
orders, purchases and cash accounts use their recorded currencies where available.

## Response language

The planner and humanizer share a policy to answer in the latest question's
language, including explanatory text, metric labels and table headings. Prior
English answers, prompt examples and database field names must not override it.
Predominantly Myanmar-script questions receive an explicit Myanmar instruction;
currency codes and numeric values remain unchanged. The programmatic fallback
localizes its introduction, empty/unavailable text and common business/financial
labels for Myanmar questions. Uncommon field identifiers are preserved; the
non-Myanmar programmatic fallback is currently English. Model language compliance
is tested at the request boundary with a fake provider, not certified by live AI.

## Limits and lifecycle writes

Inputs: 8,000 text bytes, 6 MB decoded transcription audio. Structured tool arguments:
16 KB, at most 24 selected columns, 16 filters (500 bytes each), 8 aggregates,
6 grouping columns, 4 order columns, and 100 rows. Read queries: 5-second statement
and 1-second lock timeouts, 6-second context deadline, 128 KB result payload cap.
Provider responses: 1 MB; formatted responses: 64 KB; at most 8 concurrent planner/transcription
requests per backend process, and 10 combined chat/transcription HTTP requests per
minute per merchant membership per process. Merchant quota reservation is atomic in PostgreSQL.
HTML permits formatting/tables and a few presentation classes; no URLs, images,
styles, scripts, forms, event attributes, SVG or embedded resources survive.

Only chat infrastructure writes conversations, messages and quota counters. Explicit
user conversation deletion and separate platform-admin maintenance still work. These
operations are never exposed as model tools and do not grant business-data writes.

## Client rollout and legacy conversations

Deploy the backend and portal bundle together. All chat and conversation creation
requests must supply the selected `shop_id`; list, history, delete and transcription
requests must include `?shop_id=UUID`. An older client omitting scope gets 400
`SHOP_REQUIRED`. Unauthorized scope gets 403; mismatched/legacy unscoped conversation
access gets 404. Existing conversations with null `shop_id` are retained but hidden;
start a new conversation in the selected shop. Do not guess or backfill their shop.
No canonical database/SQLite schema migration is required. Embedded mobile consumes
the same portal bundle. Native mobile has no separate AI chat client; any future
native implementation must use this contract. FULLY_OFFLINE never calls AI APIs.

## Validation and practical limits

Run `go test ./...`, `go vet ./...`, and
`RUN_DB_TESTS=1 go test ./internal/ai/adapters/outbound/postgres -run TestConfiguredDatabaseAIReadSecurity`.
The database regression creates/drops only a private generated schema. It validates
all catalog queries against the canonical schema and tests tenant/shop isolation,
current membership access, staff denials, currency grouping and quota reservation.
Provider contract tests use a fake HTTP transport. Live AI tests are opt-in with
`RUN_LIVE_AI_TESTS=1` and `GEMINI_API_KEY`; no credential is stored in test code.

These controls prevent a model proposal from widening database scope or issuing
arbitrary commands. They do not promise 100% security or perfect model answers.
An injected business description may still influence wording. Approved free-text
business fields can contain data entered by users, including misplaced private
information; this is not a semantic secret-scanning/DLP system. Avoid storing
credentials in business notes. Infrastructure compromise, privileged schema changes,
provider retention, identity/session security and proxy-level abuse controls remain
separate concerns. Review new catalog fields and test scope relationships when the
canonical schema changes.

Design reference: [OWASP prompt injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).
