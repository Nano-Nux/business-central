import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { projectStorageStock, queueStockReceipt, queueStockReduction } from "./offline-stock";
import { deferredRequestFromPayload } from "./offline-deferred";
import type { StorageItem } from "./types";
import { pendingCheckoutQuantities } from "./offline-checkout";

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
    expect((await pendingCheckoutQuantities(scope, shopId)).get(variantId)).toBeUndefined();
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
  it("does not increase the cached POS count twice when retrying the same receipt", async () => {
    await putCachedResource(scope, path, [{ id: variantId, quantity_on_hand: "2.000" }]);
    const payload = {
      variant_id: variantId,
      destination_location_id: crypto.randomUUID(),
      unit_id: "",
      quantity: "3",
      event_key: "storage-increase:retry",
    };
    await queueStockReceipt(scope, shopId, payload, "same-receipt");
    await queueStockReceipt(scope, shopId, payload, "same-receipt");
    expect(await listOperations(scope)).toHaveLength(1);
    expect(await getCachedResource(scope, path)).toMatchObject({
      data: [{ quantity_on_hand: "5.000" }],
    });
  });
});

describe("Storage stock reductions", () => {
  it("persists a reduction and its exact idempotent API request together", async () => {
    const payload = {
      variant_id: variantId,
      source_location_id: crypto.randomUUID(),
      quantity: "2",
      reason: "Damaged",
      event_key: "storage-reduce:test",
    };
    const operation = await queueStockReduction(scope, shopId, payload, "local-reduction");
    const [restored] = await listOperations(scope);
    expect(restored.payloadHash).toBe(operation.payloadHash);
    expect(restored.shopId).toBe(shopId);
    expect(deferredRequestFromPayload(restored.payload)).toMatchObject({
      path: "/inventory/stock-reductions",
      method: "POST",
      body: payload,
      headers: { "Idempotency-Key": expect.stringContaining("STOCK_REDUCTION:local-reduction:") },
    });
    await queueStockReduction(scope, shopId, payload, "local-reduction");
    expect(await listOperations(scope)).toHaveLength(1);
    expect((await pendingCheckoutQuantities(scope, shopId)).get(variantId)).toBe(2);
    expect((await pendingCheckoutQuantities(scope, "another-shop")).get(variantId)).toBeUndefined();
  });
  it("waits for an earlier receipt at the same location before replaying a reduction", async () => {
    const location = crypto.randomUUID();
    const receipt = await queueStockReceipt(scope, shopId, {
      variant_id: variantId,
      destination_location_id: location,
      unit_id: "",
      quantity: "3",
      event_key: "storage-receipt:dependency",
    });
    const reduction = await queueStockReduction(scope, shopId, {
      variant_id: variantId,
      source_location_id: location,
      quantity: "2",
      reason: "Count correction",
      event_key: "storage-reduce:dependency",
    });
    expect(reduction.dependencyOperationId).toBe(receipt.operationId);
  });

  it("projects durable increases and reductions without changing the server snapshot", async () => {
    const snapshot: StorageItem[] = [
      {
        id: variantId,
        catalog: "",
        product_name: "Tea",
        variant_name: "Box",
        unit: "PCS",
        stock_count: "10",
      },
    ];
    await queueStockReceipt(scope, shopId, {
      variant_id: variantId,
      destination_location_id: crypto.randomUUID(),
      unit_id: "",
      quantity: "3",
      event_key: "storage-increase:test",
    });
    await queueStockReduction(scope, shopId, {
      variant_id: variantId,
      source_location_id: crypto.randomUUID(),
      quantity: "2",
      reason: "Damage",
      event_key: "storage-reduce:test",
    });
    const operations = await listOperations(scope);
    expect(projectStorageStock(snapshot, operations)[0]).toMatchObject({
      stock_count: "11.000000",
      stock_pending: true,
    });
    expect(snapshot[0].stock_count).toBe("10");
    expect(
      projectStorageStock(
        snapshot,
        operations.map((op) => ({ ...op, status: "REJECTED" as const })),
      )[0],
    ).toMatchObject({ stock_count: "10", stock_pending: false });
    expect(
      projectStorageStock(
        snapshot,
        operations.map((op) => ({ ...op, status: "SYNCED" as const })),
      )[0].stock_count,
    ).toBe("10");
  });
});
