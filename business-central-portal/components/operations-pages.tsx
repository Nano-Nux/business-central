"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  StatusBadge,
  useListPagination,
} from "./ui";
import { useTranslation } from "@/lib/i18n";
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
  Role,
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
  const { t } = useTranslation();
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
      setMessage(t("inventory.barcode_assigned"));
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
      setMessage(t("inventory.barcode_removed"));
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
        eyebrow={t("nav.inventory")}
        title={t("inventory.stock_assets_title")}
        description={t("inventory.stock_assets_desc")}
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
                placeholder={t("inventory.search_assets_placeholder")}
                aria-label={t("inventory.stock_assets_title")}
              />
            </div>
            <select
              className="filter-select"
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
              aria-label="Filter stock assets"
            >
              <option value="ALL">{t("inventory.all_assets")}</option>
              <option value="WITH_BARCODE">{t("inventory.with_barcode")}</option>
              <option value="WITHOUT_BARCODE">{t("inventory.missing_barcode")}</option>
            </select>
            <select
              className="filter-select"
              value={assetSort}
              onChange={(event) => setAssetSort(event.target.value)}
              aria-label="Sort stock assets"
            >
              <option value="PRODUCT_ASC">{t("catalog.product_name")} A–Z</option>
              <option value="PRODUCT_DESC">{t("catalog.product_name")} Z–A</option>
              <option value="ASSET_TAG">{t("catalog.sku")}</option>
              <option value="STATUS">{t("common.status")}</option>
            </select>
          </div>
          {assets.loading ? (
            <Loading />
          ) : assets.error ? (
            <EmptyState title="Stock assets could not load" message={assets.error} />
          ) : visible.length === 0 ? (
            <EmptyState
              title={t("inventory.no_assets_found")}
              message={t("inventory.no_assets_desc")}
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
                    <small>{asset.barcode ? t("catalog.barcode") : t("inventory.missing_barcode")}</small>
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
            itemLabel={t("inventory.stock_assets_title")}
            onPageChange={assetPagination.setPageIndex}
          />
        </section>
        <section className="card stock-asset-editor">
          <div className="card-head">
            <div>
              <h2>{t("inventory.assign_stock_barcode")}</h2>
              <p>{t("inventory.assign_barcode_desc")}</p>
            </div>
          </div>
          {!selected ? (
            <EmptyState
              title={t("inventory.select_asset_prompt")}
              message={t("inventory.select_asset_desc")}
            />
          ) : (
            <>
              <div className="receipt-selection">
                <div>
                  <small>{t("catalog.product_name")}</small>
                  <strong>{selected.product_name}</strong>
                </div>
                <div>
                  <small>{t("catalog.sku")}</small>
                  <strong>{selected.asset_tag}</strong>
                </div>
                <div>
                  <small>{t("common.status")}</small>
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
                placeholder={t("inventory.search_assets_placeholder")}
              />
              <div className="modal-actions">
                <Button
                  type="button"
                  onClick={() => void assign()}
                  disabled={busy || !barcode.trim()}
                >
                  {busy ? t("common.loading") : t("inventory.assign_barcode_button")}
                </Button>
                {selected.barcode_id && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void clearBarcode()}
                    disabled={busy}
                  >
                    {t("inventory.remove_barcode")}
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
    <div className="stock-price-list-row">
      <span>
        <strong>{list.code}</strong>
        <small>{currentPrices.size.toLocaleString()} items</small>
      </span>
      <strong>
        {prices.loading
          ? "Loading…"
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
    <div className="stock-price-lists">
      <div className="stock-price-lists-head">
        <small>Current price lists</small>
        <small>
          {formatQuantity(quantityOnHand)}
          {unitLabel ? ` ${unitLabel}` : ""} in stock
        </small>
      </div>
      {loading ? (
        <span className="stock-price-list-empty">Loading price lists…</span>
      ) : error ? (
        <span className="stock-price-list-empty">Price lists unavailable.</span>
      ) : lists.length === 0 ? (
        <span className="stock-price-list-empty">No price lists configured.</span>
      ) : (
        lists.map((list) => <CurrentPriceList key={list.id} list={list} variantId={variantId} />)
      )}
    </div>
  );
}

export function StockInPage() {
  const { t } = useTranslation();
  const { merchant, isMerchant, can } = useAuth();
  const router = useRouter();
  const mini = merchant?.pos_complexity_level === "MINI";
  const simple = merchant?.pos_complexity_level === "SIMPLE" || mini;
  const { currentShop } = useShop();
  const offline = useOffline();

  useEffect(() => {
    if (!can("stock_in")) {
      router.replace(isMerchant ? "/merchant/dashboard" : "/staff/dashboard");
    }
  }, [can, isMerchant, router]);

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
      const unitCost = !mini ? String(form.get("unit_cost") ?? "").trim() : "";
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

  if (!can("stock_in")) {
    return (
      <EmptyState
        icon="lock"
        title="Access restricted"
        message="Your account does not have permission to perform stock-in operations."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t("nav.inventory")}
        title={t("inventory.stock_in_title")}
        description={t("inventory.stock_in_desc")}
      />

      {/* Mobile Step Navigator: only visible on mobile screens <= 800px */}
      <div className="stock-mobile-nav">
        <div className="segmented">
          <button
            type="button"
            className={mobileStep === "select" ? "active" : ""}
            onClick={() => setMobileStep("select")}
          >
            {t("inventory.stock_in_step_select")}{selectedProduct ? " (1 selected)" : ""}
          </button>
          <button
            type="button"
            className={mobileStep === "form" ? "active" : ""}
            onClick={() => setMobileStep("form")}
            disabled={!selectedProduct}
          >
            {t("inventory.stock_in_step_receive")}
          </button>
        </div>
      </div>

      <div className="stock-layout" data-mobile-step={mobileStep}>
        {/* Left Column: Product Catalog Browser */}
        <section
          className={`card stock-catalog-card stock-catalog-pane ${
            mobileStep !== "select" ? "mobile-hidden" : ""
          }`}
          aria-label={t("inventory.select_product_prompt")}
        >
          <div className="card-head">
            <div>
              <h2>{t("inventory.select_product_prompt")}</h2>
              <p>{t("inventory.select_product_desc")}</p>
            </div>
          </div>

          <div className="search-box stock-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t("pos.search_placeholder")}
              aria-label={t("common.search")}
            />
            {searchTerm && (
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setSearchTerm("");
                  setDebouncedQuery("");
                  setPageIndex(0);
                }}
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {items.loading ? (
            <Loading />
          ) : items.error ? (
            <EmptyState title="Stock-in catalog could not load" message={items.error} />
          ) : items.data.length === 0 && !debouncedQuery ? (
            <EmptyState
              icon="package"
              title={t("catalog.no_products")}
              message={t("catalog.no_products_desc")}
            />
          ) : items.data.length === 0 && debouncedQuery ? (
            <div className="stock-no-match">
              <p>No products match &ldquo;{debouncedQuery}&rdquo;.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSearchTerm("");
                  setDebouncedQuery("");
                  setPageIndex(0);
                }}
              >
                {t("common.clear")}
              </Button>
            </div>
          ) : (
            <>
              <div className="stock-catalog-list" role="listbox" aria-label="Tracked products">
                {items.data.map((item) => {
                  const isSelected = selectedProduct?.id === item.id;
                  const qtyOnHand = Number(item.quantity_on_hand) || 0;
                  const itemUnit = unitMap.get(item.base_unit_id);
                  const itemUnitLabel = itemUnit?.symbol || itemUnit?.code || "";
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`stock-product-card ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedProduct(item);
                        setError("");
                        setSuccess("");
                        setMobileStep("form");
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className={`stock-product-icon ${isSelected ? "selected" : ""}`}>
                        <Icon name="package" size={18} />
                      </span>
                      <div className="stock-product-main">
                        <div className="stock-product-title-row">
                          <strong className="stock-product-name">{item.product_name}</strong>
                          <span
                            className={`stock-qty-badge ${qtyOnHand > 0 ? "in-stock" : "out-of-stock"}`}
                          >
                            <strong>{formatQuantity(item.quantity_on_hand)}</strong>
                            {itemUnitLabel ? ` ${itemUnitLabel}` : ""}
                          </span>
                        </div>
                        {!simple && (
                          <div className="stock-product-meta">
                            <span className="stock-variant-name">{item.name}</span>
                            {item.sku && <span className="stock-meta-pill">SKU {item.sku}</span>}
                            {item.barcode && (
                              <span className="stock-meta-pill">Barcode {item.barcode}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="stock-select-indicator" aria-hidden="true">
                        <Icon name={isSelected ? "check" : "chevron"} size={16} />
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
                itemLabel={t("common.products")}
                onPageChange={setPageIndex}
              />
            </>
          )}
        </section>

        {/* Right Column: Stock In Details & Receipt Form */}
        <section
          className={`card stock-receipt-card stock-receipt-pane ${
            mobileStep !== "form" ? "mobile-hidden" : ""
          }`}
          aria-label={t("inventory.receive_stock_prompt")}
        >
          <div className="card-head">
            <div>
              <h2>{t("inventory.receive_stock_prompt")}</h2>
              <p>
                {selectedProduct
                  ? `Entering received inventory for ${selectedProduct.product_name}.`
                  : t("inventory.choose_product_prompt")}
              </p>
            </div>
            {selectedProduct && (
              <button
                type="button"
                className="stock-change-btn"
                onClick={() => {
                  setSelectedProduct(null);
                  setMobileStep("select");
                }}
                aria-label={t("inventory.change_product")}
              >
                <Icon name="close" size={14} />
                <span>{t("inventory.change_product")}</span>
              </button>
            )}
          </div>

          {success && (
            <div className="success-message" role="status">
              <Icon name="check" size={17} />
              {success}
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              <Icon name="close" size={16} />
              {error}
            </div>
          )}

          {!selectedProduct ? (
            <div className="stock-prompt-state">
              <span className="stock-prompt-icon">
                <Icon name="package" size={28} />
              </span>
              <h3>{t("inventory.no_product_selected")}</h3>
              <p>{t("inventory.no_product_selected_desc")}</p>
              <aside className="stock-tip-embedded">
                <h4>
                  <Icon name="package" size={15} />
                  {t("inventory.original_price_info_title")}
                </h4>
                <p>{t("inventory.original_price_info_desc")}</p>
                <ul>
                  <li>{t("inventory.original_price_bullet_1")}</li>
                  <li>{t("inventory.original_price_bullet_2")}</li>
                  <li>{t("inventory.original_price_bullet_3")}</li>
                </ul>
              </aside>
            </div>
          ) : (
            <Form className="stock-receipt-form" onSubmit={submit}>
              {/* Selected Product Spotlight */}
              <div className="stock-selected-spotlight">
                <div className="spotlight-header">
                  <span className="stock-product-icon selected">
                    <Icon name="package" size={20} />
                  </span>
                  <div className="spotlight-title">
                    <small>{t("catalog.product_name")}</small>
                    <strong>{selectedProduct.product_name}</strong>
                    {!simple && <span className="spotlight-variant">{selectedProduct.name}</span>}
                  </div>
                  <div className="spotlight-stock">
                    <small>{t("catalog.stock_quantity")}</small>
                    <strong>
                      {formatQuantity(selectedProduct.quantity_on_hand)}
                      {selectedUnitLabel ? ` ${selectedUnitLabel}` : ""}
                    </strong>
                  </div>
                </div>
                {!simple && (selectedProduct.sku || selectedProduct.barcode) && (
                  <div className="spotlight-pills">
                    {selectedProduct.sku && (
                      <span className="stock-meta-pill">SKU {selectedProduct.sku}</span>
                    )}
                    {selectedProduct.barcode && (
                      <span className="stock-meta-pill">Barcode {selectedProduct.barcode}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="form-grid">
                <Field label={t("inventory.stock_location")}>
                  <select
                    name="destination_location_id"
                    defaultValue={shopLocations.length === 1 ? shopLocations[0].id : ""}
                    required
                    disabled={shopLocations.length === 0}
                  >
                    <option value="">{t("inventory.select_location")}</option>
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
                      ? `${t("inventory.quantity_received")} (${selectedUnitLabel})`
                      : t("inventory.quantity_received")
                  }
                  hint={
                    selectedUnit && !allowsDecimal
                      ? "Whole units only for this product."
                      : selectedUnit
                      ? "Decimal quantities are allowed for this unit."
                      : undefined
                  }
                >
                  <input
                    name="quantity"
                    type="number"
                    step={allowsDecimal ? "0.001" : "1"}
                    min={allowsDecimal ? "0.001" : "1"}
                    required
                    placeholder={allowsDecimal ? "0.000" : "0"}
                    autoFocus
                  />
                </Field>

                {isMerchant && !mini && (
                  <Field
                    label={t("inventory.original_price_per_unit")}
                    hint="Optional after the first stock-in; leave blank to reuse the latest cost."
                  >
                    <div className="money-field">
                      <span>{currencyLabel(merchant?.default_currency_code)}</span>
                      <input
                        name="unit_cost"
                        type="number"
                        step="0.01"
                        min="0"
                        key={selectedProduct.id}
                        placeholder={t("inventory.use_latest_cost")}
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
                <div className="form-error">
                  <Icon name="close" size={16} />
                  This shop has no active stock location.
                </div>
              )}

              <div className="modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSelectedProduct(null);
                    setMobileStep("select");
                  }}
                >
                  {t("common.clear")}
                </Button>
                <Button
                  type="submit"
                  icon="package"
                  disabled={
                    busy ||
                    shopLocations.length === 0 ||
                    (offline.status === "offline" && !offline.storageAvailable)
                  }
                >
                  {busy ? t("inventory.adding_stock") : t("inventory.add_to_stock")}
                </Button>
              </div>

              <aside className="stock-tip-embedded mt-12">
                <h4>
                  <Icon name="package" size={15} />
                  {t("inventory.original_price_info_title")}
                </h4>
                <p>{t("inventory.original_price_info_desc")}</p>
                <ul>
                  <li>{t("inventory.original_price_bullet_1")}</li>
                  <li>{t("inventory.original_price_bullet_2")}</li>
                  <li>{t("inventory.original_price_bullet_3")}</li>
                </ul>
              </aside>
            </Form>
          )}
        </section>
      </div>
    </>
  );
}

export function MovementsPage() {
  const { t } = useTranslation();
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
  const variantName = (id?: string) => (id ? (variantNames.get(id) ?? id.slice(0, 8)) : "—");
  const locationName = (id?: string) =>
    id ? (locations.data.find((item) => item.id === id)?.name ?? id.slice(0, 8)) : "—";
  const visible = useMemo(
    () =>
      data
        .filter(
          (item) =>
            (!type || item.movement_type === type) &&
            `${variantNames.get(item.variant_id) ?? item.variant_id ?? ""} ${item.event_key ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          movementSort === "OLDEST"
            ? new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
            : movementSort === "PRODUCT"
              ? (variantNames.get(a.variant_id) ?? a.variant_id ?? "").localeCompare(
                  variantNames.get(b.variant_id) ?? b.variant_id ?? "",
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
        eyebrow={t("nav.inventory")}
        title={t("inventory.stock_history_title")}
        description={t("inventory.stock_history_desc")}
        action={
          <Button variant="secondary" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search_placeholder")}
          />
        </div>
        <select
          className="filter-select"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t("inventory.all_movements")}</option>
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
            title={t("inventory.no_movements_found")}
            message={t("inventory.no_movements_desc")}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("common.status")}</th>
                <th>{t("catalog.product_name")}</th>
                <th>{t("inventory.location")}</th>
                <th>{t("common.quantity")}</th>
                {isMerchant && <th>{t("inventory.unit_cost")}</th>}
                <th>{t("common.details")}</th>
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
                    {isMerchant && (
                      <Link
                        className="history-detail-btn"
                        href={`/stock-movements/${item.id}`}
                        style={{ marginLeft: "8px" }}
                        aria-label={`View detail for ${item.event_key}`}
                      >
                        <Icon name="eye" size={13} />
                        <span>{t("common.details")}</span>
                      </Link>
                    )}
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
        itemLabel={t("inventory.stock_history_title")}
        onPageChange={pagination.setPageIndex}
      />
    </>
  );
}

export function AccountsPage() {
  const { t } = useTranslation();
  const { isMerchant } = useAuth();
  const offline = useOffline();
  const users = useResource<User>("/users?page=1&page_size=100");
  const shops = useResource<Shop>("/shops?page_index=0&page_size=100");
  const roles = useResource<Role>("/roles");
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const staffRole = useMemo(
    () => roles.data.find((role) => role.code?.toLowerCase() === "staff"),
    [roles.data],
  );

  const isStockInAllowed = Boolean(staffRole?.permission_codes?.includes("stock_in"));

  async function handleToggleStockIn(checked: boolean) {
    if (!isMerchant) return;
    if (!staffRole) {
      setPermissionError("Staff role could not be loaded for this merchant.");
      return;
    }
    if (offline.status === "offline") {
      setPermissionError("Role permission changes require an active connection.");
      return;
    }
    setPermissionBusy(true);
    setPermissionError("");
    try {
      const existingCodes = staffRole.permission_codes || [];
      const updatedCodes = checked
        ? Array.from(new Set([...existingCodes, "stock_in"]))
        : existingCodes.filter((code) => code !== "stock_in");

      await patch(`/roles/${staffRole.id}`, {
        permission_codes: updatedCodes,
      });
      await roles.reload();
    } catch (err) {
      setPermissionError(
        err instanceof Error ? err.message : "Failed to update staff stock-in permission.",
      );
    } finally {
      setPermissionBusy(false);
    }
  }

  const isAiChatAllowed = Boolean(staffRole?.permission_codes?.includes("ai.chat"));

  async function handleToggleAiChat(checked: boolean) {
    if (!isMerchant) return;
    if (!staffRole) {
      setPermissionError("Staff role could not be loaded for this merchant.");
      return;
    }
    if (offline.status === "offline") {
      setPermissionError("Role permission changes require an active connection.");
      return;
    }
    setPermissionBusy(true);
    setPermissionError("");
    try {
      const existingCodes = staffRole.permission_codes || [];
      const updatedCodes = checked
        ? Array.from(new Set([...existingCodes, "ai.chat"]))
        : existingCodes.filter((code) => code !== "ai.chat");

      await patch(`/roles/${staffRole.id}`, {
        permission_codes: updatedCodes,
      });
      await roles.reload();
    } catch (err) {
      setPermissionError(
        err instanceof Error ? err.message : "Failed to update staff AI assistant permission.",
      );
    } finally {
      setPermissionBusy(false);
    }
  }

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
        eyebrow={t("accounts.eyebrow")}
        title={t("accounts.title")}
        description={t("accounts.description")}
        action={
          <Button icon="plus" disabled={offline.status === "offline"} onClick={() => setOpen(true)}>
            {t("accounts.add_staff")}
          </Button>
        }
      />
      {isMerchant && (
        <div className="table-card" style={{ marginBottom: 16, padding: "16px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <label
              className="check-field switch-field"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: isMerchant ? "pointer" : "default",
              }}
            >
              <input
                type="checkbox"
                role="switch"
                checked={isStockInAllowed}
                disabled={!isMerchant || offline.status === "offline" || permissionBusy || roles.loading}
                onChange={(event) => handleToggleStockIn(event.target.checked)}
                aria-label={t("accounts.staff_stock_in_permission")}
              />
              <span>
                <strong style={{ fontSize: 13, fontWeight: 600 }}>{t("accounts.staff_stock_in_permission")}</strong>
                <small style={{ fontSize: 11, color: "var(--muted)" }}>
                  {t("accounts.staff_stock_in_desc")}
                </small>
              </span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge tone={isStockInAllowed ? "success" : "neutral"}>
                {permissionBusy
                  ? t("common.loading")
                  : isStockInAllowed
                    ? t("accounts.stock_in_enabled")
                    : t("accounts.stock_in_disabled")}
              </Badge>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              paddingTop: 12,
              marginTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            <label
              className="check-field switch-field"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: isMerchant ? "pointer" : "default",
              }}
            >
              <input
                type="checkbox"
                role="switch"
                checked={isAiChatAllowed}
                disabled={!isMerchant || offline.status === "offline" || permissionBusy || roles.loading}
                onChange={(event) => handleToggleAiChat(event.target.checked)}
                aria-label={t("accounts.staff_ai_chat_permission", "Staff Nanonux AI Permission")}
              />
              <span>
                <strong style={{ fontSize: 13, fontWeight: 600 }}>
                  {t("accounts.staff_ai_chat_permission", "Staff Nanonux AI Permission")}
                </strong>
                <small style={{ fontSize: 11, color: "var(--muted)" }}>
                  {t("accounts.staff_ai_chat_desc", "Allow staff to access Nanonux AI Assistant for operational queries and inventory analysis.")}
                </small>
              </span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge tone={isAiChatAllowed ? "success" : "neutral"}>
                {permissionBusy
                  ? t("common.loading", "Loading…")
                  : isAiChatAllowed
                    ? t("accounts.ai_chat_enabled", "AI Allowed")
                    : t("accounts.ai_chat_disabled", "AI Off")}
              </Badge>
            </div>
          </div>
          {permissionError && (
            <p className="error banner" style={{ marginTop: 10, marginBottom: 0 }}>
              {permissionError}
            </p>
          )}
        </div>
      )}
      <ListControls
        search={userQuery}
        onSearchChange={setUserQuery}
        searchPlaceholder={t("common.search_placeholder")}
        filter={userFilter}
        onFilterChange={setUserFilter}
        filterLabel={t("common.filter")}
        filterOptions={[
          { value: "ALL", label: t("common.all") },
          { value: "ACTIVE", label: t("common.active") },
          { value: "INACTIVE", label: t("common.inactive") },
        ]}
        sort={userSort}
        onSortChange={setUserSort}
        sortLabel={t("common.actions")}
        sortOptions={[
          { value: "NAME_ASC", label: `${t("common.name")} A–Z` },
          { value: "NAME_DESC", label: `${t("common.name")} Z–A` },
          { value: "EMAIL", label: `${t("common.email")} A–Z` },
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
            title={t("accounts.no_staff_accounts")}
            message={t("accounts.no_staff_desc")}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("accounts.team_member")}</th>
                <th>{t("accounts.role")}</th>
                <th>{t("accounts.assigned_shop")}</th>
                <th>{t("common.status")}</th>
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
                          {t("accounts.assign_shop")}
                        </option>
                        {shops.data.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (shops.data.find((shop) => shop.id === user.shop_id)?.name ?? t("accounts.all_shops"))
                    )}
                  </td>
                  <td>
                    <Badge tone={user.is_active ? "success" : "neutral"}>
                      {user.is_active ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        title={t("accounts.change_password")}
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
        itemLabel={t("accounts.title")}
        onPageChange={userPagination.setPageIndex}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("accounts.add_staff_modal_title")}
        description={t("accounts.add_staff_modal_desc")}
      >
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label={t("accounts.full_name")}>
              <input name="name" required />
            </Field>
            <Field label={t("common.phone")}>
              <input name="phone" type="tel" />
            </Field>
            <div className="wide">
              <Field label={t("common.email")}>
                <input name="email" type="email" required />
              </Field>
            </div>
            <Field label={t("accounts.temporary_password")}>
              <input name="password" type="password" minLength={8} required />
            </Field>
            <Field label={t("accounts.assigned_shop")}>
              <select name="shop_id" required>
                <option value="">{t("accounts.assign_shop")}</option>
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
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={offline.status === "offline"}>
              {t("accounts.create_staff")}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={Boolean(passwordUser)}
        onClose={() => setPasswordUser(null)}
        title={`${t("accounts.change_password")}: ${passwordUser?.display_name ?? ""}`}
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
            <Field label={t("accounts.new_password")} hint="Minimum 8 characters">
              <input
                type="password"
                required
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder={t("accounts.new_password")}
              />
            </Field>
            <Field label={t("accounts.confirm_password")} hint="Retype to confirm">
              <input
                type="password"
                required
                minLength={8}
                value={staffConfirmPassword}
                onChange={(e) => setStaffConfirmPassword(e.target.value)}
                placeholder={t("accounts.confirm_password")}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setPasswordUser(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" icon="lock" disabled={passwordBusy || !staffPassword}>
              {passwordBusy ? t("common.loading") : t("accounts.update_password")}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
