"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { randomUuid } from "@/lib/random-uuid";
import { TransactionEditor } from "./transaction-editor";
import { invalidateTransactionResources } from "@/lib/offline-db";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import { normalizeDeliveryHistory, updateDeliveryPayment } from "@/lib/delivery-payment";
import { useOffline } from "@/lib/offline";
import { useShop } from "@/lib/shop";
import type { DeliveryPaymentStatus, TransactionHistoryDetail } from "@/lib/types";
import { useCachedQuery } from "@/lib/use-cached-query";
import { Button, EmptyState, Loading, PageHeader, StatusBadge, Modal } from "./ui";
import styles from "./transaction-detail-page.module.css";

export function TransactionDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteLock = useRef(false);
  const deleteKey = useRef(randomUuid());
  const { isMerchant, can } = useAuth();
  const { currentShop } = useShop();
  const offline = useOffline();
  const paymentLock = useRef(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const { data, reload, loading, error } = useCachedQuery<TransactionHistoryDetail>(
    `/transaction-history/${id}`,
    `transaction-history-detail:${id}`,
  );
  const detail = data ? normalizeDeliveryHistory(data) : undefined;

  if (!isMerchant)
    return (
      <EmptyState
        title="Access restricted"
        message="Only merchant administrators can view complete financial and FIFO cost details."
      />
    );
  if (loading) return <Loading />;
  if (error || !detail)
    return (
      <EmptyState
        title="Transaction not found"
        message={error || "This transaction is not available in the current shop."}
        action={
          <Button variant="secondary" onClick={() => void reload()}>
            Retry transaction
          </Button>
        }
      />
    );

  const { entry, order, lines, payments, refunds } = detail;
  const money = (value?: string) => formatMoney(value, order?.currency_code || entry.currency_code);
  const percent = (value: string) =>
    `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  const date = (value: string) => formatShopDateTime(value, currentShop?.timezone);
  const pendingCost = lines.some((line) => line.cost_posted === false);
  const deliveryComplete = order?.delivery_payment_status === "COMPLETE";
  const deliveryStatus = order?.delivery_payment_status ?? "UN_PAID";
  const hasDeliveryFee = Number(order?.shipping_total ?? 0) > 0;
  const closedOrder = order?.status === "CANCELLED" || order?.status === "REFUNDED";
  const refundPending = refunds.some(
    (refund) => !["SUCCEEDED", "FAILED", "CANCELLED"].includes(refund.status),
  );
  const shopMismatch = !!order?.shop_id && order.shop_id !== currentShop?.id;
  const paymentDisabled =
    paymentBusy ||
    deleteBusy ||
    editing ||
    !!detail.delivery_payment_pending ||
    closedOrder ||
    refundPending ||
    shopMismatch ||
    !can("tenant.write");

  async function changeDeliveryPayment(status: DeliveryPaymentStatus) {
    if (paymentLock.current || paymentDisabled || !detail) return;
    paymentLock.current = true;
    setPaymentBusy(true);
    setPaymentMessage("");
    setPaymentError("");
    try {
      const message = await updateDeliveryPayment(
        offline.scope,
        detail,
        status,
        `transaction-history-detail:${id}`,
      );
      await reload();
      setPaymentMessage(message);
    } catch (reason) {
      setPaymentError(
        reason instanceof Error ? reason.message : "Unable to update delivery payment.",
      );
    } finally {
      paymentLock.current = false;
      setPaymentBusy(false);
    }
  }

  const correctionDisabled =
    paymentBusy ||
    deleteBusy ||
    shopMismatch ||
    !!detail.delivery_payment_pending ||
    !can("tenant.write") ||
    !order?.updated_at;
  const correctionReason = shopMismatch
    ? "Select this transaction's shop to edit or delete it."
    : detail.delivery_payment_pending
      ? "Synchronize the pending delivery update before editing or deleting this transaction."
      : !can("tenant.write")
        ? "Editing and deleting transactions requires tenant.write permission."
        : !order?.updated_at
          ? "This transaction response is missing its update timestamp. Update or restart the backend, then refresh this transaction."
          : "";
  async function corrected() {
    if (offline.scope)
      await invalidateTransactionResources(offline.scope, id).catch(() => undefined);
    window.dispatchEvent(new Event("bc-resource-refresh"));
    await reload();
  }
  async function deleteTransaction() {
    if (deleteLock.current || correctionDisabled || !order) return;
    deleteLock.current = true;
    setDeleteBusy(true);
    setPaymentError("");
    try {
      await api(`/pos/orders/${id}`, {
        method: "DELETE",
        body: JSON.stringify({
          shop_id: currentShop?.id,
          expected_updated_at: order.updated_at,
          idempotency_key: deleteKey.current,
        }),
      });
      if (offline.scope)
        await invalidateTransactionResources(offline.scope, id).catch(() => undefined);
      window.dispatchEvent(new Event("bc-resource-refresh"));
      router.replace("/transaction-history");
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Unable to delete transaction.");
    } finally {
      deleteLock.current = false;
      setDeleteBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader
        title={entry.reference}
        description="Review the sale, check payments and manage delivery collection."
        action={
          <div className={styles.actions}>
            {order && ["POS", "TELEGRAM"].includes(order.channel) && (
              <>
                <Button
                  variant="secondary"
                  disabled={correctionDisabled}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  disabled={correctionDisabled}
                  onClick={() => {
                    setPaymentError("");
                    setDeleting(true);
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            <Link className="button button-secondary" href="/transaction-history">
              Back to history
            </Link>
          </div>
        }
      />
      {editing && (
        <TransactionEditor detail={detail} onClose={() => setEditing(false)} onSaved={corrected} />
      )}
      <Modal
        open={deleting}
        title="Permanently delete transaction"
        description={`Delete ${entry.reference}? This permanently removes its order, items, payments, refunds and transaction history, restores its stock, and removes it from invoices and reports. This cannot be undone. It does not issue a refund through a payment provider.`}
        onClose={() => {
          if (!deleteLock.current) setDeleting(false);
        }}
      >
        {paymentError && (
          <p className="form-error" role="alert">
            {paymentError}
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" disabled={deleteBusy} onClick={() => setDeleting(false)}>
            Keep transaction
          </Button>
          <Button variant="danger" disabled={deleteBusy} onClick={() => void deleteTransaction()}>
            {deleteBusy ? "Deleting transaction?" : "Permanently delete"}
          </Button>
        </div>
      </Modal>
      <div className={styles.context}>
        <StatusBadge status={order?.status || entry.status} />
        <span>{date(order?.placed_at || order?.created_at || entry.occurred_at)}</span>
        <span>{order?.shop_name || entry.shop_name || currentShop?.name}</span>
        <span>{order?.channel || entry.channel}</span>
      </div>
      {order && ["POS", "TELEGRAM"].includes(order.channel) && correctionReason && (
        <div className="notice" role="status">
          <p>{correctionReason}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Refresh transaction
          </Button>
        </div>
      )}
      {paymentMessage && (
        <p className="success-message" role="status">
          {paymentMessage}
        </p>
      )}
      {paymentError && (
        <p className="form-error" role="alert">
          {paymentError}
        </p>
      )}

      {order && (
        <section className={styles.summary} aria-label="Payment summary">
          <div className={`card ${styles.metric}`}>
            <span>Order total</span>
            <strong>{money(order.grand_total)}</strong>
            <small>Includes delivery fee</small>
          </div>
          <div className={`card ${styles.metric}`}>
            <span>Net collected</span>
            <strong>
              {order.paid_total !== undefined ? money(order.paid_total) : "Not recorded"}
            </strong>
            <small>
              {detail.delivery_payment_pending
                ? "Provisional until synchronized"
                : "After successful refunds"}
            </small>
          </div>
          <div className={`card ${styles.metric}`}>
            <span>Outstanding</span>
            <strong>
              {order.outstanding_total !== undefined
                ? money(order.outstanding_total)
                : "Not recorded"}
            </strong>
            <small>
              {detail.delivery_payment_pending
                ? "Provisional until synchronized"
                : "Amount still to collect"}
            </small>
          </div>
        </section>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={`card ${styles.panel}`}>
            <h2>Transaction information</h2>
            <dl className={styles.facts}>
              <div>
                <dt>Customer</dt>
                <dd>{order?.customer_name ?? entry.customer_name ?? ""}</dd>
              </div>
              {(order?.customer_phone || entry.customer_phone) && (
                <div>
                  <dt>Phone</dt>
                  <dd>{order?.customer_phone || entry.customer_phone}</dd>
                </div>
              )}
              <div>
                <dt>Payment type</dt>
                <dd>{order?.payment_type || entry.payment_method || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Activity</dt>
                <dd>{entry.event_type.replaceAll("_", " ").toLowerCase()}</dd>
              </div>
            </dl>
            {order?.note && (
              <div className={styles.note}>
                <span>Order note</span>
                <p>{order.note}</p>
              </div>
            )}
          </section>

          {order ? (
            <>
              <section className={`card ${styles.panel}`} aria-label="Order items">
                <div className={styles.sectionHead}>
                  <h2>Order items</h2>
                  <span>
                    {lines.length} {lines.length === 1 ? "item" : "items"}
                  </span>
                </div>
                {lines.length === 0 ? (
                  <p className={styles.muted}>No item details recorded.</p>
                ) : (
                  <ul className={styles.items}>
                    {lines.map((line) => (
                      <li key={line.id} className={styles.item}>
                        <div className={styles.itemHead}>
                          <div>
                            <strong>{line.product_name || line.description}</strong>
                            {line.product_name && line.description !== line.product_name && (
                              <span>{line.description}</span>
                            )}
                            {line.variant_name && <span>{line.variant_name}</span>}
                            {line.sku && <small>SKU: {line.sku}</small>}
                          </div>
                          <strong>{money(line.line_total)}</strong>
                        </div>
                        <div className={styles.itemAmounts}>
                          <span>
                            {formatQuantity(line.quantity)} × {money(line.unit_price)}
                          </span>
                          {Number(line.discount_amount) !== 0 && (
                            <span>Discount: {money(line.discount_amount)}</span>
                          )}
                          {Number(line.tax_amount) !== 0 && (
                            <span>Tax: {money(line.tax_amount)}</span>
                          )}
                        </div>
                        {line.cost_posted === false && (
                          <StatusBadge status="PENDING" label="Pending fulfillment" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className={`card ${styles.panel}`}>
                <h2>Order totals</h2>
                <dl className={styles.rows}>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(order.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Discount</dt>
                    <dd>{money(order.discount_total)}</dd>
                  </div>
                  <div>
                    <dt>Tax</dt>
                    <dd>{money(order.tax_total)}</dd>
                  </div>
                  <div>
                    <dt>Delivery fee</dt>
                    <dd>{money(order.shipping_total)}</dd>
                  </div>
                  <div className={styles.total}>
                    <dt>Grand total</dt>
                    <dd>{money(order.grand_total)}</dd>
                  </div>
                </dl>
              </section>
              <section className={`card ${styles.panel}`}>
                <h2>Cost and profit</h2>
                {pendingCost && (
                  <p className="notice">Inventory cost and profit are not final yet.</p>
                )}
                <dl className={styles.facts}>
                  <div>
                    <dt>Original cost</dt>
                    <dd>
                      {pendingCost ? (
                        <StatusBadge status="PENDING" label="Pending fulfillment" />
                      ) : (
                        money(detail.total_cost)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Gross profit</dt>
                    <dd>{pendingCost ? "Not final" : money(detail.gross_profit)}</dd>
                  </div>
                  <div>
                    <dt>Gross margin</dt>
                    <dd>{pendingCost ? "Not final" : percent(detail.gross_margin)}</dd>
                  </div>
                </dl>
                {pendingCost && (
                  <p className={styles.muted}>
                    FIFO cost is posted when the order is fulfilled. Pending items have not been
                    deducted from stock.
                  </p>
                )}
                {lines.length > 0 && (
                  <details className={styles.disclosure}>
                    <summary>Item cost breakdown</summary>
                    <ul className={styles.records}>
                      {lines.map((line) => (
                        <li key={line.id}>
                          <strong>
                            {line.product_name || line.description}
                            {line.variant_name ? ` · ${line.variant_name}` : ""}
                          </strong>
                          <dl className={styles.rows}>
                            <div>
                              <dt>Original unit cost</dt>
                              <dd>
                                {line.cost_posted === false
                                  ? "Pending fulfillment"
                                  : money(line.original_unit_cost)}
                              </dd>
                            </div>
                            <div>
                              <dt>Original cost</dt>
                              <dd>
                                {line.cost_posted === false
                                  ? "Pending fulfillment"
                                  : money(line.original_cost)}
                              </dd>
                            </div>
                            <div>
                              <dt>Gross profit</dt>
                              <dd>
                                {line.cost_posted === false
                                  ? "Not final"
                                  : money(line.gross_profit)}
                              </dd>
                            </div>
                            <div>
                              <dt>Gross margin</dt>
                              <dd>
                                {line.cost_posted === false
                                  ? "Not final"
                                  : percent(line.gross_margin)}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            </>
          ) : (
            <section className={`card ${styles.panel}`}>
              <h2>Activity details</h2>
              <p>{entry.details || "This stock event is not linked to a checkout order."}</p>
              <dl className={styles.facts}>
                {entry.product_name && (
                  <div>
                    <dt>Product</dt>
                    <dd>{entry.product_name}</dd>
                  </div>
                )}
                {entry.variant_name && (
                  <div>
                    <dt>Sellable option</dt>
                    <dd>{entry.variant_name}</dd>
                  </div>
                )}
                {entry.quantity !== undefined && (
                  <div>
                    <dt>Quantity</dt>
                    <dd>{formatQuantity(entry.quantity)}</dd>
                  </div>
                )}
                {entry.amount !== undefined && (
                  <div>
                    <dt>Amount</dt>
                    <dd>{money(entry.amount)}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </div>

        {order && (
          <div className={styles.side}>
            {order.channel === "POS" && (
              <section
                className={`card ${styles.panel} ${styles.delivery}`}
                aria-label="Delivery payment"
              >
                <div className={styles.sectionHead}>
                  <h2>Delivery payment</h2>
                  <StatusBadge
                    status={deliveryStatus}
                    label={deliveryComplete ? "Complete" : "Un-paid"}
                  />
                </div>
                <dl className={styles.rows}>
                  <div>
                    <dt>Delivery fee</dt>
                    <dd>{money(order.shipping_total)}</dd>
                  </div>
                  {order.delivery_name && (
                    <div>
                      <dt>Delivery service</dt>
                      <dd>{order.delivery_name}</dd>
                    </div>
                  )}
                  {order.delivery_contact && (
                    <div>
                      <dt>Contact</dt>
                      <dd>{order.delivery_contact}</dd>
                    </div>
                  )}
                </dl>
                {hasDeliveryFee ? (
                  <>
                    <p className={styles.muted}>
                      {deliveryComplete
                        ? "The delivery fee is marked complete. Reopening payment reverses its collection."
                        : "The delivery fee is separate from merchandise payment. Mark it complete when collected."}
                    </p>
                    <Button
                      variant={deliveryComplete ? "secondary" : "primary"}
                      disabled={paymentDisabled}
                      onClick={() =>
                        void changeDeliveryPayment(deliveryComplete ? "UN_PAID" : "COMPLETE")
                      }
                    >
                      {paymentBusy
                        ? "Updating delivery payment…"
                        : deliveryComplete
                          ? "Mark un-paid · reverse delivery collection"
                          : "Complete delivery payment"}
                    </Button>
                  </>
                ) : (
                  <p className={styles.muted}>No delivery fee on this sale.</p>
                )}
                {detail.delivery_payment_pending && (
                  <p className="notice" role="status">
                    Delivery collection totals are provisional until this change synchronizes.
                    Synchronize before changing it again.
                  </p>
                )}
                {closedOrder && (
                  <p className={styles.muted}>
                    Delivery payment cannot be changed on a cancelled or refunded sale.
                  </p>
                )}
                {refundPending && (
                  <p className={styles.muted}>
                    Wait for the pending refund before changing delivery payment.
                  </p>
                )}
                {shopMismatch && (
                  <p className={styles.muted}>
                    Select this transaction’s shop to change its delivery payment.
                  </p>
                )}
              </section>
            )}
            <section className={`card ${styles.panel}`}>
              <h2>Payments</h2>
              {order.payment_status && (
                <div className={styles.sectionHead}>
                  <span>{order.channel === "POS" ? "Merchandise payment" : "Payment status"}</span>
                  <StatusBadge status={order.payment_status} />
                </div>
              )}
              {payments.length === 0 ? (
                <p className={styles.muted}>No payment was recorded.</p>
              ) : (
                <details className={styles.disclosure}>
                  <summary>Payment records ({payments.length})</summary>
                  <ul className={styles.records}>
                    {payments.map((payment) => (
                      <li key={payment.id}>
                        <div className={styles.sectionHead}>
                          <strong>{payment.method}</strong>
                          <StatusBadge status={payment.status} />
                        </div>
                        <div className={styles.sectionHead}>
                          <span>
                            {payment.purpose === "DELIVERY"
                              ? "Delivery collection"
                              : "Order payment"}
                          </span>
                          <strong>{money(payment.amount)}</strong>
                        </div>
                        <small>{date(payment.captured_at || payment.created_at)}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            {refunds.length > 0 && (
              <section className={`card ${styles.panel}`}>
                <h2>Refunds</h2>
                <ul className={styles.records}>
                  {refunds.map((refund) => (
                    <li key={refund.id}>
                      <div className={styles.sectionHead}>
                        <StatusBadge status={refund.status} />
                        <strong>{money(refund.amount)}</strong>
                      </div>
                      <p>{refund.reason || "No reason recorded"}</p>
                      <small>{date(refund.created_at)}</small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
