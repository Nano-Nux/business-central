import { describe, expect, it } from "vitest";
import {
  formatPosModeName,
  getFilteredNavigationGroups,
  getLandingPageOptions,
} from "./navigation";

describe("navigation engine", () => {
  it("formats POS mode names accurately", () => {
    expect(formatPosModeName("MINI")).toEqual({
      code: "pos-mini",
      name: "POS Mini",
      badge: "pos-mini",
    });
    expect(formatPosModeName("SIMPLE")).toEqual({
      code: "pos-simple",
      name: "POS Simple",
      badge: "pos-simple",
    });
    expect(formatPosModeName("COMPLEX")).toEqual({
      code: "pos-complex",
      name: "POS Complex",
      badge: "pos-complex",
    });
    expect(formatPosModeName(undefined)).toEqual({
      code: "pos-simple",
      name: "POS Simple",
      badge: "pos-simple",
    });
  });

  describe("POS Mode: pos-mini (MINI)", () => {
    it("filters out complex and advanced stock/repair presets", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "MINI",
        isMerchant: true,
        moduleCodes: ["sales", "repair"],
      });

      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

      // Excluded in pos-mini:
      expect(allHrefs).not.toContain("/catalog/attributes");
      expect(allHrefs).not.toContain("/stock-assets");
      expect(allHrefs).not.toContain("/repairs/catalog");
      expect(allHrefs).not.toContain("/repairs/issue-presets");
      expect(allHrefs).not.toContain("/repairs/condition-presets");

      // Included in pos-mini:
      expect(allHrefs).toContain("/merchant/dashboard");
      expect(allHrefs).toContain("/pos");
      expect(allHrefs).toContain("/catalog");
      expect(allHrefs).toContain("/storage");
      expect(allHrefs).toContain("/stock-in");
      expect(allHrefs).toContain("/stock-movements");
      expect(allHrefs).toContain("/transaction-history");
      expect(allHrefs).toContain("/customers");
      expect(allHrefs).toContain("/deliveries");
      expect(allHrefs).toContain("/repairs");
      expect(allHrefs).toContain("/invoices");
      expect(allHrefs).toContain("/reports");
      expect(allHrefs).toContain("/promotions");
      expect(allHrefs).toContain("/accounts");
      expect(allHrefs).toContain("/settings");
      expect(allHrefs).not.toContain("/guide");
    });
  });

  describe("POS Mode: pos-simple (SIMPLE)", () => {
    it("includes stock barcodes and repair presets, but excludes variant attributes", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "SIMPLE",
        isMerchant: true,
        moduleCodes: ["sales", "repair"],
      });

      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

      // Excluded in pos-simple:
      expect(allHrefs).not.toContain("/catalog/attributes");

      // Included in pos-simple:
      expect(allHrefs).toContain("/stock-assets");
      expect(allHrefs).toContain("/repairs/catalog");
      expect(allHrefs).toContain("/repairs/issue-presets");
      expect(allHrefs).toContain("/repairs/condition-presets");
      expect(allHrefs).toContain("/pos");
      expect(allHrefs).toContain("/catalog");
    });
  });

  describe("POS Mode: pos-complex (COMPLEX)", () => {
    it("includes variant attributes and all standard options", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: true,
        moduleCodes: ["sales", "repair"],
      });

      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

      // Included in pos-complex:
      expect(allHrefs).toContain("/catalog/attributes");
      expect(allHrefs).toContain("/stock-assets");
      expect(allHrefs).toContain("/repairs/catalog");
      expect(allHrefs).toContain("/repairs/issue-presets");
      expect(allHrefs).toContain("/repairs/condition-presets");
      expect(allHrefs).toContain("/pos");
      expect(allHrefs).toContain("/catalog");
    });
  });

  describe("Shop module filtering", () => {
    it("excludes all repair routes when shop does not have repair module", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: true,
        moduleCodes: ["sales"],
      });

      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

      expect(allHrefs).not.toContain("/repairs");
      expect(allHrefs).not.toContain("/repairs/catalog");
      expect(allHrefs).not.toContain("/repairs/issue-presets");
      expect(allHrefs).not.toContain("/repairs/condition-presets");
    });
  });

  describe("Landing page options", () => {
    it("preserves canonical /dashboard href and provides formatted labels", () => {
      const landingGroups = getLandingPageOptions({
        posComplexityLevel: "SIMPLE",
        isMerchant: true,
        moduleCodes: ["sales", "repair"],
      });

      const overviewGroup = landingGroups.find((g) => g.label === "Overview");
      expect(overviewGroup).toBeDefined();

      const dashboardOption = overviewGroup?.items.find((i) => i.value === "/dashboard");
      expect(dashboardOption).toEqual({
        value: "/dashboard",
        label: "Dashboard (Today)",
      });

      const posOption = overviewGroup?.items.find((i) => i.value === "/pos");
      expect(posOption).toEqual({
        value: "/pos",
        label: "Point of sale",
      });
    });
  });
});
