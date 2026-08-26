"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { list, NetworkUnavailableError } from "./api";
import { useAuth } from "./auth";
import type { Shop } from "./types";
import {
  getCachedEntities,
  getCachedResource,
  putCachedResource,
  type OfflineScope,
} from "./offline-db";

type ShopValue = {
  shops: Shop[];
  currentShop: Shop | null;
  loading: boolean;
  error: string;
  cachedAt: string | null;
  selectShop: (shopId: string) => void;
};

const ShopContext = createContext<ShopValue | null>(null);
const SHOP_KEY = "bc.current-shop";

function preferredShopId(shops: Shop[], assignedId: string | null | undefined) {
  const stored = typeof window === "undefined" ? "" : (localStorage.getItem(SHOP_KEY) ?? "");
  const allowed = new Set(shops.map((shop) => shop.id));
  if (assignedId && allowed.has(assignedId)) return assignedId;
  if (stored && allowed.has(stored)) return stored;
  return shops[0]?.id ?? "";
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadedFor, setLoadedFor] = useState("");
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const scope = useMemo<OfflineScope | null>(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );
  const path = "/shops?page_index=0&page_size=100";

  const normalize = useCallback(
    (items: Shop[]) =>
      items.map((shop) => ({
        ...shop,
        logo_url: shop.logo_url ?? shop.address?.logo_url,
        show_logo_in_printed_invoice:
          shop.show_logo_in_printed_invoice ??
          shop.address?.show_logo_in_printed_invoice !== "false",
        show_device_completion_status:
          shop.show_device_completion_status ??
          shop.address?.show_device_completion_status === "true",
        show_device_type_in_repair_invoice:
          shop.show_device_type_in_repair_invoice ??
          shop.address?.show_device_type_in_repair_invoice === "true",
        show_device_brand_in_repair_invoice:
          shop.show_device_brand_in_repair_invoice ??
          shop.address?.show_device_brand_in_repair_invoice === "true",
        contact_info: shop.contact_info ?? shop.address?.contact_info,
        footer_note: shop.footer_note ?? shop.address?.footer_note,
      })),
    [],
  );

  const loadCached = useCallback(async () => {
    if (!scope) return null;
    const [resource, settings] = await Promise.all([
      getCachedResource<Shop[]>(scope, path),
      getCachedEntities<Partial<Shop>>(scope, "SHOP_SETTINGS"),
    ]);
    if (!resource) return null;
    const overrides = new Map(settings.map((entry) => [entry.entityId, entry.payload]));
    return {
      shops: normalize(
        resource.data.map((shop) => ({
          ...shop,
          ...(overrides.get(shop.id) ?? {}),
        })),
      ),
      cachedAt: resource.cachedAt,
    };
  }, [normalize, scope]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    list<Shop>(path)
      .then((items) => {
        if (!active) return;
        setError("");
        setCachedAt(null);
        setShops(normalize(items));
        if (scope) void putCachedResource(scope, path, items);
        const next = preferredShopId(items, user.shop_id);
        setSelectedId(next);
        setLoadedFor(`${user.merchant_id}:${user.membership_id}`);
        if (next) localStorage.setItem(SHOP_KEY, next);
      })
      .catch(async (reason) => {
        if (active) {
          const cached =
            reason instanceof NetworkUnavailableError ? await loadCached().catch(() => null) : null;
          if (cached) {
            setShops(cached.shops);
            setCachedAt(cached.cachedAt);
            setError("");
            const next = preferredShopId(cached.shops, user.shop_id);
            setSelectedId(next);
            if (next) localStorage.setItem(SHOP_KEY, next);
          } else {
            setError(reason instanceof Error ? reason.message : "Unable to load shops.");
          }
          setLoadedFor(`${user.merchant_id}:${user.membership_id}`);
        }
      });
    return () => {
      active = false;
    };
  }, [loadCached, normalize, scope, user]);

  useEffect(() => {
    const refreshCached = () => {
      void loadCached().then((cached) => {
        if (!cached) return;
        setShops(cached.shops);
        setCachedAt(cached.cachedAt);
      });
    };
    window.addEventListener("bc-offline-data-changed", refreshCached);
    return () => window.removeEventListener("bc-offline-data-changed", refreshCached);
  }, [loadCached]);

  const selectShop = useCallback(
    (shopId: string) => {
      if (!shops.some((shop) => shop.id === shopId)) return;
      setSelectedId(shopId);
      localStorage.setItem(SHOP_KEY, shopId);
    },
    [shops],
  );
  const loading = Boolean(user) && loadedFor !== `${user?.merchant_id}:${user?.membership_id}`;
  const value = useMemo(() => {
    const visibleShops = user ? shops : [];
    return {
      shops: visibleShops,
      currentShop: visibleShops.find((shop) => shop.id === selectedId) ?? null,
      loading,
      error,
      cachedAt,
      selectShop,
    };
  }, [user, shops, selectedId, loading, error, cachedAt, selectShop]);
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside ShopProvider");
  return value;
}
