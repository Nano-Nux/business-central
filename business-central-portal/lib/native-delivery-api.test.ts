import { afterEach, describe, expect, it, vi } from "vitest";
import { api, patch } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("native delivery requests", () => {
  it("blocks backend requests before the FULLY_OFFLINE bridge attaches", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", { location: { search: "?bc_runtime_mode=FULLY_OFFLINE" } });
    await expect(api("/shops")).rejects.toThrow("FULLY_OFFLINE");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads and edits delivery history through SQLite without a backend request", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ data: { delivery_payment_status: "COMPLETE" }, meta: {} });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", {
      BusinessCentralRuntimeMode: "FULLY_OFFLINE",
      BusinessCentralNativeDatabase: { query, isAvailable: () => true },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "bc.session"
          ? JSON.stringify({
              user: {
                merchant_id: "merchant-a",
                membership_id: "owner-a",
                shop_id: "assigned-shop",
                roles: [{ code: "merchant", permission_codes: ["tenant.write"] }],
              },
            })
          : "another-shop",
    });
    await api("/transaction-history/order-a");
    await patch("/pos/orders/order-a/delivery-payment", {
      delivery_payment_status: "COMPLETE",
      expected_status: "UN_PAID",
      idempotency_key: "collect",
    });
    await api("/pos/orders/order-a", {
      method: "PATCH",
      body: JSON.stringify({
        customer_name: "Edited",
        expected_updated_at: "v1",
        idempotency_key: "edit",
        merchant_id: "wrong-merchant",
        shop_id: "wrong-shop",
      }),
    });
    await api("/pos/orders/order-a", {
      method: "DELETE",
      body: JSON.stringify({ expected_updated_at: "v1", idempotency_key: "delete" }),
    });
    expect(query).toHaveBeenCalledWith(
      "updateTransaction",
      expect.objectContaining({
        merchant_id: "merchant-a",
        shop_id: "assigned-shop",
        customer_name: "Edited",
      }),
    );
    expect(query).toHaveBeenCalledWith(
      "deleteTransaction",
      expect.objectContaining({ id: "order-a", shop_id: "assigned-shop" }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(query).toHaveBeenNthCalledWith(
      1,
      "getTransactionHistoryDetail",
      expect.objectContaining({
        merchant_id: "merchant-a",
        shop_id: "assigned-shop",
        id: "order-a",
      }),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "updateDeliveryPayment",
      expect.objectContaining({
        merchant_id: "merchant-a",
        shop_id: "assigned-shop",
        expected_status: "UN_PAID",
        idempotency_key: "collect",
      }),
    );
  });
});
