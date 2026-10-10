import { describe, expect, it } from "vitest";
import { periodRows, profitClass, reportQuery, type ReportDay } from "./report-periods";

describe("report periods", () => {
  it("defaults to all history and keeps the selected shop", () => {
    const query = new URLSearchParams(reportQuery("day", "", "", "shop"));
    expect([...query]).toEqual([["shop_id", "shop"]]);
  });

  it.each([
    ["day", "2024-02-29", "2024-02-29", "2024-02-29T00:00:00.000Z", "2024-03-01T00:00:00.000Z"],
    ["week", "2020-W53", "2020-W53", "2020-12-28T00:00:00.000Z", "2021-01-04T00:00:00.000Z"],
    ["month", "2024-02", "2024-02", "2024-02-01T00:00:00.000Z", "2024-03-01T00:00:00.000Z"],
    ["year", "2024", "2024", "2024-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"],
  ] as const)("includes the entire ending %s", (period, start, end, from, to) => {
    const query = new URLSearchParams(reportQuery(period, start, end, "shop"));
    expect(query.get("from")).toBe(from);
    expect(query.get("to")).toBe(to);
  });

  it("supports one-sided bounds and rejects reversed or invalid periods", () => {
    expect(new URLSearchParams(reportQuery("year", "2024", "", "shop")).has("to")).toBe(false);
    expect(() => reportQuery("month", "2025-01", "2024-12", "shop")).toThrow("Start");
    expect(() => reportQuery("day", "2023-02-29", "", "shop")).toThrow("valid day");
    expect(() => reportQuery("week", "2021-W53", "", "shop")).toThrow("valid week");
  });

  const days: ReportDay[] = [
    {
      day: "2024-12-30",
      order_count: 2,
      net_sales: "100",
      cost_of_goods_sold: "60",
      gross_profit: "40",
    },
    {
      day: "2025-01-01",
      order_count: 3,
      net_sales: "50",
      cost_of_goods_sold: "70",
      gross_profit: "-20",
    },
    {
      day: "2023-01-01",
      order_count: 1,
      net_sales: "10",
      cost_of_goods_sold: "10",
      gross_profit: "0",
    },
  ];
  it("groups across ISO week/year boundaries without dropping orders and sorts newest first", () => {
    const weekly = periodRows(days, "week");
    expect(weekly[0]).toMatchObject({
      key: "2024-12-30",
      count: 5,
      revenue: 150,
      cogs: 130,
      profit: 20,
    });
    const yearly = periodRows(days, "year");
    expect(yearly.map((row) => row.label)).toEqual(["2025", "2024", "2023"]);
    expect(yearly.reduce((sum, row) => sum + row.count, 0)).toBe(6);
    expect(periodRows(days, "month")[0].label).toBe("January 2025");
    expect(periodRows(days, "day")[0].count).toBe(3);
  });
  it("colors positive, negative and zero profit separately", () => {
    expect(profitClass("10")).toBe("report-profit-positive");
    expect(profitClass("-10")).toBe("report-profit-negative");
    expect(profitClass("0.00")).toBe("report-profit-zero");
  });
});
