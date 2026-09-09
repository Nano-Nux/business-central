"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PendingOfflineChangesError, useAuth } from "@/lib/auth";
import { Icon, type IconName } from "./icons";
import { BrandIcon } from "./brand-icon";
import { Loading } from "./ui";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { SyncStatusPanel } from "./sync-status-panel";
import { formatShopAddress } from "@/lib/shop-address";
import { resolveMediaURL } from "@/lib/media-url";

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  permission?: string;
  merchantOnly?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
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
      { href: "/customers", label: "Customers", icon: "users", permission: "tenant.read" },
      { href: "/deliveries", label: "Deliveries", icon: "package", permission: "tenant.write" },
      {
        href: "/repairs",
        label: "Repairs",
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
        merchantOnly: true,
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, merchant, merchantReady, ready, isMerchant, can, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const {
    shops,
    currentShop,
    loading: shopsLoading,
    cachedAt: shopsCachedAt,
    error: shopsError,
  } = useShop();
  const offline = useOffline();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    const merchantOnly = ["/accounts", "/catalog", "/reports", "/promotions", "/settings"];
    if (
      ready &&
      user &&
      !isMerchant &&
      merchantOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    )
      router.replace("/staff/dashboard");
  }, [ready, user, isMerchant, pathname, router]);

  useEffect(() => {
    if (
      ready &&
      user &&
      currentShop &&
      !currentShop.module_codes?.includes("repair") &&
      (pathname === "/repairs" || pathname.startsWith("/repairs/"))
    ) {
      router.replace(isMerchant ? "/merchant/dashboard" : "/staff/dashboard");
    }
  }, [ready, user, currentShop, pathname, router, isMerchant]);

  useEffect(() => {
    if (
      ready &&
      user &&
      !shopsLoading &&
      (shopsError || shops.length === 0 || !currentShop) &&
      pathname !== "/select-shop"
    ) {
      router.replace("/select-shop");
    }
  }, [currentShop, pathname, ready, router, shops.length, shopsError, shopsLoading, user]);

  const groups = useMemo(
    () =>
      navigation
        .map((group) => ({
          ...group,
          items: group.items
            .filter(
              (item) =>
                (!item.merchantOnly || isMerchant) &&
                (!item.permission || can(item.permission)) &&
                (item.href !== "/catalog/attributes" ||
                  merchant?.pos_complexity_level === "COMPLEX") &&
                (!item.href.startsWith("/repairs") ||
                  currentShop?.module_codes?.includes("repair")),
            )
            .map((item) => {
              return item.href === "/dashboard"
                ? {
                    ...item,
                    href: isMerchant ? "/merchant/dashboard" : "/staff/dashboard",
                  }
                : item;
            }),
        }))
        .filter((group) => group.items.length),
    [can, isMerchant, currentShop, merchant?.pos_complexity_level],
  );
  if (!ready || !user || !merchantReady)
    return (
      <main className="screen-center">
        <Loading />
      </main>
    );
  if (!merchant)
    return (
      <main className="screen-center">
        <div className="empty-state">
          <h2>Merchant workspace unavailable</h2>
          <p>Reload the page to retrieve this merchant&apos;s configuration.</p>
          <button className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  const initials = user.display_name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const role = isMerchant ? "Merchant" : "Staff";
  const shopInitials =
    currentShop?.name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "—";
  const shopLogoUrl = resolveMediaURL(currentShop?.logo_url || currentShop?.address?.logo_url);

  async function signOut() {
    try {
      await logout();
    } catch (error) {
      if (
        error instanceof PendingOfflineChangesError &&
        window.confirm(`${error.message} Sign out and permanently discard those local changes?`)
      ) {
        await logout({ discardPending: true });
      }
    }
  }

  return (
    <div className="app-shell flex min-h-screen bg-canvas text-ink">
      <button
        type="button"
        aria-label="Close navigation"
        className={`mobile-scrim fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden transition-opacity ${
          mobileOpen ? "show opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`sidebar fixed md:sticky top-0 z-40 h-screen w-64 bg-paper border-r border-line flex flex-col shrink-0 transition-transform duration-200 ease-in-out ${
          mobileOpen ? "open translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <button
          type="button"
          className="icon-button sidebar-close absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-ink md:hidden cursor-pointer"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <Icon name="close" />
        </button>
        <div className="p-4 border-b border-line">
          <Link
            href={isMerchant ? "/merchant/dashboard" : "/staff/dashboard"}
            className="brand flex items-center gap-3"
          >
            <span className="brand-mark flex items-center justify-center w-8 h-8 rounded-lg bg-ink text-paper">
              <BrandIcon />
            </span>
            <span className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-ink">Business Central</span>
              <small className="text-[10px] text-muted leading-tight">Merchant workspace</small>
            </span>
          </Link>
        </div>
        <div
          className="shop-switcher p-3 mx-3 my-2 rounded-xl bg-canvas border border-line flex items-center gap-3"
          aria-label="Selected shop"
        >
          {shopLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              className="shop-avatar shop-avatar-image w-9 h-9 rounded-lg object-cover border border-line"
              src={shopLogoUrl}
              alt=""
            />
          ) : (
            <span className="shop-avatar flex items-center justify-center w-9 h-9 rounded-lg bg-paper font-bold text-xs text-ink border border-line">
              {shopInitials}
            </span>
          )}
          <div className="shop-switcher-info min-w-0 flex-1">
            <small className="block text-[10px] text-muted font-semibold uppercase tracking-wider">
              {isMerchant ? "Selected shop" : "Assigned shop"}
            </small>
            <strong className="block text-xs font-bold text-ink truncate">
              {currentShop?.name ??
                (shopsLoading
                  ? "Loading..."
                  : shopsError
                    ? "Shop unavailable"
                    : "No shop selected")}
            </strong>
            {currentShop && (
              <span className="shop-switcher-detail block text-[10px] text-muted truncate">
                {currentShop.business_type_name ||
                  formatShopAddress(currentShop.address) ||
                  currentShop.code}
              </span>
            )}
            {!currentShop && shopsError && (
              <span className="shop-switcher-detail block text-[10px] text-status-danger truncate">
                {shopsError}
              </span>
            )}
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const matches =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
                  const moreSpecificMatch = groups
                    .flatMap((candidateGroup) => candidateGroup.items)
                    .some(
                      (candidate) =>
                        candidate.href !== item.href &&
                        candidate.href.startsWith(`${item.href}/`) &&
                        (pathname === candidate.href || pathname.startsWith(`${candidate.href}/`)),
                    );
                  const active = matches && !moreSpecificMatch;
                  return (
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                        active
                          ? "active bg-canvas text-ink font-semibold"
                          : "text-muted hover:text-ink hover:bg-canvas/60"
                      }`}
                      key={item.href}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon name={item.icon} size={16} />
                        <span>{item.label}</span>
                      </span>
                      {active && <i className="w-1.5 h-1.5 rounded-full bg-ink" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-help p-3 mx-3 my-3 rounded-xl border border-line bg-canvas flex items-center gap-2.5 text-xs text-muted">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-paper font-bold text-[10px] text-ink border border-line">
            ?
          </span>
          <div className="flex-1 min-w-0">
            <strong className="block text-ink text-[11px] truncate">Need a hand?</strong>
            <small className="block text-[10px] text-muted truncate">View the quick guide</small>
          </div>
          <Icon name="arrow" size={14} />
        </div>
      </aside>
      <section className="main-area flex-1 min-w-0 flex flex-col">
        <header className="topbar sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 bg-paper/95 backdrop-blur-xs border-b border-line gap-4">
          <button
            className="icon-button menu-button md:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-canvas cursor-pointer"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div
            className="topbar-context connectivity-context flex items-center gap-2 text-xs text-muted min-w-0"
            role="status"
          >
            <span
              className={`live-dot w-2 h-2 rounded-full shrink-0 ${
                offline.status === "offline"
                  ? "bg-status-danger"
                  : offline.status === "syncing"
                    ? "bg-status-info animate-pulse"
                    : offline.status === "reconnecting"
                      ? "bg-status-warning animate-pulse"
                      : offline.status === "error"
                        ? "bg-status-danger"
                        : "bg-status-success"
              }`}
            />
            <span className="truncate">
              {offline.status === "offline"
                ? "Offline"
                : offline.status === "syncing"
                  ? "Syncing"
                  : offline.status === "reconnecting"
                    ? "Reconnecting"
                    : offline.status === "error"
                      ? "Sync needs attention"
                      : "Online"}
            </span>
            {(offline.pending > 0 || offline.conflicts > 0 || offline.rejected > 0) && (
              <small className="hidden sm:inline-block text-[11px] text-muted">
                {offline.pending > 0 ? `${offline.pending} pending` : ""}
                {offline.conflicts > 0
                  ? `${offline.pending > 0 ? " · " : ""}${offline.conflicts} conflicts`
                  : ""}
                {offline.rejected > 0
                  ? `${offline.pending > 0 || offline.conflicts > 0 ? " · " : ""}${offline.rejected} rejected`
                  : ""}
              </small>
            )}
            {offline.status !== "offline" &&
              (offline.pending > 0 || offline.status === "error") && (
                <button
                  className="sync-now text-[11px] font-semibold text-ink underline hover:opacity-80 cursor-pointer ml-1"
                  onClick={() => void offline.syncNow()}
                  disabled={offline.status === "syncing"}
                >
                  Sync now
                </button>
              )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <SyncStatusPanel />
            <div className="profile-wrap relative">
              <button
                className="profile-button flex items-center gap-2 p-1.5 rounded-xl border border-line hover:bg-canvas transition cursor-pointer text-left"
                onClick={() => setProfileOpen((value) => !value)}
              >
                <span className="avatar flex items-center justify-center w-7 h-7 rounded-lg bg-canvas text-xs font-bold text-ink border border-line">
                  {initials}
                </span>
                <span className="hidden sm:flex flex-col text-left">
                  <strong className="text-xs text-ink font-semibold leading-tight">
                    {user.display_name}
                  </strong>
                  <small className="text-[10px] text-muted leading-tight">{role}</small>
                </span>
                <Icon name="chevron" size={14} />
              </button>
              {profileOpen && (
                <div className="profile-menu absolute right-0 top-full mt-2 w-56 rounded-xl bg-paper border border-line shadow-xl p-2 z-50">
                  <div className="px-3 py-2 border-b border-line mb-1">
                    <strong className="block text-xs font-bold text-ink">
                      {user.display_name}
                    </strong>
                    <small className="block text-[11px] text-muted truncate">{user.email}</small>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-ink hover:bg-canvas transition"
                  >
                    <Icon name="user" size={16} />
                    User profile
                  </Link>
                  <button
                    onClick={() => void signOut()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-status-danger hover:bg-status-danger-soft transition cursor-pointer text-left"
                  >
                    <Icon name="logout" size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </section>
    </div>
  );
}
