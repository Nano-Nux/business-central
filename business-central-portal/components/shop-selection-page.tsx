"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { formatShopAddress } from "@/lib/shop-address";
import { resolveMediaURL } from "@/lib/media-url";
import { Icon } from "./icons";
import { BrandIcon } from "./brand-icon";
import { Loading } from "./ui";
import { getCanonicalWorkspaceHref } from "@/lib/workspace-routes";
import { getFilteredNavigationGroups, isAiWorkspacePath } from "@/lib/navigation";

export function ShopSelectionPage() {
  const router = useRouter();
  const { user, ready, isMerchant, logout, merchant, can } = useAuth();
  const { shops, currentShop, loading, error, selectShop } = useShop();
  const dashboard =
    isMerchant && can("tenant.read")
      ? "/reports"
      : can("tenant.write")
        ? "/pos"
        : can("tenant.read")
          ? "/transaction-history"
          : "/settings";

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, router, user]);

  function choose(shopId: string) {
    selectShop(shopId);
    const chosen = shops.find((s) => s.id === shopId);
    const savedLanding = chosen?.default_view || chosen?.address?.default_view;
    const landing = savedLanding
      ? getCanonicalWorkspaceHref(savedLanding, merchant?.pos_complexity_level)
      : undefined;
    if (landing && ["/dashboard", "/merchant/dashboard", "/staff/dashboard"].includes(landing)) {
      router.replace(dashboard);
      return;
    }
    if (merchant?.pos_complexity_level === "NANO") {
      const pages = getFilteredNavigationGroups({
        posComplexityLevel: "NANO",
        isMerchant,
        can,
        moduleCodes: chosen?.module_codes,
        aiAssistantEnabled: merchant?.ai_assistant_enabled,
      }).flatMap((group) => group.items);
      router.replace(
        pages.some((page) => page.href === landing) ? landing! : pages[0]?.href || "/settings",
      );
      return;
    }
    if (landing && isAiWorkspacePath(landing) && merchant?.ai_assistant_enabled !== true) {
      router.replace(dashboard);
      return;
    }
    router.replace(landing && landing.startsWith("/") ? landing : dashboard);
  }

  if (!ready || !user || loading) {
    return (
      <main className="screen-center">
        <Loading />
      </main>
    );
  }

  return (
    <main className="shop-selection-page">
      <header className="shop-selection-header">
        <div className="brand-mark">
          <BrandIcon />
        </div>
        <div>
          <p className="eyebrow">Business Central</p>
          <h1>Select a shop</h1>
          <p>Choose the shop you want to manage today.</p>
        </div>
        <button type="button" className="button secondary" onClick={() => void logout()}>
          Sign out
        </button>
      </header>
      {error && <div className="form-error">{error}</div>}
      {shops.length === 0 ? (
        <section className="card shop-selection-empty">
          <Icon name="store" size={28} />
          <h2>No shop is available</h2>
          <p>Ask a merchant owner to assign you to an active shop.</p>
        </section>
      ) : (
        <section className="shop-selection-grid" aria-label="Available shops">
          {shops.map((shop) => {
            const address = formatShopAddress(shop.address);
            const logoUrl = resolveMediaURL(shop.logo_url || shop.address?.logo_url);
            return (
              <button
                type="button"
                className={`card shop-selection-card${currentShop?.id === shop.id ? " selected" : ""}`}
                key={shop.id}
                onClick={() => choose(shop.id)}
              >
                <span className="shop-selection-icon">
                  {logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img className="shop-selection-logo" src={logoUrl} alt="" />
                  ) : (
                    <Icon name="store" size={24} />
                  )}
                </span>
                <span className="shop-selection-content">
                  <strong>{shop.name}</strong>
                  <small>
                    {shop.code}
                    {shop.business_type_name ? ` · ${shop.business_type_name}` : ""}
                  </small>
                  {address && <span>{address}</span>}
                  {shop.contact_info && <span>{shop.contact_info}</span>}
                  {shop.module_codes.length > 0 && (
                    <small>{shop.module_codes.length} enabled modules</small>
                  )}
                </span>
                <Icon name="arrow" size={18} />
              </button>
            );
          })}
        </section>
      )}
    </main>
  );
}
