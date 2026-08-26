import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getCachedResource, putCachedResource, type OfflineScope } from "./offline-db";
import { queueAttributeDefinitionCreate, queueAttributeOptionCreate } from "./offline-attributes";
import type { AttributeDefinition } from "./types";

const scope: OfflineScope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};
const path = "/catalog/attributes?page_index=0&page_size=100";

function deleteDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("business-central-portal-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test database is blocked."));
  });
}

beforeEach(async () => {
  await deleteDatabase();
});

describe("offline variant attributes", () => {
  it("keeps a new definition, option, and dependency in the local outbox", async () => {
    await putCachedResource<AttributeDefinition[]>(scope, path, []);

    const definitionOperation = await queueAttributeDefinitionCreate(scope, {
      code: "COLOR",
      name: "Color",
      value_type: "SELECT",
    });
    const optionOperation = await queueAttributeOptionCreate(scope, {
      definition_id: definitionOperation.entityId,
      value: "red",
      label: "Red",
      position: 0,
    });

    expect(optionOperation.dependencyOperationId).toBe(definitionOperation.operationId);
    await expect(getCachedResource<AttributeDefinition[]>(scope, path)).resolves.toMatchObject({
      data: [
        {
          id: definitionOperation.entityId,
          code: "COLOR",
          options: [{ id: optionOperation.entityId, value: "red" }],
        },
      ],
    });
  });
});
