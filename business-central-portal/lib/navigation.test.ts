import { describe, expect, it } from "vitest";
import {
  formatPosModeName,
  getFilteredNavigationGroups,
  getLandingPageOptions,
  getLocalizedNavLabel,
  isAiWorkspacePath,
} from "./navigation";

describe("navigation engine", () => {
  it("removes Today from navigation and landing choices in every mode while preserving report access", () => {
    for (const posComplexityLevel of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
      for (const isMerchant of [true, false]) {
        const options = { posComplexityLevel, isMerchant, can: () => true };
        const navigation = getFilteredNavigationGroups(options).flatMap((g) =>
          g.items.map((i) => i.href),
        );
        const landing = getLandingPageOptions(options).flatMap((g) => g.items.map((i) => i.value));
        for (const links of [navigation, landing]) {
          expect(links.some((href) => href.includes("dashboard"))).toBe(false);
          expect(links.includes("/reports")).toBe(isMerchant);
        }
      }
    }
  });
  it("exposes exactly eight core Nano pages when AI is disabled", () => {
    const groups = getFilteredNavigationGroups({
      posComplexityLevel: "NANO",
      moduleCodes: [],
      aiAssistantEnabled: false,
    });
    expect(groups.flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/pos",
      "/products-and-storage",
      "/promotions",
      "/transaction-history",
      "/reports",
      "/customers-and-deliveries",
      "/staff-accounts",
      "/settings",
    ]);
    expect(groups[0].items[1].label).toBe("Products & storage");
    expect(formatPosModeName("NANO").name).toBe("POS Nano");
  });

  it("retains enabled repair pages in Nano with role and permission filtering", () => {
    const options = { posComplexityLevel: "NANO", moduleCodes: ["repair"] };
    const owner = getFilteredNavigationGroups(options).flatMap((group) => group.items);
    expect(owner.map((item) => item.href)).toContain("/repairs");
    expect(owner.map((item) => item.href)).toContain("/repairs/catalog");
    const staff = getFilteredNavigationGroups({
      ...options,
      isMerchant: false,
      can: (permission) => permission === "tenant.read",
    }).flatMap((group) => group.items);
    expect(staff.map((item) => item.href)).toEqual([
      "/products-and-storage",
      "/transaction-history",
      "/customers-and-deliveries",
      "/settings",
    ]);
    expect(
      getLandingPageOptions(options).flatMap((group) => group.items.map((item) => item.value)),
    ).not.toContain("/dashboard");
  });
  it("offers transaction history as a landing page only with read permission", () => {
    for (const isMerchant of [true, false]) {
      const options = { posComplexityLevel: "NANO", isMerchant, moduleCodes: [] };
      const readable = getLandingPageOptions({
        ...options,
        can: (permission) => permission === "tenant.read",
      }).flatMap((group) => group.items);
      expect(readable).toContainEqual({
        value: "/transaction-history",
        label: "Transaction history",
      });
      const writeOnly = getLandingPageOptions({
        ...options,
        can: (permission) => permission === "tenant.write",
      }).flatMap((group) => group.items);
      expect(writeOnly.map((item) => item.value)).not.toContain("/transaction-history");
    }
  });
  it("offers Nano reports only to merchants with read permission, including landing options", () => {
    for (const isMerchant of [true, false]) {
      for (const readable of [true, false]) {
        const options = {
          posComplexityLevel: "NANO",
          isMerchant,
          can: (permission: string) => permission === "tenant.read" && readable,
        };
        const navigation = getFilteredNavigationGroups(options).flatMap((group) =>
          group.items.map((item) => item.href),
        );
        const landing = getLandingPageOptions(options).flatMap((group) =>
          group.items.map((item) => item.value),
        );
        expect(navigation.includes("/reports")).toBe(isMerchant && readable);
        expect(landing.includes("/reports")).toBe(isMerchant && readable);
      }
    }
  });
  it("keeps stock conversion out of Nano and Mini navigation and landing options", () => {
    for (const posComplexityLevel of ["NANO", "MINI"]) {
      for (const isMerchant of [true, false]) {
        const options = { posComplexityLevel, isMerchant, can: () => true };
        expect(
          getFilteredNavigationGroups(options).flatMap((group) =>
            group.items.map((item) => item.href),
          ),
        ).not.toContain("/stock-conversions");
        expect(
          getLandingPageOptions(options).flatMap((group) => group.items.map((item) => item.value)),
        ).not.toContain("/stock-conversions");
      }
    }
  });
  it("offers stock conversion in Simple and Complex with write permission", () => {
    for (const posComplexityLevel of ["SIMPLE", "COMPLEX"]) {
      const options = { posComplexityLevel, isMerchant: false };
      expect(
        getLandingPageOptions({ ...options, can: () => true }).flatMap((group) => group.items),
      ).toContainEqual({ value: "/stock-conversions", label: "Stock conversion" });
      expect(
        getFilteredNavigationGroups({
          ...options,
          can: (permission) => permission === "tenant.read",
        }).flatMap((group) => group.items.map((item) => item.href)),
      ).not.toContain("/stock-conversions");
    }
  });
  it("combines customers and deliveries in every mode and moves promotions into Operations", () => {
    for (const posComplexityLevel of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
      const groups = getFilteredNavigationGroups({ posComplexityLevel });
      const items = groups.flatMap((group) => group.items);
      expect(items.find((item) => item.href === "/customers-and-deliveries")?.label).toBe(
        "Customers & deliveries",
      );
      expect(items.map((item) => item.href)).not.toContain("/customers-and-deliveries/deliveries");
      if (posComplexityLevel !== "NANO") {
        expect(
          groups.find((group) => group.label === "Operations")?.items.map((item) => item.href),
        ).toContain("/promotions");
        expect(
          groups.find((group) => group.label === "Insights")?.items.map((item) => item.href),
        ).not.toContain("/promotions");
      }
    }
  });
  it("offers Mini combined storage and history with existing role and read permissions", () => {
    for (const isMerchant of [true, false]) {
      const options = {
        posComplexityLevel: "MINI",
        isMerchant,
        can: (permission: string) => permission === "tenant.read",
      };
      const items = getLandingPageOptions(options).flatMap((group) => group.items);
      expect(items).toContainEqual({ value: "/products-and-storage", label: "Products & storage" });
      expect(items).toContainEqual({ value: "/history", label: "History" });
      expect(items.some((item) => item.value === "/catalog")).toBe(isMerchant);
      expect(
        getFilteredNavigationGroups({ ...options, can: () => false }).flatMap((group) =>
          group.items.map((item) => item.href),
        ),
      ).not.toContain("/history");
    }
  });

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
      expect(allHrefs).not.toContain("/catalog/variant-attributes");
      expect(allHrefs).not.toContain("/stock-barcodes");
      expect(allHrefs).not.toContain("/repairs/catalog");
      expect(allHrefs).not.toContain("/repairs/issue-presets");
      expect(allHrefs).not.toContain("/repairs/condition-presets");

      // Included in pos-mini:
      expect(allHrefs).not.toContain("/merchant/dashboard");
      expect(allHrefs).toContain("/pos");
      expect(allHrefs).toContain("/catalog");
      expect(allHrefs).toContain("/products-and-storage");
      expect(allHrefs).not.toContain("/stock-in");
      expect(allHrefs).toContain("/history");
      expect(allHrefs).not.toContain("/stock-history");
      expect(allHrefs).not.toContain("/transaction-history");
      expect(allHrefs).toContain("/customers-and-deliveries");
      expect(allHrefs).not.toContain("/customers-and-deliveries/deliveries");
      expect(allHrefs).toContain("/repairs");
      expect(allHrefs).not.toContain("/invoices");
      expect(allHrefs).toContain("/reports");
      expect(allHrefs).toContain("/promotions");
      expect(allHrefs).toContain("/staff-accounts");
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
      expect(allHrefs).not.toContain("/catalog/variant-attributes");

      // Included in pos-simple:
      expect(allHrefs).toContain("/stock-barcodes");
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
      expect(allHrefs).toContain("/catalog/variant-attributes");
      expect(allHrefs).toContain("/stock-barcodes");
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
    it("offers operational landing pages without Today dashboard", () => {
      const landingGroups = getLandingPageOptions({
        posComplexityLevel: "SIMPLE",
        isMerchant: true,
        moduleCodes: ["sales", "repair"],
      });
      const overviewGroup = landingGroups.find((g) => g.label === "Overview");
      expect(overviewGroup).toBeDefined();
      expect(landingGroups.flatMap((g) => g.items.map((i) => i.value))).not.toContain("/dashboard");

      const posOption = overviewGroup?.items.find((i) => i.value === "/pos");
      expect(posOption).toEqual({
        value: "/pos",
        label: "Point of sale",
      });
    });
  });

  describe("AI Assistant Navigation", () => {
    it("recognizes AI pages and automation subpages without matching unrelated routes", () => {
      for (const path of [
        "/ai-assistant",
        "/ai-assistant/conversation",
        "/automations",
        "/automations/telegram",
        "/automations/whatsapp",
        "/automations/facebook",
      ]) {
        expect(isAiWorkspacePath(path)).toBe(true);
      }
      for (const path of ["/pos", "/settings", "/automations-other", "/ai-assistant-other"]) {
        expect(isAiWorkspacePath(path)).toBe(false);
      }
    });
    for (const posComplexityLevel of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
      for (const aiAssistantEnabled of [false, undefined, true]) {
        for (const isMerchant of [true, false]) {
          for (const permission of ["all", "tenant.read", "ai.chat", "none"]) {
            it(`${posComplexityLevel}: AI=${aiAssistantEnabled}, merchant=${isMerchant}, permission=${permission}`, () => {
              const options = {
                posComplexityLevel,
                aiAssistantEnabled,
                isMerchant,
                can: (code: string) => permission === "all" || permission === code,
              };
              const groups = getFilteredNavigationGroups(options);
              const landing = getLandingPageOptions(options);
              const assistant = aiAssistantEnabled === true && options.can("ai.chat");
              const automations =
                aiAssistantEnabled === true && isMerchant && options.can("tenant.read");
              for (const links of [
                groups.flatMap((group) => group.items.map((item) => item.href)),
                landing.flatMap((group) => group.items.map((item) => item.value)),
              ]) {
                expect(links.includes("/ai-assistant")).toBe(assistant);
                expect(links.includes("/automations")).toBe(automations);
              }
              expect(groups.some((group) => group.label === "AI")).toBe(assistant || automations);
            });
          }
        }
      }
    }
    it("excludes /ai-assistant when aiAssistantEnabled is false", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: true,
        can: (p) => p === "ai.chat",
        aiAssistantEnabled: false,
      });
      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(allHrefs).not.toContain("/ai-assistant");
    });

    it("excludes /ai-assistant when user lacks ai.chat permission even if enabled for merchant", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: false,
        can: (p) => p !== "ai.chat",
        aiAssistantEnabled: true,
      });
      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(allHrefs).not.toContain("/ai-assistant");
    });

    it("includes /ai-assistant when aiAssistantEnabled is true and user has ai.chat permission", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: false,
        can: (p) => p === "ai.chat" || p === "tenant.read",
        aiAssistantEnabled: true,
      });
      const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
      expect(allHrefs).toContain("/ai-assistant");
    });

    it("places /ai-assistant under the AI group", () => {
      const groups = getFilteredNavigationGroups({
        posComplexityLevel: "COMPLEX",
        isMerchant: true,
        can: (p) => p === "ai.chat",
        aiAssistantEnabled: true,
      });
      const aiGroup = groups.find((g) => g.label === "AI");
      expect(aiGroup).toBeDefined();
      expect(aiGroup?.items.some((i) => i.href === "/ai-assistant")).toBe(true);

      const overviewGroup = groups.find((g) => g.label === "Overview");
      expect(overviewGroup?.items.some((i) => i.href === "/ai-assistant") ?? false).toBe(false);
    });

    it("localizes /ai-assistant nav label to nav.nanonux_ai", () => {
      const t = (key: string, fb: string) => (key === "nav.nanonux_ai" ? "Nanonux AI" : fb);
      expect(getLocalizedNavLabel("/ai-assistant", "Nanonux AI", t)).toBe("Nanonux AI");
    });
  });

  it("groups Nanonux AI and Automations under AI for merchants", () => {
    const groups = getFilteredNavigationGroups({
      posComplexityLevel: "SIMPLE",
      isMerchant: true,
      aiAssistantEnabled: true,
      can: (permission) => permission === "tenant.read" || permission === "ai.chat",
    });
    expect(groups.find((group) => group.label === "AI")?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/ai-assistant" }),
        expect.objectContaining({ href: "/automations" }),
      ]),
    );
  });
});
