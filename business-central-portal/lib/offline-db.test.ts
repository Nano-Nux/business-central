import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySyncPage,
  clearOfflineScope,
  getCachedEntities,
  getCachedResource,
  getEntityVersion,
  getMetadata,
  listOperations,
  payloadHash,
  putCachedResource,
  quarantineOfflineScope,
  queueOperationWithEntity,
  type OfflineScope,
} from "./offline-db";

const databaseName = "business-central-portal-offline";
const owner: OfflineScope = {
  merchantId: "merchant-a",
  membershipId: "owner-a",
};
const staff: OfflineScope = {
  merchantId: "merchant-a",
  membershipId: "staff-a",
};

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(deleteDatabase);

describe("portal offline database", () => {
  it("hashes optional fields the same way JSON serialization does", async () => {
    await expect(
      payloadHash({ name: "Variant", barcode: undefined, attributes: {} }),
    ).resolves.toBe(await payloadHash({ name: "Variant", attributes: {} }));
  });

  it("keeps cached resources isolated by membership scope", async () => {
    await putCachedResource(owner, "/shops", [{ id: "owner-shop" }]);
    await putCachedResource(staff, "/shops", [{ id: "staff-shop" }]);

    await expect(getCachedResource(owner, "/shops")).resolves.toMatchObject({
      data: [{ id: "owner-shop" }],
    });
    await expect(getCachedResource(staff, "/shops")).resolves.toMatchObject({
      data: [{ id: "staff-shop" }],
    });
  });

  it("coalesces repeated pending settings edits under one stable operation", async () => {
    const first = await queueOperationWithEntity(
      owner,
      {
        shopId: "shop-a",
        entityType: "SHOP_SETTINGS",
        entityId: "shop-a",
        operationType: "UPDATE",
        payload: { tax_rate: "7" },
        baseVersion: 3,
      },
      { id: "shop-a", tax_rate: "7" },
    );
    const second = await queueOperationWithEntity(
      owner,
      {
        shopId: "shop-a",
        entityType: "SHOP_SETTINGS",
        entityId: "shop-a",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
        baseVersion: 3,
      },
      { id: "shop-a", tax_rate: "8" },
    );

    const operations = await listOperations(owner);
    expect(second.operationId).toBe(first.operationId);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: first.operationId,
      baseVersion: 3,
      payload: { tax_rate: "8" },
      status: "PENDING",
    });
    expect(operations[0].payloadHash).not.toBe(first.payloadHash);
  });

  it("commits pulled entities and the checkpoint together", async () => {
    await applySyncPage(
      owner,
      [
        {
          entityType: "SHOP_SETTINGS",
          entityId: "shop-a",
          entityVersion: 4,
          payload: { id: "shop-a", tax_rate: "10" },
        },
      ],
      19,
    );

    expect(await getEntityVersion(owner, "SHOP_SETTINGS", "shop-a")).toBe(4);
    expect(await getMetadata(owner, "checkpoint:merchant")).toBe(19);
    await expect(
      getCachedEntities<Record<string, unknown>>(owner, "SHOP_SETTINGS"),
    ).resolves.toMatchObject([{ entityId: "shop-a", payload: { tax_rate: "10" }, version: 4 }]);
  });

  it("deletes one authenticated scope without touching another", async () => {
    await putCachedResource(owner, "/catalog", [{ id: "owner-product" }]);
    await putCachedResource(staff, "/catalog", [{ id: "staff-product" }]);

    await clearOfflineScope(owner);

    await expect(getCachedResource(owner, "/catalog")).resolves.toBeNull();
    await expect(getCachedResource(staff, "/catalog")).resolves.toMatchObject({
      data: [{ id: "staff-product" }],
    });
  });

  it("quarantines unresolved operations while removing stale authorized data", async () => {
    await putCachedResource(owner, "/shops/old", [{ id: "old-shop" }]);
    await queueOperationWithEntity(
      owner,
      {
        shopId: "old-shop",
        entityType: "SHOP_SETTINGS",
        entityId: "old-shop",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
      },
      { id: "old-shop", tax_rate: "8" },
    );

    await quarantineOfflineScope(owner, "Shop assignment changed.");

    await expect(getCachedResource(owner, "/shops/old")).resolves.toBeNull();
    await expect(listOperations(owner)).resolves.toMatchObject([
      { status: "BLOCKED", lastError: "Shop assignment changed." },
    ]);
    await expect(getCachedEntities(owner, "SHOP_SETTINGS")).resolves.toHaveLength(1);
  });
});
