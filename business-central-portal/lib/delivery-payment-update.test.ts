import { beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkUnavailableError, patch } from "./api";
import { normalizeDeliveryHistory, updateDeliveryPayment } from "./delivery-payment";
import { queueDeferredMutation } from "./offline-deferred";
import type { TransactionHistoryDetail } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  patch: vi.fn(),
}));
vi.mock("./offline-deferred", () => ({ queueDeferredMutation: vi.fn() }));
vi.mock("./offline-db", () => ({ putCachedResource: vi.fn() }));

const scope = { merchantId: "merchant", membershipId: "owner" };
function fixture(): TransactionHistoryDetail {
  return {
    entry: { id: "sale", event_type: "TRANSACTION" },
    order: {
      id: "sale",
      shop_id: "shop",
      channel: "POS",
      grand_total: "106.00",
      shipping_total: "7.00",
      paid_total: "104.00",
      delivery_payment_status: "UN_PAID",
    },
    payments: [
      { id: "goods", purpose: "ORDER", status: "CAPTURED", amount: "99.00" },
      { id: "fee", purpose: "DELIVERY", status: "PARTIALLY_REFUNDED", amount: "7.00" },
    ],
    refunds: [{ id: "refund", payment_id: "fee", status: "SUCCEEDED", amount: "2.00" }],
  } as TransactionHistoryDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(patch).mockRejectedValue(new NetworkUnavailableError());
});
describe("delivery detail financial projections", () => {
  it("collects only the shortfall after a partial delivery refund", async () => {
    await updateDeliveryPayment(scope, fixture(), "COMPLETE", "detail");
    expect(queueDeferredMutation).toHaveBeenCalledWith(
      scope,
      expect.anything(),
      expect.objectContaining({
        delivery_payment_pending: true,
        order: expect.objectContaining({
          paid_total: "106.00",
          outstanding_total: "0.00",
          grand_total: "106.00",
        }),
      }),
    );
  });
  it("reverses only the remaining delivery collection", async () => {
    const detail = fixture();
    detail.order!.delivery_payment_status = "COMPLETE";
    await updateDeliveryPayment(scope, detail, "UN_PAID", "detail");
    expect(queueDeferredMutation).toHaveBeenCalledWith(
      scope,
      expect.anything(),
      expect.objectContaining({
        order: expect.objectContaining({ paid_total: "99.00", outstanding_total: "7.00" }),
      }),
    );
  });
  it("blocks additional changes until the pending change synchronizes", async () => {
    await expect(
      updateDeliveryPayment(
        scope,
        { ...fixture(), delivery_payment_pending: true },
        "COMPLETE",
        "detail",
      ),
    ).rejects.toThrow("Synchronize");
    expect(patch).not.toHaveBeenCalled();
  });
  it("recognizes delivery already collected in a legacy saved receipt", () => {
    const detail = fixture();
    delete detail.order!.delivery_payment_status;
    detail.payments = [
      {
        id: "legacy",
        amount: "106.00",
        status: "CAPTURED",
        method: "Cash",
        created_at: "2026-10-08",
      },
    ];
    detail.refunds = [];
    expect(normalizeDeliveryHistory(detail).order).toMatchObject({
      delivery_payment_status: "COMPLETE",
      paid_total: "106.00",
      outstanding_total: "0.00",
    });
  });
});
