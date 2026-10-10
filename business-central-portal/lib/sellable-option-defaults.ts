import type { Variant } from "./types";

// Match the backend's standard-option-first ordering when displaying inherited units.
export function defaultSellableOption(productId: string, variants: Variant[]) {
  const standardSKU = `STD-${productId.replaceAll("-", "")}`;
  return variants
    .filter((variant) => variant.product_id === productId)
    .sort((left, right) => {
      const standardOrder = Number(right.sku === standardSKU) - Number(left.sku === standardSKU);
      return standardOrder || left.id.localeCompare(right.id);
    })[0];
}
