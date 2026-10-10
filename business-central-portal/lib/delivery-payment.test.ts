import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOfflineScope, listOperations } from "./offline-db";
import { queueOfflineCheckout } from "./offline-checkout";
import { queueShopSettingsUpdate } from "./offline-settings";
import type { Shop, Variant } from "./types";

const scope = { merchantId: "delivery-merchant", membershipId: "delivery-owner" };
const shop: Shop = {
  id: "shop-main",
  name: "Main",
  code: "MAIN",
  is_active: true,
  module_codes: [],
  include_tax: true,
  tax_rate: "10",
};
const item = {
  id: "variant",
  product_id: "product",
  name: "Widget",
  sku: "W",
  base_unit_id: "unit",
  is_stock_tracked: false,
  price: "100",
} as Variant;
beforeEach(async () => {
  await clearOfflineScope(scope);
});
afterEach(() => vi.unstubAllGlobals());

describe("separate delivery payment", () => {
  it("persists FULLY_OFFLINE checkout in SQLite without a synchronization outbox", async () => {
    const query = vi.fn().mockResolvedValue({ order_number: "LOCAL-1" });
    vi.stubGlobal("window", {
      BusinessCentralRuntimeMode: "FULLY_OFFLINE",
      BusinessCentralNativeDatabase: { query, isAvailable: () => true },
    });
    const saved = await queueOfflineCheckout({
      scope,
      shop,
      currencyCode: "USD",
      lines: [{ item, quantity: 1 }],
      manualPromotion: "10",
      deliveryFee: "7",
      paymentMethod: "Cash",
      paymentCategory: "CASH",
    });
    expect(saved.projection).toMatchObject({
      status: "COMPLETED_LOCALLY",
      delivery_payment_status: "UN_PAID",
      payment: { status: "CAPTURED", amount: "99.00" },
      order_number: "LOCAL-1",
    });
    expect(query).toHaveBeenCalledWith(
      "checkout",
      expect.objectContaining({
        projection: expect.objectContaining({
          merchant_id: scope.merchantId,
          shop_id: shop.id,
          delivery_payment_status: "UN_PAID",
        }),
      }),
    );
    expect(await listOperations(scope)).toEqual([]);
  });
  it.each([
    [false, undefined, "UN_PAID", "99.00"],
    [false, "COMPLETE", "COMPLETE", "106.00"],
    [true, "UN_PAID", "COMPLETE", "106.00"],
  ] as const)(
    "snapshots default %s / choice %s without changing prices",
    async (auto, choice, status, paid) => {
      const saved = await queueOfflineCheckout({
        scope,
        shop: { ...shop, delivery_payment_status_auto_complete: auto },
        currencyCode: "USD",
        lines: [{ item, quantity: 1 }],
        manualPromotion: "10",
        deliveryFee: "7",
        deliveryPaymentStatus: choice,
        paymentMethod: "Cash",
        paymentCategory: "CASH",
      });
      expect(saved.projection.snapshot).toMatchObject({
        subtotal: "100.00",
        discount_total: "10.00",
        tax_total: "9.00",
        grand_total: "106.00",
        delivery_payment_status: status,
      });
      expect(saved.projection).toMatchObject({
        delivery_fee: "7.00",
        delivery_payment_status: status,
        payment: { amount: paid },
      });
      expect(saved.operation.payload.request).toMatchObject({
        delivery_payment_status: status,
        delivery_fee: "7",
      });
    },
  );
  it("saves the delivery default independently for each shop", async () => {
    const update = {
      ...shop,
      address: {},
      tax_label: "Tax",
      receipt_note: "",
      delivery_payment_status_auto_complete: true,
    };
    await queueShopSettingsUpdate(scope, shop, update);
    await queueShopSettingsUpdate(
      scope,
      { ...shop, id: "shop-other" },
      { ...update, delivery_payment_status_auto_complete: false },
    );
    const operations = await listOperations(scope);
    expect(
      operations
        .sort((a, b) => a.shopId!.localeCompare(b.shopId!))
        .map((o) => [o.shopId, o.payload.delivery_payment_status_auto_complete]),
    ).toEqual([
      ["shop-main", true],
      ["shop-other", false],
    ]);
  });
});
