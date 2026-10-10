export type ReportPeriod = "day" | "week" | "month" | "year";

export type ReportDay = {
  day: string;
  order_count: number;
  net_sales: string;
  cost_of_goods_sold: string;
  gross_profit: string;
};

export type PeriodRow = {
  key: string;
  label: string;
  count: number;
  revenue: number;
  cogs: number;
  profit: number;
};

function boundary(value: string, period: ReportPeriod): Date {
  let date: Date;
  if (period === "week") {
    const match = /^(\d{4})-W(\d{2})$/.exec(value);
    if (!match) throw new Error("Choose a valid week.");
    const year = Number(match[1]);
    const week = Number(match[2]);
    date = new Date(`${match[1]}-01-04T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + (week - 1) * 7);
    const thursday = new Date(date);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    if (week < 1 || week > 53 || thursday.getUTCFullYear() !== year)
      throw new Error("Choose a valid week.");
  } else {
    const pattern =
      period === "year" ? /^\d{4}$/ : period === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(value)) throw new Error(`Choose a valid ${period}.`);
    const full = period === "year" ? `${value}-01-01` : period === "month" ? `${value}-01` : value;
    date = new Date(`${full}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== full)
      throw new Error(`Choose a valid ${period}.`);
  }
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9998)
    throw new Error("Choose a year between 1 and 9998.");
  return date;
}

// Backend daily buckets use UTC. Include the complete selected ending period.
export function reportQuery(period: ReportPeriod, start: string, end: string, shopId: string) {
  const params = new URLSearchParams({ shop_id: shopId });
  const from = start ? boundary(start, period) : null;
  const to = end ? boundary(end, period) : null;
  if (from && to && from > to) throw new Error("Start must be on or before end.");
  if (from) params.set("from", from.toISOString());
  if (to) {
    if (period === "year") to.setUTCFullYear(to.getUTCFullYear() + 1);
    else if (period === "month") to.setUTCMonth(to.getUTCMonth() + 1);
    else to.setUTCDate(to.getUTCDate() + (period === "week" ? 7 : 1));
    params.set("to", to.toISOString());
  }
  return `?${params}`;
}

export function periodRows(days: ReportDay[], period: ReportPeriod): PeriodRow[] {
  const grouped = new Map<string, PeriodRow>();
  for (const day of days) {
    const date = new Date(day.day);
    if (period === "week") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    else if (period === "month") date.setUTCDate(1);
    else if (period === "year") date.setUTCMonth(0, 1);
    const key = date.toISOString().slice(0, 10);
    const row = grouped.get(key) ?? { key, label: key, count: 0, revenue: 0, cogs: 0, profit: 0 };
    row.count += day.order_count;
    row.revenue += Number(day.net_sales);
    row.cogs += Number(day.cost_of_goods_sold);
    row.profit += Number(day.gross_profit);
    grouped.set(key, row);
  }
  return [...grouped.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((row) => {
      const date = new Date(`${row.key}T00:00:00Z`);
      let label: string;
      if (period === "year") label = row.key.slice(0, 4);
      else if (period === "week") {
        const end = new Date(date);
        end.setUTCDate(end.getUTCDate() + 6);
        const format = new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
        label = `${format.format(date)} – ${format.format(end)}`;
      } else
        label = new Intl.DateTimeFormat(
          "en",
          period === "month"
            ? { month: "long", year: "numeric", timeZone: "UTC" }
            : { dateStyle: "medium", timeZone: "UTC" },
        ).format(date);
      return { ...row, label };
    });
}

export function profitClass(value?: string | number) {
  const profit = Number(value ?? 0);
  return profit > 0
    ? "report-profit-positive"
    : profit < 0
      ? "report-profit-negative"
      : "report-profit-zero";
}
