import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getFilteredNavigationGroups,
  getLandingPageOptions,
  getLocalizedNavLabel,
} from "./navigation";
import { getCanonicalWorkspaceHref, getWorkspaceSourcePath } from "./workspace-routes";

const modes = ["NANO", "MINI", "SIMPLE", "COMPLEX"];

describe.each(modes)("%s workspace URLs", (mode) => {
  it("provides real canonical pages and matching landing choices for every role", () => {
    for (const isMerchant of [true, false]) {
      const options = {
        posComplexityLevel: mode,
        isMerchant,
        moduleCodes: ["repair"],
        can: () => true,
      };
      const items = getFilteredNavigationGroups(options).flatMap((group) => group.items);
      expect(getLandingPageOptions(options).flatMap((group) => group.items)).toEqual(
        items.map((item) => ({ value: item.href, label: item.label })),
      );
      for (const item of items) {
        expect(existsSync(resolve(`app/(workspace)${item.href}/page.tsx`)), item.href).toBe(true);
        expect(getCanonicalWorkspaceHref(item.href, mode)).toBe(item.href);
        expect(getCanonicalWorkspaceHref(getWorkspaceSourcePath(item.href, mode), mode)).toBe(
          item.href,
        );
      }
      expect(items.find((item) => item.label === "Products & storage")?.href).toBe(
        mode === "NANO" || mode === "MINI" ? "/products-and-storage" : undefined,
      );
      expect(items.find((item) => item.label === "Customers & deliveries")?.href).toBe(
        "/customers-and-deliveries",
      );
    }
  });

  it("migrates legacy bookmarks with child paths, queries and fragments intact", () => {
    for (const [old, current] of [
      ["/customers/abc/edit?from=pos#name", "/customers-and-deliveries/abc/edit?from=pos#name"],
      ["/deliveries?status=pending", "/customers-and-deliveries/deliveries?status=pending"],
      ["/stock-movements/abc", "/stock-history/abc"],
      ["/stock-assets", "/stock-barcodes"],
      ["/accounts", "/staff-accounts"],
      ["/catalog/attributes", "/catalog/variant-attributes"],
    ]) {
      expect(getCanonicalWorkspaceHref(old, mode)).toBe(current);
      expect(getWorkspaceSourcePath(current, mode)).toBe(old);
    }
    expect(getCanonicalWorkspaceHref("/catalog?tab=products#stock", mode)).toBe(
      mode === "NANO" ? "/products-and-storage?tab=products#stock" : "/catalog?tab=products#stock",
    );
    expect(getCanonicalWorkspaceHref("/storage", mode)).toBe(
      mode === "NANO" || mode === "MINI" ? "/products-and-storage" : "/storage",
    );
    expect(getCanonicalWorkspaceHref("/catalog/products", mode)).toBe("/catalog/products");
    expect(getCanonicalWorkspaceHref("/customers-other", mode)).toBe("/customers-other");
  });
});

it("keeps translations for renamed navigation entries", () => {
  const translate = (key: string) => key;
  for (const [href, label, key] of [
    ["/products-and-storage", "Products & storage", "nav.products_storage"],
    ["/customers-and-deliveries", "Customers & deliveries", "nav.customers_deliveries"],
    ["/stock-barcodes", "Stock barcodes", "nav.stock_barcodes"],
    ["/stock-history", "Stock history", "nav.stock_history"],
    ["/staff-accounts", "Staff accounts", "nav.staff_accounts"],
    ["/catalog/variant-attributes", "Variant attributes", "nav.variant_attributes"],
  ])
    expect(getLocalizedNavLabel(href, label, translate)).toBe(key);
});
