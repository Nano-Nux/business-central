import { formatMoney } from "./currency";
import { formatShopDateTime } from "./date-time";
import type { TransactionHistoryEntry } from "./types";

export const transactionColumns = [
  { key: "date", label: "Date & time" },
  { key: "reference", label: "Reference" },
  { key: "customer", label: "Customer" },
  { key: "products", label: "Products" },
  { key: "total", label: "Order total" },
  { key: "payment", label: "Payment status" },
  { key: "delivery", label: "Delivery fee / payment" },
  { key: "collected", label: "Collected / outstanding" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
] as const;

export type TransactionColumn = (typeof transactionColumns)[number]["key"];
export type TransactionColumnFilters = Partial<Record<TransactionColumn, string>>;

function paymentLabel(status?: string) {
  if (status === "UN_PAID") return "Un-paid";
  if (status === "COMPLETE") return "Complete";
  return status?.replaceAll("_", " ") || "Unknown";
}

export function matchesTransactionFilters(
  item: TransactionHistoryEntry,
  filters: TransactionColumnFilters,
  context: { currency?: string; timezone?: string; isMerchant: boolean; deliveryPending?: boolean },
) {
  const money = (value?: string) => formatMoney(value, item.currency_code || context.currency);
  const values: Record<TransactionColumn, string> = {
    date: formatShopDateTime(item.occurred_at, context.timezone),
    reference: item.reference,
    customer: `${item.customer_name ?? ""} ${item.customer_phone || "No phone recorded"}`,
    products: item.product_name || "—",
    total: money(item.amount),
    payment: paymentLabel(item.payment_status || item.status),
    delivery: `${item.delivery_payment_status ? `${money(item.delivery_fee)} ${paymentLabel(item.delivery_payment_status)}` : "—"} ${context.deliveryPending ? "Delivery update pending synchronization" : ""}`,
    collected:
      item.paid_total !== undefined
        ? `${money(item.paid_total)} Outstanding: ${money(item.outstanding_total)}`
        : "—",
    status: item.status?.replaceAll("_", " ") || "Unknown",
    actions: context.isMerchant ? "View detail View invoice" : "View invoice",
  };
  return transactionColumns.every(({ key }) => {
    const query = filters[key]?.trim().toLocaleLowerCase() ?? "";
    const normalize = (value: string) => value.replaceAll(",", "").toLocaleLowerCase();
    return normalize(values[key]).includes(normalize(query));
  });
}
