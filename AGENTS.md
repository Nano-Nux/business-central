# Business Central — AI Coding Instructions

Read `README.md`, `BUSINESS_CONTEXT.md`, and `SYSTEM_MAP.md` before making changes. Read the relevant project README and project-level `AGENTS.md` before editing a project.

## Product boundaries

- `business-central-backend` is the only main backend and the only place for APIs and business rules.
- The backend uses Go Fiber with Hexagonal Architecture and Domain-Driven Design.
- `business-central-admin` is the platform administrator application. It manages merchants and enables merchant modules.
- `business-central-portal` is the merchant/manager/staff dashboard and POS web application.
- `business_central_mobile` provides the same operational dashboard and POS workflows as the portal, plus offline operation and synchronization.
- `business-central-public-facing` is the Business Central marketing/advertising landing site and is currently out of development scope unless explicitly requested.

## Non-negotiable rules

- Do not create a second backend or put business logic exclusively in a frontend.
- Do not create duplicate canonical models for customers, products, orders, inventory, or merchants. Follow `ARCHITECTURE.md` and `ERD.md`.
- Preserve tenant isolation. Merchant-owned data must remain scoped to the correct `merchant_id`.
- Portal and mobile must have matching UI/UX workflows, terminology, permissions, and state transitions.
- Mobile `FULLY_OFFLINE` mode, selected through `.env`, must make no backend connection and must not synchronize. Mobile `ONLINE` mode may temporarily use local SQLite and synchronizes when connectivity returns.
- Treat synchronization, conflict handling, idempotency, and schema compatibility as domain concerns.
- Do not silently change API contracts or database schema. Update documentation and tests with such changes.

## Framework rule

For Next.js projects, inspect the installed documentation under `node_modules/next/dist/docs/` when a task depends on framework behavior, because the repository uses Next.js 16.

## Before finishing

- Run the relevant formatter, linter, type checker, and tests.
- Update documentation when business behavior, architecture, API contracts, database schema, permissions, or offline synchronization changes.
- Keep changes scoped to the requested project and preserve unrelated work.
