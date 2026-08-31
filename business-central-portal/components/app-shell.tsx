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
    <div className="app-shell">
      <button
        type="button"
        aria-label="Close navigation"
        className={`mobile-scrim ${mobileOpen ? "show" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <button
          type="button"
          className="icon-button sidebar-close"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        >
          <Icon name="close" />
        </button>
        <Link href={isMerchant ? "/merchant/dashboard" : "/staff/dashboard"} className="brand">
          <span className="brand-mark">
            <BrandIcon />
          </span>
          <span>
            Business Central<small>Merchant workspace</small>
          </span>
        </Link>
        <div className="shop-switcher" aria-label="Selected shop">
          {shopLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="shop-avatar shop-avatar-image" src={shopLogoUrl} alt="" />
          ) : (
            <span className="shop-avatar">{shopInitials}</span>
          )}
          <div className="shop-switcher-info">
            <small>{isMerchant ? "Selected shop" : "Assigned shop"}</small>
            <strong>
              {currentShop?.name ??
                (shopsLoading
                  ? "Loading..."
                  : shopsError
                    ? "Shop unavailable"
                    : "No shop selected")}
            </strong>
            {currentShop && (
              <span className="shop-switcher-detail">
                {currentShop.business_type_name ||
                  formatShopAddress(currentShop.address) ||
                  currentShop.code}
              </span>
            )}
            {!currentShop && shopsError && (
              <span className="shop-switcher-detail">{shopsError}</span>
            )}
          </div>
        </div>
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
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
                    className={active ? "active" : ""}
                    key={item.href}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {active && <i />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-help">
          <span>?</span>
          <div>
            <strong>Need a hand?</strong>
            <small>View the quick guide</small>
          </div>
          <Icon name="arrow" size={16} />
        </div>
      </aside>
      <section className="main-area">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context connectivity-context" role="status">
            <span className={`live-dot connectivity-${offline.status}`} />
            <span>
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
              <small>
                {offline.pending > 0 ? `${offline.pending} pending` : ""}
                {offline.conflicts > 0
                  ? `${offline.pending > 0 ? " · " : ""}${offline.conflicts} conflicts`
                  : ""}
                {offline.rejected > 0
                  ? `${offline.pending > 0 || offline.conflicts > 0 ? " · " : ""}${offline.rejected} rejected`
                  : ""}
              </small>
            )}
            {offline.status === "offline" &&
              offline.pending === 0 &&
              offline.conflicts === 0 &&
              offline.rejected === 0 &&
              (offline.lastSyncAt || shopsCachedAt) && (
                <small>
                  Saved{" "}
                  {new Intl.DateTimeFormat("en", {
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(offline.lastSyncAt ?? shopsCachedAt!))}
                </small>
              )}
            {offline.staleResources.length > 0 && (
              <small>
                Showing saved data from{" "}
                {new Intl.DateTimeFormat("en", {
                  hour: "numeric",
                  minute: "2-digit",
                }).format(
                  new Date(offline.staleResources.map((resource) => resource.cachedAt).sort()[0]),
                )}
              </small>
            )}
            {offline.status !== "offline" &&
              (offline.pending > 0 || offline.status === "error") && (
                <button
                  className="sync-now"
                  onClick={() => void offline.syncNow()}
                  disabled={offline.status === "syncing"}
                >
                  Sync now
                </button>
              )}
          </div>
          <SyncStatusPanel />
          <div className="profile-wrap">
            <button className="profile-button" onClick={() => setProfileOpen((value) => !value)}>
              <span className="avatar">{initials}</span>
              <span>
                <strong>{user.display_name}</strong>
                <small>{role}</small>
              </span>
              <Icon name="chevron" size={15} />
            </button>
            {profileOpen && (
              <div className="profile-menu">
                <div>
                  <strong>{user.display_name}</strong>
                  <small>{user.email}</small>
                </div>
                <Link href="/profile" onClick={() => setProfileOpen(false)}>
                  <Icon name="user" size={17} />
                  User profile
                </Link>
                <button onClick={() => void signOut()}>
                  <Icon name="logout" size={17} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </section>
    </div>
  );
}
