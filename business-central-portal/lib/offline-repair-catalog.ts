import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";

export type OfflineRepairService = {
  id: string;
  code: string;
  name: string;
  description?: string;
  labor_fee: string;
  is_active: boolean;
};

const path = "/services/catalog?page_index=0&page_size=100";

async function pendingServiceCreate(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "REPAIR_SERVICE" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function updateServices(
  scope: OfflineScope,
  update: (items: OfflineRepairService[]) => OfflineRepairService[],
) {
  const cached = await getCachedResource<OfflineRepairService[]>(scope, path).catch(() => null);
  if (cached) await putCachedResource(scope, path, update(cached.data), cached.meta);
}

export async function queueRepairServiceCreate(scope: OfflineScope, body: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const projection = { id, ...body } as OfflineRepairService;
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "REPAIR_SERVICE",
      entityId: id,
      operationType: "CREATE",
      request: { path: "/services/catalog", method: "POST", body },
    },
    projection,
  );
  await updateServices(scope, (items) => [...items.filter((item) => item.id !== id), projection]);
  return operation;
}

export async function queueRepairServiceUpdate(
  scope: OfflineScope,
  service: OfflineRepairService,
  body: Record<string, unknown>,
) {
  const dependency = await pendingServiceCreate(scope, service.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "REPAIR_SERVICE",
      entityId: service.id,
      operationType: "UPDATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/services/catalog/${encodeURIComponent(service.id)}`,
        method: "PATCH",
        body,
      },
    },
    { ...service, ...body },
  );
  await updateServices(scope, (items) =>
    items.map((item) => (item.id === service.id ? { ...item, ...body } : item)),
  );
  return operation;
}

export async function queueRepairServiceDelete(scope: OfflineScope, service: OfflineRepairService) {
  const dependency = await pendingServiceCreate(scope, service.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "REPAIR_SERVICE",
      entityId: service.id,
      operationType: "DELETE",
      dependencyOperationId: dependency?.operationId,
      request: { path: `/services/catalog/${encodeURIComponent(service.id)}`, method: "DELETE" },
    },
    { ...service, is_deleted: true },
  );
  await updateServices(scope, (items) => items.filter((item) => item.id !== service.id));
  return operation;
}
