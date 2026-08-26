import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { listOperations } from "./offline-db";
import { queueProductCreate, queueProductMetadataUpdate } from "./offline-catalog";
import { queuePriceListCreate, queuePriceListUpdate } from "./offline-price-lists";
import { queueUnitCreate, queueUnitUpdate } from "./offline-units";
import type { PriceList, Product, Unit } from "./types";

const scope = { merchantId: "merchant-dependencies", membershipId: "member-dependencies" };

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

describe("offline typed operation dependencies", () => {
  it("orders updates after locally created products, units, and price lists", async () => {
    const productCreate = await queueProductCreate(scope, {
      name: "Offline product",
      description: "",
      product_type: "GOODS",
      is_active: true,
      category_ids: [],
    });
    const product = {
      id: productCreate.entityId,
      name: "Offline product",
      description: "",
      product_type: "GOODS",
      is_active: true,
      category_ids: [],
      category_names: [],
    } as Product;
    const productUpdate = await queueProductMetadataUpdate(scope, product, {
      name: "Renamed product",
      description: "",
      product_type: "GOODS",
      is_active: true,
      category_ids: [],
    });

    const unitCreate = await queueUnitCreate(scope, {
      code: "EA",
      name: "Each",
      symbol: "ea",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    });
    const unit = {
      id: unitCreate.entityId,
      code: "EA",
      name: "Each",
      symbol: "ea",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    } as Unit;
    const unitUpdate = await queueUnitUpdate(scope, unit, {
      code: "EACH",
      name: "Each",
      symbol: "ea",
      dimension_code: "COUNT",
      allows_decimal: false,
      is_active: true,
    });

    const priceListCreate = await queuePriceListCreate(scope, {
      code: "OFFLINE",
      currency_code: "USD",
      is_default: false,
    });
    const priceList = {
      id: priceListCreate.entityId,
      code: "OFFLINE",
      currency_code: "USD",
      is_default: false,
    } as PriceList;
    const priceListUpdate = await queuePriceListUpdate(scope, priceList, {
      code: "OFFLINE-UPDATED",
      currency_code: "USD",
      is_default: false,
    });

    expect(productUpdate.dependencyOperationId).toBe(productCreate.operationId);
    expect(productUpdate.baseVersion).toBe(1);
    expect(unitUpdate.dependencyOperationId).toBe(unitCreate.operationId);
    expect(unitUpdate.baseVersion).toBe(1);
    expect(priceListUpdate.dependencyOperationId).toBe(priceListCreate.operationId);
    expect(priceListUpdate.baseVersion).toBe(1);
    expect(await listOperations(scope)).toHaveLength(6);
  });
});
