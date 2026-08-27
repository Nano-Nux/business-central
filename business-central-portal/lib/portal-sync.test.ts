import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEntityVersion,
  getMetadata,
  listOperations,
  queueOperationWithEntity,
  updateOperation,
  type OfflineScope,
} from "./offline-db";
import { queueDeferredMutation } from "./offline-deferred";
import { resolvePortalConflict, synchronizePortal } from "./portal-sync";
import { api, post, upload } from "./api";
import { imageUploadMarker, PORTAL_IMAGE_UPLOADS } from "./offline-images";

vi.mock("./api", () => ({
  api: vi.fn(),
  post: vi.fn(),
  upload: vi.fn(),
  ApiError: class MockApiError extends Error {
    status = 400;
  },
  NetworkUnavailableError: class MockNetworkUnavailableError extends Error {},
}));

const mockedPost = vi.mocked(post);
const mockedApi = vi.mocked(api);
const mockedUpload = vi.mocked(upload);
const databaseName = "business-central-portal-offline";
const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(async () => {
  mockedPost.mockReset();
  mockedApi.mockReset();
  mockedUpload.mockReset();
  await deleteDatabase();
});

describe("portal synchronization", () => {
  it("uploads an offline image before replaying a deferred image mutation", async () => {
    const uploadID = "offline-repair-image";
    const queued = await queueDeferredMutation(
      scope,
      {
        entityType: "REPAIR_IMAGE",
        entityId: "local-image",
        operationType: "CREATE",
        request: {
          path: "/repairs/orders/repair-1/images",
          method: "POST",
          body: {
            image_url: imageUploadMarker(uploadID),
            source_type: "UPLOAD",
            filename: "repair.png",
            content_type: "image/png",
          },
        },
        payload: {
          image_url: imageUploadMarker(uploadID),
          source_type: "UPLOAD",
          filename: "repair.png",
          content_type: "image/png",
          [PORTAL_IMAGE_UPLOADS]: [
            {
              id: uploadID,
              filename: "repair.png",
              content_type: "image/png",
              data_base64: "aW1hZ2U=",
            },
          ],
        },
      },
      { id: "local-image" },
    );
    mockedUpload.mockResolvedValue({
      image_url: "https://images.example.com/media/merchant/repair.png",
      source_type: "UPLOAD",
    });
    mockedApi.mockImplementation(async (path, options) => {
      expect(path).toBe("/repairs/orders/repair-1/images");
      expect(JSON.parse(String(options?.body))).toMatchObject({
        image_url: "https://images.example.com/media/merchant/repair.png",
        source_type: "UPLOAD",
      });
      return { id: "canonical-image" };
    });
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 1,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      return { changes: [], next_sequence: 1, current_sequence: 1, has_more: false };
    });

    await expect(synchronizePortal(scope)).resolves.toMatchObject({ pushed: 1 });
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: queued.operationId, status: "SYNCED" },
    ]);
  });

  it("uploads an offline image to SeaweedFS before pushing typed shop settings", async () => {
    const uploadID = "offline-logo-upload";
    const queued = await queueOperationWithEntity(
      scope,
      {
        shopId: "00000000-0000-0000-0000-000000000003",
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: {
          name: "Shop",
          code: "SHOP",
          address: {
            logo_url: imageUploadMarker(uploadID),
            logo_source_type: "UPLOAD",
          },
          [PORTAL_IMAGE_UPLOADS]: [
            {
              id: uploadID,
              filename: "shop-logo.png",
              content_type: "image/png",
              data_base64: "aW1hZ2U=",
            },
          ],
        },
        baseVersion: 2,
      },
      { id: "00000000-0000-0000-0000-000000000003", logo_url: "data:image/png;base64,aW1hZ2U=" },
    );
    mockedUpload.mockResolvedValue({
      image_url: "http://seaweedfs.example/media/merchant/shop-logo.png",
      source_type: "UPLOAD",
    });
    mockedPost.mockImplementation(async (path, body) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 7,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        const operation = (body as { operations: Array<{ payload: Record<string, unknown> }> })
          .operations[0];
        expect(operation.payload).toMatchObject({
          address: {
            logo_url: "http://seaweedfs.example/media/merchant/shop-logo.png",
            logo_source_type: "UPLOAD",
          },
        });
        expect(operation.payload).not.toHaveProperty(PORTAL_IMAGE_UPLOADS);
        return {
          results: [
            {
              operation_id: queued.operationId,
              status: "APPLIED",
              entity_version: 3,
              server_payload: {
                id: "00000000-0000-0000-0000-000000000003",
                logo_url: "http://seaweedfs.example/media/merchant/shop-logo.png",
              },
            },
          ],
        };
      }
      return { changes: [], next_sequence: 7, current_sequence: 7, has_more: false };
    });

    await expect(synchronizePortal(scope)).resolves.toMatchObject({ pushed: 1 });
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: queued.operationId, status: "SYNCED" },
    ]);
  });

  it("pushes a stable queued operation and commits the pulled checkpoint", async () => {
    const queued = await queueOperationWithEntity(
      scope,
      {
        shopId: "00000000-0000-0000-0000-000000000003",
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
        baseVersion: 2,
      },
      { id: "00000000-0000-0000-0000-000000000003", tax_rate: "8" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 7,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        return {
          results: [
            {
              operation_id: queued.operationId,
              status: "APPLIED",
              entity_version: 3,
              server_payload: {
                id: "00000000-0000-0000-0000-000000000003",
                tax_rate: "8",
              },
            },
          ],
        };
      }
      return {
        changes: [],
        next_sequence: 7,
        current_sequence: 7,
        has_more: false,
      };
    });

    await expect(synchronizePortal(scope)).resolves.toEqual({
      pushed: 1,
      pulled: 0,
      conflicts: 0,
      rejected: 0,
    });
    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: queued.operationId, status: "SYNCED" },
    ]);
    expect(
      await getEntityVersion(scope, "SHOP_SETTINGS", "00000000-0000-0000-0000-000000000003"),
    ).toBe(3);
    expect(await getMetadata(scope, "checkpoint:merchant")).toBe(7);
  });

  it("replays deferred portal mutations with canonical IDs after a restart-safe queue commit", async () => {
    const localPromotionID = "local-promotion";
    const queued = await queueDeferredMutation(
      scope,
      {
        entityType: "PROMOTION",
        entityId: localPromotionID,
        operationType: "CREATE",
        request: {
          path: "/promotions",
          method: "POST",
          body: { name: "Offline sale" },
        },
      },
      { id: localPromotionID, name: "Offline sale" },
    );
    const dependent = await queueDeferredMutation(
      scope,
      {
        entityType: "PROMOTION_SCOPE",
        entityId: "local-scope",
        operationType: "CREATE",
        dependencyOperationId: queued.operationId,
        request: {
          path: "/promotions/products",
          method: "POST",
          body: { promotion_id: localPromotionID, product_id: "product-1" },
        },
      },
      { id: "local-scope", product_id: "product-1" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 2,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      return { changes: [], next_sequence: 2, current_sequence: 2, has_more: false };
    });
    mockedApi.mockImplementation(async (path) =>
      path === "/promotions"
        ? { id: "canonical-promotion", name: "Offline sale" }
        : { id: "canonical-scope", product_id: "product-1" },
    );

    await expect(synchronizePortal(scope)).resolves.toMatchObject({
      pushed: 2,
      conflicts: 0,
      rejected: 0,
    });
    expect(mockedApi).toHaveBeenCalledWith(
      "/promotions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Offline sale" }),
        headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      }),
    );
    expect(mockedApi).toHaveBeenCalledWith(
      "/promotions/products",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ promotion_id: "canonical-promotion", product_id: "product-1" }),
      }),
    );
    const synchronizedOperations = await listOperations(scope);
    expect(synchronizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationId: queued.operationId, status: "SYNCED" }),
        expect.objectContaining({ operationId: dependent.operationId, status: "SYNCED" }),
      ]),
    );
    await expect(
      getMetadata<Record<string, string>>(scope, "deferred-id-map"),
    ).resolves.toMatchObject({
      [localPromotionID]: "canonical-promotion",
    });
  });

  it("reconciles nested repair-ticket IDs before replaying dependent mutations", async () => {
    const localRepairID = "local-repair";
    const create = await queueDeferredMutation(
      scope,
      {
        entityType: "REPAIR_ORDER",
        entityId: localRepairID,
        operationType: "CREATE",
        request: {
          path: "/repairs/tickets",
          method: "POST",
          body: { idempotency_key: "repair-ticket-1" },
        },
      },
      { id: localRepairID },
    );
    await queueDeferredMutation(
      scope,
      {
        entityType: "REPAIR_ORDER",
        entityId: localRepairID,
        operationType: "UPDATE",
        dependencyOperationId: create.operationId,
        request: {
          path: `/repairs/orders/${localRepairID}`,
          method: "PATCH",
          body: {
            service_order_id: `offline-service-${localRepairID}`,
            device_id: `offline-device-${localRepairID}`,
            status: "IN_PROGRESS",
          },
        },
      },
      { id: localRepairID, status: "IN_PROGRESS" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 3,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      return { changes: [], next_sequence: 3, current_sequence: 3, has_more: false };
    });
    mockedApi.mockImplementation(async (path) => {
      if (path === "/repairs/tickets") {
        return {
          device: { id: "canonical-device" },
          service_order: { id: "canonical-service-order" },
          repair_order: { id: "canonical-repair" },
        };
      }
      return { id: "canonical-repair", status: "IN_PROGRESS" };
    });

    await expect(synchronizePortal(scope)).resolves.toMatchObject({ pushed: 2 });
    expect(mockedApi).toHaveBeenLastCalledWith(
      "/repairs/orders/canonical-repair",
      expect.objectContaining({
        body: JSON.stringify({
          service_order_id: "canonical-service-order",
          device_id: "canonical-device",
          status: "IN_PROGRESS",
        }),
      }),
    );
  });

  it("reports deferred and typed operations together", async () => {
    const deferred = await queueDeferredMutation(
      scope,
      {
        entityType: "PROMOTION",
        entityId: "local-promotion",
        operationType: "CREATE",
        request: { path: "/promotions", method: "POST", body: { name: "Sale" } },
      },
      { id: "local-promotion", name: "Sale" },
    );
    const typed = await queueOperationWithEntity(
      scope,
      {
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
      },
      { tax_rate: "8" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 5,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        return {
          results: [{ operation_id: typed.operationId, status: "APPLIED", entity_version: 2 }],
        };
      }
      return { changes: [], next_sequence: 5, current_sequence: 5, has_more: false };
    });
    mockedApi.mockResolvedValue({ id: "canonical-promotion" });

    await expect(synchronizePortal(scope)).resolves.toMatchObject({ pushed: 2 });
    await expect(listOperations(scope)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operationId: deferred.operationId, status: "SYNCED" }),
        expect.objectContaining({ operationId: typed.operationId, status: "SYNCED" }),
      ]),
    );
  });

  it("keeps authoritative conflict details visible and does not retry them", async () => {
    const queued = await queueOperationWithEntity(
      scope,
      {
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
        baseVersion: 1,
      },
      { tax_rate: "8" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 4,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        return {
          results: [
            {
              operation_id: queued.operationId,
              server_operation_id: "00000000-0000-0000-0000-000000000004",
              status: "CONFLICT",
              message: "The shop settings changed on the server.",
              entity_version: 2,
              server_payload: { tax_rate: "10" },
            },
          ],
        };
      }
      return {
        changes: [],
        next_sequence: 4,
        current_sequence: 4,
        has_more: false,
      };
    });

    await synchronizePortal(scope);

    await expect(listOperations(scope)).resolves.toMatchObject([
      {
        operationId: queued.operationId,
        status: "CONFLICT",
        serverOperationId: "00000000-0000-0000-0000-000000000004",
        serverVersion: 2,
        serverPayload: { tax_rate: "10" },
      },
    ]);
  });

  it("keeps a deferred mutation pending after transport loss for automatic retry", async () => {
    const queued = await queueDeferredMutation(
      scope,
      {
        entityType: "REPAIR_SERVICE",
        entityId: "local-service",
        operationType: "CREATE",
        request: { path: "/services/catalog", method: "POST", body: { name: "Screen" } },
      },
      { id: "local-service", name: "Screen" },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 1,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      return { changes: [], next_sequence: 1, current_sequence: 1, has_more: false };
    });
    mockedApi.mockRejectedValue(new Error("backend unavailable"));

    await expect(synchronizePortal(scope)).rejects.toThrow("backend unavailable");
    await expect(listOperations(scope)).resolves.toMatchObject([
      {
        operationId: queued.operationId,
        status: "PENDING",
        retryCount: 1,
        lastError: "backend unavailable",
      },
    ]);
  });

  it("clears superseded rejected deletes after a later delete succeeds", async () => {
    const entityId = "00000000-0000-0000-0000-000000000099";
    const rejected = await queueOperationWithEntity(
      scope,
      {
        entityType: "CATALOG_PRODUCT",
        entityId,
        operationType: "DELETE",
        payload: {},
        baseVersion: 1,
      },
      { id: entityId, is_deleted: true },
    );
    await updateOperation(rejected.operationId, {
      status: "REJECTED",
      lastError: "DELETE_REJECTED: previous server rule",
    });
    const retry = await queueOperationWithEntity(
      scope,
      {
        entityType: "CATALOG_PRODUCT",
        entityId,
        operationType: "DELETE",
        payload: {},
        baseVersion: 1,
      },
      { id: entityId, is_deleted: true },
    );
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 8,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        return {
          results: [{ operation_id: retry.operationId, status: "APPLIED", entity_version: 2 }],
        };
      }
      return { changes: [], next_sequence: 8, current_sequence: 8, has_more: false };
    });

    await synchronizePortal(scope);

    await expect(listOperations(scope)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: rejected.operationId,
          status: "SYNCED",
          lastError: undefined,
        }),
        expect.objectContaining({ operationId: retry.operationId, status: "SYNCED" }),
      ]),
    );
  });

  it("requeues operations interrupted after they were marked syncing", async () => {
    const queued = await queueOperationWithEntity(
      scope,
      {
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
        baseVersion: 1,
      },
      { tax_rate: "8" },
    );
    await updateOperation(queued.operationId, { status: "SYNCING" });
    mockedPost.mockImplementation(async (path) => {
      if (path === "/sync/handshake") {
        return {
          protocol_version: "1",
          schema_version: "1",
          server_sequence: 4,
          device: { id: "device-id" },
          session: { id: "session-id", scope: "merchant" },
        };
      }
      if (path === "/sync/push") {
        return {
          results: [{ operation_id: queued.operationId, status: "APPLIED", entity_version: 2 }],
        };
      }
      return { changes: [], next_sequence: 4, current_sequence: 4, has_more: false };
    });

    await synchronizePortal(scope);

    await expect(listOperations(scope)).resolves.toMatchObject([
      { operationId: queued.operationId, status: "SYNCED" },
    ]);
  });

  it("persists the authoritative result after explicit conflict resolution", async () => {
    const queued = await queueOperationWithEntity(
      scope,
      {
        entityType: "SHOP_SETTINGS",
        entityId: "00000000-0000-0000-0000-000000000003",
        operationType: "UPDATE",
        payload: { tax_rate: "8" },
        baseVersion: 1,
      },
      { tax_rate: "8" },
    );
    await updateOperation(queued.operationId, {
      status: "CONFLICT",
      serverOperationId: "00000000-0000-0000-0000-000000000004",
    });
    mockedPost.mockResolvedValue({
      operation_id: "00000000-0000-0000-0000-000000000004",
      strategy: "KEEP_SERVER",
      status: "IGNORED",
      entity_version: 4,
      server_payload: { tax_rate: "10" },
    });

    const [conflict] = await listOperations(scope);
    await resolvePortalConflict(scope, conflict, "KEEP_SERVER");

    await expect(listOperations(scope)).resolves.toMatchObject([
      { status: "SYNCED", serverVersion: 4, serverPayload: { tax_rate: "10" } },
    ]);
    expect(await getEntityVersion(scope, "SHOP_SETTINGS", conflict.entityId)).toBe(4);
  });
});
