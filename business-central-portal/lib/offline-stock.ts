import {
  listCachedResources,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
  type OfflineOperation,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";
import { randomUuid } from "./random-uuid";
import type { StorageItem } from "./types";

export type StockReceiptMutation = {
  variant_id: string;
  destination_location_id: string;
  unit_id: string;
  quantity: string;
  unit_cost?: string;
  event_key: string;
};

export async function queueStockReceipt(
  scope: OfflineScope,
  shopId: string,
  payload: StockReceiptMutation,
  id = randomUuid(),
) {
  const previous = (await listOperations(scope)).find(
    (operation) => operation.entityType === "STOCK_RECEIPT" && operation.entityId === id,
  );
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "STOCK_RECEIPT",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
      shopId,
    },
    { id, ...payload, movement_type: "RECEIPT", shop_id: shopId },
  );
  const resources =
    await listCachedResources<Array<{ id: string; quantity_on_hand: string }>>(scope);
  await Promise.all(
    resources
      .filter(
        (resource) =>
          resource.path.startsWith(`/pos/catalog?`) &&
          resource.path.includes(`shop_id=${encodeURIComponent(shopId)}`),
      )
      .map((resource) =>
        putCachedResource(
          scope,
          resource.path,
          (Array.isArray(resource.data) ? resource.data : []).map((item) =>
            item.id === payload.variant_id
              ? {
                  ...item,
                  quantity_on_hand: (
                    Number(item.quantity_on_hand || 0) +
                    Number(payload.quantity) -
                    Number(previous?.payload.quantity || 0)
                  ).toFixed(3),
                }
              : item,
          ),
          resource.meta,
        ),
      ),
  );
  requestBackgroundSync();
  return operation;
}

export type StockReductionMutation = {
  variant_id: string;
  source_location_id: string;
  quantity: string;
  reason: string;
  event_key: string;
};

export async function queueStockReduction(
  scope: OfflineScope,
  shopId: string,
  payload: StockReductionMutation,
  id = randomUuid(),
) {
  const dependency = (await listOperations(scope))
    .reverse()
    .find(
      (operation) =>
        operation.entityId !== id &&
        ["PENDING", "SYNCING", "FAILED"].includes(operation.status) &&
        operation.payload.variant_id === payload.variant_id &&
        ((operation.entityType === "STOCK_RECEIPT" &&
          operation.payload.destination_location_id === payload.source_location_id) ||
          (operation.entityType === "STOCK_REDUCTION" &&
            operation.payload.source_location_id === payload.source_location_id)),
    );
  return queueDeferredMutation(
    scope,
    {
      entityType: "STOCK_REDUCTION",
      entityId: id,
      operationType: "CREATE",
      shopId,
      dependencyOperationId: dependency?.operationId,
      request: { path: "/inventory/stock-reductions", method: "POST", body: payload },
    },
    { id, ...payload, movement_type: "ADJUSTMENT", shop_id: shopId },
  );
}

// Keep the cached server balance intact. Pending deltas are derived from the
// durable outbox, so refresh, rejection and discard cannot apply them twice.
export function projectStorageStock(items: StorageItem[], operations: OfflineOperation[]) {
  return items.map((item) => {
    const pending = operations.filter(
      (op) =>
        ["PENDING", "SYNCING", "FAILED"].includes(op.status) &&
        ["STOCK_RECEIPT", "STOCK_REDUCTION"].includes(op.entityType) &&
        op.payload.variant_id === item.id,
    );
    const delta = pending.reduce(
      (sum, op) =>
        sum + Number(op.payload.quantity || 0) * (op.entityType === "STOCK_REDUCTION" ? -1 : 1),
      0,
    );
    return {
      ...item,
      stock_count: pending.length
        ? (Number(item.stock_count || 0) + delta).toFixed(6)
        : item.stock_count,
      stock_pending: pending.length > 0,
    };
  });
}
