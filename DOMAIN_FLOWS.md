# Domain Flows

These are shared business workflows. Client implementations must preserve the same states and outcomes.

## Authentication and authorization

```text
User authenticates
→ backend resolves identity and merchant membership
→ backend resolves roles and permissions
→ client loads enabled merchant modules
→ client shows only permitted features and views
```

The backend remains authoritative; hiding a view in a client is not a security boundary.

## POS and order flow

Telegram sellers can create one order with an optional customer name and several
products in a single message. Send `/takeorder`, an optional `customer=<name>`
line, then one product per line using `[name] quantity=<positive number> [SKU]`.
Each order links a new guest in the shared customer table and preserves the
optional name on the order. Missing names remain blank/null; the source label
`Online-Telegram-Customer` is metadata, not a customer name. Duplicate names are
allowed and are not merged. Every item is resolved and priced within the connected
merchant; repeated variants are combined. All stock checks, reservations, and
order writes succeed together or none commit. One administrator action confirms
or cancels the entire draft. Its invoice is Pending initially; confirmation
acknowledges payment and atomically captures the full amount, making it Paid.
Cancellation/expiry void pending payment and remove the Telegram invoice from
the invoice list. Expiry releases all lines. Bot and web review show
the same customer, items, total, and status.

```text
Select customer or guest
→ select products/variants
→ create or update order
→ calculate totals
→ take payment
→ confirm order
→ create inventory consumption/fulfillment work
→ fulfill order
```

Cancellation and refund rules follow the canonical order lifecycle in `ARCHITECTURE.md`.

## Purchasing and inventory

```text
Purchase order
→ goods receipt
→ receipt inventory movement
→ FIFO cost layer
→ inventory balance
```

Transfers, sales, returns, and reversals must use immutable inventory movements and preserve traceability.

## Repair service flow

A repair ticket is one service-order aggregate. It may contain one or more
repeatable work items; each work item owns the device/subject and its issue,
while ticket-level billing and payment remain shared until allocation rules are
introduced.
Diagnostics, parts, images, approvals, and warranties may target a specific
work item or remain associated with the ticket as a whole.

Device intake records waiting time by either calendar-day count or selected end
date. The device waiting start is automatic. Ticket reads and invoices derive
the overall waiting period from the earliest device start and latest device end;
users never maintain separate ticket-level waiting dates.

Work-item status changes derive the parent repair lifecycle: untouched items
keep the ticket in `RECEIVED`, active or mixed progress moves it to
`IN_PROGRESS`, and all work items completed moves it to `READY_FOR_PICKUP`.
Explicit terminal parent states (`COMPLETED` or `REFUNDED`) are preserved.
Printing is a read-only ticket projection and does not require payment or
completion.

```text
Create canonical order with channel SERVICE
→ create service order linked to the order
  → create backend-priced service_order_items for billable services/products
  → create repair order linked one-to-one to the service order
  → register one work item/device and issue for each serviced subject
  → move from Received to In progress
  → consume or return parts
  → mark Ready for pickup
  → mark Complete and closed after final payment, or Refund after a refund
→ bill through service_order_billings
→ capture payment through orders → payments
→ issue refunds through orders → payments → refunds
```

`repair_orders` does not receive a direct payment foreign key because one repair may have multiple payments and refunds. The canonical relationship is `repair_orders → service_orders → orders → payments/refunds`.

Initial intake is one aggregate command: `POST /api/v1/repairs/tickets` creates
the device, canonical and service orders, repair record, independently
quantified initial parts, optional payment, and images in one idempotent
database transaction. The child endpoints are for changes made after intake;
they are not the initial ticket-creation workflow.

An inventory-backed repair part enters the ticket as `USED`. Saving it confirms
the linked canonical service order and posts its immutable stock-out movement
and FIFO cost allocation in the same transaction. Stock consumption therefore
does not wait for deposit or final payment. The payment lifecycle remains
independent, and its fulfillment step must not create a duplicate movement for
an already-consumed repair part.

## Shop-scoped reporting and transaction history

Each repair device work item may record up to 20 issues and 20 optional
condition notes. Empty conditions are omitted from previews and printed output.
A merchant manages separate ISSUE and CONDITION preset lists per shop;
selecting a preset copies its text into the ticket so later preset edits do not
rewrite history.

```text
Select one shop in the merchant workspace
→ backend resolves the selected shop plus the membership's allowed shop scope
→ Financial Reports aggregates canonical orders/refunds/FIFO costs for every channel at that shop
→ Transaction History lists stock events, all-channel orders, refunds, and repair deposit/final checkout payments at that shop
```

Financial Reports and Transaction History are separate reads. The former is an
aggregate financial analysis; the latter is a chronological operational audit
feed and must not be replaced by the stock movement ledger.

## Mobile online-mode temporary offline flow

```text
Backend schema/version available
→ app mode is ONLINE
→ local SQLite schema mirrors required backend tables
→ connectivity unavailable
→ mobile reads local data and records local operations
→ no backend request is attempted
→ connectivity returns
→ queued operations synchronize idempotently
→ conflicts are resolved according to sync policy
→ local state is reconciled with backend state
```

## Mobile fully offline flow

```text
App mode is FULLY_OFFLINE from .env
→ backend client is disabled
→ no internet connection is required
→ no authentication refresh, API, upload, analytics, or sync request is attempted
→ app reads and writes local SQLite only
```

`FULLY_OFFLINE` is a deployment/runtime mode, not a temporary connectivity state. It must not transition into synchronization automatically.

Telegram automatic confirmation is saved per group as
`telegram_group_connections.auto_confirm_orders` (BOOLEAN NOT NULL DEFAULT FALSE).
Migration `0051_telegram_auto_confirm` defaults existing groups to OFF; it never
processes existing drafts. `telegram_order_sources.auto_confirmed` records how
an order was confirmed, independent of later setting changes.

When ON, new valid orders are created and confirmed in one database transaction,
using the same payment capture, accounting, and stock-sale logic as manual
confirmation. Successful orders are Confirmed/Paid; their receipts have no manual
action buttons. Any creation/confirmation failure rolls back the entire new order
and returns the error. Failed orders are never automatically retried; sellers
must correct the issue and send a new command. The existing outbox retries only
receipt delivery for successfully committed orders, never the commerce operation.
Turning OFF restores manual confirmation for subsequent orders. Existing pending
orders remain pending, and already confirmed orders remain confirmed.
