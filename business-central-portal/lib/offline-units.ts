import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { Conversion, Unit } from "./types";

export type UnitMutation = Pick<
  Unit,
  "code" | "name" | "symbol" | "dimension_code" | "allows_decimal" | "is_active"
>;
export type ConversionMutation = Pick<
  Conversion,
  "from_unit_id" | "to_unit_id" | "multiplier" | "additive_offset" | "is_active"
>;

const unitsPath = "/units?page_index=0&page_size=100";
const conversionsPath = "/unit-conversions?page_index=0&page_size=100";

async function pendingUnitCreate(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "CATALOG_UNIT" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function queueUnitCreate(scope: OfflineScope, payload: UnitMutation) {
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_UNIT",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, ...payload },
  );
  await updateResource<Unit>(scope, unitsPath, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueUnitUpdate(scope: OfflineScope, unit: Unit, payload: UnitMutation) {
  const dependency = await pendingUnitCreate(scope, unit.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_UNIT",
      entityId: unit.id,
      operationType: "UPDATE",
      payload,
      baseVersion: dependency
        ? 1
        : (unit.sync_version ?? (await getEntityVersion(scope, "CATALOG_UNIT", unit.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...unit, ...payload },
  );
  await updateResource<Unit>(scope, unitsPath, (items) =>
    items.map((item) => (item.id === unit.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueUnitDelete(scope: OfflineScope, unit: Unit) {
  const dependency = await pendingUnitCreate(scope, unit.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_UNIT",
      entityId: unit.id,
      operationType: "DELETE",
      payload: { id: unit.id },
      baseVersion: dependency
        ? 1
        : (unit.sync_version ?? (await getEntityVersion(scope, "CATALOG_UNIT", unit.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...unit, is_deleted: true },
  );
  await updateResource<Unit>(scope, unitsPath, (items) =>
    items.filter((item) => item.id !== unit.id),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueConversionCreate(scope: OfflineScope, payload: ConversionMutation) {
  const dependency = await conversionDependency(scope, payload.from_unit_id, payload.to_unit_id);
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CONVERSION",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
      dependencyOperationId: dependency,
    },
    { id, ...payload },
  );
  await updateResource<Conversion>(scope, conversionsPath, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueConversionUpdate(
  scope: OfflineScope,
  conversion: Conversion,
  payload: ConversionMutation,
) {
  const ownCreate = await pendingConversionCreate(scope, conversion.id);
  const dependency =
    ownCreate?.operationId ??
    (await conversionDependency(scope, payload.from_unit_id, payload.to_unit_id));
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CONVERSION",
      entityId: conversion.id,
      operationType: "UPDATE",
      payload,
      baseVersion: ownCreate
        ? 1
        : (conversion.sync_version ??
          (await getEntityVersion(scope, "CATALOG_CONVERSION", conversion.id))),
      dependencyOperationId: dependency,
    },
    { ...conversion, ...payload },
  );
  await updateResource<Conversion>(scope, conversionsPath, (items) =>
    items.map((item) => (item.id === conversion.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueConversionDelete(scope: OfflineScope, conversion: Conversion) {
  const ownCreate = await pendingConversionCreate(scope, conversion.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_CONVERSION",
      entityId: conversion.id,
      operationType: "DELETE",
      payload: { id: conversion.id },
      baseVersion: ownCreate
        ? 1
        : (conversion.sync_version ??
          (await getEntityVersion(scope, "CATALOG_CONVERSION", conversion.id))),
      dependencyOperationId: ownCreate?.operationId,
    },
    { ...conversion, is_deleted: true },
  );
  await updateResource<Conversion>(scope, conversionsPath, (items) =>
    items.filter((item) => item.id !== conversion.id),
  );
  requestBackgroundSync();
  return operation;
}

async function conversionDependency(scope: OfflineScope, fromID: string, toID: string) {
  const from = await pendingUnitCreate(scope, fromID);
  const to = await pendingUnitCreate(scope, toID);
  if (from && to)
    throw new Error("Synchronize both new units before creating a conversion between them.");
  return (from ?? to)?.operationId;
}

async function pendingConversionCreate(scope: OfflineScope, id: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === "CATALOG_CONVERSION" &&
      operation.entityId === id &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

async function updateResource<T>(scope: OfflineScope, path: string, update: (items: T[]) => T[]) {
  const cached = await getCachedResource<T[]>(scope, path).catch(() => null);
  if (cached)
    await putCachedResource(scope, path, update(cached.data), cached.meta).catch(() => undefined);
}
