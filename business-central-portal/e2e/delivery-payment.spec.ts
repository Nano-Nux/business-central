import { expect, test } from "@playwright/test";

const merchant = "11111111-1111-1111-1111-111111111111",
  shop = "22222222-2222-2222-2222-222222222222",
  orderID = "33333333-3333-3333-3333-333333333333";

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  test(`${mode} checkout and history show independent delivery collection`, async ({ page }) => {
    const user = {
      id: "identity",
      membership_id: "membership",
      merchant_id: merchant,
      display_name: "Owner",
      email: "owner@example.test",
      is_active: true,
      platform_admin: false,
      roles: [
        {
          id: "role",
          code: "merchant",
          name: "Merchant",
          permission_codes: ["tenant.read", "tenant.write"],
        },
      ],
    };
    let deliveryStatus = "UN_PAID";
    const requests: Record<string, unknown>[] = [];
    const financial = () => ({
      delivery_payment_status: deliveryStatus,
      payment_status: "COMPLETE",
      delivery_fee: "7.00",
      paid_total: deliveryStatus === "COMPLETE" ? "106.00" : "99.00",
      outstanding_total: deliveryStatus === "COMPLETE" ? "0.00" : "7.00",
    });
    const entry = () => ({
      id: orderID,
      event_type: "TRANSACTION",
      reference: "POS-TEST",
      occurred_at: "2026-10-08T10:00:00Z",
      status: "FULFILLED",
      channel: "POS",
      amount: "106.00",
      currency_code: "USD",
      shop_id: shop,
      quantity: "1",
      ...financial(),
    });
    await page.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname.replace("/api/v1", "");
      const body = req.method() === "GET" ? undefined : req.postDataJSON();
      let data: unknown = [];
      if (path === "/auth/me") data = user;
      if (path === "/merchant")
        data = {
          id: merchant,
          name: "Delivery shop",
          default_currency_code: "USD",
          pos_complexity_level: mode,
          is_active: true,
        };
      if (path === "/shops")
        data = [
          {
            id: shop,
            name: "Main",
            code: "MAIN",
            is_active: true,
            module_codes: [],
            include_tax: true,
            tax_rate: "10",
            delivery_payment_status_auto_complete: false,
          },
        ];
      if (path === "/payment-types")
        data = [{ id: "cash", name: "Cash", category_code: "CASH", is_active: true }];
      if (path === "/pos/catalog")
        data = [
          {
            id: "variant",
            product_id: "product",
            product_name: "Widget",
            name: "Widget",
            sku: "W",
            price: "100.00",
            currency_code: "USD",
            base_unit_id: "unit",
            quantity_on_hand: "10",
            is_stock_tracked: false,
          },
        ];
      if (path === "/pos/quote")
        data = {
          currency_code: "USD",
          subtotal: "100.00",
          discount_total: "10.00",
          tax_total: "9.00",
          grand_total: "106.00",
        };
      if (path === "/pos/orders") {
        requests.push(body);
        data = { id: orderID };
      }
      if (path === "/transaction-history") data = [entry()];
      if (path === `/pos/orders/${orderID}/delivery-payment`) {
        requests.push(body);
        deliveryStatus = body.delivery_payment_status;
        data = { delivery_payment_status: deliveryStatus };
      }
      if (path === `/transaction-history/${orderID}`)
        data = {
          entry: entry(),
          order: {
            id: orderID,
            order_number: "POS-TEST",
            channel: "POS",
            status: "FULFILLED",
            currency_code: "USD",
            subtotal: "100.00",
            discount_total: "10.00",
            tax_total: "9.00",
            shipping_total: "7.00",
            grand_total: "106.00",
            shop_id: shop,
            created_at: "2026-10-08T10:00:00Z",
            ...financial(),
          },
          lines: [],
          payments: [],
          refunds: [],
          total_cost: "0",
          gross_profit: "99",
          gross_margin: "100",
        };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data,
          meta: { total: Array.isArray(data) ? data.length : 1, total_pages: 1, page_size: 10 },
        }),
      });
    });
    await page.addInitScript(
      ({ user, shop }) => {
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
        localStorage.setItem("bc.current-shop", shop);
      },
      { user, shop },
    );
    await page.goto("/pos");
    await page.getByRole("button", { name: "Add Widget to cart", exact: true }).click();
    await page.getByRole("button", { name: /^(Details|Add more detail)$/ }).click();
    const details = page.getByRole("dialog");
    await expect(details.getByLabel("Delivery payment status")).toHaveValue("UN_PAID");
    await details.getByLabel("Delivery fee", { exact: true }).fill("7");
    await details.getByLabel("Manual promotion", { exact: true }).fill("10");
    await details.getByLabel("Delivery payment status").selectOption("COMPLETE");
    await details.getByLabel("Delivery payment status").selectOption("UN_PAID");
    await details.getByRole("button", { name: /Done|Save|Apply/ }).click();
    await page.getByRole("button", { name: /Check\s*out/i }).click();
    await expect
      .poll(() =>
        requests.some((r) => r.delivery_fee === "7" && r.delivery_payment_status === "UN_PAID"),
      )
      .toBe(true);
    await page.goto("/deliveries");
    await expect(page.getByRole("switch")).toBeVisible();
    await page.goto("/transaction-history");
    await expect(page.getByRole("columnheader", { name: "Delivery fee / payment" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Complete delivery/ })).toHaveCount(0);
    await page.getByRole("link", { name: "View detail for POS-TEST" }).click();
    await page.getByRole("button", { name: /Complete delivery payment/ }).click();
    await expect(page.getByRole("button", { name: /Mark un-paid/ })).toBeVisible();
    expect(requests.at(-1)).toMatchObject({
      delivery_payment_status: "COMPLETE",
      expected_status: "UN_PAID",
    });
    await page.getByRole("button", { name: /Mark un-paid/ }).click();
    await expect(page.getByRole("button", { name: /Complete delivery payment/ })).toBeVisible();
    expect(requests.at(-1)).toMatchObject({
      delivery_payment_status: "UN_PAID",
      expected_status: "COMPLETE",
    });
    await page.goto("/deliveries");
    await page.getByRole("switch").check();
    await expect(page.getByRole("switch")).toBeChecked();
    await page.getByRole("link", { name: "Point of sale", exact: true }).click();
    await page.getByRole("button", { name: /^(Details|Add more detail)$/ }).click();
    await expect(page.getByRole("dialog").getByLabel("Delivery payment status")).toHaveValue(
      "COMPLETE",
    );
    await expect(page.getByRole("dialog").getByLabel("Delivery payment status")).toBeDisabled();
  });
}
