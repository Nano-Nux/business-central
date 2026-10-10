"use client";

import "./transaction-history-filters.css";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RowActionsMenu } from "./row-actions-menu";
import { InvoiceDetailModal } from "./invoice-detail-modal";
import { Icon } from "./icons";
import { Button, EmptyState, Loading, PageHeader, Pagination, StatusBadge } from "./ui";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { useResource } from "@/lib/use-resource";
import { formatMoney } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import type { TransactionHistoryDetail, TransactionHistoryEntry } from "@/lib/types";
import { useOffline } from "@/lib/offline";
import { getCachedEntities, listOperations } from "@/lib/offline-db";
import {
  matchesTransactionFilters,
  transactionColumns,
  type TransactionColumnFilters,
} from "@/lib/transaction-history-filters";

function filterDate(range: string) {
  if (range === "all") return null;
  const to = new Date();
  const from = new Date(to);
  if (range === "1") from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - Number(range));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function TransactionHistoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [manualInvoiceId, setManualInvoiceId] = useState<string | null>(null);
  const invoiceId = manualInvoiceId ?? params.get("invoice") ?? "";
  const offline = useOffline();
  const [pendingDeliveryEntries, setPendingDeliveryEntries] = useState<
    Map<string, TransactionHistoryEntry>
  >(new Map());
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!offline.scope) return;
      const [entities, operations] = await Promise.all([
        getCachedEntities<TransactionHistoryDetail>(offline.scope, "DELIVERY_PAYMENT"),
        listOperations(offline.scope),
      ]);
      const pending = new Set(
        operations
          .filter(
            (op) =>
              op.entityType === "DELIVERY_PAYMENT" &&
              ["PENDING", "SYNCING", "FAILED", "BLOCKED"].includes(op.status),
          )
          .map((op) => op.entityId),
      );
      if (active)
        setPendingDeliveryEntries(
          new Map(
            entities
              .filter((entity) => pending.has(entity.entityId))
              .map((entity) => [entity.entityId, entity.payload.entry]),
          ),
        );
    };
    void refresh().catch(() => undefined);
    const listener = () => void refresh().catch(() => undefined);
    window.addEventListener("bc-offline-data-changed", listener);
    return () => {
      active = false;
      window.removeEventListener("bc-offline-data-changed", listener);
    };
  }, [offline.scope]);
  const { merchant, isMerchant } = useAuth();
  const { currentShop, loading: shopsLoading } = useShop();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("30");
  const [sort, setSort] = useState("occurred_at:desc");
  const [pageIndex, setPageIndex] = useState(0);
  const [columnFilters, setColumnFilters] = useState<TransactionColumnFilters>({});
  const pageSize = 10;
  const shopId = currentShop?.id;
  const path = useMemo(() => {
    if (!shopId) return "";
    const params = new URLSearchParams({
      page_index: "0",
      page_size: "100",
    });
    if (search.trim()) params.set("query", search.trim());
    const filters: string[] = ["event_type:TRANSACTION"];
    const date = filterDate(range);
    if (date) {
      filters.push(`from:${date.from}`, `to:${date.to}`);
    }
    if (shopId) filters.push(`shop_id:${shopId}`);
    if (filters.length) params.set("filter", filters.join(","));
    return `/transaction-history?${params.toString()}`;
  }, [range, search, shopId]);
  const cacheKey = `transaction-history:orders:all:${shopId ?? "none"}:${range}:${search.trim()}`;
  const { data, loading, error } = useResource<TransactionHistoryEntry>(path, cacheKey, true);
  const filteredData = useMemo(
    () => data.filter((item) => item.event_type === "TRANSACTION"),
    [data],
  );
  const currency = merchant?.default_currency_code;
  const sortedData = useMemo(
    () =>
      filteredData
        .map((item) => ({ ...item, ...(pendingDeliveryEntries.get(item.id) ?? {}) }))
        .filter((item) =>
          matchesTransactionFilters(item, columnFilters, {
            currency,
            timezone: currentShop?.timezone,
            isMerchant,
            deliveryPending: pendingDeliveryEntries.has(item.id),
          }),
        )
        .sort((a, b) => {
          if (sort === "occurred_at:asc")
            return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
          if (sort === "reference:asc") return a.reference.localeCompare(b.reference);
          return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
        }),
    [
      filteredData,
      sort,
      pendingDeliveryEntries,
      columnFilters,
      currency,
      currentShop?.timezone,
      isMerchant,
    ],
  );
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const visiblePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageData = sortedData.slice(visiblePageIndex * pageSize, (visiblePageIndex + 1) * pageSize);

  return (
    <>
      <PageHeader
        eyebrow="Operations · Audit history"
        title="Transaction history"
        description="One entry per order. Open order details to review items, payments and refunds."
        action={
          <Button variant="secondary" onClick={() => window.print()}>
            Print view
          </Button>
        }
      />
      {shopsLoading ? (
        <Loading />
      ) : !shopId ? (
        <EmptyState
          icon="store"
          title="No shop selected"
          message="Select an active shop before opening Transaction History."
        />
      ) : (
        <>
          <section className="history-summary stats-grid">
            <article className="stat-card">
              <span className="stat-icon mint">
                <Icon name="history" />
              </span>
              <div>
                <p>Orders in view</p>
                <strong>{sortedData.length}</strong>
                <small>Orders matching current filters</small>
              </div>
            </article>
          </section>
          <div className="toolbar history-toolbar">
            <Button
              variant="secondary"
              disabled={!Object.values(columnFilters).some((value) => value?.trim())}
              onClick={() => {
                setColumnFilters({});
                setPageIndex(0);
              }}
            >
              Clear column filters
            </Button>
            <div className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageIndex(0);
                }}
                placeholder="Search order reference, customer or product"
                aria-label="Search transaction history"
              />
            </div>
            <select
              className="filter-select"
              value={range}
              onChange={(event) => {
                setRange(event.target.value);
                setPageIndex(0);
              }}
              aria-label="Filter transaction history by date"
            >
              <option value="1">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All dates</option>
            </select>
            <select
              className="filter-select"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPageIndex(0);
              }}
              aria-label="Sort transaction history"
            >
              <option value="occurred_at:desc">Newest first</option>
              <option value="occurred_at:asc">Oldest first</option>
              <option value="reference:asc">Reference A–Z</option>
            </select>
          </div>
          <div className="table-card history-table-card">
            {loading ? (
              <Loading />
            ) : error ? (
              <EmptyState title="Transaction history could not load" message={error} />
            ) : (
              <table className="data-table history-table history-filter-table">
                <thead>
                  <tr>
                    {transactionColumns.map((column) => (
                      <th key={column.key} scope="col">
                        <span>{column.label}</span>
                        <input
                          className="history-column-filter"
                          aria-label={`Filter ${column.label}`}
                          placeholder={`Filter ${column.label.toLowerCase()}`}
                          value={columnFilters[column.key] ?? ""}
                          onChange={(event) => {
                            setColumnFilters((current) => ({
                              ...current,
                              [column.key]: event.target.value,
                            }));
                            setPageIndex(0);
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.length === 0 && (
                    <tr>
                      <td colSpan={transactionColumns.length}>
                        <EmptyState
                          icon="history"
                          title="No orders match these filters"
                          message="Try clearing the search, date or column filters."
                        />
                      </td>
                    </tr>
                  )}
                  {pageData.map((item) => {
                    return (
                      <tr key={`${item.event_type}-${item.id}`} className="clickable-row">
                        <td>{formatShopDateTime(item.occurred_at, currentShop?.timezone)}</td>
                        <td>
                          <strong>{item.reference}</strong>
                        </td>
                        <td>
                          <div className="cell-main">
                            <strong>{item.customer_name ?? ""}</strong>
                            <small>{item.customer_phone || "No phone recorded"}</small>
                          </div>
                        </td>
                        <td>
                          <div className="cell-main">{item.product_name || "—"}</div>
                        </td>
                        <td>
                          <strong>
                            {formatMoney(item.amount, item.currency_code || currency)}
                          </strong>
                        </td>
                        <td>
                          <StatusBadge
                            status={item.payment_status || item.status}
                            label={
                              item.payment_status === "UN_PAID"
                                ? "Un-paid"
                                : item.payment_status === "COMPLETE"
                                  ? "Complete"
                                  : undefined
                            }
                          />
                        </td>
                        <td>
                          {item.delivery_payment_status ? (
                            <div className="cell-main">
                              <strong>
                                {formatMoney(item.delivery_fee, item.currency_code || currency)}
                              </strong>
                              <StatusBadge
                                status={item.delivery_payment_status}
                                label={
                                  item.delivery_payment_status === "COMPLETE"
                                    ? "Complete"
                                    : "Un-paid"
                                }
                              />
                              {pendingDeliveryEntries.has(item.id) && (
                                <small>Delivery update pending synchronization</small>
                              )}
                            </div>
                          ) : pendingDeliveryEntries.has(item.id) ? (
                            <small>Delivery update pending synchronization</small>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {item.paid_total !== undefined ? (
                            <div className="cell-main">
                              <strong>
                                {formatMoney(item.paid_total, item.currency_code || currency)}
                              </strong>
                              <small>
                                Outstanding:{" "}
                                {formatMoney(
                                  item.outstanding_total,
                                  item.currency_code || currency,
                                )}
                              </small>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                        <td>
                          <RowActionsMenu
                            label={item.reference}
                            actions={[
                              ...(isMerchant
                                ? [
                                    {
                                      label: "View detail",
                                      onClick: () => router.push(`/transaction-history/${item.id}`),
                                    },
                                  ]
                                : []),
                              { label: "View invoice", onClick: () => setManualInvoiceId(item.id) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            pageIndex={visiblePageIndex}
            pageSize={pageSize}
            totalItems={sortedData.length}
            totalPages={totalPages}
            itemLabel="orders"
            onPageChange={setPageIndex}
          />
        </>
      )}
      {invoiceId && shopId && (
        <InvoiceDetailModal
          key={`${shopId}:${invoiceId}`}
          invoiceId={invoiceId}
          onClose={() => {
            setManualInvoiceId("");
            if (params.has("invoice")) {
              const next = new URLSearchParams(params.toString());
              next.delete("invoice");
              router.replace(`/transaction-history${next.size ? `?${next}` : ""}`, {
                scroll: false,
              });
            }
          }}
        />
      )}
    </>
  );
}
