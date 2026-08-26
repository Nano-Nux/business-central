# Security

## Tenant isolation

Every merchant-owned operation must enforce `merchant_id` scope. Authorization must be performed in the backend even when the client hides unavailable features.

## Identity and access

- Credentials belong only to `user_identities`.
- Memberships connect identities to merchants.
- Roles and permissions determine access.
- Platform-admin access must use the designated secure backend path.
- Sensitive actions require audit events.

## Sensitive data

- Do not log passwords, tokens, payment credentials, provider secrets, or sensitive customer data.
- Store provider credentials through secret references rather than arbitrary JSON values.
- Minimize sensitive data copied to mobile SQLite and define local data deletion/logout behavior.

## API security

- Validate authentication, merchant scope, permissions, input shape, and ownership on every command.
- Use request IDs and structured audit records.
- Apply rate limiting and lockout controls to authentication and sensitive endpoints.
- Protect idempotency records from cross-merchant reuse.

## Mobile mode security

Offline data must be protected by the mobile platform where appropriate. For `ONLINE` mode, define local encryption, device logout, lost-device handling, queued-operation protection, and credential expiry. For `FULLY_OFFLINE` mode, define local encryption, device access control, local user/session policy, export controls, and lost-device handling; there is no backend logout or remote revocation path.
