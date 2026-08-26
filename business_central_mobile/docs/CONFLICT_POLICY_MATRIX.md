# Conflict policy matrix

No operational mobile mutation is marked sync-safe until its backend command,
idempotency behavior, and conflict result are paired with a local policy.

| Entity/operation | Temporary-offline ONLINE | FULLY_OFFLINE | Rationale |
|---|---|---|---|
| Identity/session | No password or refresh upload while disconnected | Local Argon2id owner credential | Credentials and rotating tokens must not be queued |
| Permissions/modules | Disabled | Local owner setup only | Authorization cannot use silent client-wins |
| Product/catalog | Read cache only | Pending local service | Backend validation and uniqueness need pairing |
| Inventory receipt/checkout | Disabled | Enabled as a local FIFO ledger with immutable movement rows | Stock availability and cost layers are standalone until a backend reconciliation policy exists |
| Order/payment/refund | Disabled for financial capture | Enabled for exact local order/payment/refund records; external capture is disabled | No silent financial reconciliation or external payment claim |
| Repair approval/status/payment | Disabled | Enabled for local aggregate records, balance-checked payments/refunds, and lifecycle transitions | Lifecycle and payment relationships remain local-only until canonical reconciliation exists |
| Settings | Read cache only | Local settings foundation | Scope and audit rules still need feature pairing |
| Local audit events | Not uploaded unless a safe policy exists | Append-only local events | Future sync must preserve event identity/order and never mutate or delete history |

Rejected and conflicted operations must remain visible in the queue when sync is
implemented. Permanent validation or authorization failures must not retry
forever.
