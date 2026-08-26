import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueVariantCreate, queueVariantDelete } from "./offline-variants";
import type { Variant } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const productID = "00000000-0000-0000-0000-000000000003";
const variant: Variant = {
  id: "00000000-0000-0000-0000-000000000004",
  product_id: productID,
  sku: "TEA-1",
  name: "Tea",
  base_unit_id: "00000000-0000-0000-0000-000000000005",
  unit_of_measure: "EA",
  is_stock_tracked: true,
  sync_version: 2,
};
const path = `/catalog/products/${productID}/variants?page_index=0&page_size=100`;

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(async () => {
  await deleteDatabase();
});

describe("offline catalog variants", () => {
  it("persists a locally identified variant and parent-product dependency", async () => {
    await putCachedResource(scope, path, []);

    const operation = await queueVariantCreate(scope, productID, {
      sku: "TEA-1",
      name: "Tea",
      base_unit_id: variant.base_unit_id,
      unit_of_measure: "EA",
      is_stock_tracked: true,
      attributes: {},
    });

    expect(operation.operationType).toBe("CREATE");
    expect(operation.payload.product_id).toBe(productID);
    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: operation.operationId, status: "PENDING" },
    ]);
  });

  it("queues deletion with the cached version and removes the local SKU", async () => {
    await putCachedResource(scope, path, [variant]);

    const operation = await queueVariantDelete(scope, variant);

    expect(operation.baseVersion).toBe(2);
    await expect(getCachedResource<Variant[]>(scope, path)).resolves.toMatchObject({
      data: [],
    });
  });
});
