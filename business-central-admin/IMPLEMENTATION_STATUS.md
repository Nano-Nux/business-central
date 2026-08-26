# Admin Implementation Status

Last reviewed: 2026-08-04

## Current state

- Next.js 16, React, TypeScript, Tailwind/PostCSS, and ESLint are configured.
- Platform administrators authenticate through the backend and see live backend health and merchant-scope counts on the overview.
- The current navigation contains Overview, Users, Roles, Currencies, Business types, and Shops. Merchant creation is embedded in Add User: the default Merchant role provisions a merchant and its owner user atomically.
- Users are listed and managed within a backend-provided merchant scope. Create and update forms use canonical identity/membership fields: email, password, display name, phone, active state, and role IDs.
- Add User defaults to the Merchant account role. Merchant mode collects merchant details and a POS complexity level (SIMPLE by default, or COMPLEX) and calls `POST /api/v1/admin/merchant-users`; other roles require an existing merchant and show `Please create a merchant first.` when none exists.
- User roles are selected from a multi-select dropdown populated by the selected merchant's backend role records.
- Custom merchant roles support create, list, update, and delete operations with permission assignments from the backend permission catalogue. System roles remain editable but cannot have their stable code changed or be deleted.
- Platform currencies support create, list, update, and delete operations. Referenced currencies are protected from deletion by the backend.
- Business types support platform-admin create, list, update, and delete operations. Shops select one active business type; detailed catalog, unit, conversion, price-list, and variant configuration remains planned.
- Shops support create, list, update, and delete operations under the selected merchant using `X-Merchant-ID`. Shop forms use the canonical name, code, address JSON, timezone, and active fields.
- Parallel authenticated requests share one in-flight refresh operation so rotating refresh tokens are not reused concurrently.

## API integration

- Users: `GET/POST /api/v1/users` and `GET/PATCH/DELETE /api/v1/users/{id}`.
- Merchant owner onboarding: `POST /api/v1/admin/merchant-users`.
- Roles: `GET/POST /api/v1/admin/merchants/{id}/roles`, `GET/PATCH/DELETE /api/v1/admin/merchants/{id}/roles/{roleId}`, and `GET /api/v1/admin/permissions`.
- Currencies: `GET/POST /api/v1/admin/currencies` and `GET/PATCH/DELETE /api/v1/admin/currencies/{code}`.
- Business types: `GET/POST /api/v1/admin/business-types` and `GET/PATCH/DELETE /api/v1/admin/business-types/{id}`.
- Shops: `GET/POST /api/v1/shops` and `GET/PATCH/DELETE /api/v1/shops/{id}` with merchant scope.

## Remaining work

- PWA installability and service-worker behavior.
- Merchant module enablement and module-specific settings.
- Audit-event visibility and browser-level integration tests.

## Validation

- Run `npm run lint` and `npm run build` for admin changes.
- Run backend `go test ./...` when admin work changes or depends on backend contracts.
