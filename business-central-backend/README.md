# Business Central Backend

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
`SEAWEEDFS_PUBLIC_URL` is the browser-viewable filer address stored in resource
image records. Both default to `http://localhost:8888` for local development.
When the backend runs in Docker, use `http://seaweed-filer:8888` for the internal
filer URL while keeping the public URL reachable by portal users. In
production, `SEAWEEDFS_PUBLIC_URL` is required, must use HTTPS, and must not be
a loopback or private address. Put the filer behind a public HTTPS reverse
proxy and allow the portal origin with CORS; image receipts use canvas and
therefore require cross-origin image access. Portal pages render the stored
public URL directly and do not proxy image reads through this backend.

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
