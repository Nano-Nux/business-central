import { listCachedResources, listOperations, type OfflineScope } from "./offline-db";
import type { Variant } from "./types";

export type SaleItem = Variant & {
  price?: string;
  product_name?: string;
  quantity_on_hand?: string;
  stock_asset_id?: string;
  barcode_match?: string;
};

export async function lookupBarcodeOffline(
  scope: OfflineScope | null,
  shopID: string,
  barcode: string,
  inMemoryCatalog: SaleItem[] = [],
): Promise<SaleItem[]> {
  const normalized = barcode.trim().toLowerCase();
  if (!normalized) return [];

  // 1. Search in-memory POS catalog items first
  const memoryMatches = inMemoryCatalog.filter((item) => {
    const itemBarcode = item.barcode?.trim().toLowerCase();
    const itemSku = item.sku?.trim().toLowerCase();
    return itemBarcode === normalized || itemSku === normalized;
  });

  if (memoryMatches.length > 0) {
    return memoryMatches;
  }

  // 2. Search cached POS catalog resources in IndexedDB
  if (scope) {
    try {
      const resources = await listCachedResources<SaleItem[]>(scope);
      const catalogResources = resources.filter((r) => r.path.startsWith("/pos/catalog"));
      const currentShopResource = catalogResources.find(
        (r) =>
          r.path.includes(`shop_id=${encodeURIComponent(shopID)}`) ||
          r.path.includes(`shop_id=${shopID}`),
      );
      const targetResources = currentShopResource
        ? [currentShopResource, ...catalogResources.filter((r) => r !== currentShopResource)]
        : catalogResources;

      for (const res of targetResources) {
        if (Array.isArray(res.data)) {
          const matches = res.data.filter((item) => {
            const itemBarcode = item.barcode?.trim().toLowerCase();
            const itemSku = item.sku?.trim().toLowerCase();
            return itemBarcode === normalized || itemSku === normalized;
          });
          if (matches.length > 0) {
            return matches;
          }
        }
      }
    } catch {
      // IndexedDB unavailable or reading failed
    }

    // 3. Search pending offline operations for newly created variants
    try {
      const operations = await listOperations(scope);
      const pendingVariants = operations.filter(
        (op) =>
          op.entityType === "CATALOG_VARIANT" &&
          op.operationType === "CREATE" &&
          ["PENDING", "FAILED", "BLOCKED"].includes(op.status),
      );
      for (const op of pendingVariants) {
        const payload = op.payload as {
          name?: string;
          sku?: string;
          barcode?: string;
          product_id?: string;
          base_unit_id?: string;
          unit_of_measure?: string;
        };
        if (
          payload.barcode?.trim().toLowerCase() === normalized ||
          payload.sku?.trim().toLowerCase() === normalized
        ) {
          return [
            {
              id: op.entityId,
              product_id: payload.product_id ?? "",
              name: payload.name ?? "Variant",
              sku: payload.sku ?? "",
              barcode: payload.barcode,
              base_unit_id: payload.base_unit_id ?? "",
              unit_of_measure: payload.unit_of_measure ?? "Unit",
              price: "0",
              quantity_on_hand: "0",
              is_stock_tracked: false,
            },
          ];
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
}
