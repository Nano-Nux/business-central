import { queueOperationWithEntity, requestBackgroundSync, type OfflineScope } from "./offline-db";

export type RepairDraftPayload = {
  shop_id: string;
  priority: string;
  device: { device_type: string; manufacturer?: string; model?: string; serial_number?: string };
  issue_description: string;
  customer_name?: string;
  customer_phone?: string;
  note?: string;
};

export async function queueRepairDraft(scope: OfflineScope, payload: RepairDraftPayload) {
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    {
      shopId: payload.shop_id,
      entityType: "REPAIR_DRAFT",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, ...payload, is_deleted: false },
  );
  requestBackgroundSync();
  return operation;
}
