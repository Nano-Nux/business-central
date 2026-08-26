import { expect, test } from "@playwright/test";

test("marks unposted FIFO cost and profit as pending", async ({ page }) => {
  const merchantID = "11111111-1111-1111-1111-111111111111";
  const shopID = "22222222-2222-2222-2222-222222222222";
  const user = {
    id: "44444444-4444-4444-4444-444444444444",
    membership_id: "55555555-5555-5555-5555-555555555555",
    merchant_id: merchantID,
    email: "owner@example.com",
    display_name: "Owner",
    is_active: true,
    platform_admin: false,
    roles: [
      {
        id: "66666666-6666-6666-6666-666666666666",
        code: "merchant",
        name: "Merchant",
        permission_codes: ["tenant.read"],
      },
    ],
  };

  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/transaction-history/order-id") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            entry: {
              id: "entry",
              reference: "REP-PENDING",
              event_type: "TRANSACTION",
              status: "PENDING_PAYMENT",
              occurred_at: "2026-08-15T03:51:07Z",
              currency_code: "MMK",
            },
            order: {
              id: "order-id",
              order_number: "REP-PENDING",
              channel: "SERVICE",
              status: "PENDING_PAYMENT",
              currency_code: "MMK",
              subtotal: "4060000",
              discount_total: "60000",
              tax_total: "0",
              shipping_total: "0",
              grand_total: "4000000",
              shop_name: "Repair Shop",
              created_at: "2026-08-15T03:51:07Z",
            },
            lines: [
              {
                id: "service",
                description: "Repair service",
                quantity: "1",
                unit_price: "60000",
                original_unit_cost: "0",
                original_cost: "0",
                cost_posted: true,
                discount_amount: "60000",
                tax_amount: "0",
                line_total: "0",
                gross_profit: "0",
                gross_margin: "0",
              },
              {
                id: "part",
                description: "MacBook Air",
                product_name: "MacBook Air",
                variant_name: "Standard",
                sku: "MAC-STD",
                quantity: "1",
                unit_price: "4000000",
                original_unit_cost: "0",
                original_cost: "0",
                cost_posted: false,
                discount_amount: "0",
                tax_amount: "0",
                line_total: "4000000",
                gross_profit: "4000000",
                gross_margin: "100",
              },
            ],
            payments: [],
            refunds: [],
            total_cost: "0",
            gross_profit: "4000000",
            gross_margin: "100",
          },
        }),
      });
      return;
    }
    if (path === "/shops") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: shopID,
              name: "Repair Shop",
              code: "MAIN",
              timezone: "UTC",
              is_active: true,
              module_codes: ["repair"],
            },
          ],
        }),
      });
      return;
    }
    if (path === "/merchant") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: merchantID,
            name: "Merchant",
            default_currency_code: "MMK",
            timezone: "UTC",
            is_active: true,
          },
        }),
      });
      return;
    }
    if (path === "/auth/me") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: user }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

  await page.goto("/transaction-history/order-id");
  await expect(page.getByText("Inventory cost and profit are not final yet.")).toBeVisible();
  await expect(page.getByText("Pending fulfillment")).toHaveCount(3);
  await expect(page.getByText("100%", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "Repair service" })).toContainText(
    "MMK 0.00",
  );
});
