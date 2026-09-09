"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  ListControls,
  Modal,
  PageHeader,
  Pagination,
  PasswordInput,
  StatusBadge,
  useListPagination,
} from "./ui";
import { patch, post, remove } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { queueStockReceipt, type StockReceiptMutation } from "@/lib/offline-stock";
import { currencyLabel, formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import type {
  Location,
  Movement,
  PriceList,
  ProductPrice,
  Shop,
  User,
  Variant,
  StockAsset,
  Unit,
} from "@/lib/types";
import { BarcodeScanner } from "./barcode-scanner";

type StockItem = {
  id: string;
  product_id: string;
  product_name: string;
  name: string;
  sku: string;
  barcode?: string;
  base_unit_id: string;
  quantity_on_hand: string;
  is_stock_tracked: boolean;
};

export function StockAssetsPage() {
  const assets = useResource<StockAsset>("/inventory/assets?page_index=0&page_size=500");
  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [assetSort, setAssetSort] = useState("PRODUCT_ASC");
  const [barcode, setBarcode] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = assets.data.find((asset) => asset.id === selectedId);
  const visible = useMemo(
    () =>
      assets.data
        .filter((asset) =>
          `${asset.product_name} ${asset.variant_name} ${asset.sku} ${asset.asset_tag} ${asset.barcode ?? ""} ${asset.status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .filter(
          (asset) =>
            assetFilter === "ALL" ||
            (assetFilter === "WITH_BARCODE" ? !!asset.barcode : !asset.barcode),
        )
        .sort((a, b) =>
          assetSort === "PRODUCT_DESC"
            ? b.product_name.localeCompare(a.product_name)
            : assetSort === "ASSET_TAG"
              ? a.asset_tag.localeCompare(b.asset_tag)
              : assetSort === "STATUS"
                ? a.status.localeCompare(b.status)
                : a.product_name.localeCompare(b.product_name),
        ),
    [assetFilter, assetSort, assets.data, query],
  );
  const assetPagination = useListPagination(visible, 10, `${query}|${assetFilter}|${assetSort}`);

  async function assign(value = barcode) {
    if (!selected || !value.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await post("/catalog/barcodes", {
        code: value.trim(),
        target_type: "ASSET",
        target_id: selected.id,
        is_primary: true,
      });
      setBarcode("");
      setMessage("Stock barcode assigned.");
      await assets.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign barcode.");
    } finally {
      setBusy(false);
    }
  }

  async function clearBarcode() {
    if (!selected?.barcode_id) return;
    setBusy(true);
    setError("");
    try {
      await remove(`/catalog/barcodes/${selected.barcode_id}`);
      setMessage("Stock barcode removed.");
      await assets.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove barcode.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock barcodes"
        description="Assign a unique barcode to each serialized stock asset. Scanned stock assets can go directly into the POS cart."
      />
      {message && <div className="success-message">{message}</div>}
      {error && <div className="form-error">{error}</div>}
      <div className="stock-assets-layout">
        <section className="card">
          <div className="toolbar">
            <div className="search-box">
              <Icon name="search" size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, SKU, asset tag, or barcode"
                aria-label="Search stock assets"
              />
            </div>
            <select
              className="filter-select"
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              aria-label="Filter stock assets"
            >
              <option value="ALL">All assets</option>
              <option value="WITH_BARCODE">With barcode</option>
              <option value="WITHOUT_BARCODE">Missing barcode</option>
            </select>
            <select
              className="filter-select"
              value={assetSort}
              onChange={(event) => setAssetSort(event.target.value)}
              aria-label="Sort stock assets"
            >
              <option value="PRODUCT_ASC">Product A–Z</option>
              <option value="PRODUCT_DESC">Product Z–A</option>
              <option value="ASSET_TAG">Asset tag</option>
              <option value="STATUS">Status</option>
            </select>
          </div>
          {assets.loading ? (
            <Loading />
          ) : assets.error ? (
            <EmptyState title="Stock assets could not load" message={assets.error} />
          ) : visible.length === 0 ? (
            <EmptyState
              title="No stock assets found"
              message="Serialized stock assets appear here when they are registered in inventory."
            />
          ) : (
            <div className="stock-asset-list">
              {assetPagination.pageItems.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  className={`stock-product-row${asset.id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span className="stock-product-icon">
                    <Icon name="package" size={18} />
                  </span>
                  <span className="stock-product-name">
                    <strong>{asset.product_name}</strong>
                    <small>
                      {asset.variant_name} · {asset.asset_tag}
                    </small>
                  </span>
                  <span className="stock-product-balance">
                    <small>{asset.barcode ? "Barcode" : "No barcode"}</small>
                    {asset.barcode ? (
                      <strong>{asset.barcode}</strong>
                    ) : (
                      <StatusBadge status={asset.status} />
                    )}
                  </span>
                  <Icon name={asset.id === selectedId ? "check" : "chevron"} size={16} />
                </button>
              ))}
            </div>
          )}
          <Pagination
            pageIndex={assetPagination.pageIndex}
            pageSize={assetPagination.pageSize}
            totalItems={assetPagination.totalItems}
            totalPages={assetPagination.totalPages}
            itemLabel="stock assets"
            onPageChange={assetPagination.setPageIndex}
          />
        </section>
        <section className="card stock-asset-editor">
          <div className="card-head">
            <div>
              <h2>Assign stock barcode</h2>
              <p>Use manual text, Camera image capture, or the live barcode scanner.</p>
            </div>
          </div>
          {!selected ? (
            <EmptyState
              title="Select a stock asset"
              message="Choose an asset from the list to manage its barcode."
            />
          ) : (
            <>
              <div className="receipt-selection">
                <div>
                  <small>Product</small>
                  <strong>{selected.product_name}</strong>
                </div>
                <div>
                  <small>Asset tag</small>
                  <strong>{selected.asset_tag}</strong>
                </div>
                <div>
                  <small>Status</small>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <BarcodeScanner
                value={barcode}
                onChange={setBarcode}
                onScan={(value) => {
                  setBarcode(value);
                  void assign(value);
                }}
                placeholder="Enter stock barcode"
              />
              <div className="modal-actions">
                <Button
                  type="button"
                  onClick={() => void assign()}
                  disabled={busy || !barcode.trim()}
                >
                  {busy ? "Saving…" : "Assign barcode"}
                </Button>
                {selected.barcode_id && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void clearBarcode()}
                    disabled={busy}
                  >
                    Remove barcode
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function CurrentPriceList({ list, variantId }: { list: PriceList; variantId: string }) {
  const prices = useResource<ProductPrice>(
    `/pricing/price-lists/${list.id}/prices?page_index=0&page_size=500`,
  );
  const [currentTimestamp] = useState(() => Date.now());
  const currentPrices = useMemo(() => {
    const latest = new Map<string, ProductPrice>();
    for (const price of prices.data) {
      const validFrom = Date.parse(price.valid_from);
      const validUntil = price.valid_until
        ? Date.parse(price.valid_until)
        : Number.POSITIVE_INFINITY;
      if (
        !Number.isFinite(validFrom) ||
        validFrom > currentTimestamp ||
        validUntil <= currentTimestamp
      ) {
        continue;
      }
      const previous = latest.get(price.variant_id);
      if (!previous || Date.parse(previous.valid_from) < validFrom) {
        latest.set(price.variant_id, price);
      }
    }
    return latest;
  }, [currentTimestamp, prices.data]);
  const selectedPrice = currentPrices.get(variantId);

  return (
    <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-surface border border-line/60 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-ink truncate">{list.code}</span>
        {list.is_default && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-muted border border-line font-medium">
            Default
          </span>
        )}
      </div>
      <strong className="font-mono text-ink shrink-0 ml-2">
        {prices.loading
          ? "…"
          : selectedPrice
            ? formatMoney(selectedPrice.amount, list.currency_code)
            : "Not set"}
      </strong>
    </div>
  );
}

function CurrentPriceLists({
  lists,
  loading,
  error,
  variantId,
  quantityOnHand,
  unitLabel,
}: {
  lists: PriceList[];
  loading: boolean;
  error: string;
  variantId: string;
  quantityOnHand: string;
  unitLabel?: string;
}) {
  return (
    <div className="stock-price-lists mt-3 rounded-xl border border-line bg-surface-muted/50 p-3 space-y-2">
      <div className="stock-price-lists-head flex items-center justify-between text-[11px] font-semibold text-muted pb-1.5 border-b border-line">
        <span className="flex items-center gap-1.5">
          <Icon name="tag" size={13} className="text-muted" />
          <span>Active Selling Prices</span>
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-line">
          {formatQuantity(quantityOnHand)}
          {unitLabel ? ` ${unitLabel}` : ""} in stock
        </span>
      </div>
      {loading ? (
        <span className="stock-price-list-empty block text-xs text-muted py-2 text-center">
          Loading price lists…
        </span>
      ) : error ? (
        <span className="stock-price-list-empty block text-xs text-status-danger py-2 text-center">
          Price lists unavailable.
        </span>
      ) : lists.length === 0 ? (
        <span className="stock-price-list-empty block text-xs text-muted py-2 text-center">
          No price lists configured.
        </span>
      ) : (
        <div className="space-y-1.5">
          {lists.map((list) => (
            <CurrentPriceList key={list.id} list={list} variantId={variantId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StockInPage() {
  const { merchant, isMerchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const { currentShop } = useShop();
  const offline = useOffline();

  const [pageIndex, setPageIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
  const [mobileStep, setMobileStep] = useState<"select" | "form">("select");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchTerm.trim());
      setPageIndex(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const pageSize = 10;
  const catalogPath = useMemo(() => {
    const params = new URLSearchParams({
      page_index: String(pageIndex),
      page_size: String(pageSize),
      filter: "is_stock_tracked:true",
    });
    if (debouncedQuery) params.set("query", debouncedQuery);
    if (currentShop) params.set("shop_id", currentShop.id);
    return `/pos/catalog?${params.toString()}`;
  }, [currentShop, debouncedQuery, pageIndex, pageSize]);

  const catalogCacheKey = `pos-catalog:stock-in:${currentShop?.id ?? "all"}:${debouncedQuery}:${pageIndex}`;
  const items = useResource<StockItem>(catalogPath, catalogCacheKey);
  const units = useResource<Unit>("/units?page_index=0&page_size=100");
  const priceLists = useResource<PriceList>(
    isMerchant ? "/pricing/price-lists?page_index=0&page_size=100" : "",
  );
  const locations = useResource<Location>("/inventory/locations?page_index=0&page_size=200");

  const unitMap = useMemo(() => {
    const map = new Map<string, Unit>();
    for (const unit of units.data) {
      map.set(unit.id, unit);
    }
    return map;
  }, [units.data]);

  const selectedUnit = selectedProduct ? unitMap.get(selectedProduct.base_unit_id) : undefined;
  const selectedUnitLabel = selectedUnit?.symbol || selectedUnit?.code || "";
  const allowsDecimal = selectedUnit ? selectedUnit.allows_decimal : true;

  const shopLocations = useMemo(
    () =>
      locations.data.filter(
        (location) => location.is_active && (!currentShop || location.shop_id === currentShop.id),
      ),
    [currentShop, locations.data],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(formElement);
    const rawQuantity = String(form.get("quantity") ?? "").trim();
    const qtyNumber = Number(rawQuantity);

    if (!rawQuantity || isNaN(qtyNumber) || qtyNumber <= 0) {
      setError("Please enter a valid positive quantity.");
      setBusy(false);
      return;
    }

    if (!allowsDecimal && !Number.isInteger(qtyNumber)) {
      setError(
        `This unit (${selectedUnitLabel || "whole unit"}) only allows whole quantities. Please enter an integer value.`,
      );
      setBusy(false);
      return;
    }

    try {
      const payload: StockReceiptMutation = {
        variant_id: selectedProduct.id,
        destination_location_id: String(form.get("destination_location_id")),
        unit_id: selectedProduct.base_unit_id,
        quantity: rawQuantity,
        event_key: `direct-stock-in:${crypto.randomUUID()}`,
      };
      const unitCost = String(form.get("unit_cost") ?? "").trim();
      if (unitCost) payload.unit_cost = unitCost;
      if (
        offline.status === "offline" &&
        (!offline.scope || !offline.storageAvailable || !currentShop)
      ) {
        throw new Error(
          "Offline storage and an assigned shop are required to receive stock while disconnected.",
        );
      }
      if (offline.scope && offline.storageAvailable && currentShop) {
        await queueStockReceipt(offline.scope, currentShop.id, payload);
        if (navigator.onLine) await offline.syncNow();
      } else await post("/inventory/stock-in", payload);

      const addedQty = qtyNumber;
      const unitLabel = selectedUnitLabel || "units";
      setSuccess(
        `${selectedProduct.product_name}${!simple && selectedProduct.name ? ` · ${selectedProduct.name}` : ""} was added to stock (+${formatQuantity(payload.quantity)} ${unitLabel}).`,
      );
      formElement.reset();
      await items.reload();
      setSelectedProduct((prev) =>
        prev
          ? {
              ...prev,
              quantity_on_hand: String(Number(prev.quantity_on_hand || 0) + addedQty),
            }
          : null,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to receive stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventory Operations"
        title="Stock in"
        description={
          isMerchant
            ? "Record incoming inventory shipments, assign destination storage locations, and register unit purchase costs to establish FIFO profit layers."
            : "Record incoming inventory shipments and assign destination storage locations. The latest recorded purchase cost is reused automatically."
        }
      />

      {/* Mobile Step Navigator */}
      <div className="stock-mobile-nav lg:hidden mb-4">
        <div className="inline-flex w-full p-1 bg-surface-muted border border-line rounded-xl gap-1">
          <button
            type="button"
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mobileStep === "select"
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink"
            }`}
            onClick={() => setMobileStep("select")}
          >
            <span>1. Select Product</span>
            {selectedProduct && (
              <span className="w-4 h-4 rounded-full bg-green text-white text-[10px] grid place-items-center">
                ✓
              </span>
            )}
          </button>
          <button
            type="button"
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mobileStep === "form"
                ? "bg-surface text-ink shadow-xs"
                : "text-muted hover:text-ink disabled:opacity-40"
            }`}
            onClick={() => setMobileStep("form")}
            disabled={!selectedProduct}
          >
            <span>2. Receive Stock</span>
          </button>
        </div>
      </div>

      <div
        className="stock-layout grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2"
        data-mobile-step={mobileStep}
      >
        {/* Left Column: Product Catalog Browser */}
        <section
          className={`stock-catalog-pane stock-catalog-card bg-surface rounded-2xl border border-line shadow-xs overflow-hidden flex flex-col lg:col-span-6 xl:col-span-7 ${
            mobileStep !== "select" ? "hidden lg:flex" : "flex"
          }`}
          aria-label="Products available for stock-in"
        >
          {/* Card Header */}
          <div className="p-5 border-b border-line flex items-center justify-between gap-3 bg-surface/50">
            <div>
              <h2 className="text-base font-serif font-medium text-ink m-0">Select a product</h2>
              <p className="text-xs text-muted m-0 mt-0.5">
                {simple
                  ? "Tracked catalog products available for inventory intake."
                  : "Active variants with inventory tracking enabled."}
              </p>
            </div>
            {items.meta?.total !== undefined && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-surface-muted text-muted border border-line shrink-0">
                {items.meta.total} tracked
              </span>
            )}
          </div>

          {/* Search Toolbar */}
          <div className="p-4 border-b border-line bg-surface-muted/30">
            <div className="search-box stock-search relative w-full max-w-none">
              <Icon
                name="search"
                size={16}
                className="absolute left-3.5 top-3 text-muted pointer-events-none"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={
                  simple
                    ? "Search products by name…"
                    : "Search by product name, variant, SKU, or barcode…"
                }
                className="w-full h-10 pl-10 pr-9 rounded-xl border border-line bg-canvas text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green transition-all"
                aria-label="Search products"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="icon-button absolute right-2.5 top-2.5 w-5 h-5 rounded-full text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
                  onClick={() => {
                    setSearchTerm("");
                    setDebouncedQuery("");
                    setPageIndex(0);
                  }}
                  aria-label="Clear search"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Catalog Items */}
          <div className="p-4 flex-1">
            {items.loading ? (
              <div className="py-12">
                <Loading />
              </div>
            ) : items.error ? (
              <EmptyState title="Stock-in catalog could not load" message={items.error} />
            ) : items.data.length === 0 && !debouncedQuery ? (
              <EmptyState
                icon="package"
                title="No tracked products"
                message={
                  simple
                    ? "Create a product before recording stock-in."
                    : "Create a product variant and enable Track inventory before recording stock-in."
                }
              />
            ) : items.data.length === 0 && debouncedQuery ? (
              <div className="stock-no-match text-center py-10 px-4 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-surface-muted text-muted grid place-items-center mx-auto">
                  <Icon name="search" size={18} />
                </div>
                <p className="text-xs text-muted m-0">
                  No products match &ldquo;{debouncedQuery}&rdquo;.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm("");
                    setDebouncedQuery("");
                    setPageIndex(0);
                  }}
                >
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className="stock-catalog-list space-y-2.5"
                  role="listbox"
                  aria-label="Tracked products"
                >
                  {items.data.map((item) => {
                    const isSelected = selectedProduct?.id === item.id;
                    const qtyOnHand = Number(item.quantity_on_hand) || 0;
                    const itemUnit = unitMap.get(item.base_unit_id);
                    const itemUnitLabel = itemUnit?.symbol || itemUnit?.code || "";
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`stock-product-card group w-full p-3.5 rounded-xl border text-left flex items-center gap-3.5 transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? "border-green bg-green-soft/40 shadow-xs ring-1 ring-green"
                            : "border-line bg-surface hover:border-theme-gray-300 hover:bg-canvas/50 hover:shadow-xs"
                        }`}
                        onClick={() => {
                          setSelectedProduct(item);
                          setError("");
                          setSuccess("");
                          setMobileStep("form");
                        }}
                        role="option"
                        aria-selected={isSelected}
                      >
                        {/* Icon */}
                        <span
                          className={`stock-product-icon w-10 h-10 rounded-xl grid place-items-center shrink-0 transition-colors ${
                            isSelected
                              ? "bg-green text-white shadow-xs"
                              : "bg-surface-muted text-muted group-hover:text-green group-hover:bg-green-soft"
                          }`}
                        >
                          <Icon name="package" size={20} />
                        </span>

                        {/* Details */}
                        <div className="stock-product-main flex-1 min-w-0">
                          <div className="stock-product-title-row flex items-center justify-between gap-2 mb-1">
                            <strong className="stock-product-name text-xs font-bold text-ink truncate group-hover:text-green transition-colors">
                              {item.product_name}
                            </strong>
                            <span
                              className={`stock-qty-badge inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border ${
                                qtyOnHand > 0
                                  ? "bg-status-success-soft text-status-success border-status-success-border in-stock"
                                  : "bg-surface-muted text-muted border-line out-of-stock"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  qtyOnHand > 0 ? "bg-green animate-pulse" : "bg-muted"
                                }`}
                              />
                              <strong>{formatQuantity(item.quantity_on_hand)}</strong>
                              {itemUnitLabel ? ` ${itemUnitLabel}` : ""} in stock
                            </span>
                          </div>
                          {!simple && (
                            <div className="stock-product-meta flex items-center flex-wrap gap-1.5 text-[11px] text-muted">
                              {item.name && (
                                <span className="stock-variant-name font-medium text-ink/80">
                                  {item.name}
                                </span>
                              )}
                              {item.sku && (
                                <span className="stock-meta-pill px-1.5 py-0.5 rounded bg-surface-muted border border-line text-[9px] font-mono text-muted">
                                  SKU: {item.sku}
                                </span>
                              )}
                              {item.barcode && (
                                <span className="stock-meta-pill px-1.5 py-0.5 rounded bg-surface-muted border border-line text-[9px] font-mono text-muted">
                                  Barcode: {item.barcode}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Indicator */}
                        <span
                          className={`stock-select-indicator w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? "bg-green text-white"
                              : "text-muted group-hover:text-ink group-hover:translate-x-0.5"
                          }`}
                          aria-hidden="true"
                        >
                          <Icon name={isSelected ? "check" : "chevron"} size={14} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <Pagination
                  pageIndex={pageIndex}
                  pageSize={pageSize}
                  totalItems={items.meta?.total ?? items.data.length}
                  totalPages={items.meta?.total_pages ?? 1}
                  itemLabel="products"
                  onPageChange={setPageIndex}
                />
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Stock In Details & Receipt Form */}
        <section
          className={`stock-receipt-pane stock-receipt-card bg-surface rounded-2xl border border-line shadow-xs overflow-hidden lg:col-span-6 xl:col-span-5 lg:sticky lg:top-20 ${
            mobileStep !== "form" ? "hidden lg:block" : "block"
          }`}
          aria-label="Stock receipt form"
        >
          {/* Card Header */}
          <div className="p-5 border-b border-line flex items-center justify-between gap-3 bg-surface/50">
            <div>
              <h2 className="text-base font-serif font-medium text-ink m-0">Receive stock</h2>
              <p className="text-xs text-muted m-0 mt-0.5">
                {selectedProduct
                  ? `Record received inventory for ${selectedProduct.product_name}.`
                  : "Choose an item from the catalog to start receipt."}
              </p>
            </div>
            {selectedProduct && (
              <button
                type="button"
                className="stock-change-btn text-[11px] font-semibold text-muted hover:text-ink px-2.5 py-1 rounded-lg border border-line bg-surface hover:bg-canvas transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                onClick={() => {
                  setSelectedProduct(null);
                  setMobileStep("select");
                }}
                aria-label="Choose different product"
              >
                <Icon name="close" size={12} />
                <span>Change</span>
              </button>
            )}
          </div>

          <div className="p-5">
            {success && (
              <div
                className="success-message p-3 rounded-xl bg-status-success-soft text-status-success border border-status-success-border text-xs flex items-center gap-2 mb-4 animate-fadeIn"
                role="status"
              >
                <span className="w-5 h-5 rounded-full bg-green text-white flex items-center justify-center shrink-0">
                  <Icon name="check" size={12} />
                </span>
                <span className="font-medium">{success}</span>
              </div>
            )}

            {error && (
              <div
                className="form-error p-3 rounded-xl bg-status-danger-soft text-status-danger border border-status-danger-border text-xs flex items-center gap-2 mb-4"
                role="alert"
              >
                <span className="w-5 h-5 rounded-full bg-status-danger text-white flex items-center justify-center shrink-0">
                  <Icon name="close" size={12} />
                </span>
                <span className="font-medium">{error}</span>
              </div>
            )}

            {!selectedProduct ? (
              <div className="stock-prompt-state p-8 text-center flex flex-col items-center justify-center min-h-[380px]">
                <div className="stock-prompt-icon w-16 h-16 rounded-2xl bg-green-soft text-green flex items-center justify-center mb-4 ring-8 ring-green-soft/30 shadow-inner">
                  <Icon name="package" size={32} />
                </div>
                <h3 className="text-base font-bold text-ink mb-1.5 font-serif">
                  No Product Selected
                </h3>
                <p className="text-xs text-muted max-w-sm leading-relaxed mb-6">
                  Select an inventory item from the catalog on the left to record received
                  quantities, choose a destination location, and configure purchase costs.
                </p>
                <aside className="stock-tip-embedded w-full text-left bg-surface-muted/60 border border-line rounded-xl p-4 space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-semibold text-ink m-0">
                    <span className="w-5 h-5 rounded-md bg-green-soft text-green flex items-center justify-center shrink-0">
                      <Icon name="package" size={12} />
                    </span>
                    <span>How Original Purchase Price Works</span>
                  </h4>
                  <p className="text-[11px] text-muted leading-relaxed m-0">
                    Each stock intake creates an immutable receipt and establishing a FIFO cost
                    layer. When this item is sold, that cost is used to compute gross margin.
                  </p>
                  <ul className="text-[11px] text-muted space-y-1 pl-5 list-disc leading-relaxed">
                    <li>Retail selling prices remain managed in the price list.</li>
                    <li>
                      {isMerchant
                        ? "Original price is the actual purchase amount paid per unit."
                        : "The latest recorded purchase cost is reused automatically."}
                    </li>
                    <li>Stock balances update immediately upon intake.</li>
                  </ul>
                </aside>
              </div>
            ) : (
              <Form className="stock-receipt-form space-y-5" onSubmit={submit}>
                {/* Selected Product Hero Spotlight */}
                <div className="stock-selected-spotlight p-4 rounded-xl border border-green/30 bg-gradient-to-br from-green-soft/30 via-surface to-surface-muted/40 shadow-xs">
                  <div className="spotlight-header flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="stock-product-icon selected w-11 h-11 rounded-xl bg-green text-white flex items-center justify-center shrink-0 shadow-xs">
                        <Icon name="package" size={22} />
                      </span>
                      <div className="spotlight-title min-w-0">
                        <small className="text-[9px] font-bold uppercase tracking-wider text-green block">
                          Selected for intake
                        </small>
                        <strong className="text-sm font-bold text-ink truncate block">
                          {selectedProduct.product_name}
                        </strong>
                        {!simple && selectedProduct.name && (
                          <span className="spotlight-variant text-xs text-muted truncate block">
                            {selectedProduct.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Metrics Bar */}
                  <div className="mt-3.5 pt-3 border-t border-line/60 grid grid-cols-2 gap-3 text-xs">
                    <div className="spotlight-stock">
                      <small className="text-[10px] text-muted block uppercase tracking-wider font-medium">
                        Current Balance
                      </small>
                      <strong className="text-sm font-bold text-ink">
                        {formatQuantity(selectedProduct.quantity_on_hand)}
                        {selectedUnitLabel ? ` ${selectedUnitLabel}` : ""}
                      </strong>
                    </div>
                    <div>
                      <small className="text-[10px] text-muted block uppercase tracking-wider font-medium">
                        Base Tracking Unit
                      </small>
                      <strong className="text-sm font-bold text-ink">
                        {selectedUnit?.name ?? selectedUnitLabel ?? "Base Unit"}
                      </strong>
                    </div>
                  </div>

                  {!simple && (selectedProduct.sku || selectedProduct.barcode) && (
                    <div className="spotlight-pills mt-2.5 pt-2.5 border-t border-line/40 flex items-center flex-wrap gap-2 text-[10px]">
                      {selectedProduct.sku && (
                        <span className="stock-meta-pill px-2 py-0.5 rounded-md bg-surface border border-line font-mono text-muted">
                          SKU: {selectedProduct.sku}
                        </span>
                      )}
                      {selectedProduct.barcode && (
                        <span className="stock-meta-pill px-2 py-0.5 rounded-md bg-surface border border-line font-mono text-muted">
                          Barcode: {selectedProduct.barcode}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <Field
                    label="Stock location"
                    hint="Select the warehouse or storage room receiving this inventory."
                  >
                    <select
                      name="destination_location_id"
                      defaultValue={shopLocations.length === 1 ? shopLocations[0].id : ""}
                      required
                      disabled={shopLocations.length === 0}
                      className="h-10 w-full rounded-xl border border-line bg-canvas px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green transition-all"
                    >
                      <option value="">Select a location</option>
                      {shopLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label={
                      selectedUnitLabel
                        ? `Quantity received (${selectedUnitLabel})`
                        : "Quantity received"
                    }
                    hint={
                      selectedUnit && !allowsDecimal
                        ? "Whole units only for this product."
                        : selectedUnit
                          ? "Decimal quantities are allowed for this unit."
                          : undefined
                    }
                  >
                    <div className="relative">
                      <input
                        name="quantity"
                        type="number"
                        step={allowsDecimal ? "0.001" : "1"}
                        min={allowsDecimal ? "0.001" : "1"}
                        required
                        placeholder={allowsDecimal ? "0.000" : "0"}
                        autoFocus
                        className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 pr-14 text-sm font-bold text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green transition-all"
                      />
                      {selectedUnitLabel && (
                        <span className="absolute right-3 top-2.5 px-2 py-0.5 rounded-md bg-surface-muted border border-line text-[11px] font-semibold text-muted pointer-events-none">
                          {selectedUnitLabel}
                        </span>
                      )}
                    </div>
                  </Field>

                  {isMerchant && (
                    <Field
                      label="Original purchase cost per unit"
                      hint="Optional after the first stock-in; leave blank to reuse the latest recorded cost."
                    >
                      <div className="money-field relative">
                        <span className="absolute left-3.5 top-2.5 text-xs font-bold text-muted pointer-events-none">
                          {currencyLabel(merchant?.default_currency_code)}
                        </span>
                        <input
                          name="unit_cost"
                          type="number"
                          step="0.01"
                          min="0"
                          key={selectedProduct.id}
                          placeholder="Reuse latest recorded cost"
                          className="h-10 w-full rounded-xl border border-line bg-canvas pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-green/30 focus:border-green transition-all"
                        />
                      </div>
                      <CurrentPriceLists
                        lists={priceLists.data}
                        loading={priceLists.loading}
                        error={priceLists.error}
                        variantId={selectedProduct.id}
                        quantityOnHand={selectedProduct.quantity_on_hand}
                        unitLabel={selectedUnitLabel}
                      />
                    </Field>
                  )}
                </div>

                {shopLocations.length === 0 && (
                  <div className="form-error p-3 rounded-xl bg-status-danger-soft text-status-danger border border-status-danger-border text-xs flex items-center gap-2">
                    <Icon name="close" size={16} />
                    <span>This shop has no active stock location configured.</span>
                  </div>
                )}

                {/* Actions */}
                <div className="modal-actions pt-4 border-t border-line flex items-center justify-end gap-3 mt-6">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSelectedProduct(null);
                      setMobileStep("select");
                    }}
                    className="h-11 px-4 text-xs font-semibold"
                  >
                    Clear
                  </Button>
                  <Button
                    type="submit"
                    icon="package"
                    disabled={
                      busy ||
                      shopLocations.length === 0 ||
                      (offline.status === "offline" && !offline.storageAvailable)
                    }
                    className="h-11 px-6 text-xs font-bold bg-green hover:bg-green-dark text-white rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    {busy ? "Adding stock…" : "Add to stock"}
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function MovementsPage() {
  const { merchant, isMerchant } = useAuth();
  const { currentShop } = useShop();
  const { data, loading, error } = useResource<Movement>(
    "/inventory/movements?page_index=0&page_size=200",
  );
  const variants = useResource<Variant>("/pos/catalog?page_index=0&page_size=500");
  const locations = useResource<Location>("/inventory/locations?page_index=0&page_size=200");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [movementSort, setMovementSort] = useState("NEWEST");
  const variantNames = useMemo(
    () => new Map(variants.data.map((item) => [item.id, item.name])),
    [variants.data],
  );
  const variantName = (id: string) => variantNames.get(id) ?? id.slice(0, 8);
  const locationName = (id?: string) =>
    id ? (locations.data.find((item) => item.id === id)?.name ?? id.slice(0, 8)) : "—";
  const visible = useMemo(
    () =>
      data
        .filter(
          (item) =>
            (!type || item.movement_type === type) &&
            `${variantNames.get(item.variant_id) ?? item.variant_id} ${item.event_key}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          movementSort === "OLDEST"
            ? new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
            : movementSort === "PRODUCT"
              ? (variantNames.get(a.variant_id) ?? a.variant_id).localeCompare(
                  variantNames.get(b.variant_id) ?? b.variant_id,
                )
              : movementSort === "QUANTITY_DESC"
                ? Number(b.quantity) - Number(a.quantity)
                : new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        ),
    [data, movementSort, query, type, variantNames],
  );
  const pagination = useListPagination(visible, 10, `${query}|${type}|${movementSort}`);
  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock movement history"
        description="A permanent audit trail of every item entering or leaving stock."
        action={
          <Button variant="secondary" onClick={() => window.print()}>
            Print view
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product or event…"
          />
        </div>
        <select
          className="filter-select"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All movements</option>
          <option>RECEIPT</option>
          <option>SALE</option>
          <option>TRANSFER</option>
          <option>RETURN</option>
          <option>ADJUSTMENT</option>
          <option>REVERSAL</option>
        </select>
        <select
          className="filter-select"
          value={movementSort}
          onChange={(event) => setMovementSort(event.target.value)}
          aria-label="Sort movements"
        >
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="PRODUCT">Product A–Z</option>
          <option value="QUANTITY_DESC">Largest quantity</option>
        </select>
      </div>
      <div className="table-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Movements could not load" message={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="history"
            title="No stock movements"
            message="Receipts, sales, and adjustments will appear here."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Product</th>
                <th>From / to</th>
                <th>Quantity</th>
                {isMerchant && <th>Unit cost</th>}
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>{formatShopDateTime(item.occurred_at, currentShop?.timezone)}</td>
                  <td>
                    <Badge
                      tone={
                        item.movement_type === "RECEIPT"
                          ? "success"
                          : item.movement_type === "SALE"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {item.movement_type}
                    </Badge>
                  </td>
                  <td>
                    <strong>{variantName(item.variant_id)}</strong>
                  </td>
                  <td>
                    {locationName(item.source_location_id)} →{" "}
                    {locationName(item.destination_location_id)}
                  </td>
                  <td>
                    <strong>
                      {item.movement_type === "SALE" ? "−" : "+"}
                      {formatQuantity(item.quantity)}
                    </strong>
                  </td>
                  {isMerchant && (
                    <td>
                      {item.unit_cost
                        ? formatMoney(item.unit_cost, merchant?.default_currency_code)
                        : "—"}
                    </td>
                  )}
                  <td>
                    <code>{item.event_key}</code>
                    <Link className="text-link" href={`/stock-movements/${item.id}`}>
                      View detail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="movements"
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}

export function AccountsPage() {
  const offline = useOffline();
  const users = useResource<User>("/users?page=1&page_size=100");
  const shops = useResource<Shop>("/shops?page_index=0&page_size=100");
  const [userQuery, setUserQuery] = useState("");
  const [userFilter, setUserFilter] = useState("ALL");
  const [userSort, setUserSort] = useState("NAME_ASC");
  const visibleUsers = useMemo(
    () =>
      users.data
        .filter(
          (user) =>
            `${user.display_name} ${user.email} ${user.phone ?? ""} ${user.roles.map((role) => role.name).join(" ")}`
              .toLowerCase()
              .includes(userQuery.toLowerCase()) &&
            (userFilter === "ALL" || (userFilter === "ACTIVE" ? user.is_active : !user.is_active)),
        )
        .sort((a, b) =>
          userSort === "NAME_DESC"
            ? b.display_name.localeCompare(a.display_name)
            : userSort === "EMAIL"
              ? a.email.localeCompare(b.email)
              : a.display_name.localeCompare(b.display_name),
        ),
    [userFilter, userQuery, userSort, users.data],
  );
  const userPagination = useListPagination(
    visibleUsers,
    10,
    `${userQuery}|${userFilter}|${userSort}`,
  );
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [staffPassword, setStaffPassword] = useState("");
  const [staffConfirmPassword, setStaffConfirmPassword] = useState("");
  const [passwordModalError, setPasswordModalError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      await post("/users", {
        email: String(form.get("email")),
        password: String(form.get("password")),
        display_name: String(form.get("name")),
        phone: String(form.get("phone") || "") || undefined,
        shop_id: String(form.get("shop_id")),
        role_code: "STAFF",
      });
      setOpen(false);
      await users.reload();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to create staff account.");
    }
  }
  async function toggle(user: User) {
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    await patch(`/users/${user.membership_id}`, { is_active: !user.is_active });
    await users.reload();
  }
  async function assign(user: User, shopId: string) {
    if (offline.status === "offline") {
      setFormError("Staff account changes require a connection.");
      return;
    }
    await patch(`/users/${user.membership_id}`, { shop_id: shopId });
    await users.reload();
  }
  async function submitStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordUser) return;
    if (offline.status === "offline") {
      setPasswordModalError("Staff password changes require an active connection.");
      return;
    }
    if (staffPassword.length < 8) {
      setPasswordModalError("Password must be at least 8 characters long.");
      return;
    }
    if (staffPassword !== staffConfirmPassword) {
      setPasswordModalError("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordModalError("");
    try {
      await patch(`/users/${passwordUser.membership_id}`, {
        password: staffPassword,
      });
      setPasswordUser(null);
      await users.reload();
    } catch (err) {
      setPasswordModalError(
        err instanceof Error ? err.message : "Failed to update staff password.",
      );
    } finally {
      setPasswordBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff accounts"
        description="Give each staff member access to exactly one shop."
        action={
          <Button icon="plus" disabled={offline.status === "offline"} onClick={() => setOpen(true)}>
            Add staff
          </Button>
        }
      />
      <ListControls
        search={userQuery}
        onSearchChange={setUserQuery}
        searchPlaceholder="Search staff, email or role"
        filter={userFilter}
        onFilterChange={setUserFilter}
        filterLabel="Filter staff"
        filterOptions={[
          { value: "ALL", label: "All staff" },
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
        ]}
        sort={userSort}
        onSortChange={setUserSort}
        sortLabel="Sort staff"
        sortOptions={[
          { value: "NAME_ASC", label: "Name A–Z" },
          { value: "NAME_DESC", label: "Name Z–A" },
          { value: "EMAIL", label: "Email A–Z" },
        ]}
      />
      <div className="table-card">
        {users.loading ? (
          <Loading />
        ) : users.error ? (
          <EmptyState title="Staff could not load" message={users.error} />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            icon="users"
            title="No staff accounts"
            message="Create an account for a cashier or repair technician."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Role</th>
                <th>Assigned shop</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {userPagination.pageItems.map((user) => (
                <tr key={user.membership_id}>
                  <td>
                    <div className="person-cell">
                      <span>
                        {user.display_name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div className="cell-main">
                        <strong>{user.display_name}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{user.roles.map((role) => role.name).join(", ") || "No role"}</td>
                  <td>
                    {user.roles.some((role) => role.code.toUpperCase() === "STAFF") ? (
                      <select
                        value={user.shop_id ?? ""}
                        disabled={offline.status === "offline"}
                        onChange={(event) => assign(user, event.target.value)}
                        aria-label={`Shop for ${user.display_name}`}
                      >
                        <option value="" disabled>
                          Assign shop
                        </option>
                        {shops.data.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (shops.data.find((shop) => shop.id === user.shop_id)?.name ?? "All shops")
                    )}
                  </td>
                  <td>
                    <Badge tone={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        title="Change staff password"
                        disabled={offline.status === "offline"}
                        onClick={() => {
                          setPasswordUser(user);
                          setStaffPassword("");
                          setStaffConfirmPassword("");
                          setPasswordModalError("");
                        }}
                      >
                        <Icon name="lock" size={15} />
                      </button>
                      <button
                        title={user.is_active ? "Deactivate" : "Activate"}
                        disabled={offline.status === "offline"}
                        onClick={() => toggle(user)}
                      >
                        <Icon name={user.is_active ? "close" : "check"} size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={userPagination.pageIndex}
        pageSize={userPagination.pageSize}
        totalItems={userPagination.totalItems}
        totalPages={userPagination.totalPages}
        itemLabel="staff accounts"
        onPageChange={userPagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add staff member"
        description="This account will be restricted to one shop."
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Full name">
              <input name="name" required />
            </Field>
            <Field label="Phone">
              <input name="phone" type="tel" />
            </Field>
            <div className="wide">
              <Field label="Email">
                <input name="email" type="email" required />
              </Field>
            </div>
            <Field label="Temporary password">
              <PasswordInput name="password" minLength={8} required />
            </Field>
            <Field label="Assigned shop">
              <select name="shop_id" required>
                <option value="">Select one shop</option>
                {shops.data.map((shop) => (
                  <option value={shop.id} key={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {formError && <div className="form-error">{formError}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={offline.status === "offline"}>
              Create staff
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        title={`Change password: ${passwordUser?.display_name ?? ""}`}
        description={`Set a new sign-in password for ${passwordUser?.email ?? "this staff member"}.`}
      >
        <Form onSubmit={submitStaffPassword}>
          <div className="form-grid">
            {passwordModalError && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  padding: "0.75rem",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                }}
              >
                {passwordModalError}
              </div>
            )}
            <Field label="New password" hint="Minimum 8 characters">
              <PasswordInput
                required
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </Field>
            <Field label="Confirm password" hint="Retype to confirm">
              <PasswordInput
                required
                minLength={8}
                value={staffConfirmPassword}
                onChange={(e) => setStaffConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setPasswordUser(null)}>
              Cancel
            </Button>
            <Button type="submit" icon="lock" disabled={passwordBusy || !staffPassword}>
              {passwordBusy ? "Updating..." : "Update password"}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
