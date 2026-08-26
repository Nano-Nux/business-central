"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "./icons";
import { EmptyState, Loading, PageHeader, StatCard } from "./ui";
import { useShop } from "@/lib/shop";
import { formatMoney } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { cachedApi } from "@/lib/offline-resource";

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

type Day = {
  day: string;
  order_count: number;
  net_sales: string;
  cost_of_goods_sold: string;
  gross_profit: string;
};

type Top = {
  product_name: string;
  variant_name: string;
  sku: string;
  item_quantity: string;
  net_sales: string;
  gross_profit: string;
};

type PeriodRow = {
  label: string;
  count: number;
  revenue: number;
  cogs: number;
  profit: number;
};

type ReportTab = {
  id: "overview" | "day" | "week" | "month";
  label: string;
  icon: IconName;
};

const tabs: ReportTab[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "day", label: "Per day", icon: "receipt" },
  { id: "week", label: "Per week", icon: "history" },
  { id: "month", label: "Per month", icon: "box" },
];

function numberValue(value?: string | number) {
  return Number(value ?? 0);
}

function rangeQuery(range: string, shopId?: string) {
  const to = new Date();
  const from = new Date(to);
  if (range === "1") {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - Number(range));
  }
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (shopId) params.set("shop_id", shopId);
  return `?${params.toString()}`;
}

function periodRows(days: Day[], period: "week" | "month") {
  const grouped = new Map<string, PeriodRow>();
  for (const day of days) {
    const date = new Date(day.day);
    let key: string;
    if (period === "month") {
      key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
    } else {
      const monday = new Date(date);
      const offset = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - offset);
      key = monday.toISOString().slice(0, 10);
    }
    const current = grouped.get(key) ?? {
      label: key,
      count: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
    };
    current.count += day.order_count;
    current.revenue += numberValue(day.net_sales);
    current.cogs += numberValue(day.cost_of_goods_sold);
    current.profit += numberValue(day.gross_profit);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.label.localeCompare(a.label))
    .map((row) => ({
      ...row,
      label:
        period === "month"
          ? new Intl.DateTimeFormat("en", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${row.label}T00:00:00Z`))
          : (() => {
              const start = new Date(`${row.label}T00:00:00Z`);
              const end = new Date(start);
              end.setUTCDate(end.getUTCDate() + 6);
              const formatter = new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              });
              return `${formatter.format(start)} – ${formatter.format(end)}`;
            })(),
    }));
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

function PeriodSummary({
  label,
  rows,
  currency,
}: {
  label: string;
  rows: PeriodRow[];
  currency?: string;
}) {
  const total = reportTotal(rows);
  const money = (value: number) => formatMoney(value, currency);
  return (
    <>
      <article className="report-summary-banner">
        <div>
          <strong>{label}</strong>
          <small>{rows.length} reporting periods</small>
        </div>
        <div className="report-summary-metrics">
          <span>
            <small>Transactions</small>
            <b>{total.count}</b>
          </span>
          <span>
            <small>Total revenue</small>
            <b>{money(total.revenue)}</b>
          </span>
          <span>
            <small>Total profit</small>
            <b>{money(total.profit)}</b>
          </span>
        </div>
      </article>
      {rows.length === 0 ? (
        <EmptyState
          icon="chart"
          title={`No ${label.toLowerCase()} data`}
          message="Completed transactions will appear here for the selected range."
        />
      ) : (
        <div className="report-period-card">
          <div className="report-table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>{label.replace(" Summary", "")}</th>
                  <th>Transactions</th>
                  <th>Revenue</th>
                  <th>COGS</th>
                  <th>Gross profit</th>
                  <th>Average order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td>{row.count}</td>
                    <td className="amount-positive">{money(row.revenue)}</td>
                    <td className="amount-negative">{money(row.cogs)}</td>
                    <td className="amount-positive">{money(row.profit)}</td>
                    <td>{money(row.count ? row.revenue / row.count : 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{total.count}</td>
                  <td>{money(total.revenue)}</td>
                  <td>{money(total.cogs)}</td>
                  <td>{money(total.profit)}</td>
                  <td>{money(total.count ? total.revenue / total.count : 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function ReportsPage() {
  const { currentShop, loading: shopsLoading } = useShop();
  const { merchant, user } = useAuth();
  const [range, setRange] = useState("7");
  const [tab, setTab] = useState<ReportTab["id"]>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [top, setTop] = useState<Top[]>([]);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const shopId = currentShop?.id;
  const scope = useMemo(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );

  useEffect(() => {
    let active = true;
    if (shopsLoading || !shopId)
      return () => {
        active = false;
      };
    const query = rangeQuery(range, shopId);
    const cachePrefix = `reports:${shopId}:${range}`;
    Promise.all([
      cachedApi<Summary>(scope, `/reports/sales-summary${query}`, `${cachePrefix}:summary`),
      cachedApi<Day[]>(
        scope,
        `${`/reports/sales-by-day${query}`}&page_index=0&page_size=100`,
        `${cachePrefix}:days`,
      ),
      cachedApi<Top[]>(
        scope,
        `${`/reports/top-products${query}`}&page_index=0&page_size=5`,
        `${cachePrefix}:top`,
      ),
    ])
      .then(([nextSummary, nextDays, nextTop]) => {
        if (!active) return;
        setSummary(nextSummary.data);
        setDays(nextDays.data);
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
      });
    return () => {
      active = false;
    };
  }, [range, scope, shopId, shopsLoading]);

  const money = (value?: string | number) => formatMoney(value, merchant?.default_currency_code, 0);
  const maximum = Math.max(...days.map((day) => numberValue(day.net_sales)), 1);
  const dailyRows = useMemo(
    () =>
      days.map((day) => ({
        label: new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(new Date(day.day)),
        count: day.order_count,
        revenue: numberValue(day.net_sales),
        cogs: numberValue(day.cost_of_goods_sold),
        profit: numberValue(day.gross_profit),
      })),
    [days],
  );
  const weeklyRows = useMemo(() => periodRows(days, "week"), [days]);
  const monthlyRows = useMemo(() => periodRows(days, "month"), [days]);

  return (
    <>
      <PageHeader
        eyebrow="Insights · Financial reports"
        title="Financial Reports"
        description="Financial performance across every module and transaction channel for your selected shop."
        action={
          <div className="report-actions">
            <select
              className="filter-select"
              value={range}
              onChange={(event) => setRange(event.target.value)}
              aria-label="Report date range"
            >
              <option value="1">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <Link className="button button-secondary" href="/transaction-history">
              <Icon name="history" size={17} />
              Transaction history
            </Link>
          </div>
        }
      />
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
            {item.label}
          </button>
        ))}
      </div>
      {cachedAt && (
        <p className="offline-snapshot-notice" role="status">
          Offline snapshot saved{" "}
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(cachedAt))}
        </p>
      )}
      {shopsLoading ? (
        <Loading />
      ) : !shopId ? (
        <EmptyState
          icon="store"
          title="No shop selected"
          message="Select an active shop before opening Financial Reports."
        />
      ) : error ? (
        <EmptyState title="Reports could not load" message={error} />
      ) : tab === "overview" ? (
        <>
          <section className="stats-grid">
            <StatCard
              label="Gross revenue"
              value={money(summary?.gross_sales)}
              note="Total sales income"
              icon="chart"
            />
            <StatCard
              label="Net profit"
              value={money(summary?.gross_profit)}
              note={`${summary?.gross_margin_percent ?? 0}% gross margin`}
              icon="tag"
              tone="amber"
            />
            <StatCard
              label="Cost of goods"
              value={money(summary?.cost_of_goods_sold)}
              note="FIFO inventory cost"
              icon="box"
              tone="blue"
            />
            <StatCard
              label="Orders in period"
              value={String(summary?.order_count ?? 0)}
              note={`${summary?.item_quantity ?? 0} items across all modules`}
              icon="receipt"
              tone="purple"
            />
          </section>
          <section className="report-breakdown card">
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
                <strong className="amount-positive">{money(summary?.gross_profit)}</strong>
              </div>
            </div>
          </section>
          <section className="grid-2 reports-grid">
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Sales analysis</h2>
                  <p>Net sales and gross profit by day</p>
                </div>
                <div className="chart-legend">
                  <span>
                    <i />
                    Net sales
                  </span>
                  <span>
                    <i className="profit" />
                    Gross profit
                  </span>
                </div>
              </div>
              {days.length ? (
                <div className="report-chart">
                  {days.map((day) => (
                    <div className="report-bar" key={day.day}>
                      <div>
                        <i
                          style={{
                            height: `${Math.max(3, (numberValue(day.net_sales) / maximum) * 100)}%`,
                          }}
                        />
                        <b
                          style={{
                            height: `${Math.max(2, (numberValue(day.gross_profit) / maximum) * 100)}%`,
                          }}
                        />
                      </div>
                      <span>
                        {new Intl.DateTimeFormat("en", {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        }).format(new Date(day.day))}
                      </span>
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
            </article>
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Top products</h2>
                  <p>Ranked by net sales</p>
                </div>
              </div>
              {top.length ? (
                <div className="rank-list">
                  {top.map((item, index) => (
                    <div className="rank-item" key={item.sku}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.product_name}</strong>
                        <small>
                          {item.variant_name} · {item.item_quantity} sold
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
            </article>
          </section>
        </>
      ) : tab === "day" ? (
        <PeriodSummary
          label="Daily Summary"
          rows={dailyRows}
          currency={merchant?.default_currency_code}
        />
      ) : tab === "week" ? (
        <PeriodSummary
          label="Weekly Summary"
          rows={weeklyRows}
          currency={merchant?.default_currency_code}
        />
      ) : (
        <PeriodSummary
          label="Monthly Summary"
          rows={monthlyRows}
          currency={merchant?.default_currency_code}
        />
      )}
    </>
  );
}
