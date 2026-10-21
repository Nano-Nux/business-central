# Authorization Matrix

The backend enforces authorization. Client-side route and menu hiding improves usability but is never a security boundary.

## Actors

| Actor | Scope |
|---|---|
| Platform administrator | Cross-merchant administration through the admin application |
| Merchant owner | Full operational access within an assigned merchant, subject to platform rules |
| Manager | Operational access granted by merchant roles and permissions |
| Staff | Limited operational access granted by merchant roles and permissions |
| Customer/guest | Public or explicitly authorized customer actions only |

## Permission format

Use stable permission codes grouped by domain, for example:

```text
merchant.read
merchant.update
merchant.modules.manage
users.manage
orders.create
orders.refund
inventory.adjust
service.manage
repair.manage
repair.approve
reports.read
ai.chat
```

The current portal uses the implemented baseline codes `tenant.read`, `tenant.write`, `membership.manage`, `rbac.manage`, and `ai.chat`. More granular domain codes remain a future compatibility-preserving extension.

## Baseline matrix

| Capability | Platform admin | Owner | Manager | Staff |
|---|---:|---:|---:|---:|
| Create/update merchants | Yes | No | No | No |
| Enable merchant modules | Yes | No | No | No |
| Enable AI Assistant for merchant (`ai_assistant_enabled`) | Yes | No | No | No |
| Set/reset merchant AI usage limit (`ai_usage_limit`, `ai_usage_count`) | Yes | No | No | No |
| Access Nanonux AI Assistant (`ai.chat`) | No | Yes | Configurable through `ai.chat` | Configurable through `ai.chat` (default off) |
| AI Chat: View profit & original purchase price | No | Yes | Yes (if owner/merchant role) | Strictly Forbidden (deterministic SQL block & prompt scrub) |
| Manage merchant users | Authorized platform operation | Yes | Configurable | No |
| Manage products | No | Yes | Configurable | Configurable |
| Operate POS | No | Yes | Yes | Configurable |
| Manage inventory | No | Yes | Configurable | Configurable |
| Receive or reduce stock in Storage (including queued receipts) | No | Yes | No | No |
| Set pack conversion ratios | No | Yes | No | No |
| Break packs at an assigned shop | No | Yes | Configurable through `tenant.write` | Yes when `tenant.write` is assigned |
| Manage service orders | No | Yes | Configurable | Configurable |
| Manage repair orders | No | Yes | Configurable | Configurable |
| Manage merchant payment types | No | Yes | Configurable through `membership.manage` | No |
| Edit customer, delivery, repair intake, and repair billing records | No | Yes | No | No |
| Approve repair estimates | No | Yes | Configurable | Configurable |
| Refund payments | No | Yes | Configurable | Usually no |

## Enforcement rules

- Storage modification and direct stock receiving require an active system `merchant` or `owner` role. `tenant.write` or legacy `stock_in` alone never grants these actions. Receipt synchronization applies the same role and location/shop checks; nonmerchant Storage responses omit original price and profit. The portal has no staff stock-in permission switch.

- Shared Telegram webhook status and registration (`GET/POST /api/v1/admin/telegram/webhook`) require `claims.PlatformAdmin`; merchant permissions do not grant access. Registration applies to the shared bot across all merchants, while group/order operations retain their existing tenant scope.
- Tenant Telegram pairing-code creation and rotation, order Confirm/Cancel, and automatic-confirmation setting require both `tenant.write` and the system `merchant` or `owner` role. Staff with `tenant.write` may still review groups and orders but cannot perform those actions. Platform-admin Telegram routes retain their platform-admin authorization.

- Every permission check must include merchant scope.
- Module permissions are ineffective when the merchant module is disabled.
- A user must have an active identity, active membership, and applicable role assignment.
- Staff memberships require exactly one active `shop_id`; POS, inventory locations/receipts, repairs, invoices, and reports are constrained to that shop by backend queries.
- AI Assistant enforces strict staff confidentiality boundaries: staff members are never permitted to view, calculate, estimate, or query business profit, margins, original purchase prices, or cost of goods sold. Queries containing disallowed tokens are deterministically blocked by the backend SQL validator before hitting the database, conversational system prompts omit confidential cost schemas, and executed SQL queries are omitted from responses.
- AI Assistant enforces per-merchant query usage limits (`ai_usage_limit`, default 50). Only platform administrators may configure the limit or reset the count (`ai_usage_count`); tenant users cannot alter their own limit or count. Requests exceeding the limit are blocked with HTTP 403 `AI_USAGE_LIMIT_EXCEEDED`.
- Customer, delivery-option, and repair-ticket intake edits require the system `owner` or `merchant` role; generic tenant write permission is not sufficient.
- Merchant and shop settings require `membership.manage`; hiding routes in the portal is not the security boundary.
- Sensitive operations such as refunds, inventory adjustments, repair approvals, and module changes require audit events.
- Portal and mobile must consume the same permission results and feature flags.

- POS delivery collection/reversal requires the system merchant/owner role plus
  `tenant.write`, merchant scope, and assigned-shop scope. The Deliveries shop
  default uses existing shop-settings synchronization (`tenant.write`); direct
  shop settings retain their existing permissions. See [delivery payment](DELIVERY_PAYMENT.md).

Transaction correction (`PATCH`/`DELETE /pos/orders/:orderId`) requires a
merchant or owner role plus `tenant.write`. Merchant and selected-shop scope,
optimistic version and idempotency are enforced by the backend; permanent ledger
purge additionally validates owner membership in PostgreSQL. The SQLite bridge
checks active local membership, owner role, permission and assigned-shop scope.
Staff do not receive transaction detail edit/delete controls.


## AI data-read policy

`ai.chat` and merchant enablement remain required. Every AI chat is constrained to one accessible, active shop and its current authenticated membership; owner prompts cannot widen that scope. Merchant/owner roles and platform administrators may use financial datasets, while other roles retain existing cost/profit restrictions. Employee identities/contacts, credentials, tokens, roles and arbitrary configuration/payload data are excluded for everyone. Approved customers and delivery contacts are permitted within shop relationships. See [AI security policy](AI_CHAT_SECURITY.md).

## Platform receptionist

Public visitors can start a conversation and access only that conversation using its random, unexpired bearer capability; this never grants merchant access. Only authenticated platform administrators may list/read all public transcripts and bookings or change knowledge, schedule, quotas and Google connection. Merchant owners, managers and staff are forbidden from `/admin/receptionist/*`, regardless of merchant selection. The model can only request availability; visitor confirmation is required for event creation.
