import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { priceSyncID, queuePriceDelete, queuePriceUpsert } from "./offline-pricing";
import type { ProductPrice } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const priceListID = "00000000-0000-0000-0000-000000000003";
const variantID = "00000000-0000-0000-0000-000000000004";
const validFrom = "2026-08-09T10:20:30.123Z";
const path = `/pricing/price-lists/${priceListID}/prices?page_index=0&page_size=200`;

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

describe("offline pricing", () => {
  it("generates a stable UUID identity for a composite price key", async () => {
    await expect(priceSyncID(scope.merchantId, priceListID, variantID, validFrom)).resolves.toBe(
      await priceSyncID(scope.merchantId, priceListID, variantID, validFrom),
    );
  });

  it("persists a price upsert and delete through the durable outbox", async () => {
    const syncID = await priceSyncID(scope.merchantId, priceListID, variantID, validFrom);
    await putCachedResource<ProductPrice[]>(scope, path, []);
    const created = await queuePriceUpsert(scope, {
      sync_id: syncID,
      price_list_id: priceListID,
      variant_id: variantID,
      amount: "12.50",
      valid_from: validFrom,
    });

    expect(created.operationType).toBe("CREATE");
    await expect(getCachedResource<ProductPrice[]>(scope, path)).resolves.toMatchObject({
      data: [{ sync_id: syncID, amount: "12.50" }],
    });
    const [stored] = await getCachedResource<ProductPrice[]>(scope, path).then(
      (result) => result!.data,
    );
    const deleted = await queuePriceDelete(scope, { ...stored, sync_id: syncID });

    expect(deleted.operationType).toBe("DELETE");
    await expect(listOperations(scope)).resolves.toHaveLength(2);
  });
});
