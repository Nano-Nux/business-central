# Independent POS delivery payment

NANO, MINI, SIMPLE and COMPLEX share the same workflow and financial rules.
The design reference is the portal's Deliveries switch, POS Add more detail form,
Transaction History table, and View detail controls. Mobile embeds these screens.

## Workflow and permissions

At the top of Deliveries, the shop switch saves
`delivery_payment_status_auto_complete`. Its default is false. ON forces
`COMPLETE` for new checkouts; OFF defaults to `UN_PAID`, with an explicit choice
in Add more detail. Changing the switch does not modify previous sales.
Manual delivery charges do not require a named delivery option.

Transaction History displays merchandise payment, delivery charge/payment,
net collected and outstanding. Only View detail can collect or reopen delivery
payment. This action requires the system merchant/owner role and `tenant.write`,
with merchant and assigned-shop scope. Shop preference synchronization uses the
existing `SHOP_SETTINGS` update permission (`tenant.write`) and shop isolation;
the direct shop-settings API retains its existing permission requirements.

## Money and lifecycle

`orders.shipping_total` and grand total always include the fee. Delivery payment
is independent of merchandise payment. The initial merchandise receipt excludes
the fee; an upfront delivery receipt has `payments.purpose=DELIVERY`.
Completing later captures only the delivery amount still owed. Marking un-paid
appends refunds for the collected delivery receipts. Legacy combined receipts
can reverse their fee when the original full payment remains available.
The ledger retains every capture and reversal. Pending refunds must settle before
another delivery change. Cancelled/refunded sales cannot collect delivery fees.

Example: merchandise after discounts and tax is 99, fee is 7, grand total is 106.
UN_PAID records collected 99 and outstanding 7. COMPLETE records collected 106
and outstanding 0. Reopening collection returns these figures to 99 and 7.
A partial delivery refund of 2 is replenished by 2, without collecting 7 again.
Prices, discounts, tax, stock, FIFO cost and gross profit do not change.

`PATCH /api/v1/pos/orders/{orderId}/delivery-payment` accepts
`delivery_payment_status`, `expected_status`, and a unique `idempotency_key`
(maximum 240 characters). Atomic order locks, expected-state checks, receipt
purpose, audit events and canonical ORDER synchronization prevent duplicate or
stale financial writes. Repeating the same request returns the stored result.

## Migration and offline operation

Backend migration `0054_delivery_payment_status` adds the shop flag (false),
order status, and receipt purpose. Historical orders retain COMPLETE and legacy
payments remain ORDER because delivery was previously captured with merchandise.
New order defaults are UN_PAID. Existing checkout contracts accept the optional
status field; old offline snapshots without it replay as COMPLETE.

Portal temporary-offline checkout snapshots fee, status and collection amount.
Replay requires review and rolls back the attempted sale if an updated shop
default changes delivery collection. Offline detail edits queue durable deferred
PATCH requests, show provisional balances, and block further edits until replay.
Expected-state conflicts require review rather than silently overwriting a change.

Mobile ONLINE uses canonical backend history and delivery updates, retaining the
existing temporary-offline checkout/synchronization path. FULLY_OFFLINE uses
Drift SQLite through the native bridge for checkout, shop preferences, transaction
history and delivery edits. It makes no backend API calls and does not enqueue
checkout synchronization. SQLite schema 28 preserves historical COMPLETE status,
infers legacy fees from totals, and stores receipt purpose. Backups round-trip
these fields and shop preferences; schema-27 backups remain supported. External
payment authorization stays pending offline.

## Acceptance evidence

- Backend: `internal/pos/domain/delivery_payment_test.go`, HTTP delivery-payment
  permission tests, and isolated PostgreSQL delivery payment/migration tests.
  All four modes cover balances, concurrency, repeated reversal/recollection,
  partial refunds, shop defaults/isolation, and actual offline replay including
  legacy snapshots and changed-default rollback.
- Portal: `e2e/delivery-payment.spec.ts` exercises all four modes and the switch,
  details form, history visibility and detail-only edits. Offline checkout,
  delivery-update and native-routing unit tests cover durable projections and
  FULLY_OFFLINE backend suppression.
- Mobile: native database bridge, schema migration and backup tests verify the
  same status/collection transitions, scope, idempotency and stored preferences.
  The operational UI is the shared portal bundle, with no separate Flutter screen.

## Transaction detail presentation

All four POS modes share the same responsive transaction detail screen. Order
total, net collected and outstanding appear first. The Delivery payment card
appears beside transaction information on desktop and before it on mobile.
It shows the delivery fee even without a named delivery service and offers
Complete delivery payment or Mark un-paid (reverse delivery collection).
Pending synchronization, pending refunds and cancelled/refunded orders disable
changes with an explanation. The selected shop must match the order's shop.
The existing merchant-only visibility, backend permission checks, expected-state
updates, offline projection and native FULLY_OFFLINE bridge remain authoritative.
Sales without a delivery fee show a clear no-fee message.

Items show quantity, unit price, discount/tax when present and line total.
Cost/profit information and expandable item cost and payment records preserve
the full financial detail without a wide table. Pending FIFO costs are never
presented as final profit. Missing customer names remain blank.

Browser acceptance: `e2e/transaction-detail.spec.ts` covers all four modes at
desktop and phone widths, collection/reversal, error recovery, zero fees,
merchant-only access, selected-shop checks and pending synchronization/refunds.
`e2e/pending-transaction-cost.spec.ts` checks pending cost presentation.
The existing `e2e/delivery-payment.spec.ts` retains end-to-end checkout coverage.
