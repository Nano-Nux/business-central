import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { PriceList } from "./types";

export type PriceListMutation = Pick<PriceList, "code" | "currency_code" | "is_default">;
const path = "/pricing/price-lists?page_index=0&page_size=100";

export async function queuePriceListCreate(scope: OfflineScope, payload: PriceListMutation) {
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    { entityType: "PRICE_LIST", entityId: id, operationType: "CREATE", payload, baseVersion: 0 },
    { id, ...payload },
  );
  await updatePriceLists(scope, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queuePriceListUpdate(
  scope: OfflineScope,
  list: PriceList,
  payload: PriceListMutation,
) {
  const dependency = await pendingPriceListCreate(scope, list.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "PRICE_LIST",
      entityId: list.id,
      operationType: "UPDATE",
      payload,
      baseVersion: dependency
        ? 1
        : (list.sync_version ?? (await getEntityVersion(scope, "PRICE_LIST", list.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...list, ...payload },
  );
  await updatePriceLists(scope, (items) =>
    items.map((item) => (item.id === list.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queuePriceListDelete(scope: OfflineScope, list: PriceList) {
  const prices = await getCachedResource<unknown[]>(
    scope,
    `/pricing/price-lists/${list.id}/prices?page_index=0&page_size=200`,
  ).catch(() => null);
  if (prices?.data.length) {
    throw new Error("Remove all prices from this list before deleting it.");
  }
  const dependency = await pendingPriceListCreate(scope, list.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "PRICE_LIST",
      entityId: list.id,
      operationType: "DELETE",
      payload: { id: list.id },
      baseVersion: dependency
        ? 1
        : (list.sync_version ?? (await getEntityVersion(scope, "PRICE_LIST", list.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...list, is_deleted: true },
  );
  await updatePriceLists(scope, (items) => items.filter((item) => item.id !== list.id));
  requestBackgroundSync();
  return operation;
}

async function pendingPriceListCreate(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "PRICE_LIST" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function updatePriceLists(scope: OfflineScope, update: (items: PriceList[]) => PriceList[]) {
  const cached = await getCachedResource<PriceList[]>(scope, path).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, path, update(cached.data), cached.meta).catch(() => undefined);
}
