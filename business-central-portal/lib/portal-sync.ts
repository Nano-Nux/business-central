import { api, ApiError, NetworkUnavailableError, post, upload } from "./api";
import {
  PORTAL_OFFLINE_SCHEMA_VERSION,
  applySyncPage,
  discardOfflineOperation,
  getMetadata,
  listOperations,
  notifyOfflineChange,
  payloadHash,
  putCachedEntity,
  putMetadata,
  updateOperation,
  type OfflineOperation,
  type OfflineScope,
} from "./offline-db";
import { applyAttributeSyncChange } from "./offline-attributes";
import { deferredRequestFromPayload } from "./offline-deferred";
import { randomUuid } from "./random-uuid";
import { imageUploadID, PORTAL_IMAGE_UPLOADS, type OfflineImageUpload } from "./offline-images";

const PROTOCOL_VERSION = "1";
const SCOPE = "merchant";
const syncRuns = new Map<string, Promise<SyncSummary>>();

type SyncHandshake = {
  protocol_version: string;
  schema_version: string;
  server_sequence: number;
  device: { id: string };
  session: { id: string; scope: string };
};

type SyncOperationResult = {
  operation_id: string;
  server_operation_id?: string;
  status: "APPLIED" | "REJECTED" | "CONFLICT";
  code?: string;
  message?: string;
  entity_version?: number;
  server_payload?: Record<string, unknown>;
};

type SyncChange = {
  server_sequence: number;
  entity_type: string;
  entity_id: string;
  entity_version: number;
  operation_type: string;
  payload: Record<string, unknown>;
};

type PullResponse = {
  changes: SyncChange[];
  next_sequence: number;
  current_sequence: number;
  has_more: boolean;
};

export type SyncSummary = {
  pushed: number;
  pulled: number;
  conflicts: number;
  rejected: number;
};

function scopeRunKey(scope: OfflineScope) {
  return `${scope.merchantId}:${scope.membershipId}`;
}

async function deviceIdentifier(scope: OfflineScope) {
  const existing = await getMetadata<string>(scope, "device-identifier");
  if (existing) return existing;
  const created = `portal:${randomUuid()}`;
  await putMetadata(scope, "device-identifier", created);
  return created;
}

export function retryDelayMs(retryCount: number) {
  return Math.min(300, 2 ** Math.min(8, Math.max(0, retryCount))) * 1000;
}

async function recoverInterruptedOperations(scope: OfflineScope) {
  const operations = await listOperations(scope);
  await Promise.all(
    operations
      .filter((operation) => operation.status === "SYNCING")
      .map((operation) =>
        updateOperation(operation.operationId, {
          status: "PENDING",
          nextRetryAt: undefined,
          lastError: "Synchronization was interrupted and will be retried.",
        }),
      ),
  );
}

function dependencyReady(operation: OfflineOperation, all: OfflineOperation[]) {
  if (!operation.dependencyOperationId) return true;
  return all.some(
    (candidate) =>
      candidate.operationId === operation.dependencyOperationId && candidate.status === "SYNCED",
  );
}

async function pendingOperations(scope: OfflineScope) {
  const now = Date.now();
  const all = await listOperations(scope);
  return all.filter(
    (operation) =>
      (operation.status === "PENDING" || operation.status === "FAILED") &&
      (!operation.nextRetryAt || Date.parse(operation.nextRetryAt) <= now) &&
      dependencyReady(operation, all),
  );
}

function isDeferred(operation: OfflineOperation) {
  return deferredRequestFromPayload(operation.payload) !== null;
}

function replaceMappedIds(value: unknown, mappings: Map<string, string>): unknown {
  if (typeof value === "string") return mappings.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceMappedIds(item, mappings));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      replaceMappedIds(item, mappings),
    ]),
  );
}

function replaceMappedPath(path: string, mappings: Map<string, string>) {
  let result = path;
  for (const [localID, canonicalID] of mappings) {
    result = result.split(localID).join(canonicalID);
  }
  return result;
}

function replaceOfflineImageMarkers(value: unknown, urls: Map<string, string>): unknown {
  const id = imageUploadID(value);
  if (id) {
    const url = urls.get(id);
    if (!url) throw new Error("The offline image upload result is missing.");
    return url;
  }
  if (Array.isArray(value)) return value.map((item) => replaceOfflineImageMarkers(item, urls));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      replaceOfflineImageMarkers(item, urls),
    ]),
  );
}

function decodeOfflineImage(uploadRequest: OfflineImageUpload) {
  const binary = atob(uploadRequest.data_base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: uploadRequest.content_type });
}

function offlineImageUploadRequests(payload: Record<string, unknown>) {
  const value = payload[PORTAL_IMAGE_UPLOADS];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("The offline image upload queue is invalid.");
  return value as OfflineImageUpload[];
}

async function materializeOfflineImageUploads(
  operation: OfflineOperation,
): Promise<OfflineOperation> {
  const requests = offlineImageUploadRequests(operation.payload);
  if (!requests.length) return operation;
  const urls = new Map<string, string>();
  for (const uploadRequest of requests) {
    if (
      !uploadRequest ||
      typeof uploadRequest.id !== "string" ||
      typeof uploadRequest.filename !== "string" ||
      typeof uploadRequest.content_type !== "string" ||
      typeof uploadRequest.data_base64 !== "string"
    ) {
      throw new Error("The offline image upload queue contains an invalid image.");
    }
    const data = new FormData();
    data.set("file", decodeOfflineImage(uploadRequest), uploadRequest.filename);
    const stored = await upload<{ image_url: string }>("/media/images/upload", data);
    if (!stored.image_url) throw new Error("The image service did not return an image URL.");
    urls.set(uploadRequest.id, stored.image_url);
  }
  const payload = Object.fromEntries(
    Object.entries(operation.payload).filter(([key]) => key !== PORTAL_IMAGE_UPLOADS),
  );
  const materializedPayload = replaceOfflineImageMarkers(payload, urls) as Record<string, unknown>;
  const materializedHash = await payloadHash(materializedPayload);
  await updateOperation(operation.operationId, {
    payload: materializedPayload,
    payloadHash: materializedHash,
  });
  return { ...operation, payload: materializedPayload, payloadHash: materializedHash };
}

function addDeferredIDMapping(
  mappings: Map<string, string>,
  localID: unknown,
  canonicalID: unknown,
) {
  if (typeof localID !== "string" || typeof canonicalID !== "string") return;
  if (localID === canonicalID) return;
  mappings.set(localID, canonicalID);
}

function recordDeferredResultMappings(
  operation: OfflineOperation,
  result: unknown,
  mappings: Map<string, string>,
) {
  if (!result || typeof result !== "object") return;
  const record = result as Record<string, unknown>;
  addDeferredIDMapping(mappings, operation.entityId, record.id);

  // Repair ticket creation returns an aggregate with nested canonical IDs.
  // Dependent requests are queued with all three provisional IDs.
  if (operation.entityType === "REPAIR_ORDER" && operation.operationType === "CREATE") {
    const repairOrder = record.repair_order;
    const serviceOrder = record.service_order;
    const device = record.device;
    if (repairOrder && typeof repairOrder === "object") {
      addDeferredIDMapping(
        mappings,
        operation.entityId,
        (repairOrder as Record<string, unknown>).id,
      );
    }
    if (serviceOrder && typeof serviceOrder === "object") {
      addDeferredIDMapping(
        mappings,
        `offline-service-${operation.entityId}`,
        (serviceOrder as Record<string, unknown>).id,
      );
    }
    if (device && typeof device === "object") {
      addDeferredIDMapping(
        mappings,
        `offline-device-${operation.entityId}`,
        (device as Record<string, unknown>).id,
      );
    }
    const requestEnvelope = operation.payload.portal_request;
    const requestBody =
      requestEnvelope && typeof requestEnvelope === "object"
        ? (requestEnvelope as Record<string, unknown>).body
        : undefined;
    const localWorkItems =
      requestBody &&
      typeof requestBody === "object" &&
      Array.isArray((requestBody as Record<string, unknown>).work_items)
        ? ((requestBody as Record<string, unknown>).work_items as unknown[])
        : [];
    const canonicalWorkItems = Array.isArray(record.work_items) ? record.work_items : [];
    for (let index = 0; index < localWorkItems.length; index += 1) {
      const localItem = localWorkItems[index];
      const canonicalItem = canonicalWorkItems[index];
      if (
        localItem &&
        typeof localItem === "object" &&
        canonicalItem &&
        typeof canonicalItem === "object"
      ) {
        addDeferredIDMapping(
          mappings,
          (localItem as Record<string, unknown>).id,
          (canonicalItem as Record<string, unknown>).id,
        );
      }
    }
  }
}

async function deferredIdMappings(scope: OfflineScope) {
  return new Map(
    Object.entries((await getMetadata<Record<string, string>>(scope, "deferred-id-map")) ?? {}),
  );
}

async function saveDeferredIdMappings(scope: OfflineScope, mappings: Map<string, string>) {
  await putMetadata(scope, "deferred-id-map", Object.fromEntries(mappings));
}

async function markDeferredDependentsBlocked(
  scope: OfflineScope,
  failedOperationId: string,
  reason: string,
) {
  const operations = await listOperations(scope);
  const blocked = new Set([failedOperationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const operation of operations) {
      if (
        operation.dependencyOperationId &&
        blocked.has(operation.dependencyOperationId) &&
        ["PENDING", "FAILED"].includes(operation.status)
      ) {
        blocked.add(operation.operationId);
        changed = true;
        await updateOperation(operation.operationId, {
          status: "BLOCKED",
          nextRetryAt: undefined,
          lastError: `A required offline change could not be synchronized: ${reason}`,
        });
      }
    }
  }
}

async function runDeferredOperations(scope: OfflineScope, operations: OfflineOperation[]) {
  const mappings = await deferredIdMappings(scope);
  let pushed = 0;
  let conflicts = 0;
  let rejected = 0;
  for (const operation of operations) {
    const request = deferredRequestFromPayload(operation.payload);
    if (!request) continue;
    await updateOperation(operation.operationId, {
      status: "SYNCING",
      lastError: undefined,
    });
    try {
      const body = request.body
        ? (replaceMappedIds(request.body, mappings) as Record<string, unknown>)
        : undefined;
      const result = await api<unknown>(replaceMappedPath(request.path, mappings), {
        method: request.method,
        ...(request.headers ? { headers: request.headers } : {}),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (result && typeof result === "object") {
        const before = mappings.size;
        recordDeferredResultMappings(operation, result, mappings);
        const canonicalID = mappings.get(operation.entityId);
        if (canonicalID) {
          mappings.set(`${operation.entityType}:${operation.entityId}`, canonicalID);
        }
        if (mappings.size !== before) {
          await saveDeferredIdMappings(scope, mappings);
        }
      }
      await updateOperation(operation.operationId, {
        status: "SYNCED",
        retryCount: 0,
        nextRetryAt: undefined,
        lastError: undefined,
        ...(result && typeof result === "object"
          ? { serverPayload: result as Record<string, unknown> }
          : {}),
      });
      if (result && typeof result === "object") {
        await putCachedEntity(
          scope,
          operation.entityType,
          operation.entityId,
          result as Record<string, unknown>,
          operation.baseVersion ?? 1,
        );
      }
      pushed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The deferred portal mutation failed.";
      if (
        error instanceof NetworkUnavailableError ||
        !(error instanceof ApiError) ||
        error.status >= 500
      ) {
        const retryCount = operation.retryCount + 1;
        await updateOperation(operation.operationId, {
          status: "PENDING",
          retryCount,
          nextRetryAt: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
          lastError: message,
        });
        throw error;
      }
      if (error instanceof ApiError && (error.status === 409 || error.status === 412)) {
        conflicts += 1;
        await updateOperation(operation.operationId, {
          status: "CONFLICT",
          nextRetryAt: undefined,
          lastError: message,
        });
      } else {
        rejected += 1;
        await updateOperation(operation.operationId, {
          status: "REJECTED",
          nextRetryAt: undefined,
          lastError: message,
        });
      }
      await markDeferredDependentsBlocked(scope, operation.operationId, message);
    }
  }
  return { pushed, conflicts, rejected };
}

async function markTransportFailure(operations: OfflineOperation[], error: unknown) {
  const message = error instanceof Error ? error.message : "Synchronization request failed.";
  await Promise.all(
    operations.map((operation) => {
      const retryCount = operation.retryCount + 1;
      return updateOperation(operation.operationId, {
        status: "PENDING",
        retryCount,
        nextRetryAt: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
        lastError: message,
      });
    }),
  );
}

async function applyPushResults(
  scope: OfflineScope,
  operations: OfflineOperation[],
  results: SyncOperationResult[],
) {
  const byId = new Map(results.map((result) => [result.operation_id, result]));
  let pushed = 0;
  let conflicts = 0;
  let rejected = 0;
  for (const operation of operations) {
    const result = byId.get(operation.operationId);
    if (!result) {
      await updateOperation(operation.operationId, {
        status: "FAILED",
        retryCount: operation.retryCount + 1,
        nextRetryAt: new Date(Date.now() + retryDelayMs(operation.retryCount + 1)).toISOString(),
        lastError: "The server did not return a result for this operation.",
      });
      continue;
    }
    if (result.status === "APPLIED") {
      pushed += 1;
      await updateOperation(operation.operationId, {
        status: "SYNCED",
        serverOperationId: result.server_operation_id,
        retryCount: 0,
        nextRetryAt: undefined,
        lastError: undefined,
      });
      const supersededRejections = (await listOperations(scope)).filter(
        (candidate) =>
          candidate.operationId !== operation.operationId &&
          candidate.entityType === operation.entityType &&
          candidate.entityId === operation.entityId &&
          candidate.operationType === operation.operationType &&
          candidate.status === "REJECTED",
      );
      await Promise.all(
        supersededRejections.map((candidate) =>
          updateOperation(candidate.operationId, {
            status: "SYNCED",
            lastError: undefined,
            nextRetryAt: undefined,
          }),
        ),
      );
      if (result.server_payload && result.entity_version !== undefined) {
        await putCachedEntity(
          scope,
          operation.entityType,
          operation.entityId,
          result.server_payload,
          result.entity_version,
        );
      }
      continue;
    }
    if (result.status === "CONFLICT") {
      conflicts += 1;
      await updateOperation(operation.operationId, {
        status: "CONFLICT",
        serverOperationId: result.server_operation_id,
        nextRetryAt: undefined,
        lastError: result.message ?? "The server reported a conflict.",
        serverPayload: result.server_payload,
        serverVersion: result.entity_version,
      });
      if (result.server_payload && result.entity_version !== undefined) {
        await putCachedEntity(
          scope,
          operation.entityType,
          operation.entityId,
          result.server_payload,
          result.entity_version,
        );
      }
      continue;
    }
    const alreadyExists =
      operation.operationType === "CREATE" &&
      (result.code === "ALREADY_EXISTS" || result.code === "DUPLICATE");
    if (alreadyExists) {
      await discardOfflineOperation(scope, operation);
      continue;
    }
    rejected += 1;
    await updateOperation(operation.operationId, {
      status: "REJECTED",
      nextRetryAt: undefined,
      lastError: `${result.code ?? "REJECTED"}: ${result.message ?? "The server rejected this operation."}`,
      serverPayload: result.server_payload,
      serverVersion: result.entity_version,
    });
  }
  return { pushed, conflicts, rejected };
}

async function runSync(scope: OfflineScope): Promise<SyncSummary> {
  await recoverInterruptedOperations(scope);
  const identifier = await deviceIdentifier(scope);
  const handshake = await post<SyncHandshake>("/sync/handshake", {
    device_identifier: identifier,
    device_name: "Business Central Portal",
    client_session_key: randomUuid(),
    scope: SCOPE,
  });
  if (handshake.protocol_version !== PROTOCOL_VERSION) {
    throw new Error(
      `Sync protocol ${handshake.protocol_version} is incompatible with portal protocol ${PROTOCOL_VERSION}.`,
    );
  }
  if (Number(handshake.schema_version) > PORTAL_OFFLINE_SCHEMA_VERSION) {
    throw new Error("The portal offline database must be upgraded before synchronization.");
  }
  await putMetadata(scope, "sync-session", {
    sessionId: handshake.session.id,
    deviceId: handshake.device.id,
    serverSequence: handshake.server_sequence,
    openedAt: new Date().toISOString(),
  });

  let pushed = 0;
  let conflicts = 0;
  let rejected = 0;
  let deferredReady = (await pendingOperations(scope)).filter(isDeferred).slice(0, 100);
  while (deferredReady.length > 0) {
    try {
      const result = await runDeferredOperations(scope, deferredReady);
      pushed += result.pushed;
      conflicts += result.conflicts;
      rejected += result.rejected;
    } catch (error) {
      throw error;
    }
    deferredReady = (await pendingOperations(scope)).filter(isDeferred).slice(0, 100);
  }

  const ready = (await pendingOperations(scope))
    .filter((operation) => !isDeferred(operation))
    .slice(0, 100);
  const materializedReady: OfflineOperation[] = [];
  for (const operation of ready) {
    try {
      materializedReady.push(await materializeOfflineImageUploads(operation));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The offline image could not be uploaded.";
      if (
        error instanceof NetworkUnavailableError ||
        !(error instanceof ApiError) ||
        error.status >= 500
      ) {
        const retryCount = operation.retryCount + 1;
        await updateOperation(operation.operationId, {
          status: "PENDING",
          retryCount,
          nextRetryAt: new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
          lastError: message,
        });
        throw error;
      }
      rejected += 1;
      await updateOperation(operation.operationId, {
        status: "REJECTED",
        nextRetryAt: undefined,
        lastError: message,
      });
    }
  }
  if (materializedReady.length > 0) {
    const hashedReady = await Promise.all(
      materializedReady.map(async (operation) => {
        const hash = await payloadHash(operation.payload);
        if (hash !== operation.payloadHash) {
          await updateOperation(operation.operationId, { payloadHash: hash });
        }
        return { ...operation, payloadHash: hash };
      }),
    );
    await Promise.all(
      hashedReady.map((operation) =>
        updateOperation(operation.operationId, {
          status: "SYNCING",
          lastError: undefined,
        }),
      ),
    );
    try {
      const response = await post<{ results: SyncOperationResult[] }>("/sync/push", {
        session_id: handshake.session.id,
        operations: hashedReady.map((operation) => ({
          operation_id: operation.operationId,
          entity_type: operation.entityType,
          entity_id: operation.entityId,
          ...(operation.shopId ? { shop_id: operation.shopId } : {}),
          operation_type: operation.operationType,
          ...(operation.baseVersion !== undefined ? { base_version: operation.baseVersion } : {}),
          payload_hash: operation.payloadHash,
          ...(operation.dependencyOperationId
            ? { dependency_operation_id: operation.dependencyOperationId }
            : {}),
          client_created_at: operation.clientCreatedAt,
          payload: operation.payload,
        })),
      });
      const typedResult = await applyPushResults(scope, hashedReady, response.results);
      pushed += typedResult.pushed;
      conflicts += typedResult.conflicts;
      rejected += typedResult.rejected;
    } catch (error) {
      await markTransportFailure(hashedReady, error);
      throw error;
    }
  }

  let checkpoint = (await getMetadata<number>(scope, "checkpoint:merchant")) ?? 0;
  let hasMore = true;
  let pulled = 0;
  while (hasMore) {
    const page = await post<PullResponse>("/sync/pull", {
      session_id: handshake.session.id,
      scope: SCOPE,
      after_sequence: checkpoint,
      limit: 100,
    });
    const changes = page.changes.map((change) => ({
      entityType: change.entity_type,
      entityId: change.entity_id,
      entityVersion: change.entity_version,
      operationType: change.operation_type,
      payload: change.payload,
    }));
    checkpoint = page.next_sequence;
    await applySyncPage(scope, changes, checkpoint);
    await Promise.all(
      changes.map((change) =>
        applyAttributeSyncChange(scope, {
          entityType: change.entityType,
          operationType: change.operationType,
          payload: change.payload,
        }),
      ),
    );
    pulled += changes.length;
    hasMore = page.has_more;
  }
  await putMetadata(scope, "last-sync-at", new Date().toISOString());
  notifyOfflineChange();
  return { pushed, pulled, conflicts, rejected };
}

export function synchronizePortal(scope: OfflineScope) {
  const key = scopeRunKey(scope);
  const active = syncRuns.get(key);
  if (active) return active;
  const execute = () => runSync(scope);
  const lockedRun =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request<Promise<SyncSummary>>(`business-central-sync:${key}`, execute)
      : execute();
  const run: Promise<SyncSummary> = lockedRun
    .then((summary) => summary)
    .finally(() => syncRuns.delete(key));
  syncRuns.set(key, run);
  return run;
}

type ConflictResolution = {
  operation_id: string;
  strategy: "KEEP_SERVER" | "APPLY_CLIENT";
  status: "IGNORED" | "RESOLVED";
  entity_version: number;
  server_payload: Record<string, unknown>;
};

export async function resolvePortalConflict(
  scope: OfflineScope,
  operation: OfflineOperation,
  strategy: ConflictResolution["strategy"],
) {
  if (operation.status !== "CONFLICT" || !operation.serverOperationId) {
    throw new Error("This conflict does not have a server resolution reference.");
  }
  const resolution = await post<ConflictResolution>(
    `/sync/conflicts/${encodeURIComponent(operation.serverOperationId)}/resolve`,
    { strategy },
  );
  await putCachedEntity(
    scope,
    operation.entityType,
    operation.entityId,
    resolution.server_payload,
    resolution.entity_version,
  );
  await updateOperation(operation.operationId, {
    status: "SYNCED",
    serverPayload: resolution.server_payload,
    serverVersion: resolution.entity_version,
    lastError: undefined,
  });
  notifyOfflineChange();
  return resolution;
}
