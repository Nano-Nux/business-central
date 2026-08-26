import {
  listCachedResources,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";

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
) {
  const id = crypto.randomUUID();
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
                    Number(item.quantity_on_hand || 0) + Number(payload.quantity)
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
