import {
  getCachedResource,
  getEntityVersion,
  listOperations,
  putCachedResource,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
} from "./offline-db";
import type { AttributeDefinition, AttributeOption, Variant } from "./types";

export type AttributeDefinitionMutation = Pick<AttributeDefinition, "code" | "name" | "value_type">;
export type AttributeOptionMutation = Pick<
  AttributeOption,
  "definition_id" | "value" | "label" | "position"
>;

const attributesPath = "/catalog/attributes?page_index=0&page_size=100";

async function pendingCreate(scope: OfflineScope, entityType: string, entityId: string) {
  return (await listOperations(scope)).find(
    (operation) =>
      operation.entityType === entityType &&
      operation.entityId === entityId &&
      operation.operationType === "CREATE" &&
      ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
  );
}

export async function queueAttributeDefinitionCreate(
  scope: OfflineScope,
  payload: AttributeDefinitionMutation,
) {
  const id = crypto.randomUUID();
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_DEFINITION",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
    },
    { id, ...payload, options: [] },
  );
  await updateDefinitions(scope, (items) => [
    ...items.filter((item) => item.id !== id),
    { id, ...payload, options: [] },
  ]);
  requestBackgroundSync();
  return operation;
}

export async function queueAttributeDefinitionUpdate(
  scope: OfflineScope,
  definition: AttributeDefinition,
  payload: AttributeDefinitionMutation,
) {
  const dependency = await pendingCreate(scope, "CATALOG_ATTRIBUTE_DEFINITION", definition.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_DEFINITION",
      entityId: definition.id,
      operationType: "UPDATE",
      payload,
      baseVersion: dependency
        ? 1
        : (definition.sync_version ??
          (await getEntityVersion(scope, "CATALOG_ATTRIBUTE_DEFINITION", definition.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...definition, ...payload },
  );
  await updateDefinitions(scope, (items) =>
    items.map((item) => (item.id === definition.id ? { ...item, ...payload } : item)),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueAttributeDefinitionDelete(
  scope: OfflineScope,
  definition: AttributeDefinition,
) {
  const dependency = await pendingCreate(scope, "CATALOG_ATTRIBUTE_DEFINITION", definition.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_DEFINITION",
      entityId: definition.id,
      operationType: "DELETE",
      payload: { id: definition.id },
      baseVersion: dependency
        ? 1
        : (definition.sync_version ??
          (await getEntityVersion(scope, "CATALOG_ATTRIBUTE_DEFINITION", definition.id))),
      dependencyOperationId: dependency?.operationId,
    },
    { ...definition, is_deleted: true },
  );
  await updateDefinitions(scope, (items) => items.filter((item) => item.id !== definition.id));
  requestBackgroundSync();
  return operation;
}

export async function queueAttributeOptionCreate(
  scope: OfflineScope,
  payload: AttributeOptionMutation,
) {
  const id = crypto.randomUUID();
  const dependency = await pendingCreate(
    scope,
    "CATALOG_ATTRIBUTE_DEFINITION",
    payload.definition_id,
  );
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_OPTION",
      entityId: id,
      operationType: "CREATE",
      payload,
      baseVersion: 0,
      dependencyOperationId: dependency?.operationId,
    },
    { id, ...payload },
  );
  await updateDefinitions(scope, (items) =>
    items.map((item) =>
      item.id === payload.definition_id
        ? {
            ...item,
            options: [...item.options.filter((option) => option.id !== id), { id, ...payload }],
          }
        : item,
    ),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueAttributeOptionUpdate(
  scope: OfflineScope,
  option: AttributeOption,
  payload: AttributeOptionMutation,
) {
  const ownDependency = await pendingCreate(scope, "CATALOG_ATTRIBUTE_OPTION", option.id);
  const definitionDependency = await pendingCreate(
    scope,
    "CATALOG_ATTRIBUTE_DEFINITION",
    option.definition_id,
  );
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_OPTION",
      entityId: option.id,
      operationType: "UPDATE",
      payload,
      baseVersion: ownDependency
        ? 1
        : (option.sync_version ??
          (await getEntityVersion(scope, "CATALOG_ATTRIBUTE_OPTION", option.id))),
      dependencyOperationId: ownDependency?.operationId ?? definitionDependency?.operationId,
    },
    { ...option, ...payload },
  );
  await updateDefinitions(scope, (items) =>
    items.map((item) =>
      item.id === option.definition_id
        ? {
            ...item,
            options: item.options.map((itemOption) =>
              itemOption.id === option.id ? { ...itemOption, ...payload } : itemOption,
            ),
          }
        : item,
    ),
  );
  requestBackgroundSync();
  return operation;
}

export async function queueAttributeOptionDelete(scope: OfflineScope, option: AttributeOption) {
  const ownDependency = await pendingCreate(scope, "CATALOG_ATTRIBUTE_OPTION", option.id);
  const operation = await queueOperationWithEntity(
    scope,
    {
      entityType: "CATALOG_ATTRIBUTE_OPTION",
      entityId: option.id,
      operationType: "DELETE",
      payload: { definition_id: option.definition_id },
      baseVersion: ownDependency
        ? 1
        : (option.sync_version ??
          (await getEntityVersion(scope, "CATALOG_ATTRIBUTE_OPTION", option.id))),
      dependencyOperationId: ownDependency?.operationId,
    },
    { ...option, is_deleted: true },
  );
  await updateDefinitions(scope, (items) =>
    items.map((item) =>
      item.id === option.definition_id
        ? {
            ...item,
            options: item.options.filter((itemOption) => itemOption.id !== option.id),
          }
        : item,
    ),
  );
  requestBackgroundSync();
  return operation;
}

async function updateDefinitions(
  scope: OfflineScope,
  update: (items: AttributeDefinition[]) => AttributeDefinition[],
) {
  const cached = await getCachedResource<AttributeDefinition[]>(scope, attributesPath).catch(
    () => null,
  );
  if (cached) {
    await putCachedResource(scope, attributesPath, update(cached.data), cached.meta).catch(
      () => undefined,
    );
  }
}

export function variantAttributes(variant: Variant): Record<string, unknown> {
  return variant.attributes ?? {};
}

export async function applyAttributeSyncChange(
  scope: OfflineScope,
  change: {
    entityType: string;
    operationType?: string;
    payload: Record<string, unknown>;
  },
) {
  const cached = await getCachedResource<AttributeDefinition[]>(scope, attributesPath).catch(
    () => null,
  );
  if (!cached) return;
  const payload = change.payload;
  if (change.entityType === "CATALOG_ATTRIBUTE_DEFINITION") {
    const definition = payload as unknown as AttributeDefinition;
    await updateDefinitions(scope, (items) =>
      change.operationType === "DELETE"
        ? items.filter((item) => item.id !== String(payload.id))
        : [
            ...items.filter((item) => item.id !== definition.id),
            { ...definition, options: definition.options ?? [] },
          ],
    );
    return;
  }
  if (change.entityType !== "CATALOG_ATTRIBUTE_OPTION") return;
  const definitionID = String(payload.definition_id ?? "");
  if (!definitionID) return;
  await updateDefinitions(scope, (items) =>
    items.map((definition) => {
      if (definition.id !== definitionID) return definition;
      return {
        ...definition,
        options:
          change.operationType === "DELETE"
            ? definition.options.filter((item) => item.id !== String(payload.id))
            : [
                ...definition.options.filter((item) => item.id !== String(payload.id)),
                payload as unknown as AttributeOption,
              ].sort(
                (left, right) =>
                  left.position - right.position || left.label.localeCompare(right.label),
              ),
      };
    }),
  );
}
