import { describe, expect, it } from "vitest";
import { shopStockLocation } from "./shop-stock-location";
import type { Location } from "./types";

const location = (id: string, shopID: string, type = "SHOP", active = true): Location => ({
  id,
  shop_id: shopID,
  location_type: type,
  is_active: active,
  code: id,
  name: id,
});

describe("current shop stock location", () => {
  it("matches POS ordering while excluding other shops and inactive locations", () => {
    const rows = [
      location("0", "other"),
      location("1", "current", "WAREHOUSE"),
      location("2", "current", "SHOP", false),
      location("4", "current"),
      location("3", "current"),
    ];
    expect(shopStockLocation(rows, "current")?.id).toBe("3");
    expect(rows[0].id).toBe("0");
  });
  it("falls back within the shop only, ordered by ID", () => {
    expect(
      shopStockLocation(
        [location("2", "current", "WAREHOUSE"), location("1", "current", "WAREHOUSE")],
        "current",
      )?.id,
    ).toBe("1");
  });
  it("never falls back to another shop or selects without a current shop", () => {
    expect(shopStockLocation([location("1", "other")], "current")).toBeUndefined();
    expect(shopStockLocation([location("1", "other")])).toBeUndefined();
  });
});
