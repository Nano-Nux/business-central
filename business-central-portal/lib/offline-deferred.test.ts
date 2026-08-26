import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedEntities,
  getCachedResource,
  listOperations,
  type OfflineScope,
  putCachedResource,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";

const scope: OfflineScope = { merchantId: "merchant", membershipId: "membership" };

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Offline database is blocked."));
  });
}

beforeEach(deleteDatabase);

describe("deferred portal mutations", () => {
  it("commits the local projection and replay request atomically", async () => {
    await putCachedResource(scope, "/promotions?page_index=0&page_size=100", []);
    const operation = await queueDeferredMutation(
      scope,
      {
        entityType: "PROMOTION",
        entityId: "local-promotion",
        operationType: "CREATE",
        request: { path: "/promotions", method: "POST", body: { name: "Offline sale" } },
      },
      { id: "local-promotion", name: "Offline sale" },
    );

    await expect(listOperations(scope)).resolves.toMatchObject([
      {
        operationId: operation.operationId,
        status: "PENDING",
        payload: {
          name: "Offline sale",
          portal_request: {
            path: "/promotions",
            method: "POST",
            headers: { "Idempotency-Key": expect.any(String) },
          },
        },
      },
    ]);
    await expect(
      getCachedResource(scope, "/promotions?page_index=0&page_size=100"),
    ).resolves.toMatchObject({
      data: [],
    });
    await expect(getCachedEntities(scope, "PROMOTION")).resolves.toMatchObject([
      { entityId: "local-promotion", payload: { name: "Offline sale" } },
    ]);
  });
});
