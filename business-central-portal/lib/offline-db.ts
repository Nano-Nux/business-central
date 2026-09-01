import type { ApiEnvelope } from "./types";
import { randomUuid } from "./random-uuid";

export const PORTAL_OFFLINE_SCHEMA_VERSION = 1;
const DATABASE_NAME = "business-central-portal-offline";
const DATABASE_VERSION = 1;

const STORES = {
  resources: "resources",
  entities: "entities",
  operations: "operations",
  metadata: "metadata",
} as const;

export type OfflineScope = {
  merchantId: string;
  membershipId: string;
};

export type OfflineOperationStatus =
  "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "REJECTED" | "CONFLICT" | "BLOCKED";

export type OfflineOperation = {
  operationId: string;
  serverOperationId?: string;
  scopeKey: string;
  merchantId: string;
  membershipId: string;
  shopId?: string;
  entityType: string;
  entityId: string;
  operationType: "CREATE" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  payloadHash: string;
  baseVersion?: number;
  clientCreatedAt: string;
  dependencyOperationId?: string;
  status: OfflineOperationStatus;
  retryCount: number;
  nextRetryAt?: string;
  lastError?: string;
  serverPayload?: Record<string, unknown>;
  serverVersion?: number;
};

type CachedResource<T> = {
  key: string;
  scopeKey: string;
  path: string;
  data: T;
  meta?: ApiEnvelope<unknown>["meta"];
  cachedAt: string;
};

export type CachedResourceResult<T> = {
  data: T;
  meta?: ApiEnvelope<unknown>["meta"];
  cachedAt: string;
};

export type CachedEntity<T> = {
  key: string;
  scopeKey: string;
  entityType: string;
  entityId: string;
  payload: T;
  version: number;
  cachedAt: string;
};

type MetadataRecord<T> = {
  key: string;
  scopeKey: string;
  name: string;
  value: T;
  updatedAt: string;
};

export type QueueOperationInput = {
  operationId?: string;
  shopId?: string;
  entityType: string;
  entityId: string;
  operationType: "CREATE" | "UPDATE" | "DELETE";
  payload: Record<string, unknown>;
  baseVersion?: number;
  dependencyOperationId?: string;
};

export function offlineScopeKey(scope: OfflineScope) {
  return `${scope.merchantId}:${scope.membershipId}`;
}

export function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function resourceKey(scope: OfflineScope, path: string) {
  return `${offlineScopeKey(scope)}:resource:${path}`;
}

function entityKey(scope: OfflineScope, entityType: string, entityId: string) {
  return `${offlineScopeKey(scope)}:entity:${entityType}:${entityId}`;
}

function metadataKey(scope: OfflineScope, name: string) {
  return `${offlineScopeKey(scope)}:metadata:${name}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("Offline browser storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.resources)) {
        const store = database.createObjectStore(STORES.resources, {
          keyPath: "key",
        });
        store.createIndex("byScope", "scopeKey", { unique: false });
      }
      if (!database.objectStoreNames.contains(STORES.entities)) {
        const store = database.createObjectStore(STORES.entities, {
          keyPath: "key",
        });
        store.createIndex("byScope", "scopeKey", { unique: false });
        store.createIndex("byScopeType", ["scopeKey", "entityType"], {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(STORES.operations)) {
        const store = database.createObjectStore(STORES.operations, {
          keyPath: "operationId",
        });
        store.createIndex("byScope", "scopeKey", { unique: false });
        store.createIndex("byScopeStatusCreated", ["scopeKey", "status", "clientCreatedAt"], {
          unique: false,
        });
      }
      if (!database.objectStoreNames.contains(STORES.metadata)) {
        const store = database.createObjectStore(STORES.metadata, {
          keyPath: "key",
        });
        store.createIndex("byScope", "scopeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Offline storage upgrade is blocked by another tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline transaction aborted."));
  });
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export async function payloadHash(payload: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function putCachedResource<T>(
  scope: OfflineScope,
  path: string,
  data: T,
  meta?: ApiEnvelope<unknown>["meta"],
) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readwrite");
  transaction.objectStore(STORES.resources).put({
    key: resourceKey(scope, path),
    scopeKey: offlineScopeKey(scope),
    path,
    data,
    meta,
    cachedAt: new Date().toISOString(),
  } satisfies CachedResource<T>);
  await transactionDone(transaction);
  database.close();
}

export async function getCachedResource<T>(
  scope: OfflineScope,
  path: string,
): Promise<CachedResourceResult<T> | null> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readonly");
  const row = (await requestResult(
    transaction.objectStore(STORES.resources).get(resourceKey(scope, path)),
  )) as CachedResource<T> | undefined;
  await transactionDone(transaction);
  database.close();
  return row ? { data: row.data, meta: row.meta, cachedAt: row.cachedAt } : null;
}

export async function listCachedResources<T>(scope: OfflineScope) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.resources, "readonly");
  const rows = (await requestResult(
    transaction
      .objectStore(STORES.resources)
      .index("byScope")
      .getAll(IDBKeyRange.only(offlineScopeKey(scope))),
  )) as Array<CachedResource<T>>;
  await transactionDone(transaction);
  database.close();
  return rows.map((row) => ({
    path: row.path,
    data: row.data,
    meta: row.meta,
    cachedAt: row.cachedAt,
  }));
}

export async function putCachedEntity<T>(
  scope: OfflineScope,
  entityType: string,
  entityId: string,
  payload: T,
  version = 0,
) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.entities, "readwrite");
  transaction.objectStore(STORES.entities).put({
    key: entityKey(scope, entityType, entityId),
    scopeKey: offlineScopeKey(scope),
    entityType,
    entityId,
    payload,
    version,
    cachedAt: new Date().toISOString(),
  } satisfies CachedEntity<T>);
  await transactionDone(transaction);
  database.close();
}

export async function getCachedEntities<T>(
  scope: OfflineScope,
  entityType: string,
): Promise<Array<CachedEntity<T>>> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.entities, "readonly");
  const index = transaction.objectStore(STORES.entities).index("byScopeType");
  const rows = (await requestResult(
    index.getAll(IDBKeyRange.only([offlineScopeKey(scope), entityType])),
  )) as Array<CachedEntity<T>>;
  await transactionDone(transaction);
  database.close();
  return rows;
}

export async function getEntityVersion(scope: OfflineScope, entityType: string, entityId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.entities, "readonly");
  const row = (await requestResult(
    transaction.objectStore(STORES.entities).get(entityKey(scope, entityType, entityId)),
  )) as CachedEntity<unknown> | undefined;
  await transactionDone(transaction);
  database.close();
  return row?.version ?? 0;
}

export async function queueOperationWithEntity<T>(
  scope: OfflineScope,
  input: QueueOperationInput,
  localProjection: T,
) {
  const existing = (await listOperations(scope))
    .reverse()
    .find(
      (operation) =>
        operation.entityType === input.entityType &&
        operation.entityId === input.entityId &&
        operation.operationType === input.operationType &&
        ["PENDING", "FAILED", "BLOCKED"].includes(operation.status),
    );
  const operationId = existing?.operationId ?? input.operationId ?? randomUuid();
  const hash = await payloadHash(input.payload);
  const createdAt = new Date().toISOString();
  const operation: OfflineOperation = {
    operationId,
    scopeKey: offlineScopeKey(scope),
    merchantId: scope.merchantId,
    membershipId: scope.membershipId,
    shopId: input.shopId,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    payload: input.payload,
    payloadHash: hash,
    baseVersion: existing?.baseVersion ?? input.baseVersion,
    clientCreatedAt: existing?.clientCreatedAt ?? createdAt,
    dependencyOperationId: existing?.dependencyOperationId ?? input.dependencyOperationId,
    status: "PENDING",
    retryCount: 0,
  };
  const database = await openDatabase();
  const transaction = database.transaction([STORES.entities, STORES.operations], "readwrite");
  transaction.objectStore(STORES.entities).put({
    key: entityKey(scope, input.entityType, input.entityId),
    scopeKey: offlineScopeKey(scope),
    entityType: input.entityType,
    entityId: input.entityId,
    payload: localProjection,
    version: input.baseVersion ?? 0,
    cachedAt: createdAt,
  } satisfies CachedEntity<T>);
  transaction.objectStore(STORES.operations).put(operation);
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
  return operation;
}

export async function listOperations(scope: OfflineScope): Promise<OfflineOperation[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.operations, "readonly");
  const rows = (await requestResult(
    transaction
      .objectStore(STORES.operations)
      .index("byScope")
      .getAll(IDBKeyRange.only(offlineScopeKey(scope))),
  )) as OfflineOperation[];
  await transactionDone(transaction);
  database.close();
  return rows.sort((left, right) => left.clientCreatedAt.localeCompare(right.clientCreatedAt));
}

export async function updateOperation(operationId: string, update: Partial<OfflineOperation>) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.operations, "readwrite");
  const store = transaction.objectStore(STORES.operations);
  const current = (await requestResult(store.get(operationId))) as OfflineOperation | undefined;
  if (current) store.put({ ...current, ...update, operationId });
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function discardOfflineOperation(
  scope: OfflineScope,
  operation: Pick<OfflineOperation, "operationId" | "entityType" | "entityId">,
) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.entities, STORES.operations], "readwrite");
  transaction.objectStore(STORES.operations).delete(operation.operationId);
  transaction
    .objectStore(STORES.entities)
    .delete(entityKey(scope, operation.entityType, operation.entityId));
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function discardOfflineOperations(
  scope: OfflineScope,
  operations: Array<Pick<OfflineOperation, "operationId" | "entityType" | "entityId">>,
) {
  if (operations.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction([STORES.entities, STORES.operations], "readwrite");
  const opsStore = transaction.objectStore(STORES.operations);
  const entitiesStore = transaction.objectStore(STORES.entities);
  for (const operation of operations) {
    opsStore.delete(operation.operationId);
    entitiesStore.delete(entityKey(scope, operation.entityType, operation.entityId));
  }
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function retryOfflineOperation(operation: OfflineOperation) {
  await updateOperation(operation.operationId, {
    status: "PENDING",
    nextRetryAt: undefined,
    lastError: undefined,
  });
}

export async function retryOfflineOperations(operations: OfflineOperation[]) {
  if (operations.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction(STORES.operations, "readwrite");
  const store = transaction.objectStore(STORES.operations);
  for (const operation of operations) {
    const current = (await requestResult(store.get(operation.operationId))) as
      OfflineOperation | undefined;
    if (current) {
      store.put({
        ...current,
        status: "PENDING",
        nextRetryAt: undefined,
        lastError: undefined,
      });
    }
  }
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function getMetadata<T>(scope: OfflineScope, name: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.metadata, "readonly");
  const row = (await requestResult(
    transaction.objectStore(STORES.metadata).get(metadataKey(scope, name)),
  )) as MetadataRecord<T> | undefined;
  await transactionDone(transaction);
  database.close();
  return row?.value ?? null;
}

export async function putMetadata<T>(scope: OfflineScope, name: string, value: T) {
  const database = await openDatabase();
  const transaction = database.transaction(STORES.metadata, "readwrite");
  transaction.objectStore(STORES.metadata).put({
    key: metadataKey(scope, name),
    scopeKey: offlineScopeKey(scope),
    name,
    value,
    updatedAt: new Date().toISOString(),
  } satisfies MetadataRecord<T>);
  await transactionDone(transaction);
  database.close();
}

export async function applySyncPage(
  scope: OfflineScope,
  changes: Array<{
    entityType: string;
    entityId: string;
    entityVersion: number;
    operationType?: string;
    payload: Record<string, unknown>;
  }>,
  nextSequence: number,
) {
  const database = await openDatabase();
  const transaction = database.transaction([STORES.entities, STORES.metadata], "readwrite");
  const now = new Date().toISOString();
  const entities = transaction.objectStore(STORES.entities);
  for (const change of changes) {
    const key = entityKey(scope, change.entityType, change.entityId);
    if (change.operationType === "DELETE") {
      entities.delete(key);
    } else {
      entities.put({
        key,
        scopeKey: offlineScopeKey(scope),
        entityType: change.entityType,
        entityId: change.entityId,
        payload: change.payload,
        version: change.entityVersion,
        cachedAt: now,
      } satisfies CachedEntity<Record<string, unknown>>);
    }
  }
  transaction.objectStore(STORES.metadata).put({
    key: metadataKey(scope, "checkpoint:merchant"),
    scopeKey: offlineScopeKey(scope),
    name: "checkpoint:merchant",
    value: nextSequence,
    updatedAt: now,
  } satisfies MetadataRecord<number>);
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function clearOfflineScope(scope: OfflineScope) {
  const database = await openDatabase();
  const transaction = database.transaction(Object.values(STORES), "readwrite");
  const key = offlineScopeKey(scope);
  await Promise.all(
    Object.values(STORES).map(async (storeName) => {
      const store = transaction.objectStore(storeName);
      const index = store.index("byScope");
      const keys = await requestResult(index.getAllKeys(IDBKeyRange.only(key)));
      for (const item of keys) store.delete(item);
    }),
  );
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export async function quarantineOfflineScope(
  scope: OfflineScope,
  reason = "Authorization or shop assignment changed. Reauthenticate and review this operation.",
) {
  const database = await openDatabase();
  const transaction = database.transaction(Object.values(STORES), "readwrite");
  const scopeKey = offlineScopeKey(scope);
  const operationsStore = transaction.objectStore(STORES.operations);
  const operations = (await requestResult(
    operationsStore.index("byScope").getAll(IDBKeyRange.only(scopeKey)),
  )) as OfflineOperation[];
  const unresolved = operations.filter((operation) => operation.status !== "SYNCED");
  const retainedEntities = new Set(
    unresolved.map((operation) => entityKey(scope, operation.entityType, operation.entityId)),
  );
  for (const operation of operations) {
    if (operation.status === "SYNCED") operationsStore.delete(operation.operationId);
    else
      operationsStore.put({
        ...operation,
        status: "BLOCKED",
        nextRetryAt: undefined,
        lastError: reason,
      });
  }
  for (const storeName of [STORES.resources, STORES.metadata] as const) {
    const store = transaction.objectStore(storeName);
    const keys = await requestResult(store.index("byScope").getAllKeys(IDBKeyRange.only(scopeKey)));
    for (const key of keys) store.delete(key);
  }
  const entities = transaction.objectStore(STORES.entities);
  const entityKeys = await requestResult(
    entities.index("byScope").getAllKeys(IDBKeyRange.only(scopeKey)),
  );
  for (const key of entityKeys) {
    if (!retainedEntities.has(String(key))) entities.delete(key);
  }
  await transactionDone(transaction);
  database.close();
  notifyOfflineChange();
}

export function notifyOfflineChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("bc-offline-data-changed"));
  }
}

export function requestBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  void navigator.serviceWorker.ready
    .then((registration) => {
      const optional = registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      return optional.sync?.register("business-central-portal-sync");
    })
    .catch(() => undefined);
}
