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
| Manage service orders | No | Yes | Configurable | Configurable |
| Manage repair orders | No | Yes | Configurable | Configurable |
| Manage merchant payment types | No | Yes | Configurable through `membership.manage` | No |
| Edit customer, delivery, repair intake, and repair billing records | No | Yes | No | No |
| Approve repair estimates | No | Yes | Configurable | Configurable |
| Refund payments | No | Yes | Configurable | Usually no |

## Enforcement rules

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
