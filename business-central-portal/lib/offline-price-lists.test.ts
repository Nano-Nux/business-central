import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queuePriceListCreate, queuePriceListDelete } from "./offline-price-lists";
import type { PriceList } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const path = "/pricing/price-lists?page_index=0&page_size=100";
const list: PriceList = {
  id: "00000000-0000-0000-0000-000000000003",
  code: "RETAIL",
  currency_code: "USD",
  is_default: true,
  sync_version: 2,
};

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

describe("offline price lists", () => {
  it("creates a stable local price list operation", async () => {
    await putCachedResource<PriceList[]>(scope, path, []);
    const operation = await queuePriceListCreate(scope, {
      code: "RETAIL",
      currency_code: "USD",
      is_default: true,
    });

    expect(operation.operationType).toBe("CREATE");
    await expect(listOperations(scope)).resolves.toHaveLength(1);
    await expect(getCachedResource<PriceList[]>(scope, path)).resolves.toMatchObject({
      data: [{ id: operation.entityId, code: "RETAIL" }],
    });
  });

  it("queues price-list deletion with its optimistic version", async () => {
    await putCachedResource<PriceList[]>(scope, path, [list]);
    const operation = await queuePriceListDelete(scope, list);

    expect(operation.baseVersion).toBe(2);
    await expect(getCachedResource<PriceList[]>(scope, path)).resolves.toMatchObject({
      data: [],
    });
  });

  it("keeps a price list when cached child prices exist", async () => {
    await putCachedResource<PriceList[]>(scope, path, [list]);
    await putCachedResource(
      scope,
      `/pricing/price-lists/${list.id}/prices?page_index=0&page_size=200`,
      [{ id: "price-1" }],
    );

    await expect(queuePriceListDelete(scope, list)).rejects.toThrow(
      "Remove all prices from this list before deleting it.",
    );
    await expect(listOperations(scope)).resolves.toHaveLength(0);
    await expect(getCachedResource<PriceList[]>(scope, path)).resolves.toMatchObject({
      data: [list],
    });
  });
});
