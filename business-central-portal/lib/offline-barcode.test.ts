import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineScope,
  putCachedResource,
  queueOperationWithEntity,
  type OfflineScope,
} from "./offline-db";
import { lookupBarcodeOffline, type SaleItem } from "./offline-barcode";

const scope: OfflineScope = {
  merchantId: "merchant-test",
  membershipId: "user-test",
};

const sampleItem1: SaleItem = {
  id: "var-1",
  product_id: "prod-1",
  product_name: "Coffee Beans",
  name: "Espresso Roast 1kg",
  sku: "COF-ESP-1KG",
  barcode: "8851234567890",
  base_unit_id: "unit-1",
  unit_of_measure: "kg",
  price: "25.00",
  quantity_on_hand: "50",
  is_stock_tracked: true,
};

const sampleItem2: SaleItem = {
  id: "var-2",
  product_id: "prod-2",
  product_name: "Whole Milk",
  name: "1 Gallon",
  sku: "MILK-GAL",
  barcode: "8859876543210",
  base_unit_id: "unit-2",
  unit_of_measure: "gallon",
  price: "4.50",
  quantity_on_hand: "20",
  is_stock_tracked: true,
};

describe("lookupBarcodeOffline", () => {
  beforeEach(async () => {
    await clearOfflineScope(scope);
  });

  it("finds matching item in in-memory catalog by barcode", async () => {
    const results = await lookupBarcodeOffline(scope, "shop-1", "8851234567890", [
      sampleItem1,
      sampleItem2,
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("var-1");
    expect(results[0].product_name).toBe("Coffee Beans");
  });

  it("finds matching item in in-memory catalog by SKU fallback", async () => {
    const results = await lookupBarcodeOffline(scope, "shop-1", "MILK-GAL", [
      sampleItem1,
      sampleItem2,
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("var-2");
  });

  it("finds matching item in cached IndexedDB catalog when in-memory catalog is empty", async () => {
    // Cache catalog in IndexedDB
    await putCachedResource(scope, "/pos/catalog?page_index=0&page_size=200&shop_id=shop-1", [
      sampleItem1,
      sampleItem2,
    ]);

    const results = await lookupBarcodeOffline(
      scope,
      "shop-1",
      "8851234567890",
      [], // in-memory catalog empty
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("var-1");
  });

  it("finds newly created offline variant from pending operations", async () => {
    await queueOperationWithEntity(
      scope,
      {
        entityType: "CATALOG_VARIANT",
        entityId: "new-var-123",
        operationType: "CREATE",
        payload: {
          name: "Offline Croissant",
          sku: "CROIS-01",
          barcode: "1234567890128",
          product_id: "prod-crois",
        },
      },
      { id: "new-var-123" },
    );

    const results = await lookupBarcodeOffline(scope, "shop-1", "1234567890128", []);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("new-var-123");
    expect(results[0].name).toBe("Offline Croissant");
    expect(results[0].barcode).toBe("1234567890128");
  });

  it("returns empty array when no barcode or SKU matches", async () => {
    const results = await lookupBarcodeOffline(scope, "shop-1", "NONEXISTENT-CODE", [sampleItem1]);
    expect(results).toEqual([]);
  });
});
