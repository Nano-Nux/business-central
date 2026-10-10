"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { projectStorageStock } from "@/lib/offline-stock";
import { useResource } from "@/lib/use-resource";
import type { StorageItem } from "@/lib/types";
import { Icon } from "./icons";
import { Button, EmptyState, Loading, PageHeader, Pagination } from "./ui";
import { StorageStockDialog } from "./storage-stock-dialog";

type StorageColumn = {
  key: keyof StorageItem;
  label: string;
  filterPlaceholder: string;
  merchantOnly?: boolean;
};

const columns: StorageColumn[] = [
  { key: "catalog", label: "Catalog", filterPlaceholder: "Filter catalog", merchantOnly: true },
  { key: "variant_name", label: "Product variant", filterPlaceholder: "Filter variant" },
  { key: "brand", label: "Brand", filterPlaceholder: "Filter brand", merchantOnly: true },
  { key: "product_name", label: "Product item", filterPlaceholder: "Filter product" },
  { key: "unit", label: "Unit", filterPlaceholder: "Filter unit" },
  { key: "stock_count", label: "Stock count", filterPlaceholder: "Filter quantity" },
  { key: "sell_price", label: "RETAIL sell price", filterPlaceholder: "Filter sell price" },
  {
    key: "original_price",
    label: "Original price",
    filterPlaceholder: "Filter original price",
    merchantOnly: true,
  },
  { key: "profit", label: "Profit", filterPlaceholder: "Filter profit", merchantOnly: true },
  {
    key: "expired_date",
    label: "Expiration date",
    filterPlaceholder: "YYYY-MM-DD",
    merchantOnly: true,
  },
  {
    key: "manufacture_date",
    label: "Manufacture date",
    filterPlaceholder: "YYYY-MM-DD",
    merchantOnly: true,
  },
];

function displayDate(value?: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

function CatalogPath({ value }: { value?: string }) {
  if (!value) return <span className="muted-text">Uncategorized</span>;
  return (
    <div className="storage-catalog-paths">
      {value.split(" / ").map((path) => (
        <div className="storage-catalog-path" key={path}>
          {path.split(" → ").map((part, index) => (
            <span key={`${path}-${part}-${index}`}>
              {index > 0 && <i aria-hidden="true">›</i>}
              <b>{part}</b>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StoragePage() {
  const { isMerchant, merchant } = useAuth();
  const offline = useOffline();
  const [editing, setEditing] = useState<{
    item: StorageItem;
    action?: "increase" | "reduce";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<[keyof StorageItem, boolean]>(["product_name", true]);
  const visibleColumns = columns.filter((column) => isMerchant || !column.merchantOnly);
  const filterQuery = useMemo(
    () =>
      Object.entries(filters)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${key}:${value.trim()}`)
        .join(","),
    [filters],
  );
  const params = new URLSearchParams({
    page_index: String(pageIndex),
    page_size: String(pageSize),
    sort: `${sort[0]}:${sort[1] ? "asc" : "desc"}`,
  });
  if (query.trim()) params.set("query", query.trim());
  if (filterQuery) params.set("filter", filterQuery);
  const resource = useResource<StorageItem>(`/inventory/storage?${params.toString()}`);
  const items = projectStorageStock(resource.data, offline.operations);
  const currency = merchant?.default_currency_code;

  function updateFilter(key: keyof StorageItem, value: string) {
    setPageIndex(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(key: keyof StorageItem) {
    setPageIndex(0);
    setSort(([currentKey, ascending]) => [key, currentKey === key ? !ascending : true]);
  }

  function renderValue(item: StorageItem, key: keyof StorageItem) {
    if (key === "catalog") return <CatalogPath value={item.catalog} />;
    if (key === "expired_date" || key === "manufacture_date") {
      return displayDate(item[key]);
    }
    if (key === "stock_count") return formatQuantity(item.stock_count);
    if (key === "sell_price" || key === "original_price" || key === "profit") {
      return item[key] ? formatMoney(item[key], currency) : "—";
    }
    return item[key] || "—";
  }

  return (
    <>
      <PageHeader
        eyebrow="Operations · Inventory"
        title="Storage"
        description={
          isMerchant
            ? "Check stock and prices, receive inventory or record a stock reduction. Every change is recorded in stock history."
            : "Check current stock and RETAIL sell prices."
        }
      />
      {notice && (
        <p role="status" className="banner">
          {notice}
        </p>
      )}
      <div className="toolbar storage-toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(event) => {
              setPageIndex(0);
              setQuery(event.target.value);
            }}
            placeholder="Search every storage column…"
            aria-label="Search storage"
          />
        </div>
        <label className="storage-page-size">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageIndex(0);
              setPageSize(Number(event.target.value));
            }}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-card storage-table-card">
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <EmptyState title="Storage could not load" message={resource.error} />
        ) : resource.data.length === 0 ? (
          <EmptyState
            icon="package"
            title="No stock records match"
            message="Try clearing the search or column filters. Products and stock balances appear here automatically."
          />
        ) : (
          <table className="data-table storage-table">
            <thead>
              <tr>
                <th className="storage-number-column">
                  <span className="storage-column-label">Number</span>
                </th>
                {visibleColumns.map((column) => (
                  <th key={column.key}>
                    <div className="storage-column-tools">
                      <input
                        aria-label={`Filter ${column.label}`}
                        value={filters[column.key] ?? ""}
                        onChange={(event) => updateFilter(column.key, event.target.value)}
                        placeholder={column.filterPlaceholder}
                      />
                      <button
                        type="button"
                        className={sort[0] === column.key ? "is-active" : ""}
                        onClick={() => toggleSort(column.key)}
                        aria-label={`Sort ${column.label} ${sort[0] === column.key && sort[1] ? "descending" : "ascending"}`}
                        title={`Sort ${column.label}`}
                      >
                        {sort[0] === column.key ? (sort[1] ? "↑" : "↓") : "↕"}
                      </button>
                    </div>
                    <span className="storage-column-label">{column.label}</span>
                  </th>
                ))}
                {isMerchant && <th>Stock actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="storage-number-column">{pageIndex * pageSize + index + 1}</td>
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={`storage-cell-${column.key}`}>
                      {renderValue(item, column.key)}
                      {column.key === "stock_count" && item.stock_pending && (
                        <small> (pending)</small>
                      )}
                    </td>
                  ))}
                  {isMerchant && (
                    <td>
                      <div className="table-actions">
                        {merchant?.pos_complexity_level === "NANO" ? (
                          <Button
                            variant="secondary"
                            disabled={item.is_stock_tracked === false}
                            onClick={() => setEditing({ item })}
                          >
                            Adjust stock
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              disabled={item.is_stock_tracked === false}
                              onClick={() => setEditing({ item, action: "increase" })}
                            >
                              Increase
                            </Button>
                            <Button
                              variant="danger"
                              disabled={item.is_stock_tracked === false}
                              onClick={() => setEditing({ item, action: "reduce" })}
                            >
                              Reduce
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={pageIndex}
        pageSize={resource.meta?.page_size ?? pageSize}
        totalItems={resource.meta?.total ?? resource.data.length}
        totalPages={resource.meta?.total_pages ?? 1}
        itemLabel="stock records"
        onPageChange={setPageIndex}
      />
      {isMerchant && editing && (
        <StorageStockDialog
          item={editing.item}
          action={editing.action}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setNotice(message);
            setEditing(null);
            await resource.reload();
          }}
        />
      )}
    </>
  );
}
