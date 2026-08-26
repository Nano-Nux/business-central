import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearOfflineScope, listOperations } from "./offline-db";
import {
  listOfflineCheckouts,
  pendingCheckoutQuantities,
  queueOfflineCheckout,
} from "./offline-checkout";
import type { Shop, Variant } from "./types";

const scope = { merchantId: "merchant-checkout", membershipId: "cashier-checkout" };
const shop: Shop = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Main shop",
  code: "MAIN",
  is_active: true,
  module_codes: ["CORE"],
  include_tax: true,
  tax_rate: "10",
};
const item: Variant = {
  id: "00000000-0000-0000-0000-000000000004",
  product_id: "00000000-0000-0000-0000-000000000005",
  name: "Blue",
  product_name: "Widget",
  sku: "W-BLUE",
  base_unit_id: "00000000-0000-0000-0000-000000000006",
  unit_of_measure: "Each",
  is_stock_tracked: true,
  quantity_on_hand: "5",
  price: "10.00",
};

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline POS checkout", () => {
  it("atomically saves a complete provisional cash checkout and typed operation", async () => {
    const saved = await queueOfflineCheckout({
      scope,
      shop,
      currencyCode: "USD",
      lines: [{ item, quantity: 2 }],
      deliveryFee: "1.00",
      manualPromotion: "2.00",
      customerName: "Ada",
      customerPhone: "555-0100",
      note: "Leave at counter",
      paymentMethod: "CASH",
    });

    expect(saved.projection).toMatchObject({
      status: "PENDING_SYNCHRONIZATION",
      payment: { method: "CASH", status: "PROVISIONAL_CASH" },
      snapshot: {
        subtotal: "20.00",
        discount_total: "2.00",
        tax_total: "1.80",
        grand_total: "20.80",
      },
    });
    const [operation] = await listOperations(scope);
    expect(operation).toMatchObject({
      entityType: "POS_CHECKOUT",
      entityId: saved.projection.provisional_id,
      shopId: shop.id,
      operationType: "CREATE",
      status: "PENDING",
    });
    expect(operation.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(listOfflineCheckouts(scope)).resolves.toHaveLength(1);
  });

  it("keeps a supplied checkout identity for ambiguous online response recovery", async () => {
    const checkoutID = "00000000-0000-0000-0000-000000000007";
    const saved = await queueOfflineCheckout({
      scope,
      provisionalId: checkoutID,
      shop,
      currencyCode: "USD",
      lines: [{ item, quantity: 1 }],
      paymentMethod: "CASH",
    });

    const [operation] = await listOperations(scope);
    expect(saved.projection.provisional_id).toBe(checkoutID);
    expect(operation.operationId).toBe(checkoutID);
    expect((operation.payload.request as { idempotency_key: string }).idempotency_key).toBe(
      checkoutID,
    );
  });

  it("reserves stock across browser-restorable provisional checkouts", async () => {
    await queueOfflineCheckout({
      scope,
      shop,
      currencyCode: "USD",
      lines: [{ item, quantity: 4 }],
      paymentMethod: "CASH",
    });

    await expect(pendingCheckoutQuantities(scope)).resolves.toEqual(new Map([[item.id, 4]]));
    await expect(
      queueOfflineCheckout({
        scope,
        shop,
        currencyCode: "USD",
        lines: [{ item, quantity: 2 }],
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow("only 1 provisionally available");
  });

  it("records external payment only as an authorization intent", async () => {
    const saved = await queueOfflineCheckout({
      scope,
      shop,
      currencyCode: "USD",
      lines: [{ item, quantity: 1 }],
      paymentMethod: "CARD",
    });

    expect(saved.projection).toMatchObject({
      status: "PENDING_PAYMENT_AUTHORIZATION",
      payment: { method: "CARD", status: "PENDING_AUTHORIZATION" },
    });
  });
});
