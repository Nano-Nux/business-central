import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearOfflineScope, listOperations } from "./offline-db";
import { queueRepairDiagnostic } from "./offline-repair-diagnostics";

const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline repair diagnostics", () => {
  it("queues an append-only stable diagnostic operation", async () => {
    const operation = await queueRepairDiagnostic(
      scope,
      "00000000-0000-0000-0000-000000000003",
      "00000000-0000-0000-0000-000000000004",
      "Screen cracked",
      "00000000-0000-0000-0000-000000000005",
    );
    const [stored] = await listOperations(scope);
    expect(stored.operationId).toBe(operation.operationId);
    expect(stored.entityType).toBe("REPAIR_DIAGNOSTIC");
    expect(stored.operationType).toBe("CREATE");
    expect(stored.baseVersion).toBe(0);
    expect(stored.payload.work_item_id).toBe("00000000-0000-0000-0000-000000000005");
  });
});
