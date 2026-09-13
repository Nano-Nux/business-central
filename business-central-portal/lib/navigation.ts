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
      { href: "/dashboard", label: "Today", icon: "home" },
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
        href: "/stock-in",
        label: "Stock in",
        icon: "package",
        permission: "stock_in",
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
      { href: "/customers", label: "Customers", icon: "users", permission: "tenant.read" },
      { href: "/deliveries", label: "Deliveries", icon: "package", permission: "tenant.write" },
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
        href: "/invoices",
        label: "Invoices",
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
        href: "/promotions",
        label: "Promotions",
        icon: "tag",
        permission: "tenant.write",
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
      {
        href: "/guide",
        label: "Quick guide",
        icon: "book",
      },
    ],
  },
];

export type NavigationFilterOptions = {
  posComplexityLevel?: "SIMPLE" | "COMPLEX" | "MINI" | string;
  isMerchant?: boolean;
  can?: (permission: string) => boolean;
  moduleCodes?: string[];
  mapDashboardForRole?: boolean;
};

export function getFilteredNavigationGroups({
  posComplexityLevel,
  isMerchant = true,
  can,
  moduleCodes,
  mapDashboardForRole = true,
}: NavigationFilterOptions): NavGroup[] {
  const isMini = posComplexityLevel === "MINI";
  const isComplex = posComplexityLevel === "COMPLEX";

  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        if (item.merchantOnly && !isMerchant) return false;
        if (item.permission && can && !can(item.permission)) return false;

        // POS complexity level rules
        if (item.href === "/catalog/attributes" && !isComplex) return false;
        if (isMini && item.href === "/stock-assets") return false;
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
      })
      .map((item) => {
        if (mapDashboardForRole && item.href === "/dashboard") {
          return {
            ...item,
            href: isMerchant ? "/merchant/dashboard" : "/staff/dashboard",
          };
        }
        return item;
      }),
  })).filter((group) => group.items.length > 0);
}

export type LandingPageOption = {
  value: string;
  label: string;
};

export type LandingPageGroup = {
  label: string;
  items: LandingPageOption[];
};

export function getLandingPageOptions(
  options: Omit<NavigationFilterOptions, "mapDashboardForRole">,
): LandingPageGroup[] {
  // For landing pages, we do not rewrite /dashboard into /merchant/dashboard or /staff/dashboard
  // so the canonical "/dashboard" URL works universally across both merchant and staff logins.
  const groups = getFilteredNavigationGroups({
    ...options,
    mapDashboardForRole: false,
  });

  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      value: item.href,
      label: item.href === "/dashboard" ? "Dashboard (Today)" : item.label,
    })),
  }));
}

export function formatPosModeName(posComplexityLevel?: string): {
  code: "pos-mini" | "pos-simple" | "pos-complex";
  name: string;
  badge: string;
} {
  switch (posComplexityLevel) {
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
  const map: Record<string, string> = {
    "/dashboard": "nav.today",
    "/merchant/dashboard": "nav.today",
    "/staff/dashboard": "nav.today",
    "/pos": "nav.pos",
    "/catalog": "nav.catalog",
    "/catalog/attributes": "nav.variant_attributes",
    "/storage": "nav.storage",
    "/stock-in": "nav.stock_in",
    "/stock-assets": "nav.stock_barcodes",
    "/stock-movements": "nav.stock_history",
    "/transaction-history": "nav.transaction_history",
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
  };
  const key = map[href];
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
  };
  const key = map[label];
  return key ? t(key, label) : label;
}
