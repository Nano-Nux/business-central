"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./icons";
import { EmptyState, Loading, PageHeader, Pagination, useListPagination } from "./ui";
import { useShop } from "@/lib/shop";
import { formatMoney, formatQuantity } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { cachedApi } from "@/lib/offline-resource";
import { useTranslation } from "@/lib/i18n";
import { apiPage } from "@/lib/api";
import { loadResourcePages } from "@/lib/resource-pages";
import {
  periodRows,
  profitClass,
  reportQuery,
  type ReportDay,
  type ReportPeriod,
  type PeriodRow,
} from "@/lib/report-periods";
import { TodayOverview } from "./today-overview";
import styles from "./reports-page.module.css";

type Summary = {
  order_count: number;
  pos_order_count: number;
  repair_count: number;
  item_quantity: string;
  gross_sales: string;
  discounts: string;
  net_sales: string;
  refunds: string;
  cost_of_goods_sold: string;
  gross_profit: string;
  gross_margin_percent: string;
};

type Day = ReportDay;

type Top = {
  product_name: string;
  variant_name: string;
  sku: string;
  item_quantity: string;
  net_sales: string;
  gross_profit: string;
};

type ReportTab = {
  id: "overview" | ReportPeriod;
  label: string;
  icon: IconName;
};

const tabs: ReportTab[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "day", label: "Per day", icon: "receipt" },
  { id: "week", label: "Per week", icon: "history" },
  { id: "month", label: "Per month", icon: "box" },
  { id: "year", label: "Per year", icon: "chart" },
];

function numberValue(value?: string | number) {
  return Number(value ?? 0);
}

function reportTotal(rows: PeriodRow[]) {
  return rows.reduce(
    (total, row) => ({
      count: total.count + row.count,
      revenue: total.revenue + row.revenue,
      cogs: total.cogs + row.cogs,
      profit: total.profit + row.profit,
    }),
    { count: 0, revenue: 0, cogs: 0, profit: 0 },
  );
}

function ReportMetric({
  label,
  value,
  note,
  icon,
  profit,
}: {
  label: string;
  value: string;
  note?: string;
  icon: IconName;
  profit?: string | number;
}) {
  return (
    <article className={styles.metric}>
      <div className={styles.metricLabel}>
        <span>{label}</span>
        <Icon name={icon} size={18} />
      </div>
      <strong className={profit === undefined ? undefined : profitClass(profit)}>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function PeriodSummary({
  label,
  rows,
  currency,
  resetKey,
}: {
  label: string;
  rows: PeriodRow[];
  currency?: string;
  resetKey: string;
}) {
  const pagination = useListPagination(rows, 10, resetKey);
  const total = reportTotal(rows);
  const money = (value: number) => formatMoney(value, currency);
  return (
    <>
      <section className={styles.periodIntro}>
        <div>
          <h2>{label}</h2>
          <p>{rows.length} reporting periods &middot; Latest first</p>
        </div>
        <span className={styles.contextBadge}>
          <Icon name="chart" size={14} /> Period totals
        </span>
      </section>
      <section className={styles.periodMetrics} aria-label="Period totals">
        <ReportMetric label="Transactions" value={String(total.count)} icon="receipt" />
        <ReportMetric label="Total revenue" value={money(total.revenue)} icon="chart" />
        <ReportMetric
          label="Gross profit"
          value={money(total.profit)}
          icon="tag"
          profit={total.profit}
        />
      </section>
      {rows.length === 0 ? (
        <EmptyState
          icon="chart"
          title={`No ${label.toLowerCase()} data`}
          message="Completed transactions will appear here for the selected range."
        />
      ) : (
        <div className={`${styles.periodPanel} report-period-card`}>
          <div className="report-table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th>Transactions</th>
                  <th>Revenue</th>
                  <th>COGS</th>
                  <th className="report-profit-positive">Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td>
                      <span className={styles.transactionCount}>
                        {row.count}
                        <span className={styles.mobileCountLabel}>
                          {row.count === 1 ? " transaction" : " transactions"}
                        </span>
                      </span>
                    </td>
                    <td>{money(row.revenue)}</td>
                    <td>{money(row.cogs)}</td>
                    <td className={profitClass(row.profit)}>{money(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            {...pagination}
            itemLabel="reporting periods"
            onPageChange={pagination.setPageIndex}
          />
        </div>
      )}
    </>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { currentShop, loading: shopsLoading } = useShop();
  const { merchant, user } = useAuth();
  const [tab, setTab] = useState<ReportTab["id"]>("overview");
  const [bounds, setBounds] = useState<Record<ReportTab["id"], { start: string; end: string }>>({
    overview: { start: "", end: "" },
    day: { start: "", end: "" },
    week: { start: "", end: "" },
    month: { start: "", end: "" },
    year: { start: "", end: "" },
  });
  const [loadedQuery, setLoadedQuery] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [top, setTop] = useState<Top[]>([]);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const shopId = currentShop?.id;
  const period = tab === "overview" ? "day" : tab;
  const { start, end } = bounds[tab];
  const queryState = useMemo(() => {
    try {
      return { query: reportQuery(period, start, end, shopId ?? ""), error: "" };
    } catch (error) {
      return { query: "", error: error instanceof Error ? error.message : "Invalid range." };
    }
  }, [period, start, end, shopId]);
  const loading = loadedQuery !== queryState.query;
  const resetKey = `${tab}:${shopId}:${start}:${end}`;
  const chartPagination = useListPagination(days, 10, resetKey);
  const topPagination = useListPagination(top, 10, resetKey);
  const scope = useMemo(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );

  useEffect(() => {
    let active = true;
    if (shopsLoading || !shopId || queryState.error)
      return () => {
        active = false;
      };
    const query = queryState.query;
    const cachePrefix = `reports:v2:${shopId}:${query}`;
    // Fetch every backend page before grouping, and cache only complete datasets.
    const readAll = async <T,>(path: string) =>
      (await loadResourcePages<T>(path, true, apiPage)).data;
    Promise.all([
      cachedApi<Summary>(scope, `/reports/sales-summary${query}`, `${cachePrefix}:summary`),
      cachedApi<Day[]>(
        scope,
        `${`/reports/sales-by-day${query}`}&page_index=0&page_size=100`,
        `${cachePrefix}:days`,
        readAll<Day>,
      ),
      cachedApi<Top[]>(
        scope,
        `${`/reports/top-products${query}`}&page_index=0&page_size=100`,
        `${cachePrefix}:top`,
        readAll<Top>,
      ),
    ])
      .then(([nextSummary, nextDays, nextTop]) => {
        if (!active) return;
        setSummary(nextSummary.data);
        setDays([...nextDays.data].sort((a, b) => b.day.localeCompare(a.day)));
        setTop(nextTop.data);
        setCachedAt(
          [nextSummary.cachedAt, nextDays.cachedAt, nextTop.cachedAt]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(0) ?? null,
        );
        setError("");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Reports could not load.");
      })
      .finally(() => {
        if (active) setLoadedQuery(query);
      });
    return () => {
      active = false;
    };
  }, [queryState, scope, shopId, shopsLoading]);

  const money = (value?: string | number) => formatMoney(value, merchant?.default_currency_code, 0);
  const maximum = Math.max(...days.map((day) => numberValue(day.net_sales)), 1);
  const rows = useMemo(() => periodRows(days, period), [days, period]);
  const periodLabel =
    period === "day"
      ? "Daily Summary"
      : period === "week"
        ? "Weekly Summary"
        : period === "month"
          ? "Monthly Summary"
          : "Yearly Summary";
  const inputType = period === "year" ? "number" : period === "day" ? "date" : period;
  const updateBound = (name: "start" | "end", value: string) =>
    setBounds((current) => ({
      ...current,
      [tab]: { ...current[tab], [name]: value },
    }));

  return (
    <div className={styles.reports}>
      <PageHeader
        eyebrow={t("reports.eyebrow")}
        title={t("reports.financial_reports")}
        description={t("reports.financial_reports_desc")}
        action={
          <div className="report-actions">
            <Link className="button button-secondary" href="/transaction-history">
              <Icon name="history" size={17} />
              {t("reports.transaction_history")}
            </Link>
          </div>
        }
      />
      <section className={styles.toolbar}>
        <div className="report-tabs" role="tablist" aria-label="Financial report views">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
              role="tab"
              aria-selected={tab === item.id}
            >
              <Icon name={item.icon} size={17} />
              {item.id === "overview"
                ? t("reports.overview")
                : item.id === "day"
                  ? t("reports.per_day")
                  : item.id === "week"
                    ? t("reports.per_week")
                    : item.id === "month"
                      ? t("reports.per_month")
                      : t("reports.per_year", "Per year")}
            </button>
          ))}
        </div>
        <div className={styles.filterBar}>
          <div className={styles.filterContext}>
            <Icon name="history" size={17} />
            <span>
              {start || end ? "Custom range" : "All dates"}
              <small>{currentShop?.name ?? "Selected shop"}</small>
            </span>
          </div>
          <div className={styles.dateControls}>
            {(["start", "end"] as const).map((name) => (
              <label className={styles.dateField} key={`${tab}:${name}`}>
                <span>
                  {name === "start" ? "Start" : "End"} {period}
                </span>
                <input
                  className="filter-select"
                  type={inputType}
                  aria-label={`${name === "start" ? "Start" : "End"} ${period}`}
                  value={name === "start" ? start : end}
                  min={period === "year" ? 1 : undefined}
                  max={period === "year" ? 9998 : undefined}
                  placeholder={period === "year" ? "YYYY" : undefined}
                  onChange={(event) => updateBound(name, event.target.value)}
                />
              </label>
            ))}
            {(start || end) && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  setBounds((current) => ({ ...current, [tab]: { start: "", end: "" } }))
                }
              >
                All dates
              </button>
            )}
          </div>
        </div>
      </section>
      {cachedAt && (
        <p className="offline-snapshot-notice" role="status">
          Offline snapshot saved{" "}
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(cachedAt))}
        </p>
      )}
      {queryState.error ? (
        <p role="alert">{queryState.error}</p>
      ) : shopsLoading ? (
        <Loading />
      ) : !shopId ? (
        <EmptyState
          icon="store"
          title="No shop selected"
          message="Select an active shop before opening Financial Reports."
        />
      ) : loading ? (
        <Loading />
      ) : error ? (
        <EmptyState title="Reports could not load" message={error} />
      ) : tab === "overview" ? (
        <>
          <TodayOverview key={`${user?.merchant_id}:${user?.membership_id}:${shopId}`} />
          <section className={styles.overviewMetrics}>
            <ReportMetric
              label={t("reports.gross_sales")}
              value={money(summary?.gross_sales)}
              note="Total sales income"
              icon="chart"
            />
            <ReportMetric
              label={t("reports.net_profit")}
              value={money(summary?.gross_profit)}
              note={`${summary?.gross_margin_percent ?? 0}% gross margin`}
              icon="tag"
              profit={summary?.gross_profit}
            />
            <ReportMetric
              label={t("reports.cost_of_goods_sold")}
              value={money(summary?.cost_of_goods_sold)}
              note="FIFO inventory cost"
              icon="box"
            />
            <ReportMetric
              label={t("reports.orders_count")}
              value={String(summary?.order_count ?? 0)}
              note={`${formatQuantity(summary?.item_quantity)} items`}
              icon="receipt"
            />
          </section>
          <section className={`${styles.breakdown} report-breakdown card`}>
            <div className="card-head">
              <div>
                <h2>Financial breakdown summary</h2>
                <p>Authoritative totals for the selected reporting period</p>
              </div>
            </div>
            <div className="breakdown-list">
              <div>
                <span>All-channel order count</span>
                <strong>{summary?.order_count ?? 0}</strong>
              </div>
              <div>
                <span>Total POS sales count</span>
                <strong>{summary?.pos_order_count ?? 0}</strong>
              </div>
              <div>
                <span>Repairs completed</span>
                <strong>{summary?.repair_count ?? 0}</strong>
              </div>
              <div>
                <span>Refunds processed</span>
                <strong>{money(summary?.refunds)}</strong>
              </div>
              <div>
                <span>Gross profit (revenue − COGS − refunds)</span>
                <strong className={profitClass(summary?.gross_profit)}>
                  {money(summary?.gross_profit)}
                </strong>
              </div>
            </div>
          </section>
          <section className={styles.overviewGrid}>
            <article className={`${styles.overviewPanel} card`}>
              <div className="card-head">
                <div>
                  <h2>Sales analysis</h2>
                  <p>Net sales and gross profit by day</p>
                </div>
                <span className={styles.contextBadge}>Latest first</span>
              </div>
              {days.length ? (
                <div className={styles.salesList}>
                  {chartPagination.pageItems.map((day) => (
                    <div className={styles.salesRow} key={day.day}>
                      <div className={styles.salesDate}>
                        {new Intl.DateTimeFormat("en", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(day.day))}
                      </div>
                      <div className={styles.salesTrack} aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.max(1, (numberValue(day.net_sales) / maximum) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className={styles.salesAmounts}>
                        <strong>{money(day.net_sales)}</strong>
                        <small className={profitClass(day.gross_profit)}>
                          {money(day.gross_profit)} profit
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="chart"
                  title="No sales in this period"
                  message="Complete a POS sale to start seeing your sales analysis."
                />
              )}
              <Pagination
                {...chartPagination}
                itemLabel="sales days"
                onPageChange={chartPagination.setPageIndex}
              />
            </article>
            <article className={`${styles.overviewPanel} card`}>
              <div className="card-head">
                <div>
                  <h2>Top products</h2>
                  <p>Ranked by net sales</p>
                </div>
              </div>
              {top.length ? (
                <div className="rank-list">
                  {topPagination.pageItems.map((item, index) => (
                    <div className="rank-item" key={item.sku}>
                      <span>{topPagination.pageIndex * topPagination.pageSize + index + 1}</span>
                      <div>
                        <strong>{item.product_name}</strong>
                        <small>
                          {item.variant_name} · {formatQuantity(item.item_quantity)} sold
                        </small>
                      </div>
                      <b>{money(item.net_sales)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="box"
                  title="No product data"
                  message="Product performance will appear after sales."
                />
              )}
              <Pagination
                {...topPagination}
                itemLabel="products"
                onPageChange={topPagination.setPageIndex}
              />
            </article>
          </section>
        </>
      ) : (
        <PeriodSummary
          label={periodLabel}
          rows={rows}
          currency={merchant?.default_currency_code}
          resetKey={resetKey}
        />
      )}
    </div>
  );
}
