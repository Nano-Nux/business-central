"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PendingOfflineChangesError, useAuth } from "@/lib/auth";
import { Icon } from "./icons";
import { BrandIcon } from "./brand-icon";
import { Loading } from "./ui";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { SyncStatusPanel } from "./sync-status-panel";
import { formatShopAddress } from "@/lib/shop-address";
import { resolveMediaURL } from "@/lib/media-url";

import {
  getFilteredNavigationGroups,
  isAiWorkspacePath,
  getLocalizedNavLabel,
  getLocalizedGroupLabel,
} from "@/lib/navigation";
import { getCanonicalWorkspaceHref, getWorkspaceSourcePath } from "@/lib/workspace-routes";
import { useTranslation } from "@/lib/i18n";
import { QuickGuideModal } from "./quick-guide-modal";
import { useResponsiveTables } from "./responsive-tables";

export function AppShell({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLElement>(null);
  const browserPathname = usePathname();
  const router = useRouter();
  const isPos = browserPathname === "/pos" || browserPathname.startsWith("/pos/");
  const isAi = browserPathname === "/ai-assistant" || browserPathname.startsWith("/ai-assistant/");
  const { user, merchant, merchantReady, ready, isMerchant, can, logout } = useAuth();
  const nano = merchant?.pos_complexity_level === "NANO";
  const pathname = getWorkspaceSourcePath(browserPathname, merchant?.pos_complexity_level);
  const aiPageDisabled = isAiWorkspacePath(pathname) && merchant?.ai_assistant_enabled !== true;
  useResponsiveTables(contentRef, Boolean(ready && user && merchantReady && merchant));
  const { t, language } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
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
    const merchantOnly = [
      "/accounts",
      ...(nano ? ["/products"] : ["/catalog"]),
      "/reports",
      "/promotions",
      "/settings/payment-types",
      "/settings/merchant",
      "/settings/application",
      "/settings/tax-notes",
      "/settings/repair-specs",
      "/settings/staff",
    ];
    if (
      ready &&
      merchantReady &&
      user &&
      !isMerchant &&
      merchantOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    ) {
      if (pathname.startsWith("/settings")) {
        router.replace("/settings");
      } else {
        router.replace(
          can("tenant.write") ? "/pos" : can("tenant.read") ? "/transaction-history" : "/settings",
        );
      }
    }
  }, [ready, merchantReady, user, isMerchant, pathname, router, nano, can]);

  useEffect(() => {
    if (!ready || !user || !merchantReady || !merchant || !aiPageDisabled) return;
    router.replace(
      can("tenant.write") ? "/pos" : can("tenant.read") ? "/transaction-history" : "/settings",
    );
  }, [ready, user, merchantReady, merchant, aiPageDisabled, router, can]);

  useEffect(() => {
    if (!ready || !user || !nano) return;
    if (["/guide"].some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      router.replace(can("tenant.write") ? "/pos" : "/products-and-storage");
    } else if (["/products", "/storage", "/stock-in"].includes(pathname)) {
      router.replace("/products-and-storage");
    }
  }, [ready, user, nano, pathname, router, can]);

  useEffect(() => {
    if (
      ready &&
      user &&
      currentShop &&
      !currentShop.module_codes?.includes("repair") &&
      (pathname === "/repairs" || pathname.startsWith("/repairs/"))
    ) {
      router.replace(
        isMerchant && can("tenant.read")
          ? "/reports"
          : can("tenant.write")
            ? "/pos"
            : can("tenant.read")
              ? "/transaction-history"
              : "/settings",
      );
    }
  }, [ready, user, currentShop, pathname, router, isMerchant, can]);

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

  useEffect(() => {
    if (!ready || !user || !merchantReady || !merchant || shopsLoading || !currentShop) return;
    const canonical = getCanonicalWorkspaceHref(browserPathname, merchant.pos_complexity_level);
    if (canonical !== browserPathname) {
      router.replace(canonical + window.location.search + window.location.hash);
    }
  }, [ready, user, merchantReady, merchant, shopsLoading, currentShop, browserPathname, router]);

  const groups = useMemo(
    () =>
      getFilteredNavigationGroups({
        posComplexityLevel: merchant?.pos_complexity_level,
        isMerchant,
        can,
        moduleCodes: currentShop?.module_codes,
        aiAssistantEnabled: merchant?.ai_assistant_enabled,
      }),
    [
      can,
      isMerchant,
      currentShop?.module_codes,
      merchant?.pos_complexity_level,
      merchant?.ai_assistant_enabled,
    ],
  );
  if (
    !ready ||
    !user ||
    !merchantReady ||
    (merchant && aiPageDisabled) ||
    (merchant &&
      currentShop &&
      getCanonicalWorkspaceHref(browserPathname, merchant.pos_complexity_level) !== browserPathname)
  )
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
  const role = isMerchant ? t("nav.merchant_role", "Merchant") : t("nav.staff_role", "Staff");
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
        aria-label={t("nav.close_menu", "Close navigation")}
        className={`mobile-scrim ${mobileOpen ? "show" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <button
          type="button"
          className="icon-button sidebar-close"
          aria-label={t("nav.close_menu", "Close menu")}
          onClick={() => setMobileOpen(false)}
        >
          <Icon name="close" />
        </button>
        <Link
          href={
            nano
              ? "/pos"
              : isMerchant && can("tenant.read")
                ? "/reports"
                : can("tenant.write")
                  ? "/pos"
                  : can("tenant.read")
                    ? "/transaction-history"
                    : "/settings"
          }
          className="brand"
        >
          <span className="brand-mark">
            <BrandIcon />
          </span>
          <span>
            {t("nav.brand_title", "Business Central")}
            <small>{t("nav.brand_subtitle", "Merchant workspace")}</small>
          </span>
        </Link>
        <div className="shop-switcher" aria-label={t("nav.selected_shop", "Selected shop")}>
          {shopLogoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="shop-avatar shop-avatar-image" src={shopLogoUrl} alt="" />
          ) : (
            <span className="shop-avatar">{shopInitials}</span>
          )}
          <div className="shop-switcher-info">
            <small>
              {isMerchant
                ? t("nav.selected_shop", "Selected shop")
                : t("nav.assigned_shop", "Assigned shop")}
            </small>
            <strong>
              {currentShop?.name ??
                (shopsLoading
                  ? t("nav.loading_shop", "Loading...")
                  : shopsError
                    ? t("nav.shop_unavailable", "Shop unavailable")
                    : t("nav.no_shop_selected", "No shop selected"))}
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
              <p>{getLocalizedGroupLabel(group.label, t)}</p>
              {group.items.map((item) => {
                const itemPath = getWorkspaceSourcePath(item.href, merchant?.pos_complexity_level);
                const matches =
                  (itemPath === "/customers" && pathname === "/deliveries") ||
                  (itemPath === "/history" &&
                    (pathname.startsWith("/stock-movements") ||
                      pathname.startsWith("/transaction-history"))) ||
                  (merchant?.pos_complexity_level === "MINI" &&
                    itemPath === "/catalog" &&
                    ["/categories", "/brands", "/stock-conversions", "/stock-assets"].includes(
                      pathname,
                    )) ||
                  pathname === itemPath ||
                  (itemPath !== "/dashboard" && pathname.startsWith(`${itemPath}/`));
                const moreSpecificMatch = groups
                  .flatMap((candidateGroup) => candidateGroup.items)
                  .some((candidate) => {
                    const candidatePath = getWorkspaceSourcePath(
                      candidate.href,
                      merchant?.pos_complexity_level,
                    );
                    return (
                      candidatePath !== itemPath &&
                      candidatePath.startsWith(`${itemPath}/`) &&
                      (pathname === candidatePath || pathname.startsWith(`${candidatePath}/`))
                    );
                  });
                const active = matches && !moreSpecificMatch;
                const localizedLabel = getLocalizedNavLabel(item.href, item.label, t);
                return (
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={active ? "active" : ""}
                    key={item.href}
                  >
                    <Icon name={item.icon} />
                    <span>{localizedLabel}</span>
                    {active && <i />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {!nano && (
          <Link href="/guide" className="sidebar-help" onClick={() => setMobileOpen(false)}>
            <span>?</span>
            <div>
              <strong>{t("nav.need_help", "Need a hand?")}</strong>
              <small>{t("nav.view_quick_guide", "View the quick guide")}</small>
            </div>
            <Icon name="arrow" size={16} />
          </Link>
        )}
      </aside>
      <QuickGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
      <section
        className={`main-area ${isPos ? "main-area-pos" : ""} ${isAi ? "main-area-ai" : ""}`}
      >
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setMobileOpen(true)}
            aria-label={t("nav.open_menu", "Open menu")}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context connectivity-context" role="status">
            <span className={`live-dot connectivity-${offline.status}`} />
            <span>
              {offline.status === "offline"
                ? t("nav.offline", "Offline")
                : offline.status === "syncing"
                  ? t("nav.syncing", "Syncing")
                  : offline.status === "reconnecting"
                    ? t("nav.reconnecting", "Reconnecting")
                    : offline.status === "error"
                      ? t("nav.sync_needs_attention", "Sync needs attention")
                      : t("nav.online", "Online")}
            </span>
            {(offline.pending > 0 || offline.conflicts > 0 || offline.rejected > 0) && (
              <small>
                {offline.pending > 0 ? t("nav.pending_count", { count: offline.pending }) : ""}
                {offline.conflicts > 0
                  ? `${offline.pending > 0 ? " · " : ""}${t("nav.conflicts_count", { count: offline.conflicts })}`
                  : ""}
                {offline.rejected > 0
                  ? `${offline.pending > 0 || offline.conflicts > 0 ? " · " : ""}${t("nav.rejected_count", { count: offline.rejected })}`
                  : ""}
              </small>
            )}
            {offline.status === "offline" &&
              offline.pending === 0 &&
              offline.conflicts === 0 &&
              offline.rejected === 0 &&
              (offline.lastSyncAt || shopsCachedAt) && (
                <small>
                  {t("nav.saved_at", {
                    time: new Intl.DateTimeFormat(
                      language === "en" ? "en" : language === "th" ? "th" : "my",
                      {
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    ).format(new Date(offline.lastSyncAt ?? shopsCachedAt!)),
                  })}
                </small>
              )}
            {offline.staleResources.length > 0 && (
              <small>
                {new Intl.DateTimeFormat(
                  language === "en" ? "en" : language === "th" ? "th" : "my",
                  {
                    hour: "numeric",
                    minute: "2-digit",
                  },
                ).format(
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
                  {t("nav.sync_now", "Sync now")}
                </button>
              )}
          </div>
          <SyncStatusPanel />
          <Link
            href="/settings/language"
            className="topbar-lang-button"
            title={t("settings.language.title", "Language setting")}
            aria-label={t("settings.language.title", "Language setting")}
          >
            <Icon name="globe" size={14} />
            <span>{language === "my" ? "MM" : language.toUpperCase()}</span>
          </Link>
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
                  {t("nav.user_profile", "User profile")}
                </Link>
                <Link href="/settings/language" onClick={() => setProfileOpen(false)}>
                  <Icon name="globe" size={17} />
                  {t("settings.language.title", "Language setting")}
                </Link>
                <button onClick={() => void signOut()}>
                  <Icon name="logout" size={17} />
                  {t("nav.sign_out", "Sign out")}
                </button>
              </div>
            )}
          </div>
        </header>
        <main
          ref={contentRef}
          className={`content ${isPos ? "content-pos" : ""} ${isAi ? "content-ai" : ""}`}
        >
          {children}
        </main>
      </section>
    </div>
  );
}
