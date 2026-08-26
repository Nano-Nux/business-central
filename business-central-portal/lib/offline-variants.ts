import {
  getCachedResource,
  getEntityVersion,
  listCachedResources,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { Variant } from "./types";

export type VariantMutation = Pick<
  Variant,
  "sku" | "barcode" | "name" | "base_unit_id" | "unit_of_measure" | "is_stock_tracked"
> & { attributes?: Record<string, unknown> };

function variantsPath(productID: string) {
  return `/catalog/products/${productID}/variants?page_index=0&page_size=100`;
}

async function pendingCreate(scope: OfflineScope, entityType: string, entityID: string) {
  const operations = await listOperations(scope);
  return operations.find(
    (operation) =>
      operation.entityType === entityType &&
      operation.entityId === entityID &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function queueVariantCreate(
  scope: OfflineScope,
  productID: string,
  payload: VariantMutation,
) {
  const id = crypto.randomUUID();
  const productDependency = await pendingCreate(scope, "CATALOG_PRODUCT", productID);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_VARIANT",
      entityId: id,
      operationType: "CREATE",
      payload: { product_id: productID, ...payload, attributes: payload.attributes ?? {} },
      baseVersion: 0,
      dependencyOperationId: productDependency?.operationId,
    },
    { id, product_id: productID, ...payload },
  );
  await updateVariantCollection(scope, productID, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, product_id: productID, ...payload },
  ]);
  await updatePosCatalogVariants(scope, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, product_id: productID, ...payload },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueVariantUpdate(
  scope: OfflineScope,
  variant: Variant,
  payload: VariantMutation,
) {
  const productDependency = await pendingCreate(scope, "CATALOG_PRODUCT", variant.product_id);
  const ownDependency = await pendingCreate(scope, "CATALOG_VARIANT", variant.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_VARIANT",
      entityId: variant.id,
      operationType: "UPDATE",
      payload: { product_id: variant.product_id, ...payload, attributes: payload.attributes ?? {} },
      baseVersion: ownDependency
        ? 1
        : (variant.sync_version ?? (await getEntityVersion(scope, "CATALOG_VARIANT", variant.id))),
      dependencyOperationId: ownDependency?.operationId ?? productDependency?.operationId,
    },
    { ...variant, ...payload },
  );
  await updateVariantCollection(scope, variant.product_id, (items) =>
    items.map((item) => (item.id === variant.id ? { ...item, ...payload } : item)),
  );
  await updatePosCatalogVariants(scope, (items) =>
    items.map((item) => (item.id === variant.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueVariantDelete(scope: OfflineScope, variant: Variant) {
  const ownDependency = await pendingCreate(scope, "CATALOG_VARIANT", variant.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_VARIANT",
      entityId: variant.id,
      operationType: "DELETE",
      payload: { product_id: variant.product_id },
      baseVersion: ownDependency
        ? 1
        : (variant.sync_version ?? (await getEntityVersion(scope, "CATALOG_VARIANT", variant.id))),
      dependencyOperationId: ownDependency?.operationId,
    },
    { ...variant, is_deleted: true },
  );
  await updateVariantCollection(scope, variant.product_id, (items) =>
    items.filter((item) => item.id !== variant.id),
  );
  await updatePosCatalogVariants(scope, (items) => items.filter((item) => item.id !== variant.id));
  requestBackgroundSync();
  return operation;
}

async function updateVariantCollection(
  scope: OfflineScope,
  productID: string,
  update: (items: Variant[]) => Variant[],
) {
  const path = variantsPath(productID);
  const cached = await getCachedResource<Variant[]>(scope, path).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, path, update(cached.data), cached.meta).catch(() => undefined);
}

async function updatePosCatalogVariants(
  scope: OfflineScope,
  update: (items: Variant[]) => Variant[],
) {
  const resources = await listCachedResources<Variant[]>(scope);
  await Promise.all(
    resources
      .filter((resource) => resource.path.startsWith("/pos/catalog?"))
      .map((resource) =>
        putCachedResource(scope, resource.path, update(resource.data), resource.meta),
      ),
  );
}
