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
```

The current portal uses the implemented baseline codes `tenant.read`, `tenant.write`, `membership.manage`, and `rbac.manage`. More granular domain codes remain a future compatibility-preserving extension.

## Baseline matrix

| Capability | Platform admin | Owner | Manager | Staff |
|---|---:|---:|---:|---:|
| Create/update merchants | Yes | No | No | No |
| Enable merchant modules | Yes | No | No | No |
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
- Customer, delivery-option, and repair-ticket intake edits require the system `owner` or `merchant` role; generic tenant write permission is not sufficient.
- Merchant and shop settings require `membership.manage`; hiding routes in the portal is not the security boundary.
- Sensitive operations such as refunds, inventory adjustments, repair approvals, and module changes require audit events.
- Portal and mobile must consume the same permission results and feature flags.
