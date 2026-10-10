import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`transaction header filters combine across pages and stay usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const shopID = "22222222-2222-2222-2222-222222222222";
    const user = {
      id: "user",
      membership_id: "member",
      merchant_id: "merchant",
      display_name: "Owner",
      email: "owner@example.com",
      is_active: true,
      platform_admin: false,
      roles: [
        { id: "role", code: "merchant", name: "Merchant", permission_codes: ["tenant.read"] },
      ],
    };
    const orders = Array.from({ length: 11 }, (_, index) => ({
      id: `order-${index}`,
      event_type: "TRANSACTION",
      reference: `POS-${index}`,
      occurred_at: new Date(Date.now() - index * 60000).toISOString(),
      status: "COMPLETED",
      payment_status: "COMPLETE",
      customer_name: index === 10 ? "Alice" : "Bob",
      product_name: "Coffee",
      amount: "1250",
      currency_code: "USD",
      shop_id: shopID,
      delivery_fee: "25",
      delivery_payment_status: "UN_PAID",
      paid_total: "1250",
      outstanding_total: "25",
    }));
    await page.route("http://localhost:8080/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1", "");
      let data: unknown = [];
      let meta;
      if (path === "/auth/me") data = user;
      if (path === "/merchant")
        data = {
          id: "merchant",
          name: "Merchant",
          default_currency_code: "USD",
          pos_complexity_level: "SIMPLE",
          is_active: true,
        };
      if (path === "/shops")
        data = [
          {
            id: shopID,
            name: "Main shop",
            code: "MAIN",
            timezone: "UTC",
            is_active: true,
            module_codes: [],
          },
        ];
      if (path === "/transaction-history") {
        expect(url.searchParams.get("filter")).toContain(`shop_id:${shopID}`);
        const index = Number(url.searchParams.get("page_index"));
        data = index === 0 ? orders.slice(0, 10) : orders.slice(10);
        meta = { page_index: index, page_size: 10, total: 11, total_pages: 2 };
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data, meta }),
      });
    });
    await page.addInitScript(
      ({ user, shopID }) => {
        localStorage.setItem(
          "bc.session",
          JSON.stringify({
            access_token: "test-token",
            refresh_token: "test-refresh",
            token_type: "Bearer",
            expires_at: "2099-01-01T00:00:00Z",
            user,
          }),
        );
        localStorage.setItem("bc.current-shop", shopID);
      },
      { user, shopID },
    );
    await page.goto("/transaction-history");
    const table = page.locator(".history-table");
    await expect(table.locator("thead input")).toHaveCount(10);
    for (const input of await table.locator("thead input").all()) await expect(input).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(10);
    await page.getByRole("textbox", { name: "Filter Customer", exact: true }).fill("alice");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table.locator("tbody")).toContainText("POS-10");
    await page.getByRole("textbox", { name: "Filter Order total", exact: true }).fill("1,250");
    await expect(table.locator("tbody")).toContainText("POS-10");
    await page.getByRole("textbox", { name: "Filter Products", exact: true }).fill("Tea");
    await expect(table).toContainText("No orders match these filters");
    await expect(page.getByRole("textbox", { name: "Filter Products", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Filter Products", exact: true }).fill("Coffee");
    await expect(table.locator("tbody")).toContainText("POS-10");
    await page.getByRole("button", { name: "Clear column filters" }).click();
    await expect(table.locator("tbody tr")).toHaveCount(10);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
