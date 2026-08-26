import {
  getEntityVersion,
  getCachedResource,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { Delivery } from "./types";

export async function queueDeliveryCreate(
  scope: OfflineScope,
  shopId: string,
  name: string,
  contactInfo: string,
) {
  const id = crypto.randomUUID();
  const payload = { shop_id: shopId, name, contact_info: contactInfo, is_active: true };
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId,
      entityType: "DELIVERY",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, shop_id: shopId, name, contact_info: contactInfo, is_active: true },
  );
  await updateDeliveryCollection(scope, shopId, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, shop_id: shopId, name, contact_info: contactInfo },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueDeliveryDelete(scope: OfflineScope, delivery: Delivery) {
  const operations = await listOperations(scope);
  const pendingCreate = operations.find(
    (operation) =>
      operation.entityType === "DELIVERY" &&
      operation.entityId === delivery.id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
  const baseVersion = pendingCreate
    ? 1
    : (delivery.sync_version ?? (await getEntityVersion(scope, "DELIVERY", delivery.id)));
  const payload = {
    shop_id: delivery.shop_id,
    name: delivery.name,
    contact_info: delivery.contact_info,
    is_active: false,
  };
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId: delivery.shop_id,
      entityType: "DELIVERY",
      entityId: delivery.id,
      operationType: "DELETE",
      payload,
      baseVersion,
      dependencyOperationId: pendingCreate?.operationId,
    },
    { ...delivery, is_active: false },
  );
  await updateDeliveryCollection(scope, delivery.shop_id, (items) =>
    items.filter((item) => item.id !== delivery.id),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueDeliveryUpdate(
  scope: OfflineScope,
  delivery: Delivery,
  name: string,
  contactInfo: string,
) {
  const operations = await listOperations(scope);
  const pendingCreate = operations.find(
    (operation) =>
      operation.entityType === "DELIVERY" &&
      operation.entityId === delivery.id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
  const baseVersion = pendingCreate
    ? 1
    : (delivery.sync_version ?? (await getEntityVersion(scope, "DELIVERY", delivery.id)));
  const updated = { ...delivery, name, contact_info: contactInfo };
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId: delivery.shop_id,
      entityType: "DELIVERY",
      entityId: delivery.id,
      operationType: "UPDATE",
      payload: { shop_id: delivery.shop_id, name, contact_info: contactInfo, is_active: true },
      baseVersion,
      dependencyOperationId: pendingCreate?.operationId,
    },
    updated,
  );
  await updateDeliveryCollection(scope, delivery.shop_id, (items) =>
    items.map((item) => (item.id === delivery.id ? updated : item)),
  );
  requestBackgroundSync();
  return operation;
}

async function updateDeliveryCollection(
  scope: OfflineScope,
  shopId: string,
  update: (items: Delivery[]) => Delivery[],
) {
  const path = `/shops/${shopId}/deliveries?page_index=0&page_size=100`;
  const cached = await getCachedResource<Delivery[]>(scope, path).catch(() => null);
  if (!cached) return;
  await putCachedResource(scope, path, update(cached.data), cached.meta).catch(() => undefined);
}
