import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { Category } from "./types";

export type CategoryMutation = Pick<
  Category,
  "name" | "slug" | "parent_category_id" | "description" | "sort_order"
>;

const categoriesPath = "/catalog/categories?page_index=0&page_size=200";

async function pendingCreate(scope: OfflineScope, categoryID?: string) {
  if (!categoryID) return undefined;
  const operations = await listOperations(scope);
  return operations.find(
    (operation) =>
      operation.entityType === "CATALOG_CATEGORY" &&
      operation.entityId === categoryID &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function queueCategoryCreate(scope: OfflineScope, payload: CategoryMutation) {
  const id = crypto.randomUUID();
  const dependency = await pendingCreate(scope, payload.parent_category_id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CATEGORY",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
      dependencyOperationId: dependency?.operationId,
    },
    { id, ...payload },
  );
  await updateCategoryCollection(scope, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueCategoryUpdate(
  scope: OfflineScope,
  category: Category,
  payload: CategoryMutation,
) {
  const dependency = await pendingCreate(scope, payload.parent_category_id);
  const ownCreate = await pendingCreate(scope, category.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CATEGORY",
      entityId: category.id,
      operationType: "UPDATE",
      payload,
      baseVersion: ownCreate
        ? 1
        : (category.sync_version ??
          (await getEntityVersion(scope, "CATALOG_CATEGORY", category.id))),
      dependencyOperationId: ownCreate?.operationId ?? dependency?.operationId,
    },
    { ...category, ...payload },
  );
  await updateCategoryCollection(scope, (items) =>
    items.map((item) => (item.id === category.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueCategoryDelete(scope: OfflineScope, category: Category) {
  const operations = await listOperations(scope);
  const dependency = operations.find(
    (operation) =>
      operation.entityType === "CATALOG_CATEGORY" &&
      operation.entityId === category.id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CATEGORY",
      entityId: category.id,
      operationType: "DELETE",
      payload: {},
      baseVersion: dependency
        ? 1
        : (category.sync_version ??
          (await getEntityVersion(scope, "CATALOG_CATEGORY", category.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...category, is_deleted: true },
  );
  await updateCategoryCollection(scope, (items) => items.filter((item) => item.id !== category.id));
  requestBackgroundSync();
  return operation;
}

async function updateCategoryCollection(
  scope: OfflineScope,
  update: (items: Category[]) => Category[],
) {
  const cached = await getCachedResource<Category[]>(scope, categoriesPath).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, categoriesPath, update(cached.data), cached.meta).catch(
    () => undefined,
  );
}
