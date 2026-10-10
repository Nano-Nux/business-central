import { expect, test, type Page } from "@playwright/test";

const shopID = "22222222-2222-2222-2222-222222222222";
const days = Array.from({ length: 125 }, (_, index) => {
  const year = 2026 - Math.floor(index / 10);
  const month = 10 - (index % 10);
  return {
    day: `${year}-${String(month).padStart(2, "0")}-01T00:00:00Z`,
    order_count: 1,
    net_sales: "100",
    cost_of_goods_sold: index === 1 ? "150" : index === 2 ? "100" : "50",
    gross_profit: index === 1 ? "-50" : index === 2 ? "0" : "50",
  };
});

async function setup(page: Page, mode = "NANO", repair = false, staff = false) {
  const requested: URL[] = [];
  const user = {
    id: "77777777-7777-7777-7777-777777777777",
    membership_id: "88888888-8888-8888-8888-888888888888",
    merchant_id: "11111111-1111-1111-1111-111111111111",
    display_name: "Owner",
    email: "owner@example.test",
    is_active: true,
    platform_admin: false,
    roles: [
      {
        id: "role",
        code: staff ? "staff" : "merchant",
        name: "Merchant",
        permission_codes: ["tenant.read", "tenant.write"],
      },
    ],
  };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    let data: unknown = [];
    let total = 0;
    let totalPages = 1;
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: user.merchant_id,
        name: "Report shop",
        slug: "reports",
        default_currency_code: "USD",
        pos_complexity_level: mode,
        is_active: true,
      };
    if (path === "/shops")
      data = [
        {
          id: shopID,
          name: "Main",
          code: "MAIN",
          is_active: true,
          module_codes: repair ? ["repair"] : [],
        },
      ];
    if (path === "/repairs/orders")
      data = [
        { id: "repair-active", status: "WAITING_PARTS" },
        { id: "repair-complete", status: "COMPLETED" },
      ];
    if (path.startsWith("/reports/")) {
      requested.push(url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const selected = days.filter(
        (day) =>
          (!from || new Date(day.day) >= new Date(from)) &&
          (!to || new Date(day.day) < new Date(to)),
      );
      if (path === "/reports/sales-summary")
        data = {
          order_count: selected.length,
          pos_order_count: selected.length,
          repair_count: 0,
          item_quantity: String(selected.length),
          gross_sales: "12500",
          discounts: "0",
          net_sales: "12500",
          refunds: "0",
          cost_of_goods_sold: "6250",
          gross_profit: "6250",
          gross_margin_percent: "50",
        };
      if (path === "/reports/sales-by-day") {
        const size = Number(url.searchParams.get("page_size"));
        const index = Number(url.searchParams.get("page_index"));
        total = selected.length;
        totalPages = Math.ceil(total / size);
        data = selected.slice(index * size, (index + 1) * size);
      }
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data, meta: { total, total_pages: totalPages } }),
    });
  });
  await page.addInitScript(
    ({ user, shopID }) => {
      localStorage.setItem(
        "bc.session",
        JSON.stringify({
          access_token: "test",
          refresh_token: "test",
          token_type: "Bearer",
          expires_at: "2099-01-01T00:00:00Z",
          user,
        }),
      );
      localStorage.setItem("bc.current-shop", shopID);
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    },
    { user, shopID },
  );
  return requested;
}

for (const width of [1280, 768, 390, 320]) {
  test(`Reports shows all history, period pagination and signed profit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = await setup(page);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Financial breakdown summary" })).toBeVisible();
    for (const endpoint of ["sales-summary", "sales-by-day", "top-products"]) {
      expect(
        requests.some(
          (url) =>
            url.pathname.endsWith(endpoint) &&
            !url.searchParams.has("from") &&
            !url.searchParams.has("to"),
        ),
      ).toBe(true);
    }
    expect(
      requests.some(
        (url) =>
          url.pathname.endsWith("sales-by-day") && url.searchParams.get("page_index") === "1",
      ),
    ).toBe(true);
    await page.getByRole("tab", { name: "Per day", exact: true }).click();
    const table = page.locator(".report-table");
    await expect(table.locator("tbody tr")).toHaveCount(10);
    await expect(table.locator("tbody tr").first()).toContainText("Oct 1, 2026");
    await expect(table.locator("tfoot")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Average order" })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: "Gross profit" })).toHaveClass(
      /report-profit-positive/,
    );
    await expect(table.locator("tbody tr").nth(0).locator("td").last()).toHaveClass(
      /report-profit-positive/,
    );
    await expect(table.locator("tbody tr").nth(1).locator("td").last()).toHaveClass(
      /report-profit-negative/,
    );
    await expect(table.locator("tbody tr").nth(2).locator("td").last()).toHaveClass(
      /report-profit-zero/,
    );
    for (const theme of ["default-theme", "midnight-dark-theme"]) {
      await page.evaluate(
        (theme) => document.documentElement.setAttribute("data-theme", theme),
        theme,
      );
      const colors = await table.evaluate((table) => {
        const tokenColor = (token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          table.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const cells = [...table.querySelectorAll("tbody tr")]
          .slice(0, 3)
          .map((row) => getComputedStyle(row.lastElementChild!).color);
        return {
          cells,
          expected: [
            tokenColor("--status-success"),
            tokenColor("--status-danger"),
            tokenColor("--text"),
          ],
          header: getComputedStyle(table.querySelector("th:last-child")!).color,
        };
      });
      expect(colors.cells).toEqual(colors.expected);
      expect(colors.header).toBe(colors.expected[0]);
    }
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "default-theme"));
    await page.screenshot({
      path: `playwright-report-period-results/reports-${width}.png`,
      fullPage: true,
    });
    const pagination = page.getByRole("navigation", { name: "reporting periods pagination" });
    await pagination.getByRole("button", { name: "Go to page 2", exact: true }).click();
    await expect(table.locator("tbody tr").first()).toContainText("Oct 1, 2025");
    await page.getByRole("tab", { name: "Per year", exact: true }).click();
    await expect(page.getByLabel("Start year", { exact: true })).toHaveAttribute("type", "number");
    await expect(table.locator("tbody tr").first()).toContainText("2026");
    await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(
      /^10(?: transactions)?$/,
    );
    await pagination.getByRole("button", { name: "Go to page 2", exact: true }).click();
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.locator("tbody tr").last()).toContainText("2014");
    for (const name of ["Per week", "Per month", "Per year", "Overview"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(
        page.getByLabel(
          name === "Per week"
            ? "Start week"
            : name === "Per month"
              ? "Start month"
              : name === "Per year"
                ? "Start year"
                : "Start day",
          { exact: true },
        ),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `playwright-report-period-results/reports-${name.replaceAll(" ", "-")}-${width}.png`,
        fullPage: true,
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("Reports uses inclusive tab-specific bounds and resets pagination", async ({ page }) => {
  const requests = await setup(page);
  await page.goto("/reports");
  await page.getByRole("tab", { name: "Per month", exact: true }).click();
  await page.getByLabel("Start month", { exact: true }).fill("2026-09");
  await page.getByLabel("End month", { exact: true }).fill("2026-10");
  await expect(page.locator(".report-table tbody tr")).toHaveCount(2);
  await expect(page.locator(".report-table tbody tr").first()).toContainText("October 2026");
  expect(
    requests.some(
      (url) =>
        url.searchParams.get("from") === "2026-09-01T00:00:00.000Z" &&
        url.searchParams.get("to") === "2026-11-01T00:00:00.000Z",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "All dates", exact: true }).click();
  await expect(page.locator(".report-table tbody tr")).toHaveCount(10);
  await page.getByRole("tab", { name: "Per week", exact: true }).click();
  await expect(page.getByLabel("Start week", { exact: true })).toHaveAttribute("type", "week");
  await page.getByLabel("Start week", { exact: true }).fill("2026-W40");
  await page.getByLabel("End week", { exact: true }).fill("2026-W40");
  await expect(page.locator(".report-table tbody tr")).toHaveCount(1);
  await page.getByRole("tab", { name: "Per day", exact: true }).click();
  await page.getByLabel("Start day", { exact: true }).fill("2026-10-01");
  await page.getByLabel("End day", { exact: true }).fill("2026-10-01");
  await expect(page.locator(".report-table tbody tr")).toHaveCount(1);
  await page.getByLabel("End day", { exact: true }).fill("2026-09-01");
  await expect(page.locator("p[role=alert]")).toHaveText("Start must be on or before end.");
});

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  test(`${mode} merges Today into report Overview and redirects old dashboard links`, async ({
    page,
  }) => {
    const requests = await setup(page, mode, true);
    await page.goto("/merchant/dashboard");
    await expect(page).toHaveURL(/\/reports$/);
    const today = page.getByRole("region", { name: "Today overview" });
    await expect(today.getByText("Net sales today", { exact: true })).toBeVisible();
    await expect(today.getByRole("heading", { name: "Sales rhythm" })).toBeVisible();
    await expect(today.getByText("1 active repairs", { exact: true })).toBeVisible();
    const openPos = today.getByRole("link", { name: "Open POS", exact: true });
    await expect(openPos).toBeVisible();
    expect(
      await openPos.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.color !== style.backgroundColor;
      }),
    ).toBe(true);
    expect(
      requests
        .filter((url) => url.searchParams.has("from"))
        .every((url) => url.searchParams.get("shop_id") === shopID),
    ).toBe(true);
    await expect(page.locator(".sidebar nav")).toHaveCount(1);
    await expect(
      page.locator(".sidebar nav").getByRole("link", { name: "Today", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: "Per day", exact: true }).click();
    await expect(today).toHaveCount(0);
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await expect(today.getByText("Net sales today", { exact: true })).toBeVisible();
  });
}
test("staff legacy dashboard links retain merchant-only report access", async ({ page }) => {
  await setup(page, "SIMPLE", false, true);
  await page.goto("/staff/dashboard");
  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByRole("region", { name: "Today overview" })).toHaveCount(0);
});
