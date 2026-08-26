import {
  payloadHash,
  queueOperationWithEntity,
  requestBackgroundSync,
  type OfflineScope,
  type QueueOperationInput,
} from "./offline-db";

/**
 * A portal-owned replay policy for API mutations which do not yet have a
 * server sync entity type. The request is still durable and is only replayed
 * by portal-sync after connectivity returns; it is never sent to the generic
 * server push endpoint.
 */
export const PORTAL_DEFERRED_REQUEST = "portal_request";

export type DeferredRequest = {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type DeferredMutationInput = Omit<QueueOperationInput, "payload"> & {
  request: DeferredRequest;
  payload?: Record<string, unknown>;
};

export function deferredRequestFromPayload(
  payload: Record<string, unknown>,
): DeferredRequest | null {
  const request = payload[PORTAL_DEFERRED_REQUEST];
  if (!request || typeof request !== "object") return null;
  const candidate = request as Record<string, unknown>;
  if (
    typeof candidate.path !== "string" ||
    !["POST", "PATCH", "DELETE"].includes(String(candidate.method))
  ) {
    return null;
  }
  return {
    path: candidate.path,
    method: candidate.method as DeferredRequest["method"],
    ...(candidate.body && typeof candidate.body === "object"
      ? { body: candidate.body as Record<string, unknown> }
      : {}),
    ...(candidate.headers && typeof candidate.headers === "object"
      ? { headers: candidate.headers as Record<string, string> }
      : {}),
  };
}

export async function queueDeferredMutation<T>(
  scope: OfflineScope,
  input: DeferredMutationInput,
  localProjection: T,
) {
  const payload = {
    ...(input.payload ?? input.request.body ?? {}),
    [PORTAL_DEFERRED_REQUEST]: input.request,
  };
  const request = payload[PORTAL_DEFERRED_REQUEST] as DeferredRequest;
  const keySeed = await payloadHash(payload);
  payload[PORTAL_DEFERRED_REQUEST] = {
    ...request,
    headers: {
      ...request.headers,
      "Idempotency-Key": `${input.entityType}:${input.entityId}:${keySeed.slice(0, 24)}`,
    },
  };
  const operation = await queueOperationWithEntity(scope, { ...input, payload }, localProjection);
  requestBackgroundSync();
  return operation;
}
