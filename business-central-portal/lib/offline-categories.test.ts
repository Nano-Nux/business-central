import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueCategoryCreate, queueCategoryDelete } from "./offline-categories";
import type { Category } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const categoriesPath = "/catalog/categories?page_index=0&page_size=200";
const category: Category = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Tea",
  slug: "tea",
  sort_order: 0,
  sync_version: 3,
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

describe("offline catalog categories", () => {
  it("creates a stable local category and preserves a parent dependency", async () => {
    await putCachedResource(scope, categoriesPath, []);
    const parent = await queueCategoryCreate(scope, {
      name: "Drinks",
      slug: "drinks",
      parent_category_id: undefined,
      description: undefined,
      sort_order: 0,
    });
    const child = await queueCategoryCreate(scope, {
      name: "Tea",
      slug: "tea",
      parent_category_id: parent.entityId,
      description: undefined,
      sort_order: 0,
    });

    expect(child.dependencyOperationId).toBe(parent.operationId);
    await expect(listOperations(scope)).resolves.toHaveLength(2);
  });

  it("queues deletion with the cached version and removes the local category", async () => {
    await putCachedResource(scope, categoriesPath, [category]);

    const operation = await queueCategoryDelete(scope, category);

    expect(operation.operationType).toBe("DELETE");
    expect(operation.baseVersion).toBe(3);
    await expect(getCachedResource<Category[]>(scope, categoriesPath)).resolves.toMatchObject({
      data: [],
    });
  });
});
