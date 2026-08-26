import { queueOperationWithEntity, requestBackgroundSync, type OfflineScope } from "./offline-db";

export async function queueRepairDiagnostic(
  scope: OfflineScope,
  shopId: string,
  repairOrderId: string,
  diagnosis: string,
  workItemId?: string,
) {
  const id = crypto.randomUUID();
  const payload = {
    shop_id: shopId,
    repair_order_id: repairOrderId,
    work_item_id: workItemId || undefined,
    diagnosis: diagnosis.trim(),
  };
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId,
      entityType: "REPAIR_DIAGNOSTIC",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, ...payload },
  );
  requestBackgroundSync();
  return operation;
}
