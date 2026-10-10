import { getCanonicalWorkspaceHref, getWorkspaceSourcePath } from "./workspace-routes";

import type { IconName } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  permission?: string;
  merchantOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/pos",
        label: "Point of sale",
        icon: "cart",
        permission: "tenant.write",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/catalog",
        label: "Catalog",
        icon: "catalog",
        permission: "tenant.read",
        merchantOnly: true,
      },
      {
        href: "/catalog/attributes",
        label: "Variant attributes",
        icon: "tag",
        permission: "tenant.write",
        merchantOnly: true,
      },
      {
        href: "/storage",
        label: "Storage",
        icon: "package",
        permission: "tenant.read",
      },
      {
        href: "/stock-conversions",
        label: "Stock conversion",
        icon: "swap",
        permission: "tenant.write",
      },
      {
        href: "/stock-assets",
        label: "Stock barcodes",
        icon: "box",
        permission: "tenant.write",
      },
      {
        href: "/stock-movements",
        label: "Stock history",
        icon: "history",
        permission: "tenant.read",
      },
      {
        href: "/transaction-history",
        label: "Transaction history",
        icon: "receipt",
        permission: "tenant.read",
      },
      {
        href: "/promotions",
        label: "Promotions",
        icon: "tag",
        permission: "tenant.write",
        merchantOnly: true,
      },
      {
        href: "/customers",
        label: "Customers & deliveries",
        icon: "users",
        permission: "tenant.read",
      },
      {
        href: "/repairs",
        label: "Repair",
        icon: "repair",
        permission: "tenant.write",
      },
      {
        href: "/repairs/catalog",
        label: "Repair catalog",
        icon: "catalog",
        permission: "tenant.write",
      },
      {
        href: "/repairs/issue-presets",
        label: "Issue presets",
        icon: "tag",
        permission: "tenant.write",
        merchantOnly: true,
      },
      {
        href: "/repairs/condition-presets",
        label: "Condition presets",
        icon: "tag",
        permission: "tenant.write",
        merchantOnly: true,
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/reports",
        label: "Reports",
        icon: "chart",
        permission: "tenant.read",
        merchantOnly: true,
      },
    ],
  },
  {
    label: "AI",
    items: [
      {
        href: "/ai-assistant",
        label: "Nanonux AI",
        icon: "bot",
        permission: "ai.chat",
      },
      {
        href: "/automations",
        label: "Automations",
        icon: "bot",
        permission: "tenant.read",
        merchantOnly: true,
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        href: "/accounts",
        label: "Staff accounts",
        icon: "users",
        permission: "membership.manage",
        merchantOnly: true,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "settings",
      },
    ],
  },
];

export type NavigationFilterOptions = {
  posComplexityLevel?: "SIMPLE" | "COMPLEX" | "MINI" | string;
  isMerchant?: boolean;
  can?: (permission: string) => boolean;
  moduleCodes?: string[];
  aiAssistantEnabled?: boolean;
};

export function isAiWorkspacePath(path: string): boolean {
  return NAVIGATION_GROUPS.filter((group) => group.label === "AI").some((group) =>
    group.items.some((item) => path === item.href || path.startsWith(`${item.href}/`)),
  );
}

export function getFilteredNavigationGroups({
  posComplexityLevel,
  isMerchant = true,
  can,
  moduleCodes,
  aiAssistantEnabled = false,
}: NavigationFilterOptions): NavGroup[] {
  if (posComplexityLevel === "NANO") {
    const core: NavItem[] = [
      { href: "/pos", label: "POS", icon: "cart", permission: "tenant.write" },
      { href: "/catalog", label: "Products & storage", icon: "package", permission: "tenant.read" },
      {
        href: "/promotions",
        label: "Promotions",
        icon: "tag",
        permission: "tenant.write",
        merchantOnly: true,
      },
      {
        href: "/transaction-history",
        label: "Transaction history",
        icon: "receipt",
        permission: "tenant.read",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: "chart",
        permission: "tenant.read",
        merchantOnly: true,
      },
      {
        href: "/customers",
        label: "Customers & deliveries",
        icon: "users",
        permission: "tenant.read",
      },
      {
        href: "/accounts",
        label: "Staff accounts",
        icon: "users",
        permission: "membership.manage",
        merchantOnly: true,
      },
      { href: "/settings", label: "Settings", icon: "settings" },
    ];
    const services = NAVIGATION_GROUPS.flatMap((group) => group.items).filter(
      (item) => item.href.startsWith("/repairs") && moduleCodes?.includes("repair"),
    );
    return [
      { label: "Workspace", items: core },
      { label: "Services", items: services },
      ...NAVIGATION_GROUPS.filter((group) => group.label === "AI" && aiAssistantEnabled),
    ]
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            (!item.merchantOnly || isMerchant) &&
            (!item.permission || !can || can(item.permission)),
        ),
      }))
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          href: getCanonicalWorkspaceHref(item.href, posComplexityLevel),
        })),
      }));
  }
  const isMini = posComplexityLevel === "MINI";
  const isComplex = posComplexityLevel === "COMPLEX";

  return NAVIGATION_GROUPS.filter((group) => group.label !== "AI" || aiAssistantEnabled)
    .map((group) => ({
      ...group,
      items: group.items
        .map((item): NavItem => {
          if (isMini && item.href === "/storage") return { ...item, label: "Products & storage" };
          if (isMini && item.href === "/stock-movements")
            return { ...item, href: "/history", label: "History" };
          return item;
        })
        .filter((item) => {
          if (item.merchantOnly && !isMerchant) return false;
          if (item.permission && can && !can(item.permission)) return false;

          if (isMini && item.href === "/transaction-history") return false;

          // POS complexity level rules
          if (item.href === "/catalog/attributes" && !isComplex) return false;
          if (isMini && (item.href === "/stock-assets" || item.href === "/stock-conversions"))
            return false;
          if (
            isMini &&
            (item.href === "/repairs/catalog" ||
              item.href === "/repairs/issue-presets" ||
              item.href === "/repairs/condition-presets")
          ) {
            return false;
          }

          // Shop module rules
          if (item.href.startsWith("/repairs") && moduleCodes && !moduleCodes.includes("repair")) {
            return false;
          }

          return true;
        }),
    }))
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        href: getCanonicalWorkspaceHref(item.href, posComplexityLevel),
      })),
    }));
}

export type LandingPageOption = {
  value: string;
  label: string;
};

export type LandingPageGroup = {
  label: string;
  items: LandingPageOption[];
};

export function getLandingPageOptions(options: NavigationFilterOptions): LandingPageGroup[] {
  const groups = getFilteredNavigationGroups(options);

  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      value: item.href,
      label: item.label,
    })),
  }));
}

export function formatPosModeName(posComplexityLevel?: string): {
  code: "pos-nano" | "pos-mini" | "pos-simple" | "pos-complex";
  name: string;
  badge: string;
} {
  switch (posComplexityLevel) {
    case "NANO":
      return { code: "pos-nano", name: "POS Nano", badge: "pos-nano" };
    case "MINI":
      return {
        code: "pos-mini",
        name: "POS Mini",
        badge: "pos-mini",
      };
    case "COMPLEX":
      return {
        code: "pos-complex",
        name: "POS Complex",
        badge: "pos-complex",
      };
    case "SIMPLE":
    default:
      return {
        code: "pos-simple",
        name: "POS Simple",
        badge: "pos-simple",
      };
  }
}

export function getLocalizedNavLabel(
  href: string,
  fallback: string,
  t?: (key: string, fallback: string) => string,
): string {
  if (!t) return fallback;
  if (fallback === "Products & storage") return t("nav.products_storage", fallback);
  if (fallback === "Customers & deliveries") return t("nav.customers_deliveries", fallback);
  const map: Record<string, string> = {
    "/dashboard": "nav.today",
    "/ai-assistant": "nav.nanonux_ai",
    "/merchant/dashboard": "nav.today",
    "/staff/dashboard": "nav.today",
    "/pos": "nav.pos",
    "/catalog": "nav.catalog",
    "/catalog/attributes": "nav.variant_attributes",
    "/storage": "nav.storage",
    "/stock-in": "nav.stock_in",
    "/stock-assets": "nav.stock_barcodes",
    "/stock-movements": "nav.stock_history",
    "/history": "nav.history",
    "/transaction-history": "nav.transaction_history",
    "/stock-conversions": "nav.stock_conversion",
    "/customers": "nav.customers",
    "/deliveries": "nav.deliveries",
    "/repairs": "nav.repairs",
    "/repairs/catalog": "nav.repair_catalog",
    "/repairs/issue-presets": "nav.issue_presets",
    "/repairs/condition-presets": "nav.condition_presets",
    "/invoices": "nav.invoices",
    "/reports": "nav.reports",
    "/promotions": "nav.promotions",
    "/accounts": "nav.staff_accounts",
    "/settings": "nav.settings",
    "/guide": "nav.guide",
    "/automations": "nav.automations",
  };
  const key = map[getWorkspaceSourcePath(href)];
  return key ? t(key, fallback) : fallback;
}

export function getLocalizedGroupLabel(
  label: string,
  t?: (key: string, fallback: string) => string,
): string {
  if (!t) return label;
  const map: Record<string, string> = {
    Overview: "nav.overview",
    Operations: "nav.operations",
    Insights: "nav.insights",
    Manage: "nav.manage",
    Automations: "nav.automations",
  };
  const key = map[label];
  return key ? t(key, label) : label;
}
