import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearOfflineScope, listOperations } from "./offline-db";
import { queueRepairDraft } from "./offline-repair-drafts";

const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline repair drafts", () => {
  it("persists a stable intake-only create operation", async () => {
    const operation = await queueRepairDraft(scope, {
      shop_id: "00000000-0000-0000-0000-000000000003",
      priority: "NORMAL",
      device: { device_type: "Phone", model: "Example" },
      issue_description: "Cracked screen",
      customer_name: "Customer",
    });
    const [stored] = await listOperations(scope);
    expect(stored.operationId).toBe(operation.operationId);
    expect(stored.entityType).toBe("REPAIR_DRAFT");
    expect(stored.operationType).toBe("CREATE");
    expect(stored.baseVersion).toBe(0);
    expect(stored.payload).not.toHaveProperty("payment_status");
    expect(stored.payload).not.toHaveProperty("parts");
  });
});
