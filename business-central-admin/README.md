# Business Central Admin

Next.js progressive web application for the platform administrator.

## Responsibilities

- Manage merchant-scoped users and assign one or more roles.
- Manage merchant roles and their backend permission grants.
- Manage platform currency reference data.
- Manage shops within a selected merchant tenant.
- Register the shared Telegram bot webhook and inspect delivery status at `/telegram-groups`. Platform administrators enter the deployed backend's public HTTPS webhook URL; the backend keeps the bot token and webhook secret private.

The current admin navigation has no standalone merchant page. Merchant
creation is available from the Add User form when the Merchant role is
selected; existing merchants are also loaded as tenant selectors for users,
roles, and shops. The admin application does not own business rules or
persistence; it uses APIs from `business-central-backend`. Read the
repository-level `BUSINESS_CONTEXT.md` and `SYSTEM_MAP.md` before development.

New Merchant users default to POS Nano. The POS complexity selector also retains Mini, Simple and Complex; editing an existing merchant preserves its stored selection.

## Public receptionist

`/receptionist` is platform-admin-only and provides paginated public chat history, full transcripts with linked appointments, all bookings with status filtering and detail views, approved support knowledge, scheduling/quota settings and Google Calendar connect/disconnect. Configure backend credentials using the [receptionist setup guide](../business-central-backend/internal/receptionist/README.md); the browser never receives provider credentials. Booking status reflects creation outcome, not external Google edits.
