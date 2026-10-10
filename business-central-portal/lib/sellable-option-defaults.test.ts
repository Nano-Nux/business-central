import { describe, expect, it } from "vitest";
import { defaultSellableOption } from "./sellable-option-defaults";
import type { Variant } from "./types";

const option = (id: string, sku: string, product_id = "product"): Variant => ({
  id,
  sku,
  product_id,
  name: "Option",
  base_unit_id: id,
  unit_of_measure: id,
  is_stock_tracked: true,
});
describe("default sellable option", () => {
  it("prefers the managed standard option even if another option sorts first", () => {
    const variants = [
      option("a", "PACK"),
      option("z", "STD-product"),
      option("0", "STD-product", "other-product"),
    ];
    expect(defaultSellableOption("product", variants)?.id).toBe("z");
    expect(variants[0].id).toBe("a");
  });
  it("uses deterministic IDs when there is no standard option and never crosses products", () => {
    expect(defaultSellableOption("product", [option("z", "Z"), option("a", "A")])?.id).toBe("a");
    expect(defaultSellableOption("missing", [option("a", "A")])).toBeUndefined();
  });
});
