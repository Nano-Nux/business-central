"use client";

import { FormEvent, useMemo, useState } from "react";
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
}: {
  lists: PriceList[];
  loading: boolean;
  error: string;
  variantId: string;
  quantityOnHand: string;
}) {
  return (
    <div className="stock-price-lists">
      <div className="stock-price-lists-head">
        <small>Current price lists</small>
        <small>{formatQuantity(quantityOnHand)} in stock</small>
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
  const { merchant, isMerchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const { currentShop } = useShop();
  const offline = useOffline();
  const items = useResource<StockItem>(
    `/pos/catalog?page_index=0&page_size=500${currentShop ? `&shop_id=${encodeURIComponent(currentShop.id)}` : ""}`,
  );
  const priceLists = useResource<PriceList>(
    isMerchant ? "/pricing/price-lists?page_index=0&page_size=100" : "",
  );
  const locations = useResource<Location>("/inventory/locations?page_index=0&page_size=200");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const trackedItems = useMemo(
    () =>
      items.data.filter(
        (item) =>
          item.is_stock_tracked &&
          `${item.product_name} ${item.name} ${item.sku} ${item.barcode ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [items.data, query],
  );
  const selected = items.data.find((item) => item.id === selectedId);
  const shopLocations = useMemo(
    () =>
      locations.data.filter(
        (location) => location.is_active && (!currentShop || location.shop_id === currentShop.id),
      ),
    [currentShop, locations.data],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const form = new FormData(formElement);
    try {
      const payload: StockReceiptMutation = {
        variant_id: selected.id,
        destination_location_id: String(form.get("destination_location_id")),
        unit_id: selected.base_unit_id,
        quantity: String(form.get("quantity")),
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
      setSuccess(
        `${selected.product_name} · ${selected.name} was added to stock using its recorded original cost.`,
      );
      setSelectedId("");
      formElement.reset();
      await items.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to receive stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock in"
        description={
          isMerchant
            ? "Choose a product and enter the received quantity. The original purchase cost is optional when this product has been stocked before."
            : "Choose a product and enter the received quantity. The latest recorded original price is reused automatically."
        }
      />
      <div className="stock-layout">
        <Form className="card stock-form" onSubmit={submit}>
          <div className="card-head">
            <div>
              <h2>Select a product</h2>
              <p>
                {simple
                  ? "Only products with inventory tracking enabled are shown."
                  : "Only variants with Track inventory enabled are shown."}{" "}
                {isMerchant
                  ? " The cost entered here is used later to calculate profit."
                  : " The latest recorded cost is used later to calculate profit."}
              </p>
            </div>
          </div>
          {success && (
            <div className="success-message">
              <Icon name="check" size={17} />
              {success}
            </div>
          )}
          {error && (
            <div className="form-error">
              <Icon name="close" size={16} />
              {error}
            </div>
          )}
          {items.loading || locations.loading ? (
            <Loading />
          ) : items.error || locations.error ? (
            <EmptyState
              title="Stock-in data could not load"
              message={items.error || locations.error}
            />
          ) : items.data.filter((item) => item.is_stock_tracked).length === 0 ? (
            <EmptyState
              icon="package"
              title="No tracked products"
              message={
                simple
                  ? "Create a product before recording stock-in."
                  : "Create a product variant and enable Track inventory before recording stock-in."
              }
            />
          ) : (
            <>
              <div className="search-box stock-search">
                <Icon name="search" size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={simple ? "Search products…" : "Search product, SKU, or barcode…"}
                  aria-label="Search products"
                />
              </div>
              <div className="stock-product-list" aria-label="Products available for stock-in">
                {trackedItems.length === 0 ? (
                  <p className="stock-no-match">No products match your search.</p>
                ) : (
                  trackedItems.map((item) => (
                    <button
                      type="button"
                      className={`stock-product-row${selectedId === item.id ? " selected" : ""}`}
                      key={item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setError("");
                        setSuccess("");
                      }}
                      aria-pressed={selectedId === item.id}
                    >
                      <span className="stock-product-icon">
                        <Icon name="package" size={18} />
                      </span>
                      <span className="stock-product-name">
                        <strong>{item.product_name}</strong>
                        {!simple && (
                          <small>
                            {item.name} · SKU {item.sku}
                          </small>
                        )}
                      </span>
                      <span className="stock-product-balance">
                        <small>In stock</small>
                        <strong>{item.quantity_on_hand}</strong>
                      </span>
                      <Icon name={selectedId === item.id ? "check" : "chevron"} size={16} />
                    </button>
                  ))
                )}
              </div>
              {selected && (
                <div className="receipt-selection">
                  <div>
                    <small>Selected product</small>
                    <strong>{selected.product_name}</strong>
                    {!simple && <span>{selected.name}</span>}
                  </div>
                  {!simple && (
                    <div>
                      <small>SKU</small>
                      <span>{selected.sku}</span>
                    </div>
                  )}
                  <div>
                    <small>Current stock</small>
                    <strong>{selected.quantity_on_hand}</strong>
                  </div>
                </div>
              )}
              <div className="form-grid">
                <Field label="Stock location">
                  <select
                    name="destination_location_id"
                    defaultValue={shopLocations.length === 1 ? shopLocations[0].id : ""}
                    required
                    disabled={!selected || shopLocations.length === 0}
                  >
                    <option value="">Select a location</option>
                    {shopLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity received">
                  <input
                    name="quantity"
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    disabled={!selected}
                    placeholder="0"
                  />
                </Field>
                {isMerchant && (
                  <Field
                    label="Original price per unit"
                    hint="Optional after the first stock-in; leave blank to reuse the latest cost."
                  >
                    <div className="money-field">
                      <span>{currencyLabel(merchant?.default_currency_code)}</span>
                      <input
                        name="unit_cost"
                        type="number"
                        step="0.01"
                        min="0"
                        key={selected?.id}
                        disabled={!selected}
                        placeholder="Use latest cost"
                      />
                    </div>
                    {selected && (
                      <CurrentPriceLists
                        lists={priceLists.data}
                        loading={priceLists.loading}
                        error={priceLists.error}
                        variantId={selected.id}
                        quantityOnHand={selected.quantity_on_hand}
                      />
                    )}
                  </Field>
                )}
              </div>
              {selected && shopLocations.length === 0 && (
                <div className="form-error">
                  <Icon name="close" size={16} />
                  This shop has no active stock location.
                </div>
              )}
              <div className="modal-actions">
                <Button type="reset" variant="secondary" onClick={() => setSelectedId("")}>
                  Clear
                </Button>
                <Button
                  type="submit"
                  icon="package"
                  disabled={
                    busy ||
                    !selected ||
                    shopLocations.length === 0 ||
                    (offline.status === "offline" && !offline.storageAvailable)
                  }
                >
                  {busy ? "Adding stock…" : "Add to stock"}
                </Button>
              </div>
            </>
          )}
        </Form>
        <aside className="card stock-tip">
          <span className="stat-icon mint">
            <Icon name="package" />
          </span>
          <h3>How original price works</h3>
          <p>
            Each stock-in creates an immutable receipt and a FIFO cost layer. When this item is
            sold, that cost is used to calculate gross profit.
          </p>
          <ul>
            <li>Selling price stays in the RETAIL price list.</li>
            <li>
              {isMerchant
                ? "Original price is the amount you paid per unit."
                : "The latest original price is reused automatically."}
            </li>
            <li>Stock quantity updates immediately.</li>
          </ul>
        </aside>
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
                  <td>
                    {formatShopDateTime(item.occurred_at, currentShop?.timezone)}
                  </td>
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
      setPasswordModalError(err instanceof Error ? err.message : "Failed to update staff password.");
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
              <input name="password" type="password" minLength={8} required />
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
              <div style={{ gridColumn: "1 / -1", padding: "0.75rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "6px", fontSize: "0.9rem" }}>
                {passwordModalError}
              </div>
            )}
            <Field label="New password" hint="Minimum 8 characters">
              <input
                type="password"
                required
                minLength={8}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </Field>
            <Field label="Confirm password" hint="Retype to confirm">
              <input
                type="password"
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
