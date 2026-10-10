import { patch, NetworkUnavailableError } from "./api";
import { queueDeferredMutation } from "./offline-deferred";
import { putCachedResource, type OfflineScope } from "./offline-db";
import { randomUuid } from "./random-uuid";
import type { DeliveryPaymentStatus, TransactionHistoryDetail } from "./types";

// Older saved detail responses predate the separate delivery field. Their POS
// fees were collected with the original payment; recover the saved totals from
// those immutable receipts instead of treating an already-paid fee as unpaid.
export function normalizeDeliveryHistory(
  detail: TransactionHistoryDetail,
): TransactionHistoryDetail {
  const order = detail.order;
  if (!order || order.channel !== "POS" || order.delivery_payment_status) return detail;
  const paid =
    detail.payments
      .filter((payment) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status))
      .reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0) -
    detail.refunds
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce((sum, refund) => sum + Math.round(Number(refund.amount) * 100), 0);
  const financial = {
    delivery_payment_status: "COMPLETE" as const,
    delivery_fee: order.shipping_total,
    paid_total: (paid / 100).toFixed(2),
    outstanding_total: ((Math.round(Number(order.grand_total) * 100) - paid) / 100).toFixed(2),
    payment_status:
      paid >= Math.round((Number(order.grand_total) - Number(order.shipping_total)) * 100)
        ? "COMPLETE"
        : "UN_PAID",
  };
  return { ...detail, entry: { ...detail.entry, ...financial }, order: { ...order, ...financial } };
}

export async function updateDeliveryPayment(
  scope: OfflineScope | null,
  detail: TransactionHistoryDetail,
  status: DeliveryPaymentStatus,
  cacheKey: string,
) {
  detail = normalizeDeliveryHistory(detail);
  const order = detail.order;
  if (!order) throw new Error("An order is required.");
  if (detail.delivery_payment_pending)
    throw new Error("Synchronize the pending delivery change before editing again.");
  const body = {
    delivery_payment_status: status,
    expected_status: order.delivery_payment_status,
    idempotency_key: randomUuid(),
  };
  const path = `/pos/orders/${order.id}/delivery-payment`;
  try {
    await patch(path, body);
    return "Delivery payment updated.";
  } catch (error) {
    if (!(error instanceof NetworkUnavailableError) || !scope) throw error;
    const fee = Math.round(Number(order.shipping_total) * 100);
    const deliveryReceipts = detail.payments.filter((payment) => payment.purpose === "DELIVERY");
    const netDelivery = deliveryReceipts.reduce((sum, payment) => {
      const captured = ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)
        ? Math.round(Number(payment.amount) * 100)
        : 0;
      const refunded = detail.refunds
        .filter((refund) => refund.payment_id === payment.id && refund.status === "SUCCEEDED")
        .reduce((amount, refund) => amount + Math.round(Number(refund.amount) * 100), 0);
      return sum + captured - refunded;
    }, 0);
    const adjustment =
      status === order.delivery_payment_status
        ? 0
        : status === "COMPLETE"
          ? Math.max(0, fee - netDelivery)
          : -(deliveryReceipts.length ? netDelivery : fee);
    const paid = Math.round(Number(order.paid_total) * 100) + adjustment;
    const projection = {
      ...detail,
      delivery_payment_pending: true,
      entry: {
        ...detail.entry,
        delivery_payment_status: status,
        paid_total: (paid / 100).toFixed(2),
        outstanding_total: ((Math.round(Number(order.grand_total) * 100) - paid) / 100).toFixed(2),
      },
      order: {
        ...order,
        delivery_payment_status: status,
        paid_total: (paid / 100).toFixed(2),
        outstanding_total: ((Math.round(Number(order.grand_total) * 100) - paid) / 100).toFixed(2),
      },
    };
    await queueDeferredMutation(
      scope,
      {
        shopId: order.shop_id,
        entityType: "DELIVERY_PAYMENT",
        entityId: order.id,
        operationType: "UPDATE",
        request: { path, method: "PATCH", body },
      },
      projection,
    );
    await putCachedResource(scope, cacheKey, projection);
    return "Delivery payment change saved locally; collection totals are provisional until synchronization.";
  }
}
