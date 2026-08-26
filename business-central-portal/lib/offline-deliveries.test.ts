import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearOfflineScope, listOperations } from "./offline-db";
import {
  queueDeliveryCreate,
  queueDeliveryDelete,
  queueDeliveryUpdate,
} from "./offline-deliveries";

const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const shopId = "00000000-0000-0000-0000-000000000003";

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline delivery operations", () => {
  it("uses a stable entity ID and orders a delete after an unsynced create", async () => {
    const created = await queueDeliveryCreate(scope, shopId, "Courier", "555-0100");
    const [createOperation] = await listOperations(scope);
    const deleted = await queueDeliveryDelete(scope, {
      id: createOperation.entityId,
      shop_id: shopId,
      name: "Courier",
      contact_info: "555-0100",
    });

    expect(created.operationId).toBe(createOperation.operationId);
    expect(deleted.operationType).toBe("DELETE");
    expect(deleted.baseVersion).toBe(1);
    expect(deleted.dependencyOperationId).toBe(created.operationId);
  });

  it("orders an edit after an unsynced create", async () => {
    const created = await queueDeliveryCreate(scope, shopId, "Courier", "555-0100");
    const updated = await queueDeliveryUpdate(
      scope,
      {
        id: created.entityId,
        shop_id: shopId,
        name: "Courier",
        contact_info: "555-0100",
      },
      "Express courier",
      "555-0200",
    );

    expect(updated.operationType).toBe("UPDATE");
    expect(updated.baseVersion).toBe(1);
    expect(updated.dependencyOperationId).toBe(created.operationId);
    expect(updated.payload).toMatchObject({ name: "Express courier", contact_info: "555-0200" });
  });
});
