import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";
import type { Product, Promotion } from "./types";

export type PromotionCode = {
  id: string;
  code: string;
  is_active: boolean;
  usage_limit?: number;
  redemption_count: number;
};

export type PromotionScope = {
  id: string;
  product_id: string;
  variant_id?: string;
  product_name: string;
  variant_name?: string;
};

const promotionsPath = "/promotions?page_index=0&page_size=100";
const activePromotionsPath = "/promotions?page_index=0&page_size=100&filter=is_active:true";

async function pendingPromotion(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "PROMOTION" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function pendingChildCreate(
  scope: OfflineScope,
  entityType: "PROMOTION_SCOPE" | "PROMOTION_CODE",
  id: string,
) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === entityType &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function updateResource<T>(scope: OfflineScope, path: string, update: (items: T[]) => T[]) {
  const cached = await getCachedResource<T[]>(scope, path).catch(() => null);
  if (cached) await putCachedResource(scope, path, update(cached.data), cached.meta);
}

export async function queuePromotionCreate(scope: OfflineScope, body: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const projection = { id, redemption_count: 0, ...body } as Promotion;
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION",
      entityId: id,
      operationType: "CREATE",
      request: { path: "/promotions", method: "POST", body },
    },
    projection,
  );
  await updateResource<Promotion>(scope, promotionsPath, (items) => [
    ...items.filter((item) => item.id !== id),
    projection,
  ]);
  if (projection.is_active) {
    await updateResource<Promotion>(scope, activePromotionsPath, (items) => [
      ...items.filter((item) => item.id !== id),
      projection,
    ]);
  }
  return operation;
}

export async function queuePromotionUpdate(
  scope: OfflineScope,
  promotion: Promotion,
  body: Record<string, unknown>,
) {
  const dependency = await pendingPromotion(scope, promotion.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION",
      entityId: promotion.id,
      operationType: "UPDATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/promotions/${encodeURIComponent(promotion.id)}`,
        method: "PATCH",
        body,
      },
    },
    { ...promotion, ...body },
  );
  await updateResource<Promotion>(scope, promotionsPath, (items) =>
    items.map((item) => (item.id === promotion.id ? { ...item, ...body } : item)),
  );
  await updateResource<Promotion>(scope, activePromotionsPath, (items) =>
    body.is_active === false
      ? items.filter((item) => item.id !== promotion.id)
      : items.map((item) => (item.id === promotion.id ? { ...item, ...body } : item)),
  );
  return operation;
}

export async function queuePromotionDelete(scope: OfflineScope, promotion: Promotion) {
  const dependency = await pendingPromotion(scope, promotion.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION",
      entityId: promotion.id,
      operationType: "DELETE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: `/promotions/${encodeURIComponent(promotion.id)}`,
        method: "DELETE",
      },
    },
    { ...promotion, is_deleted: true },
  );
  await updateResource<Promotion>(scope, promotionsPath, (items) =>
    items.filter((item) => item.id !== promotion.id),
  );
  await updateResource<Promotion>(scope, activePromotionsPath, (items) =>
    items.filter((item) => item.id !== promotion.id),
  );
  return operation;
}

export async function queuePromotionScopeCreate(
  scope: OfflineScope,
  promotion: Promotion,
  body: { product_id: string; variant_id?: string },
  product?: Product,
) {
  const id = crypto.randomUUID();
  const dependency = await pendingPromotion(scope, promotion.id);
  const projection: PromotionScope = {
    id,
    product_id: body.product_id,
    ...(body.variant_id ? { variant_id: body.variant_id } : {}),
    product_name: product?.name ?? body.product_id,
  };
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION_SCOPE",
      entityId: id,
      operationType: "CREATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: "/promotions/products",
        method: "POST",
        body: { promotion_id: promotion.id, ...body },
      },
    },
    projection,
  );
  await updateResource<PromotionScope>(
    scope,
    `/promotions/${promotion.id}/products?page_index=0&page_size=100`,
    (items) => [...items.filter((item) => item.id !== id), projection],
  );
  return operation;
}

export async function queuePromotionScopeDelete(
  scope: OfflineScope,
  promotion: Promotion,
  item: PromotionScope,
) {
  const dependency = await pendingChildCreate(scope, "PROMOTION_SCOPE", item.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION_SCOPE",
      entityId: item.id,
      operationType: "DELETE",
      dependencyOperationId: dependency?.operationId,
      request: { path: `/promotions/products/${encodeURIComponent(item.id)}`, method: "DELETE" },
    },
    { ...item, is_deleted: true },
  );
  await updateResource<PromotionScope>(
    scope,
    `/promotions/${promotion.id}/products?page_index=0&page_size=100`,
    (items) => items.filter((candidate) => candidate.id !== item.id),
  );
  return operation;
}

export async function queuePromotionCodeCreate(
  scope: OfflineScope,
  promotion: Promotion,
  body: { code: string; is_active: boolean; usage_limit?: number },
) {
  const id = crypto.randomUUID();
  const dependency = await pendingPromotion(scope, promotion.id);
  const projection: PromotionCode = { id, redemption_count: 0, ...body };
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION_CODE",
      entityId: id,
      operationType: "CREATE",
      dependencyOperationId: dependency?.operationId,
      request: {
        path: "/promotions/codes",
        method: "POST",
        body: { promotion_id: promotion.id, ...body },
      },
    },
    projection,
  );
  await updateResource<PromotionCode>(
    scope,
    `/promotions/${promotion.id}/codes?page_index=0&page_size=100`,
    (items) => [...items.filter((item) => item.id !== id), projection],
  );
  return operation;
}

export async function queuePromotionCodeDelete(
  scope: OfflineScope,
  promotion: Promotion,
  item: PromotionCode,
) {
  const dependency = await pendingChildCreate(scope, "PROMOTION_CODE", item.id);
  const operation = await queueDeferredMutation(
    scope,
    {
      entityType: "PROMOTION_CODE",
      entityId: item.id,
      operationType: "DELETE",
      dependencyOperationId: dependency?.operationId,
      request: { path: `/promotions/codes/${encodeURIComponent(item.id)}`, method: "DELETE" },
    },
    { ...item, is_deleted: true },
  );
  await updateResource<PromotionCode>(
    scope,
    `/promotions/${promotion.id}/codes?page_index=0&page_size=100`,
    (items) => items.filter((candidate) => candidate.id !== item.id),
  );
  return operation;
}
