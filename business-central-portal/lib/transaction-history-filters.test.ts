import { describe, expect, it } from "vitest";
import { matchesTransactionFilters } from "./transaction-history-filters";
import type { TransactionHistoryEntry } from "./types";

const entry: TransactionHistoryEntry = {
  id: "order",
  event_type: "TRANSACTION",
  reference: "POS-102",
  occurred_at: "2026-10-10T23:30:00Z",
  status: "PENDING_PAYMENT",
  customer_name: "Alice",
  customer_phone: "091234567",
  product_name: "Coffee",
  amount: "1250",
  currency_code: "USD",
  payment_status: "UN_PAID",
  delivery_fee: "25",
  delivery_payment_status: "COMPLETE",
  paid_total: "500",
  outstanding_total: "775",
};
const context = { isMerchant: true, timezone: "Asia/Bangkok" };

describe("transaction history header filters", () => {
  it("combines all displayed columns using case-insensitive text and formatted money", () => {
    expect(
      matchesTransactionFilters(
        entry,
        {
          date: "Oct 11",
          reference: "pos-102",
          customer: "091234",
          products: "COFFEE",
          total: "1,250",
          payment: "un-paid",
          delivery: "complete",
          collected: "Outstanding: USD 775",
          status: "pending payment",
          actions: "view detail",
        },
        context,
      ),
    ).toBe(true);
    expect(matchesTransactionFilters(entry, { customer: "Alice", products: "Tea" }, context)).toBe(
      false,
    );
  });

  it("honors missing values, whitespace, staff actions and pending delivery projection", () => {
    expect(matchesTransactionFilters(entry, { reference: "   " }, context)).toBe(true);
    expect(matchesTransactionFilters(entry, { actions: "detail" }, { isMerchant: false })).toBe(
      false,
    );
    expect(matchesTransactionFilters(entry, { actions: "invoice" }, { isMerchant: false })).toBe(
      true,
    );
    expect(
      matchesTransactionFilters(
        entry,
        { delivery: "pending synchronization" },
        {
          ...context,
          deliveryPending: true,
        },
      ),
    ).toBe(true);
    expect(
      matchesTransactionFilters(
        {
          ...entry,
          customer_phone: undefined,
          paid_total: undefined,
          delivery_payment_status: undefined,
        },
        { customer: "no phone", collected: "—", delivery: "—" },
        context,
      ),
    ).toBe(true);
  });
});
