"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/use-resource";
import type { StorageItem } from "@/lib/types";
import { Icon } from "./icons";
import { EmptyState, Loading, PageHeader, Pagination } from "./ui";

type StorageColumn = {
  key: keyof StorageItem;
  label: string;
  filterPlaceholder: string;
  merchantOnly?: boolean;
};

const columns: StorageColumn[] = [
  { key: "catalog", label: "Catalog", filterPlaceholder: "Filter catalog" },
  { key: "variant_name", label: "Product variant", filterPlaceholder: "Filter variant" },
  { key: "brand", label: "Brand", filterPlaceholder: "Filter brand" },
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
  { key: "expired_date", label: "Expiration date", filterPlaceholder: "YYYY-MM-DD" },
  { key: "manufacture_date", label: "Manufacture date", filterPlaceholder: "YYYY-MM-DD" },
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
        description="Check current stock, RETAIL pricing, catalog placement and product dates. This page is view-only."
      />
      <div className="toolbar storage-toolbar flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="search-box relative flex-1 min-w-[240px] flex items-center">
          <span className="absolute left-3 text-muted pointer-events-none flex items-center">
            <Icon name="search" size={17} />
          </span>
          <input
            className="w-full h-10 pl-9 pr-3 text-sm bg-paper text-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20 transition"
            value={query}
            onChange={(event) => {
              setPageIndex(0);
              setQuery(event.target.value);
            }}
            placeholder="Search every storage column…"
            aria-label="Search storage"
          />
        </div>
        <label className="storage-page-size flex items-center gap-2 text-xs text-muted font-medium">
          <span>Rows per page</span>
          <select
            className="h-9 px-2.5 py-1 text-xs bg-paper text-ink border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/20 transition cursor-pointer"
            value={pageSize}
            onChange={(event) => {
              setPageIndex(0);
              setPageSize(Number(event.target.value));
            }}
          >
            {[10].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-card storage-table-card rounded-2xl border border-line bg-paper overflow-x-auto shadow-xs">
        {resource.loading ? (
          <div className="p-8 flex justify-center">
            <Loading />
          </div>
        ) : resource.error ? (
          <EmptyState title="Storage could not load" message={resource.error} />
        ) : resource.data.length === 0 ? (
          <EmptyState
            icon="package"
            title="No stock records match"
            message="Try clearing the search or column filters. Products and stock balances appear here automatically."
          />
        ) : (
          <table className="data-table storage-table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas">
                <th className="storage-number-column px-3.5 py-2.5 font-bold uppercase tracking-wider text-[10px] text-muted">
                  <span className="storage-column-label">Number</span>
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-[10px] text-muted"
                  >
                    <div className="storage-column-tools flex items-center gap-1.5 mb-1.5">
                      <input
                        aria-label={`Filter ${column.label}`}
                        value={filters[column.key] ?? ""}
                        onChange={(event) => updateFilter(column.key, event.target.value)}
                        placeholder={column.filterPlaceholder}
                        className="w-full h-7 px-2 text-xs bg-paper text-ink border border-line rounded font-normal normal-case focus:outline-none focus:ring-1 focus:ring-ink/20"
                      />
                      <button
                        type="button"
                        className={`px-1.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer ${
                          sort[0] === column.key
                            ? "is-active bg-ink text-paper border-ink"
                            : "bg-paper text-muted border-line hover:text-ink hover:bg-canvas"
                        }`}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {resource.data.map((item, index) => (
                <tr key={item.id} className="hover:bg-canvas/50 transition">
                  <td className="storage-number-column px-3.5 py-3 text-muted text-xs">
                    {pageIndex * pageSize + index + 1}
                  </td>
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`storage-cell-${column.key} px-3.5 py-3 text-ink text-xs`}
                    >
                      {renderValue(item, column.key)}
                    </td>
                  ))}
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
    </>
  );
}
