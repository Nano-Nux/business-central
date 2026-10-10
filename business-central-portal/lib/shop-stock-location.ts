import type { Location } from "./types";

// Match the canonical POS location ordering, scoped strictly to the current shop.
export function shopStockLocation(locations: Location[], shopID?: string) {
  if (!shopID) return undefined;
  return locations
    .filter((location) => location.is_active && location.shop_id === shopID)
    .sort(
      (a, b) =>
        Number(b.location_type === "SHOP") - Number(a.location_type === "SHOP") ||
        a.id.localeCompare(b.id),
    )[0];
}
