import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueStockReceipt } from "./offline-stock";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const shopId = "00000000-0000-0000-0000-000000000003";
const variantId = "00000000-0000-0000-0000-000000000004";
const path = `/pos/catalog?page_index=0&page_size=500&shop_id=${shopId}`;

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(deleteDatabase);

describe("offline stock receiving", () => {
  it("queues a shop-scoped receipt and updates cached on-hand quantity", async () => {
    await putCachedResource(scope, path, [{ id: variantId, quantity_on_hand: "2.000" }]);
    const operation = await queueStockReceipt(scope, shopId, {
      variant_id: variantId,
      destination_location_id: crypto.randomUUID(),
      unit_id: crypto.randomUUID(),
      quantity: "3.5",
      unit_cost: "12.34",
      event_key: "direct-stock-in:test",
    });

    expect(operation.entityType).toBe("STOCK_RECEIPT");
    expect(operation.shopId).toBe(shopId);
    await expect(
      getCachedResource<{ id: string; quantity_on_hand: string }[]>(scope, path),
    ).resolves.toMatchObject({
      data: [{ id: variantId, quantity_on_hand: "5.500" }],
    });
    await expect(listOperations(scope)).resolves.toHaveLength(1);
  });

  it("queues a receipt without cost for server-side recent-cost reuse", async () => {
    const operation = await queueStockReceipt(scope, shopId, {
      variant_id: variantId,
      destination_location_id: crypto.randomUUID(),
      unit_id: crypto.randomUUID(),
      quantity: "1",
      event_key: "direct-stock-in:reuse-cost",
    });

    expect(operation.payload).not.toHaveProperty("unit_cost");
  });
});
