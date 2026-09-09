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

export function ShopSelectionPage() {
  const router = useRouter();
  const { user, ready, isMerchant, logout } = useAuth();
  const { shops, currentShop, loading, error, selectShop } = useShop();
  const dashboard = isMerchant ? "/merchant/dashboard" : "/staff/dashboard";

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, router, user]);

  function choose(shopId: string) {
    selectShop(shopId);
    const chosen = shops.find((s) => s.id === shopId);
    const landing = chosen?.default_view || chosen?.address?.default_view;
    router.replace(landing && landing.startsWith("/") ? landing : dashboard);
  }

  if (!ready || !user || loading) {
    return (
      <main className="screen-center min-h-screen grid place-items-center bg-canvas">
        <Loading />
      </main>
    );
  }

  return (
    <main className="shop-selection-page max-w-4xl mx-auto p-6 sm:p-10">
      <header className="shop-selection-header flex items-center justify-between gap-4 pb-6 mb-8 border-b border-line">
        <div className="flex items-center gap-4">
          <div className="brand-mark flex items-center justify-center w-10 h-10 rounded-xl bg-ink text-paper">
            <BrandIcon />
          </div>
          <div>
            <p className="eyebrow text-[10px] font-bold uppercase tracking-wider text-muted mb-0.5">
              Business Central
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-ink m-0">Select a shop</h1>
            <p className="text-xs text-muted m-0">Choose the shop you want to manage today.</p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary px-3.5 py-2 rounded-lg border border-line bg-paper text-ink text-xs font-semibold hover:bg-canvas transition cursor-pointer"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </header>
      {error && (
        <div className="form-error flex items-center gap-2 p-3 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger border border-status-danger-border mb-6">
          <Icon name="close" size={16} />
          {error}
        </div>
      )}
      {shops.length === 0 ? (
        <section className="card shop-selection-empty p-10 text-center rounded-2xl border border-dashed border-line bg-paper">
          <Icon name="store" size={28} />
          <h2 className="text-lg font-bold text-ink mt-3 mb-1">No shop is available</h2>
          <p className="text-xs text-muted">
            Ask a merchant owner to assign you to an active shop.
          </p>
        </section>
      ) : (
        <section
          className="shop-selection-grid grid grid-cols-1 sm:grid-cols-2 gap-4"
          aria-label="Available shops"
        >
          {shops.map((shop) => {
            const address = formatShopAddress(shop.address);
            const logoUrl = resolveMediaURL(shop.logo_url || shop.address?.logo_url);
            return (
              <button
                type="button"
                className={`card shop-selection-card flex items-center gap-4 p-5 rounded-2xl border bg-paper text-left hover:border-ink/40 transition cursor-pointer ${
                  currentShop?.id === shop.id
                    ? " selected border-ink ring-2 ring-ink/10"
                    : "border-line"
                }`}
                key={shop.id}
                onClick={() => choose(shop.id)}
              >
                <span className="shop-selection-icon flex items-center justify-center w-12 h-12 rounded-xl bg-canvas text-ink shrink-0 border border-line">
                  {logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className="shop-selection-logo w-full h-full object-cover rounded-xl"
                      src={logoUrl}
                      alt=""
                    />
                  ) : (
                    <Icon name="store" size={24} />
                  )}
                </span>
                <span className="shop-selection-content flex-1 min-w-0">
                  <strong className="block text-sm font-bold text-ink truncate">{shop.name}</strong>
                  <small className="block text-xs text-muted truncate">
                    {shop.code}
                    {shop.business_type_name ? ` · ${shop.business_type_name}` : ""}
                  </small>
                  {address && (
                    <span className="block text-[11px] text-muted truncate mt-0.5">{address}</span>
                  )}
                  {shop.contact_info && (
                    <span className="block text-[11px] text-muted truncate">
                      {shop.contact_info}
                    </span>
                  )}
                  {shop.module_codes.length > 0 && (
                    <small className="inline-block px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold bg-canvas text-muted border border-line">
                      {shop.module_codes.length} enabled modules
                    </small>
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
