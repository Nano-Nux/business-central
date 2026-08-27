import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  payloadHash,
  putCachedResource,
  updateOperation,
  type OfflineScope,
  type OfflineOperation,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";
import { PORTAL_IMAGE_UPLOADS, type OfflineImageUpload } from "./offline-images";
import type { RepairDevice, RepairOrder, RepairWorkItem } from "./types";
import { addDateOnlyDays, dateOnlyDaysBetween } from "./date-time";

export async function editQueuedRepairTicket(
  operation: OfflineOperation,
  changes: { deposit_amount: string; payment_status: string; payment_method: string },
) {
  const envelope = operation.payload.portal_request;
  if (!envelope || typeof envelope !== "object")
    throw new Error("This operation does not contain an editable repair request.");
  const request = envelope as Record<string, unknown>;
  const body = request.body;
  if (!body || typeof body !== "object")
    throw new Error("This operation does not contain a repair request body.");
  const nextBody = {
    ...(body as Record<string, unknown>),
    deposit_amount: changes.deposit_amount.trim() || "0",
    payment_status: changes.payment_status,
    payment_method: changes.payment_method,
  };
  const basePayload = {
    ...operation.payload,
    portal_request: { ...request, body: nextBody, headers: undefined },
  } as Record<string, unknown>;
  const keySeed = await payloadHash(basePayload);
  const payload = {
    ...basePayload,
    portal_request: {
      ...request,
      body: nextBody,
      headers: {
        ...((request.headers as Record<string, string> | undefined) ?? {}),
        "Idempotency-Key": `${operation.entityType}:${operation.entityId}:${keySeed.slice(0, 24)}`,
      },
    },
  } as Record<string, unknown>;
  await updateOperation(operation.operationId, {
    payload,
    payloadHash: await payloadHash(payload),
    status: "PENDING",
    retryCount: 0,
    nextRetryAt: undefined,
    lastError: undefined,
  });
}

function repairsPath(shopID: string) {
  return `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${encodeURIComponent(shopID)}`;
}

function repairPath(repair: RepairOrder) {
  return repair.shop_id
    ? repairsPath(repair.shop_id)
    : "/repairs/orders?page_index=0&page_size=100";
}

async function updateResource<T>(scope: OfflineScope, path: string, update: (items: T[]) => T[]) {
  const cached = await getCachedResource<T[]>(scope, path).catch(() => null);
  if (cached) await putCachedResource(scope, path, update(cached.data), cached.meta);
}

async function reserveCatalogStock(
  scope: OfflineScope,
  shopId: string | undefined,
  variantId: string,
  quantity: string,
) {
  if (!shopId) return;
  const path = `/pos/catalog?page_index=0&page_size=200&shop_id=${encodeURIComponent(shopId)}`;
  await updateResource<Record<string, unknown>>(scope, path, (items) =>
    items.map((item) =>
      item.id === variantId
        ? {
            ...item,
            quantity_on_hand: Math.max(
              0,
              Number(item.quantity_on_hand ?? 0) - Number(quantity),
            ).toFixed(3),
          }
        : item,
    ),
  );
}

async function pendingRepairCreate(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "REPAIR_ORDER" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function queueRepairTicketCreate(
  scope: OfflineScope,
  shopId: string,
  body: Record<string, unknown>,
  projection: RepairOrder,
  options: { offlineImageUploads?: OfflineImageUpload[]; localImages?: unknown[] } = {},
) {
  const id = projection.id;
  const requestedWorkItems = Array.isArray(body.work_items) ? body.work_items : [];
  const normalizedWorkItems = requestedWorkItems
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      ...item,
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
    }));
  const requestBody = normalizedWorkItems.length
    ? { ...body, work_items: normalizedWorkItems }
    : body;
  const projectedWorkItems = normalizedWorkItems.map((item, index) => {
    const itemRecord = item as Record<string, unknown>;
    const waitingStartDate = projection.received_at.slice(0, 10);
    const waitingDays = Math.max(0, Number(itemRecord.waiting_days ?? 0));
    const waitingEndDate =
      typeof itemRecord.waiting_end_date === "string" && itemRecord.waiting_end_date
        ? itemRecord.waiting_end_date
        : addDateOnlyDays(waitingStartDate, waitingDays);
    return {
      id: String(itemRecord.id),
      service_order_id: projection.service_order_id,
      sequence_number: index + 1,
      type: String(itemRecord.type ?? "DEVICE"),
      status: "OPEN",
      form_version: 1,
      device: (itemRecord.device ?? {}) as RepairDevice,
      issue_description: String(itemRecord.issue_description ?? ""),
      issues: Array.isArray(itemRecord.issues)
        ? itemRecord.issues.map(String)
        : [String(itemRecord.issue_description ?? "")].filter(Boolean),
      conditions: Array.isArray(itemRecord.conditions) ? itemRecord.conditions.map(String) : [],
      note: typeof itemRecord.note === "string" ? itemRecord.note : undefined,
      additional_fee: String(itemRecord.additional_fee ?? "0"),
      waiting_start_date: waitingStartDate,
      waiting_end_date: waitingEndDate,
      waiting_days: dateOnlyDaysBetween(waitingStartDate, waitingEndDate),
      financials: {
        subtotal: "0.00",
        discount_total: "0.00",
        tax_amount: "0.00",
        total: "0.00",
        paid: "0.00",
        balance: "0.00",
      },
      fields:
        itemRecord.fields && typeof itemRecord.fields === "object"
          ? (itemRecord.fields as Record<string, unknown>)
          : {},
    };
  });
  const waitingStartDate = projectedWorkItems.map((item) => item.waiting_start_date).sort()[0];
  const waitingEndDate = projectedWorkItems
    .map((item) => item.waiting_end_date)
    .sort()
    .at(-1);
  const projectedRepair = projectedWorkItems.length
    ? {
        ...projection,
        work_items: projectedWorkItems,
        waiting_start_date: waitingStartDate,
        waiting_end_date: waitingEndDate,
        waiting_days:
          waitingStartDate && waitingEndDate
            ? dateOnlyDaysBetween(waitingStartDate, waitingEndDate)
            : 0,
      }
    : projection;
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId,
      entityType: "REPAIR_ORDER",
      entityId: id,
      operationType: "CREATE",
      request: { path: "/repairs/tickets", method: "POST", body: requestBody },
      ...(options.offlineImageUploads?.length
        ? {
            payload: {
              ...requestBody,
              [PORTAL_IMAGE_UPLOADS]: options.offlineImageUploads,
            },
          }
        : {}),
    },
    projectedRepair,
  );
  await updateResource<RepairOrder>(scope, repairsPath(shopId), (items) => [
    ...items.filter((item) => item.id !== id),
    projectedRepair,
  ]);
  const parts = Array.isArray(body.parts) ? body.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const item = part as Record<string, unknown>;
    if (typeof item.variant_id === "string") {
      await reserveCatalogStock(scope, shopId, item.variant_id, String(item.quantity ?? "0"));
    }
  }
  const images = options.localImages ?? (Array.isArray(body.images) ? body.images : []);
  if (images.length) {
    await updateResource<Record<string, unknown>>(
      scope,
      `/repairs/orders/${id}/images?page_index=0&page_size=100`,
      () =>
        images.map((image) => ({
          id: crypto.randomUUID(),
          repair_order_id: id,
          ...(image as Record<string, unknown>),
          created_at: new Date().toISOString(),
        })),
    );
  }
  if (Number(body.deposit_amount ?? 0) > 0) {
    await updateResource<Record<string, unknown>>(
      scope,
      `/repairs/orders/${id}/payments?page_index=0&page_size=100`,
      () => [
        {
          id: crypto.randomUUID(),
          repair_order_id: id,
          kind: "DEPOSIT",
          method: body.payment_method,
          amount: String(body.deposit_amount),
          status: "PENDING_SYNCHRONIZATION",
          created_at: new Date().toISOString(),
        },
      ],
    );
  }
  if (parts.length) {
    await updateResource<Record<string, unknown>>(
      scope,
      `/repairs/orders/${id}/parts?page_index=0&page_size=100`,
      () =>
        parts.map((part) => ({
          id: crypto.randomUUID(),
          repair_order_id: id,
          ...(part as Record<string, unknown>),
          status: "USED",
        })),
    );
  }
  return { operation, projectedRepair };
}

export async function updateRepairProjection(
  scope: OfflineScope,
  repair: RepairOrder,
  update: Partial<RepairOrder>,
) {
  const projection = { ...repair, ...update };
  await updateResource<RepairOrder>(scope, repairPath(repair), (items) =>
    items.map((item) => (item.id === repair.id ? projection : item)),
  );
  return projection;
}

export async function queueRepairStatusUpdate(
  scope: OfflineScope,
  repair: RepairOrder,
  body: Record<string, unknown>,
) {
  const dependency = await pendingRepairCreate(scope, repair.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_ORDER",
      entityId: repair.id,
      operationType: "UPDATE",
      dependencyOperationId: dependency?.operationId,
      baseVersion: dependency ? 1 : await getEntityVersion(scope, "REPAIR_ORDER", repair.id),
      request: {
        path: `/repairs/orders/${encodeURIComponent(repair.id)}`,
        method: "PATCH",
        body,
      },
    },
    { ...repair, ...body },
  );
  await updateResource<RepairOrder>(scope, repairPath(repair), (items) =>
    items.map((item) => (item.id === repair.id ? { ...item, ...body } : item)),
  );
  return operation;
}

export async function queueRepairWorkItemStatus(
  scope: OfflineScope,
  repair: RepairOrder,
  workItemId: string,
  status: string,
) {
  const dependency = await pendingRepairCreate(scope, repair.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_WORK_ITEM",
      entityId: workItemId,
      operationType: "UPDATE",
      dependencyOperationId: dependency?.operationId,
      baseVersion: dependency ? 1 : await getEntityVersion(scope, "REPAIR_WORK_ITEM", workItemId),
      request: {
        path: `/repairs/work-items/${encodeURIComponent(workItemId)}`,
        method: "PATCH",
        body: { status },
      },
    },
    { id: workItemId, repair_order_id: repair.id, status },
  );
  await updateResource<RepairOrder>(scope, repairPath(repair), (items) =>
    items.map((item) =>
      item.id !== repair.id
        ? item
        : {
            ...item,
            work_items: (item.work_items ?? []).map((workItem) =>
              workItem.id === workItemId ? { ...workItem, status } : workItem,
            ),
          },
    ),
  );
  await updateResource<RepairWorkItem>(
    scope,
    `/repairs/orders/${repair.id}/work-items?page_index=0&page_size=100`,
    (items) => items.map((item) => (item.id === workItemId ? { ...item, status } : item)),
  );
  return operation;
}

export async function queueRepairDetailsUpdate(
  scope: OfflineScope,
  repair: RepairOrder,
  body: Record<string, unknown>,
) {
  const requestedWorkItems = Array.isArray(body.work_items)
    ? body.work_items.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
    : [];
  const dependency = await pendingRepairCreate(scope, repair.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_ORDER",
      entityId: repair.id,
      operationType: "UPDATE",
      dependencyOperationId: dependency?.operationId,
      baseVersion: dependency ? 1 : await getEntityVersion(scope, "REPAIR_ORDER", repair.id),
      request: {
        path: `/repairs/orders/${encodeURIComponent(repair.id)}/details`,
        method: "PATCH",
        body,
      },
    },
    { ...repair, ...body },
  );
  const projectedWorkItems = requestedWorkItems.length
    ? (repair.work_items ?? []).map((workItem) => {
        const update = requestedWorkItems.find((item) => item.id === workItem.id);
        return update
          ? {
              ...workItem,
              device:
                update.device && typeof update.device === "object"
                  ? {
                      ...workItem.device,
                      ...(update.device as Partial<RepairDevice>),
                    }
                  : workItem.device,
              issue_description: String(update.issue_description ?? workItem.issue_description),
              issues: Array.isArray(update.issues) ? update.issues.map(String) : workItem.issues,
              conditions: Array.isArray(update.conditions)
                ? update.conditions.map(String)
                : workItem.conditions,
              note: typeof update.note === "string" ? update.note : undefined,
              waiting_end_date:
                typeof update.waiting_end_date === "string"
                  ? update.waiting_end_date
                  : workItem.waiting_end_date,
              waiting_days:
                typeof update.waiting_days === "number"
                  ? update.waiting_days
                  : workItem.waiting_days,
            }
          : workItem;
      })
    : undefined;
  const projectionUpdate: Partial<RepairOrder> = requestedWorkItems.length
    ? ({
        ...body,
        issue_description:
          projectedWorkItems?.[0]?.issue_description ??
          String(body.issue_description ?? repair.issue_description),
        work_items: projectedWorkItems ?? [],
        waiting_start_date: projectedWorkItems
          ?.map((item) => item.waiting_start_date)
          .filter((value): value is string => Boolean(value))
          .sort()[0],
        waiting_end_date: projectedWorkItems
          ?.map((item) => item.waiting_end_date)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1),
      } as Partial<RepairOrder>)
    : (body as Partial<RepairOrder>);
  if (projectionUpdate.waiting_start_date && projectionUpdate.waiting_end_date) {
    projectionUpdate.waiting_days = dateOnlyDaysBetween(
      projectionUpdate.waiting_start_date,
      projectionUpdate.waiting_end_date,
    );
  }
  await updateRepairProjection(scope, repair, projectionUpdate);
  if (projectedWorkItems) {
    await updateResource<RepairWorkItem>(
      scope,
      `/repairs/orders/${repair.id}/work-items?page_index=0&page_size=100`,
      (items) =>
        items.map((item) => projectedWorkItems.find((workItem) => workItem.id === item.id) ?? item),
    );
  }
  return operation;
}

export async function queueRepairPart(
  scope: OfflineScope,
  repair: RepairOrder,
  body: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  const dependency = await pendingRepairCreate(scope, repair.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_PART",
      entityId: id,
      operationType: "CREATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/repairs/orders/${encodeURIComponent(repair.id)}/parts`,
        method: "POST",
        body: { repair_order_id: repair.id, ...body },
      },
    },
    { id, repair_order_id: repair.id, ...body },
  );
  await reserveCatalogStock(scope, repair.shop_id, String(body.variant_id), String(body.quantity));
  return operation;
}

export async function queueRepairPayment(
  scope: OfflineScope,
  repair: RepairOrder,
  body: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  const dependency = await pendingRepairCreate(scope, repair.id);
  const payment = {
    id,
    repair_order_id: repair.id,
    status: "PENDING_SYNCHRONIZATION",
    ...body,
  };
  const operation = await queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_PAYMENT",
      entityId: id,
      operationType: "CREATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/repairs/orders/${encodeURIComponent(repair.id)}/payments`,
        method: "POST",
        body,
      },
    },
    payment,
  );
  const paid = Number(repair.deposit_paid ?? 0) + Number(body.amount ?? 0);
  const completed = Number(repair.total_cost ?? 0) > 0 && paid >= Number(repair.total_cost ?? 0);
  await updateRepairProjection(scope, repair, {
    deposit_paid: paid.toFixed(2),
    payment_status: completed ? "PAID" : "AMOUNT_PAID",
    status: completed ? "COMPLETED" : repair.status,
    completed_at: completed
      ? (repair.completed_at ?? new Date().toISOString())
      : repair.completed_at,
  });
  return operation;
}

export async function queueRepairImage(
  scope: OfflineScope,
  repair: RepairOrder,
  body: Record<string, unknown>,
  options: { offlineImageUpload?: OfflineImageUpload; localImageUrl?: string } = {},
) {
  const id = crypto.randomUUID();
  const dependency = await pendingRepairCreate(scope, repair.id);
  return queueDeferredMutation(
    scope,
    {
      shopId: repair.shop_id,
      entityType: "REPAIR_IMAGE",
      entityId: id,
      operationType: "CREATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/repairs/orders/${encodeURIComponent(repair.id)}/images`,
        method: "POST",
        body,
      },
      ...(options.offlineImageUpload
        ? {
            payload: {
              ...body,
              [PORTAL_IMAGE_UPLOADS]: [options.offlineImageUpload],
            },
          }
        : {}),
    },
    {
      id,
      repair_order_id: repair.id,
      ...body,
      ...(options.localImageUrl ? { image_url: options.localImageUrl } : {}),
    },
  );
}

export async function addPendingRepairChild<T>(
  scope: OfflineScope,
  repair: RepairOrder,
  resource: "parts" | "payments" | "images",
  child: T,
) {
  await updateResource<T>(
    scope,
    `/repairs/orders/${repair.id}/${resource}?page_index=0&page_size=100`,
    (items) => [...items, child],
  );
}
