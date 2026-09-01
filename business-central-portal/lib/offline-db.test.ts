import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySyncPage,
  clearOfflineScope,
  discardOfflineOperation,
  discardOfflineOperations,
  getCachedEntities,
  getCachedResource,
  getEntityVersion,
  getMetadata,
  listOperations,
  payloadHash,
  putCachedResource,
  quarantineOfflineScope,
  queueOperationWithEntity,
  retryOfflineOperation,
  retryOfflineOperations,
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

  it("retries failed operations and resets error and retry timestamps", async () => {
    const op = await queueOperationWithEntity(
      owner,
      {
        shopId: "shop-a",
        entityType: "CATALOG_PRODUCT",
        entityId: "prod-1",
        operationType: "CREATE",
        payload: { title: "Test Item" },
      },
      { id: "prod-1", title: "Test Item" },
    );
    op.status = "FAILED";
    op.lastError = "Network error";
    op.nextRetryAt = new Date().toISOString();

    await retryOfflineOperation(op);
    let operations = await listOperations(owner);
    expect(operations[0]).toMatchObject({
      operationId: op.operationId,
      status: "PENDING",
    });
    expect(operations[0].lastError).toBeUndefined();
    expect(operations[0].nextRetryAt).toBeUndefined();

    // Batch retry
    op.status = "REJECTED";
    await retryOfflineOperations([op]);
    operations = await listOperations(owner);
    expect(operations[0].status).toBe("PENDING");
  });

  it("discards single and batch offline operations and cleans up cached entities", async () => {
    const op1 = await queueOperationWithEntity(
      owner,
      {
        shopId: "shop-a",
        entityType: "CATALOG_PRODUCT",
        entityId: "prod-1",
        operationType: "CREATE",
        payload: { title: "Test Item 1" },
      },
      { id: "prod-1", title: "Test Item 1" },
    );
    const op2 = await queueOperationWithEntity(
      owner,
      {
        shopId: "shop-a",
        entityType: "CATALOG_PRODUCT",
        entityId: "prod-2",
        operationType: "CREATE",
        payload: { title: "Test Item 2" },
      },
      { id: "prod-2", title: "Test Item 2" },
    );

    // Discard single
    await discardOfflineOperation(owner, op1);
    expect(await listOperations(owner)).toHaveLength(1);
    expect(await getCachedEntities(owner, "CATALOG_PRODUCT")).toHaveLength(1);

    // Discard batch
    await discardOfflineOperations(owner, [op2]);
    expect(await listOperations(owner)).toHaveLength(0);
    expect(await getCachedEntities(owner, "CATALOG_PRODUCT")).toHaveLength(0);
  });
});
