"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { projectStorageStock } from "@/lib/offline-stock";
import { useResource } from "@/lib/use-resource";
import type { Product, StorageItem, Variant } from "@/lib/types";
import { Badge, EmptyState, Loading, Pagination, useListPagination } from "./ui";
import { RowActionsMenu } from "./row-actions-menu";
import { StorageStockDialog } from "./storage-stock-dialog";

type Actions = {
  onEdit: (product: Product) => void;
  onPacks: (product: Product) => void;
  onDelete: (product: Product) => void;
};

type StockItem = ReturnType<typeof projectStorageStock>[number];
type StockSnapshot = {
  items: StockItem[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};
type ColumnKey =
  | "product"
  | "brand"
  | "category"
  | "variant"
  | "unit"
  | "stock"
  | "sell"
  | "cost"
  | "profit"
  | "status"
  | "expiry"
  | "manufacture";
const columns: { key: ColumnKey; label: string; merchantOnly?: boolean }[] = [
  { key: "product", label: "Product" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Classification" },
  { key: "variant", label: "Product variant" },
  { key: "unit", label: "Unit" },
  { key: "stock", label: "Stock count" },
  { key: "sell", label: "RETAIL sell price" },
  { key: "cost", label: "Original price", merchantOnly: true },
  { key: "profit", label: "Profit", merchantOnly: true },
  { key: "status", label: "Status" },
  { key: "expiry", label: "Expiration date" },
  { key: "manufacture", label: "Manufacture date" },
];

function ProductStockLoader({
  product,
  onLoaded,
}: {
  product: Product;
  onLoaded: (id: string, snapshot: StockSnapshot) => void;
}) {
  const offline = useOffline();
  const variants = useResource<Variant>(
    `/catalog/products/${product.id}/variants?page_index=0&page_size=100`,
    undefined,
    true,
  );
  const params = new URLSearchParams({
    page_index: "0",
    page_size: "100",
    filter: `product_name:${product.name}`,
  });
  const storage = useResource<StorageItem>(`/inventory/storage?${params}`, undefined, true);
  const snapshot = useMemo<StockSnapshot>(() => {
    const variantIDs = new Set(variants.data.map((variant) => variant.id));
    return {
      items: projectStorageStock(storage.data, offline.operations).filter((item) =>
        variantIDs.has(item.id),
      ),
      loading: variants.loading || storage.loading,
      error: variants.error || storage.error,
      reload: storage.reload,
    };
  }, [
    variants.data,
    variants.loading,
    variants.error,
    storage.data,
    storage.loading,
    storage.error,
    storage.reload,
    offline.operations,
  ]);
  useEffect(() => {
    onLoaded(product.id, snapshot);
  }, [onLoaded, product.id, snapshot]);
  return null;
}

function ProductStockRow({
  product,
  brand,
  category,
  item,
  loading,
  error,
  onEdit,
  onPacks,
  onDelete,
  onStock,
}: Actions & {
  product: Product;
  brand?: string;
  category?: string;
  item: StockItem | null;
  loading: boolean;
  error: string;
  onStock: (item: StockItem) => void;
}) {
  const { merchant, isMerchant } = useAuth();
  const money = (value?: string) =>
    value ? formatMoney(value, merchant?.default_currency_code) : "—";

  return (
    <tr>
      <td>
        <button className="product-cell-btn product-link" onClick={() => onEdit(product)}>
          <div className="cell-main">
            <strong>{product.name}</strong>
            {product.barcode && <small>{product.barcode}</small>}
            {product.description && <small>{product.description}</small>}
          </div>
        </button>
        {error && <small role="alert">Stock could not load: {error}</small>}
      </td>
      <td>{item?.brand || brand || "—"}</td>
      <td>
        <div className="product-classification">
          <span>{item?.catalog || category || "Uncategorized"}</span>
        </div>
      </td>
      <td>{item?.variant_name || "—"}</td>
      <td>{item?.unit || "—"}</td>
      <td>
        {loading
          ? "Loading…"
          : item
            ? item.is_stock_tracked === false
              ? "Not tracked"
              : formatQuantity(item.stock_count)
            : "—"}
        {item?.stock_pending && <small> (pending)</small>}
      </td>
      <td>{money(item?.sell_price)}</td>
      {isMerchant && <td>{money(item?.original_price)}</td>}
      {isMerchant && <td>{money(item?.profit)}</td>}
      <td>
        <Badge tone={product.is_active ? "success" : "neutral"}>
          {product.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td>{product.expired_date?.slice(0, 10) || "—"}</td>
      <td>{product.manufacture_date?.slice(0, 10) || "—"}</td>
      <td>
        <RowActionsMenu
          label={
            item && item.variant_name !== product.name
              ? `${product.name} ? ${item.variant_name}`
              : product.name
          }
          actions={[
            { label: "Edit", onClick: () => onEdit(product) },
            { label: "Pack sizes", onClick: () => onPacks(product) },
            ...(isMerchant && item
              ? [
                  {
                    label: "Adjust stock",
                    disabled: item.is_stock_tracked === false,
                    onClick: () => onStock(item),
                  },
                ]
              : []),
            { label: "Delete", danger: true, onClick: () => onDelete(product) },
          ]}
        />
      </td>
    </tr>
  );
}

export function NanoProductsTable({
  products,
  loading,
  error,
  brandMap,
  categoryLabels,
  resetKey,
  ...actions
}: Actions & {
  products: Product[];
  loading: boolean;
  error: string;
  brandMap: Map<string, string>;
  categoryLabels: Map<string, string>;
  resetKey: string;
}) {
  const { isMerchant, merchant } = useAuth();
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [filterRevision, setFilterRevision] = useState(0);
  function updateFilter(key: ColumnKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setFilterRevision((current) => current + 1);
  }
  const [snapshots, setSnapshots] = useState<Record<string, StockSnapshot>>({});
  const [editing, setEditing] = useState<{ item: StockItem; reload: () => Promise<void> } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const onLoaded = useCallback((id: string, snapshot: StockSnapshot) => {
    setSnapshots((current) =>
      current[id] === snapshot ? current : { ...current, [id]: snapshot },
    );
  }, []);
  const visibleColumns = columns.filter((column) => isMerchant || !column.merchantOnly);
  const rows = products
    .flatMap((product) => {
      const snapshot = snapshots[product.id];
      const items: (StockItem | null)[] =
        !snapshot || snapshot.loading || snapshot.error || !snapshot.items.length
          ? [null]
          : snapshot.items;
      const brand = product.brand_id ? brandMap.get(product.brand_id) : undefined;
      const category = product.category_ids
        .map((id) => categoryLabels.get(id))
        .filter(Boolean)
        .join(" / ");
      return items.map((item) => ({ product, item, brand, category, snapshot }));
    })
    .filter(({ product, item, brand, category }) => {
      const money = (value?: string) =>
        value
          ? `${value} ${Number(value)} ${formatMoney(value, merchant?.default_currency_code)}`
          : "\u2014";
      const values: Record<ColumnKey, string> = {
        product: `${product.name} ${product.barcode || ""} ${product.description || ""}`,
        brand: item?.brand || brand || "\u2014",
        category: item?.catalog || category || "Uncategorized",
        variant: item?.variant_name || "\u2014",
        unit: item?.unit || "\u2014",
        stock: item
          ? item.is_stock_tracked === false
            ? "Not tracked"
            : `${item.stock_count} ${Number(item.stock_count)} ${formatQuantity(item.stock_count)}`
          : "\u2014",
        sell: money(item?.sell_price),
        cost: money(item?.original_price),
        profit: money(item?.profit),
        status: product.is_active ? "Active" : "Inactive",
        expiry: product.expired_date?.slice(0, 10) || "\u2014",
        manufacture: product.manufacture_date?.slice(0, 10) || "\u2014",
      };
      return visibleColumns.every(({ key }) => {
        const filter = filters[key]?.trim().toLowerCase();
        return (
          !filter ||
          (key === "status"
            ? values[key].toLowerCase() === filter
            : values[key].toLowerCase().includes(filter))
        );
      });
    });
  const pagination = useListPagination(rows, 10, `${resetKey}|${filterRevision}`);
  return (
    <>
      {products.map((product) => (
        <ProductStockLoader key={product.id} product={product} onLoaded={onLoaded} />
      ))}
      {notice && (
        <p role="status" className="banner">
          {notice}
        </p>
      )}
      <div className="table-card storage-table-card">
        {loading ? (
          <Loading />
        ) : error ? (
          <EmptyState title="Products could not load" message={error} />
        ) : (
          <table
            className="data-table storage-table nano-filter-table"
            aria-label="Products and storage"
          >
            <thead>
              <tr>
                {visibleColumns.map(({ key, label }) => (
                  <th key={key} scope="col" aria-label={label}>
                    <span className="storage-column-label">{label}</span>
                    <div className="storage-column-tools">
                      {key === "status" ? (
                        <select
                          aria-label={`Filter ${label}`}
                          value={filters[key] || ""}
                          onChange={(event) => updateFilter(key, event.target.value)}
                        >
                          <option value="">All statuses</option>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      ) : (
                        <input
                          aria-label={`Filter ${label}`}
                          placeholder={
                            key === "expiry" || key === "manufacture"
                              ? "YYYY-MM-DD"
                              : `Filter ${label.toLowerCase()}`
                          }
                          value={filters[key] || ""}
                          onChange={(event) => updateFilter(key, event.target.value)}
                        />
                      )}
                    </div>
                  </th>
                ))}
                <th>
                  <span className="storage-column-label">Actions</span>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={!Object.values(filters).some(Boolean)}
                    onClick={() => {
                      setFilters({});
                      setFilterRevision((current) => current + 1);
                    }}
                  >
                    Clear filters
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map(({ product, item, brand, category, snapshot }) => (
                <ProductStockRow
                  key={`${product.id}:${item?.id || "product"}`}
                  product={product}
                  item={item}
                  brand={brand}
                  category={category}
                  loading={!snapshot || snapshot.loading}
                  error={snapshot?.error || ""}
                  {...actions}
                  onStock={(item) => setEditing({ item, reload: snapshot!.reload })}
                />
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={visibleColumns.length + 1}>
                    <EmptyState
                      icon="package"
                      title="No products found"
                      message="Create a product or clear the search and filters."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="product rows"
        onPageChange={pagination.setPageIndex}
      />
      {isMerchant &&
        editing &&
        createPortal(
          <StorageStockDialog
            item={editing.item}
            onClose={() => setEditing(null)}
            onSaved={async (message) => {
              setNotice(message);
              setEditing(null);
              await editing.reload();
            }}
          />,
          document.body,
        )}
    </>
  );
}
