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
import type { ProductPrice } from "./types";

export type PriceMutation = {
  sync_id: string;
  price_list_id: string;
  variant_id: string;
  amount: string;
  valid_from: string;
  valid_until?: string;
};

async function pendingPriceListCreate(scope: OfflineScope, priceListID: string) {
  const operations = await listOperations(scope);
  return operations.find(
    (operation) =>
      operation.entityType === "PRICE_LIST" &&
      operation.entityId === priceListID &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function pendingPriceCreate(scope: OfflineScope, priceID: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "PRODUCT_PRICE" &&
      operation.entityId === priceID &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function priceSyncID(
  merchantID: string,
  priceListID: string,
  variantID: string,
  validFrom: string,
) {
  const namespace = Uint8Array.from(
    "6ba7b8109dad11d180b400c04fd430c8".match(/.{2}/g)!.map((item) => parseInt(item, 16)),
  );
  const timestamp = new Date(validFrom).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
  const name = new TextEncoder().encode(`${merchantID}:${priceListID}:${variantID}:${timestamp}`);
  const input = new Uint8Array(namespace.length + name.length);
  input.set(namespace);
  input.set(name, namespace.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", input));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function queuePriceUpsert(
  scope: OfflineScope,
  price: PriceMutation,
  existing?: ProductPrice,
) {
  const listDependency = await pendingPriceListCreate(scope, price.price_list_id);
  const ownCreate = existing ? await pendingPriceCreate(scope, price.sync_id) : undefined;
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "PRODUCT_PRICE",
      entityId: price.sync_id,
      operationType: existing ? "UPDATE" : "CREATE",
      payload: price,
      baseVersion: ownCreate
        ? 1
        : (existing?.sync_version ??
          (await getEntityVersion(scope, "PRODUCT_PRICE", price.sync_id))),
      dependencyOperationId: ownCreate?.operationId ?? listDependency?.operationId,
    },
    price,
  );
  await updatePriceCollection(scope, price.price_list_id, (items) => {
    const filtered = items.filter((item) => item.sync_id !== price.sync_id);
    return [...filtered, price];
  });
  await updatePosCatalogPrice(scope, price.variant_id, price.amount);
  requestBackgroundSync();
  return operation;
}

export async function queuePriceDelete(scope: OfflineScope, price: ProductPrice) {
  const syncID = price.sync_id;
  if (!syncID)
    throw new Error("This price has no synchronization identity; refresh before removing it.");
  const payload: PriceMutation = {
    sync_id: syncID,
    price_list_id: price.price_list_id,
    variant_id: price.variant_id,
    amount: price.amount,
    valid_from: price.valid_from,
    ...(price.valid_until ? { valid_until: price.valid_until } : {}),
  };
  const listDependency = await pendingPriceListCreate(scope, price.price_list_id);
  const ownCreate = await pendingPriceCreate(scope, syncID);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "PRODUCT_PRICE",
      entityId: syncID,
      operationType: "DELETE",
      payload,
      baseVersion: ownCreate
        ? 1
        : (price.sync_version ?? (await getEntityVersion(scope, "PRODUCT_PRICE", syncID))),
      dependencyOperationId: ownCreate?.operationId ?? listDependency?.operationId,
    },
    { ...price, is_deleted: true },
  );
  await updatePriceCollection(scope, price.price_list_id, (items) =>
    items.filter((item) => item.sync_id !== syncID),
  );
  await updatePosCatalogPrice(scope, price.variant_id, undefined);
  requestBackgroundSync();
  return operation;
}

async function updatePriceCollection(
  scope: OfflineScope,
  priceListID: string,
  update: (items: ProductPrice[]) => ProductPrice[],
) {
  const path = `/pricing/price-lists/${priceListID}/prices?page_index=0&page_size=200`;
  const cached = await getCachedResource<ProductPrice[]>(scope, path).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, path, update(cached.data), cached.meta).catch(() => undefined);
}

async function updatePosCatalogPrice(
  scope: OfflineScope,
  variantID: string,
  amount: string | undefined,
) {
  const resources = await listCachedResources<Record<string, unknown>>(scope);
  await Promise.all(
    resources
      .filter((resource) => resource.path.startsWith("/pos/catalog?"))
      .map((resource) =>
        putCachedResource(
          scope,
          resource.path,
          Array.isArray(resource.data)
            ? resource.data.map((item) =>
                item.id === variantID ? { ...item, price: amount } : item,
              )
            : resource.data,
          resource.meta,
        ),
      ),
  );
}
