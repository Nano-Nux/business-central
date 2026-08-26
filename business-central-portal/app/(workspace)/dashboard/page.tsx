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
          <Link href="/pos" className="button button-primary">
            <Icon name="cart" size={18} />
            Open POS
          </Link>
        }
      />
      {error && (
        <div className="form-error">
          <Icon name="close" size={16} />
          {error}
        </div>
      )}
      {cachedAt && (
        <p className="offline-snapshot-notice" role="status">
          Offline snapshot saved{" "}
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(cachedAt))}
        </p>
      )}
      <section className="stats-grid">
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
      <section className="grid-2">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Sales rhythm</h2>
              <p>Your last seven trading days</p>
            </div>
            {isMerchant && <Link href="/reports">See report →</Link>}
          </div>
          {days.length === 0 ? (
            <EmptyState
              icon="chart"
              title="No sales in the last seven days"
              message="Completed POS orders will build this chart."
            />
          ) : (
            <div className="chart-wrap">
              {days.map((day, index) => (
                <div
                  className={`chart-col ${index === days.length - 1 ? "active" : ""}`}
                  key={day.day}
                >
                  <i
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
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Right now</h2>
              <p>Live tenant data</p>
            </div>
          </div>
          <div className="activity-list">
            <div className="activity">
              <span className="activity-icon">
                <Icon name="cart" size={16} />
              </span>
              <div>
                <strong>{summary?.order_count ?? 0} sales completed</strong>
                <small>{money(summary?.net_sales)} in net sales today</small>
              </div>
              <strong>Today</strong>
            </div>
            <div className="activity">
              <span className="activity-icon">
                <Icon name="package" size={16} />
              </span>
              <div>
                <strong>Inventory ledger</strong>
                <small>Review receipts, sales and adjustments</small>
              </div>
              <Link className="text-link" href="/stock-movements">
                View
              </Link>
            </div>
            <div className="activity">
              <span className="activity-icon">
                <Icon name="repair" size={16} />
              </span>
              <div>
                <strong>{activeRepairs.length} active repairs</strong>
                <small>
                  {activeRepairs.filter((repair) => repair.status.includes("WAIT")).length} waiting
                </small>
              </div>
              <Link className="text-link" href="/repairs">
                Open
              </Link>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
