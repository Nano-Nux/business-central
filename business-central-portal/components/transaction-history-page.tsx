"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { Button, EmptyState, Loading, PageHeader, Pagination, StatusBadge } from "./ui";
import { useAuth } from "@/lib/auth";
import { useShop } from "@/lib/shop";
import { useResource } from "@/lib/use-resource";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import type { TransactionHistoryEntry } from "@/lib/types";

const eventLabels: Record<string, string> = {
  TRANSACTION: "Transaction",
  REFUND: "Refund",
  STOCK_IN: "Stock in",
  STOCK_OUT: "Stock out",
  STOCK_RETURN: "Stock return",
  STOCK_TRANSFER: "Stock transfer",
  STOCK_ADJUSTMENT: "Stock adjustment",
  REPAIR_CHECKOUT: "Repair checkout",
};

function filterDate(range: string) {
  if (range === "all") return null;
  const to = new Date();
  const from = new Date(to);
  if (range === "1") from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - Number(range));
  return { from: from.toISOString(), to: to.toISOString() };
}

function eventIcon(eventType: string) {
  if (eventType.startsWith("STOCK")) return "package" as const;
  if (eventType === "REPAIR_CHECKOUT") return "repair" as const;
  if (eventType === "REFUND") return "swap" as const;
  return "receipt" as const;
}

export function TransactionHistoryPage() {
  const { merchant, isMerchant } = useAuth();
  const { currentShop, loading: shopsLoading } = useShop();
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [range, setRange] = useState("30");
  const [sort, setSort] = useState("occurred_at:desc");
  const [pageIndex, setPageIndex] = useState(0);
  const shopId = currentShop?.id;
  const path = useMemo(() => {
    if (!shopId) return "";
    const params = new URLSearchParams({
      page_index: String(pageIndex),
      page_size: "10",
    });
    if (search.trim()) params.set("query", search.trim());
    const filters: string[] = [];
    if (eventType) filters.push(`event_type:${eventType}`);
    const date = filterDate(range);
    if (date) {
      filters.push(`from:${date.from}`, `to:${date.to}`);
    }
    if (shopId) filters.push(`shop_id:${shopId}`);
    if (filters.length) params.set("filter", filters.join(","));
    return `/transaction-history?${params.toString()}`;
  }, [eventType, pageIndex, range, search, shopId]);
  const cacheKey = `transaction-history:${shopId ?? "none"}:${range}:${eventType}:${search.trim()}:${pageIndex}`;
  const { data, loading, error, meta } = useResource<TransactionHistoryEntry>(path, cacheKey);
  const currency = merchant?.default_currency_code;
  const sortedData = useMemo(
    () =>
      [...data].sort((a, b) => {
        if (sort === "occurred_at:asc")
          return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
        if (sort === "event_type:asc") return a.event_type.localeCompare(b.event_type);
        if (sort === "reference:asc") return a.reference.localeCompare(b.reference);
        return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      }),
    [data, sort],
  );
  const transactionCount = data.filter((item) => item.event_type === "TRANSACTION").length;
  const stockCount = data.filter((item) => item.event_type.startsWith("STOCK")).length;
  const repairCount = data.filter((item) => item.event_type === "REPAIR_CHECKOUT").length;

  return (
    <>
      <PageHeader
        eyebrow="Operations · Audit history"
        title="Transaction history"
        description="One chronological view of stock activity, sales, refunds and repair checkout payments."
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
                <p>Records in view</p>
                <strong>{data.length}</strong>
                <small>Latest operational events</small>
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon blue">
                <Icon name="receipt" />
              </span>
              <div>
                <p>Transactions</p>
                <strong>{transactionCount}</strong>
                <small>Canonical sales orders</small>
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon amber">
                <Icon name="package" />
              </span>
              <div>
                <p>Stock events</p>
                <strong>{stockCount}</strong>
                <small>In, out, return and adjustment</small>
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon purple">
                <Icon name="repair" />
              </span>
              <div>
                <p>Repair checkouts</p>
                <strong>{repairCount}</strong>
                <small>Deposits and final payments</small>
              </div>
            </article>
          </section>
          <div className="toolbar history-toolbar">
            <div className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageIndex(0);
                }}
                placeholder="Search reference, customer, product or event…"
                aria-label="Search transaction history"
              />
            </div>
            <select
              className="filter-select"
              value={eventType}
              onChange={(event) => {
                setEventType(event.target.value);
                setPageIndex(0);
              }}
              aria-label="Filter transaction history by event"
            >
              <option value="">All activity</option>
              <option value="TRANSACTION">Transactions</option>
              <option value="REFUND">Refunds</option>
              <option value="STOCK_IN">Stock in</option>
              <option value="STOCK_OUT">Stock out</option>
              <option value="REPAIR_CHECKOUT">Repair checkout</option>
            </select>
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
              <option value="event_type:asc">Activity type</option>
              <option value="reference:asc">Reference A–Z</option>
            </select>
          </div>
          <div className="table-card history-table-card">
            {loading ? (
              <Loading />
            ) : error ? (
              <EmptyState title="Transaction history could not load" message={error} />
            ) : data.length === 0 ? (
              <EmptyState
                icon="history"
                title="No activity matches these filters"
                message="Stock events, sales, refunds and repair checkout payments will appear here."
              />
            ) : (
              <table className="data-table history-table">
                <thead>
                  <tr>
                    <th>Date & time</th>
                    <th>Activity</th>
                    <th>Reference</th>
                    <th>Customer / details</th>
                    <th>Product / item</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((item) => {
                    const product = [item.product_name, item.variant_name]
                      .filter(Boolean)
                      .join(" · ");
                    const amountLabel = item.amount
                      ? formatMoney(item.amount, item.currency_code || currency)
                      : "—";
                    return (
                      <tr key={`${item.event_type}-${item.id}`} className="clickable-row">
                        <td>
                          {formatShopDateTime(item.occurred_at, currentShop?.timezone)}
                        </td>
                        <td>
                          <div className="history-event-cell">
                            <span className="history-event-icon">
                              <Icon name={eventIcon(item.event_type)} size={15} />
                            </span>
                            <strong>{eventLabels[item.event_type] ?? item.event_type}</strong>
                          </div>
                        </td>
                        <td>
                          <strong>{item.reference}</strong>
                          {item.channel && <small>{item.channel}</small>}
                        </td>
                        <td>
                          <div className="cell-main">
                            <strong>{item.customer_name || "Walk-in / not recorded"}</strong>
                            <small>{item.customer_phone || item.details || "—"}</small>
                          </div>
                        </td>
                        <td>
                          <div className="cell-main">
                            <strong>{product || item.details || "—"}</strong>
                            <small>{item.sku || item.payment_method || ""}</small>
                          </div>
                        </td>
                        <td>{item.quantity ? formatQuantity(item.quantity) : "—"}</td>
                        <td>
                          <div className="cell-main history-value-cell">
                            <strong>{amountLabel}</strong>
                            {item.event_type.startsWith("STOCK") && item.amount && (
                              <small>
                                {item.event_type === "STOCK_OUT" ? "COGS" : "Unit cost"}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                          {isMerchant && (
                            <Link className="text-link" href={`/transaction-history/${item.id}`}>
                              View detail
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            pageIndex={pageIndex}
            pageSize={meta?.page_size ?? 10}
            totalItems={meta?.total ?? data.length}
            totalPages={meta?.total_pages ?? 1}
            itemLabel="records"
            onPageChange={setPageIndex}
          />
        </>
      )}
    </>
  );
}
