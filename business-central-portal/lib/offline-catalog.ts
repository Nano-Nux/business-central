import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { Product } from "./types";

export type ProductMetadataUpdate = Pick<
  Product,
  | "name"
  | "description"
  | "product_type"
  | "manufacture_date"
  | "expired_date"
  | "is_active"
  | "category_ids"
>;

const productsPath = "/catalog/products?page_index=0&page_size=100";

export async function queueProductCreate(scope: OfflineScope, payload: ProductMetadataUpdate) {
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_PRODUCT",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, ...payload, category_names: [] },
  );
  await updateProductCollection(scope, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload, category_names: [] },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueProductMetadataUpdate(
  scope: OfflineScope,
  product: Product,
  update: ProductMetadataUpdate,
) {
  const pendingCreate = (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "CATALOG_PRODUCT" &&
      operation.entityId === product.id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
  const baseVersion = pendingCreate
    ? 1
    : await getEntityVersion(scope, "CATALOG_PRODUCT", product.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_PRODUCT",
      entityId: product.id,
      operationType: "UPDATE",
      payload: update,
      baseVersion: baseVersion || product.sync_version || 0,
      dependencyOperationId: pendingCreate?.operationId,
    },
    { ...product, ...update },
  );
  await updateProductCollection(scope, (items) =>
    items.map((item) => (item.id === product.id ? { ...item, ...update } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueProductDelete(scope: OfflineScope, product: Product) {
  const operations = await listOperations(scope);
  const pendingCreate = operations.find(
    (operation) =>
      operation.entityType === "CATALOG_PRODUCT" &&
      operation.entityId === product.id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
  const baseVersion = pendingCreate
    ? 1
    : (product.sync_version ?? (await getEntityVersion(scope, "CATALOG_PRODUCT", product.id)));
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_PRODUCT",
      entityId: product.id,
      operationType: "DELETE",
      payload: {},
      baseVersion,
      dependencyOperationId: pendingCreate?.operationId,
    },
    { ...product, is_deleted: true },
  );
  await updateProductCollection(scope, (items) => items.filter((item) => item.id !== product.id));
  requestBackgroundSync();
  return operation;
}

async function updateProductCollection(
  scope: OfflineScope,
  update: (items: Product[]) => Product[],
) {
  const cached = await getCachedResource<Product[]>(scope, productsPath).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, productsPath, update(cached.data), cached.meta).catch(
    () => undefined,
  );
}
