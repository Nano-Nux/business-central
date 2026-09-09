"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { RepairOrder } from "@/lib/types";
import { useShop } from "@/lib/shop";
import { formatMoney } from "@/lib/currency";
import { cachedApi } from "@/lib/offline-resource";

type Summary = {
  order_count: number;
  item_quantity: string;
  net_sales: string;
  gross_profit: string;
  gross_margin_percent: string;
};
type Day = { day: string; net_sales: string };

export default function DashboardPage() {
  const { user, isMerchant, merchant } = useAuth();
  const { currentShop } = useShop();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [repairs, setRepairs] = useState<RepairOrder[]>([]);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const scope = useMemo(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );
  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const shop = currentShop ? `&shop_id=${encodeURIComponent(currentShop.id)}` : "";
    const today = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(now.toISOString())}${shop}`;
    const cachePrefix = `dashboard:${currentShop?.id ?? "all"}`;
    Promise.all([
      cachedApi<Summary>(scope, `/reports/sales-summary${today}`, `${cachePrefix}:today`),
      cachedApi<Day[]>(
        scope,
        `/reports/sales-by-day?from=${encodeURIComponent(new Date(Date.now() - 6 * 86400000).toISOString())}&to=${encodeURIComponent(now.toISOString())}${shop}&page_index=0&page_size=7`,
        `${cachePrefix}:seven-days`,
      ),
      currentShop?.module_codes?.includes("repair")
        ? cachedApi<RepairOrder[]>(
            scope,
            `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${encodeURIComponent(currentShop.id)}`,
            `${cachePrefix}:repairs`,
          )
        : Promise.resolve({ data: [] as RepairOrder[], cachedAt: null }),
    ])
      .then(([nextSummary, nextDays, nextRepairs]) => {
        setSummary(nextSummary.data);
        setDays(nextDays.data);
        setRepairs(nextRepairs.data);
        setCachedAt(
          [nextSummary.cachedAt, nextDays.cachedAt, nextRepairs.cachedAt]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(0) ?? null,
        );
        setError("");
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Today’s dashboard could not load."),
      );
  }, [currentShop, scope]);
  const money = (value?: string) => formatMoney(value, merchant?.default_currency_code, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const maximum = Math.max(...days.map((day) => Number(day.net_sales)), 1);
  const activeRepairs = repairs.filter(
    (repair) => !["COMPLETED", "REFUNDED"].includes(repair.status),
  );

  return (
    <>
      <PageHeader
        eyebrow={isMerchant ? "Merchant dashboard" : "Staff dashboard"}
        title={`${greeting}, ${user?.display_name.split(" ")[0] ?? "there"}`}
        description={
          isMerchant
            ? "Here’s how your business is moving today."
            : "Here’s what is happening at your assigned shop today."
        }
        action={
          <Link
            href="/pos"
            className="button button-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ink text-paper text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="cart" size={18} />
            Open POS
          </Link>
        }
      />
      {error && (
        <div className="form-error flex items-center gap-2 p-3 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger border border-status-danger-border mb-6">
          <Icon name="close" size={16} />
          {error}
        </div>
      )}
      {cachedAt && (
        <p
          className="offline-snapshot-notice text-xs text-muted mb-4 px-3 py-1.5 rounded-lg bg-canvas border border-line inline-block"
          role="status"
        >
          Offline snapshot saved{" "}
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(cachedAt))}
        </p>
      )}
      <section className="stats-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Net sales today"
          value={money(summary?.net_sales)}
          note={`${summary?.order_count ?? 0} completed orders`}
          icon="chart"
          tone="mint"
        />
        <StatCard
          label="Orders"
          value={String(summary?.order_count ?? 0)}
          note={`${summary?.item_quantity ?? "0"} items sold`}
          icon="receipt"
          tone="blue"
        />
        <StatCard
          label="Gross profit"
          value={money(summary?.gross_profit)}
          note={`${summary?.gross_margin_percent ?? "0"}% margin`}
          icon="tag"
          tone="amber"
        />
        <StatCard
          label="Repairs in progress"
          value={String(activeRepairs.length)}
          note={`${repairs.length} total repair tickets`}
          icon="repair"
          tone="purple"
        />
      </section>
      <section className="grid-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <article className="card bg-paper border border-line rounded-2xl p-5 shadow-xs">
          <div className="card-head flex items-start justify-between gap-4 mb-4 pb-3 border-b border-line">
            <div>
              <h2 className="text-base font-bold text-ink m-0">Sales rhythm</h2>
              <p className="text-xs text-muted m-0 mt-0.5">Your last seven trading days</p>
            </div>
            {isMerchant && (
              <Link className="text-xs font-semibold text-ink hover:underline" href="/reports">
                See report →
              </Link>
            )}
          </div>
          {days.length === 0 ? (
            <EmptyState
              icon="chart"
              title="No sales in the last seven days"
              message="Completed POS orders will build this chart."
            />
          ) : (
            <div className="chart-wrap flex items-end justify-between gap-2 h-44 pt-6 px-2">
              {days.map((day, index) => (
                <div
                  className={`chart-col flex-1 flex flex-col items-center justify-end h-full gap-2 text-[11px] text-muted ${
                    index === days.length - 1 ? "active text-ink font-bold" : ""
                  }`}
                  key={day.day}
                >
                  <i
                    className={`w-full max-w-[28px] rounded-t-md transition-all ${
                      index === days.length - 1
                        ? "bg-ink"
                        : "bg-theme-gray-300 hover:bg-theme-gray-400"
                    }`}
                    style={{
                      height: `${Math.max(3, (Number(day.net_sales) / maximum) * 88)}%`,
                    }}
                  />
                  <span>
                    {new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(day.day))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="card bg-paper border border-line rounded-2xl p-5 shadow-xs">
          <div className="card-head flex items-start justify-between gap-4 mb-4 pb-3 border-b border-line">
            <div>
              <h2 className="text-base font-bold text-ink m-0">Right now</h2>
              <p className="text-xs text-muted m-0 mt-0.5">Live tenant data</p>
            </div>
          </div>
          <div className="activity-list space-y-3">
            <div className="activity flex items-center gap-3 p-3 rounded-xl bg-canvas border border-line">
              <span className="activity-icon flex items-center justify-center w-8 h-8 rounded-lg bg-paper text-ink border border-line shrink-0">
                <Icon name="cart" size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <strong className="block text-xs font-bold text-ink truncate">
                  {summary?.order_count ?? 0} sales completed
                </strong>
                <small className="block text-[11px] text-muted truncate">
                  {money(summary?.net_sales)} in net sales today
                </small>
              </div>
              <strong className="text-xs font-semibold text-muted">Today</strong>
            </div>
            <div className="activity flex items-center gap-3 p-3 rounded-xl bg-canvas border border-line">
              <span className="activity-icon flex items-center justify-center w-8 h-8 rounded-lg bg-paper text-ink border border-line shrink-0">
                <Icon name="package" size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <strong className="block text-xs font-bold text-ink truncate">
                  Inventory ledger
                </strong>
                <small className="block text-[11px] text-muted truncate">
                  Review receipts, sales and adjustments
                </small>
              </div>
              <Link
                className="text-link text-xs font-semibold text-ink underline hover:opacity-80"
                href="/stock-movements"
              >
                View
              </Link>
            </div>
            <div className="activity flex items-center gap-3 p-3 rounded-xl bg-canvas border border-line">
              <span className="activity-icon flex items-center justify-center w-8 h-8 rounded-lg bg-paper text-ink border border-line shrink-0">
                <Icon name="repair" size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <strong className="block text-xs font-bold text-ink truncate">
                  {activeRepairs.length} active repairs
                </strong>
                <small className="block text-[11px] text-muted truncate">
                  {activeRepairs.filter((repair) => repair.status.includes("WAIT")).length} waiting
                </small>
              </div>
              <Link
                className="text-link text-xs font-semibold text-ink underline hover:opacity-80"
                href="/repairs"
              >
                Open
              </Link>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
