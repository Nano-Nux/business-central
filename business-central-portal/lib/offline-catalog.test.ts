import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applySyncPage,
  getCachedResource,
  getCachedEntities,
  listOperations,
  putCachedEntity,
  type OfflineScope,
  putCachedResource,
} from "./offline-db";
import {
  queueProductCreate,
  queueProductDelete,
  queueProductMetadataUpdate,
} from "./offline-catalog";
import type { Product } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const productsPath = "/catalog/products?page_index=0&page_size=100";

const product: Product = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Tea",
  product_type: "PHYSICAL",
  is_active: true,
  category_ids: [],
  category_names: [],
  sync_version: 4,
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

describe("offline catalog products", () => {
  it("persists a locally identified product create and projection", async () => {
    await putCachedResource(scope, productsPath, []);

    const operation = await queueProductCreate(scope, {
      name: "Tea",
      description: "Loose leaf",
      product_type: "PHYSICAL",
      is_active: true,
      category_ids: [],
    });

    expect(operation.operationType).toBe("CREATE");
    expect(operation.entityId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: operation.operationId, status: "PENDING" },
    ]);
    await expect(getCachedResource<Product[]>(scope, productsPath)).resolves.toMatchObject({
      data: [{ id: operation.entityId, name: "Tea" }],
    });
  });

  it("queues product deletion with the cached version and removes the local row", async () => {
    await putCachedResource(scope, productsPath, [product]);

    const operation = await queueProductDelete(scope, product);

    expect(operation.operationType).toBe("DELETE");
    expect(operation.baseVersion).toBe(4);
    await expect(getCachedResource<Product[]>(scope, productsPath)).resolves.toMatchObject({
      data: [],
    });
  });

  it("keeps optional product dates in the queued update and local projection", async () => {
    await putCachedResource(scope, productsPath, [product]);

    const operation = await queueProductMetadataUpdate(scope, product, {
      name: product.name,
      product_type: product.product_type,
      is_active: product.is_active,
      category_ids: product.category_ids,
      manufacture_date: "2026-08-01",
      expired_date: "2027-08-01",
    });

    expect(operation.payload).toMatchObject({
      manufacture_date: "2026-08-01",
      expired_date: "2027-08-01",
    });
    await expect(getCachedResource<Product[]>(scope, productsPath)).resolves.toMatchObject({
      data: [{ manufacture_date: "2026-08-01", expired_date: "2027-08-01" }],
    });
  });

  it("applies a product delete change as an entity tombstone", async () => {
    await putCachedEntity(scope, "CATALOG_PRODUCT", product.id, product, 4);

    await applySyncPage(
      scope,
      [
        {
          entityType: "CATALOG_PRODUCT",
          entityId: product.id,
          entityVersion: 5,
          operationType: "DELETE",
          payload: { id: product.id, is_deleted: true },
        },
      ],
      12,
    );

    await expect(getCachedEntities(scope, "CATALOG_PRODUCT")).resolves.toEqual([]);
  });
});
