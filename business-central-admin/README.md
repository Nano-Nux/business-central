# Business Central Admin

Next.js progressive web application for the platform administrator.

## Responsibilities

- Manage merchant-scoped users and assign one or more roles.
- Manage merchant roles and their backend permission grants.
- Manage platform currency reference data.
- Manage shops within a selected merchant tenant.

The current admin navigation has no standalone merchant page. Merchant
creation is available from the Add User form when the Merchant role is
selected; existing merchants are also loaded as tenant selectors for users,
roles, and shops. The admin application does not own business rules or
persistence; it uses APIs from `business-central-backend`. Read the
repository-level `BUSINESS_CONTEXT.md` and `SYSTEM_MAP.md` before development.
