# Database Development

## Sources of truth

- PostgreSQL structure: `business-central-backend/schema.sql`
- Relationships: `ERD.md`
- Ownership and invariants: `ARCHITECTURE.md`
- Mobile local representation: `business_central_mobile` implementation and its versioned SQLite migrations

## Development rules

- Every merchant-owned table must preserve `merchant_id` tenant scope.
- Prefer composite tenant-safe foreign keys where the schema uses them.
- Do not create duplicate customer, product, order, payment, or inventory masters.
- Use constraints and triggers for invariants that must hold regardless of API caller.
- Use migrations for changes after the initial database bootstrap. Do not edit an already-applied migration.
- Record destructive or incompatible changes with a data migration and rollback/recovery plan.

## Local database lifecycle

The backend needs documented commands for create, reset, seed, migrate, and test database setup before runtime implementation begins. Until those commands exist, do not assume `schema.sql` alone provides a complete local development workflow.

## PostgreSQL to SQLite

Mobile SQLite is a supported local projection, not an independent domain model. For each supported table, document:

- PostgreSQL source table and SQLite table
- Type adaptations
- Required local indexes
- Schema version
- Offline-readable fields
- Offline-writable fields
- Sync identity and timestamps
- Migration behavior

PostgreSQL-specific features such as RLS, triggers, extensions, generated values, exclusion constraints, and JSONB require explicit SQLite adaptations or backend reconciliation.

## Change checklist

- Update `schema.sql`, `ERD.md`, and architecture documentation.
- Add or update backend database tests.
- Add a migration if the database is already deployed.
- Update mobile SQLite migrations and sync behavior.
- Update API and feature records.

The service-ticket migration `0024_service_work_items_and_forms` adds
tenant-scoped repeatable work items and device specializations, backfills every
existing repair ticket with one item, links existing repair children to that
item, and extends custom fields with ticket/work-item scope and form-version
metadata. New work-item tables are RLS-protected and mobile stores additional
offline intake children in its local repair projection until full reconciliation
is implemented.
