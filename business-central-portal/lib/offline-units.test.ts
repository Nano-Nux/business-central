import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  getCachedResource,
  listOperations,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";
import { queueConversionCreate, queueUnitCreate, queueUnitDelete } from "./offline-units";
import type { Unit } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const unitsPath = "/units?page_index=0&page_size=100";
const conversionsPath = "/unit-conversions?page_index=0&page_size=100";

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(deleteDatabase);

describe("offline units and conversions", () => {
  it("queues a unit create and projects it locally", async () => {
    await putCachedResource<Unit[]>(scope, unitsPath, []);
    const operation = await queueUnitCreate(scope, {
      code: "BOX",
      name: "Box",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    });

    expect(operation.entityType).toBe("CATALOG_UNIT");
    await expect(getCachedResource<Unit[]>(scope, unitsPath)).resolves.toMatchObject({
      data: [{ id: operation.entityId, code: "BOX" }],
    });
  });

  it("orders a conversion after one pending unit parent and rejects two unresolved parents", async () => {
    await putCachedResource<Unit[]>(scope, unitsPath, []);
    await putCachedResource(scope, conversionsPath, []);
    const from = await queueUnitCreate(scope, {
      code: "CASE",
      name: "Case",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    });
    const to = crypto.randomUUID();
    const conversion = await queueConversionCreate(scope, {
      from_unit_id: from.entityId,
      to_unit_id: to,
      multiplier: "24",
      additive_offset: "0",
      is_active: true,
    });
    expect(conversion.dependencyOperationId).toBe(from.operationId);

    const second = await queueUnitCreate(scope, {
      code: "EACH",
      name: "Each",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    });
    await expect(
      queueConversionCreate(scope, {
        from_unit_id: from.entityId,
        to_unit_id: second.entityId,
        multiplier: "1",
        additive_offset: "0",
        is_active: true,
      }),
    ).rejects.toThrow("Synchronize both new units");
    expect(
      (await listOperations(scope)).filter((item) => item.entityType === "CATALOG_CONVERSION"),
    ).toHaveLength(1);
  });

  it("queues unit deletion with the cached entity version", async () => {
    const unit: Unit = {
      id: crypto.randomUUID(),
      code: "KG",
      name: "Kilogram",
      dimension_code: "MASS",
      allows_decimal: true,
      is_active: true,
      sync_version: 4,
    };
    await putCachedResource<Unit[]>(scope, unitsPath, [unit]);
    const operation = await queueUnitDelete(scope, unit);
    expect(operation.baseVersion).toBe(4);
    await expect(getCachedResource<Unit[]>(scope, unitsPath)).resolves.toMatchObject({ data: [] });
  });
});
