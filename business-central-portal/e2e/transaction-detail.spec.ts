import { expect, test, type Page } from "@playwright/test";

const shop = "22222222-2222-2222-2222-222222222222";
const orderID = "33333333-3333-3333-3333-333333333333";

async function setup(
  page: Page,
  mode = "SIMPLE",
  options: {
    role?: string;
    orderStatus?: string;
    pending?: boolean;
    fee?: string;
    pendingRefund?: boolean;
    failUpdate?: boolean;
    orderShop?: string;
    stockEvent?: boolean;
    missingVersion?: boolean;
  } = {},
) {
  const user = {
    id: "identity",
    membership_id: "membership",
    merchant_id: "merchant",
    display_name: "Owner",
    email: "owner@example.test",
    is_active: true,
    roles: [
      {
        id: "role",
        code: options.role ?? "merchant",
        name: "User",
        permission_codes: ["tenant.read", "tenant.write"],
      },
    ],
  };
  let edited: Record<string, unknown> | undefined;
  let status = "UN_PAID";
  let fail = options.failUpdate;
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: "merchant",
        name: "Detail shop",
        default_currency_code: "USD",
        pos_complexity_level: mode,
        is_active: true,
      };
    if (path === "/shops")
      data = [
        {
          id: shop,
          name: "Main shop",
          code: "MAIN",
          is_active: true,
          module_codes: [],
          timezone: "UTC",
        },
      ];
    if (path === "/pos/catalog")
      data = [
        {
          id: "variant",
          product_name: "Cotton wool",
          name: "Small packet",
          sku: "CW-SMALL",
          price: "50.00",
        },
        {
          id: "second-variant",
          product_name: "Charger",
          name: "Charger",
          sku: "CHARGER",
          price: "10.00",
        },
      ];
    if (path === `/pos/orders/${orderID}`) {
      const body = request.postDataJSON();
      requests.push({ ...body, method: request.method() });
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Transaction changed. Refresh before editing or deleting it.",
            },
          }),
        });
        return;
      }
      if (request.method() === "PATCH") edited = body;
      data = request.method() === "DELETE" ? { deleted: true } : { id: orderID };
    }
    if (path === `/pos/orders/${orderID}/delivery-payment`) {
      const body = request.postDataJSON();
      requests.push(body);
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Delivery payment changed. Refresh and try again.",
            },
          }),
        });
        return;
      }
      status = body.delivery_payment_status;
      data = { delivery_payment_status: status };
    }
    if (path === "/invoices")
      data = [
        {
          id: orderID,
          number: "POS-DETAIL",
          customer: "Alice",
          merchant_name: "Detail shop",
          shop_id: shop,
          shop_name: "Main shop",
          currency_code: "USD",
          created_at: "2026-10-08T10:00:00Z",
          status: "Paid",
          kind: "pos",
          subtotal: "125.00",
          discount_total: "0",
          tax_total: "0",
          grand_total: "125.00",
          items: [{ name: "Phone", quantity: "1", unit_price: "125.00" }],
        },
      ];
    if (path === "/transaction-history") {
      expect(new URL(request.url()).searchParams.get("filter")).toContain("event_type:TRANSACTION");
      data = [
        {
          id: orderID,
          reference: "POS-DETAIL",
          event_type: "TRANSACTION",
          status: "FULFILLED",
          occurred_at: "2026-10-08T10:00:00Z",
          amount: "125.00",
          currency_code: "USD",
          quantity: "5",
          details: "Canonical POS order: Phone, Charger",
          product_name: "Phone, Charger",
          customer_name: "Alice",
        },
        {
          id: "second-order",
          reference: "POS-SECOND",
          event_type: "TRANSACTION",
          status: "FULFILLED",
          occurred_at: "2026-10-08T09:00:00Z",
          amount: "75.00",
          currency_code: "USD",
          quantity: "2",
          details: "Canonical POS order: Cable, Case",
          customer_name: "Bob",
        },
      ];
    }
    if (path === `/transaction-history/${orderID}`) {
      const fee = options.fee ?? "7.00";
      data = {
        delivery_payment_pending: !!options.pending,
        entry: {
          id: orderID,
          reference: "POS-DETAIL",
          event_type: options.stockEvent ? "STOCK_RECEIPT" : "TRANSACTION",
          status: "FULFILLED",
          occurred_at: "2026-10-08T10:00:00Z",
          currency_code: "USD",
          shop_name: "Main shop",
          details: "Stock received",
          quantity: "5.000000",
        },
        order: options.stockEvent
          ? undefined
          : {
              id: orderID,
              order_number: "POS-DETAIL",
              updated_at: options.missingVersion ? undefined : "2026-10-08T10:00:00Z",
              channel: "POS",
              status: options.orderStatus ?? "FULFILLED",
              currency_code: "USD",
              subtotal: "100.00",
              discount_total: "10.00",
              tax_total: "9.00",
              shipping_total: fee,
              grand_total: "106.00",
              shop_id: options.orderShop ?? shop,
              created_at: "2026-10-08T10:00:00Z",
              payment_type: "Cash",
              customer_name: edited?.customer_name ?? "",
              note: edited?.note ?? "Leave with reception",
              delivery_payment_status: status,
              payment_status: "COMPLETE",
              paid_total: status === "COMPLETE" ? "106.00" : "99.00",
              outstanding_total: status === "COMPLETE" ? "0.00" : "7.00",
            },
        lines: options.stockEvent
          ? []
          : [
              {
                id: "line",
                variant_id: "variant",
                description: "Cotton wool",
                product_name: "Cotton wool",
                variant_name: "Small packet",
                sku: "CW-SMALL",
                quantity: "2.000000",
                unit_price: "50.00",
                original_unit_cost: "20.00",
                original_cost: "40.00",
                cost_posted: true,
                discount_amount: "10.00",
                tax_amount: "9.00",
                line_total: "99.00",
                gross_profit: "59.00",
                gross_margin: "59.595960",
              },
            ],
        payments: options.stockEvent
          ? []
          : [
              {
                id: "payment",
                method: "Cash",
                purpose: "ORDER",
                status: "CAPTURED",
                amount: "99.00",
                created_at: "2026-10-08T10:00:00Z",
              },
            ],
        refunds: options.pendingRefund
          ? [
              {
                id: "refund",
                payment_id: "payment",
                amount: "1.00",
                status: "PENDING",
                reason: "Awaiting reversal",
                created_at: "2026-10-08T10:00:00Z",
              },
            ]
          : [],
        total_cost: "40.00",
        gross_profit: "59.00",
        gross_margin: "59.595960",
      };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data, meta: { total_pages: 1 } }),
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
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    },
    { user, shop },
  );
  return requests;
}

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  for (const width of [1280, 390]) {
    test(`${mode} transaction detail shows readable items and delivery controls at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const requests = await setup(page, mode);
      await page.goto(`/transaction-history/${orderID}`);
      const summary = page.getByRole("region", { name: "Payment summary" });
      await expect(summary).toContainText("USD 106.00");
      await expect(summary).toContainText("USD 99.00");
      await expect(summary).toContainText("USD 7.00");
      const delivery = page.getByRole("region", { name: "Delivery payment", exact: true });
      await expect(
        delivery.getByRole("button", { name: "Complete delivery payment", exact: true }),
      ).toBeVisible();
      const items = page.getByRole("region", { name: "Order items", exact: true });
      await expect(items).toContainText("2 × USD 50.00");
      await expect(items).not.toContainText("2.000000");
      await expect(items).toContainText("Small packet");
      await expect(items).toContainText("USD 99.00");
      await page.getByText("Item cost breakdown", { exact: true }).click();
      await expect(page.getByText("Original unit cost", { exact: true })).toBeVisible();
      await page.getByText("Payment records (1)", { exact: true }).click();
      await expect(page.getByText("Order payment", { exact: true })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`transaction-detail-${mode}-${width}.png`),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await delivery
        .getByRole("button", { name: "Complete delivery payment", exact: true })
        .click();
      await expect(delivery.getByRole("button", { name: /Mark un-paid/ })).toBeVisible();
      await expect(summary).toContainText("USD 0.00");
      expect(requests[0]).toMatchObject({
        delivery_payment_status: "COMPLETE",
        expected_status: "UN_PAID",
      });
      await delivery.getByRole("button", { name: /Mark un-paid/ }).click();
      await expect(
        delivery.getByRole("button", { name: "Complete delivery payment", exact: true }),
      ).toBeVisible();
      expect(requests[1]).toMatchObject({
        delivery_payment_status: "UN_PAID",
        expected_status: "COMPLETE",
      });
    });
  }
}

for (const [label, options, explanation] of [
  ["cancelled", { orderStatus: "CANCELLED" }, "Delivery payment cannot be changed"],
  ["refunded", { orderStatus: "REFUNDED" }, "Delivery payment cannot be changed"],
  ["pending sync", { pending: true }, "Synchronize before changing it again"],
  ["pending refund", { pendingRefund: true }, "Wait for the pending refund"],
  ["another shop", { orderShop: "other-shop" }, "Select this transaction’s shop"],
] as const) {
  test(`delivery edit disabled for ${label}`, async ({ page }) => {
    const requests = await setup(page, "SIMPLE", options);
    await page.goto(`/transaction-history/${orderID}`);
    await expect(
      page.getByRole("button", { name: "Complete delivery payment", exact: true }),
    ).toBeDisabled();
    await expect(page.getByText(explanation, { exact: false })).toBeVisible();
    expect(requests).toHaveLength(0);
  });
}

test("delivery update failures are visible and can be retried", async ({ page }) => {
  await setup(page, "SIMPLE", { failUpdate: true });
  await page.goto(`/transaction-history/${orderID}`);
  await page.getByRole("button", { name: "Complete delivery payment", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Delivery payment changed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete delivery payment", exact: true }).click();
  await expect(page.getByRole("button", { name: /Mark un-paid/ })).toBeVisible();
});

test("a sale without a delivery fee explains why there is no collection action", async ({
  page,
}) => {
  await setup(page, "MINI", { fee: "0.00" });
  await page.goto(`/transaction-history/${orderID}`);
  await expect(page.getByText("No delivery fee on this sale.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete delivery payment", exact: true }),
  ).toHaveCount(0);
});

test("staff cannot view financial detail or delivery editing despite write permission", async ({
  page,
}) => {
  await setup(page, "COMPLEX", { role: "staff" });
  await page.goto(`/transaction-history/${orderID}`);
  await expect(page.getByText("Access restricted", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete delivery payment", exact: true }),
  ).toHaveCount(0);
});

test("non-order stock events show their quantities without delivery actions", async ({ page }) => {
  await setup(page, "NANO", { stockEvent: true });
  await page.goto(`/transaction-history/${orderID}`);
  await expect(page.getByRole("heading", { name: "Activity details", exact: true })).toBeVisible();
  await expect(page.getByText("Stock received", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Delivery payment", exact: true })).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`history shows one summary per order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/transaction-history");
    const rows = page.locator(".history-table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("POS-DETAIL");
    await expect(rows.nth(0)).toContainText("125.00");
    await expect(
      rows.nth(0).getByRole("cell", { name: "Phone, Charger", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Products", exact: true })).toBeVisible();
    await expect(rows.nth(1)).toContainText("75.00");
    await expect(
      page.getByRole("columnheader", { name: "Order total", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Product / item", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Qty", exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Canonical POS order: Phone, Charger", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Actions", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Actions for POS-DETAIL", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "View detail", exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: "View invoice", exact: true }).click();
    const invoice = page.getByRole("dialog", { name: "Invoice details" });
    await expect(invoice).toContainText("POS-DETAIL");
    await expect(
      invoice.getByRole("img", { name: "Sales invoice POS-DETAIL", exact: true }),
    ).toBeVisible();
    await expect(invoice.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(invoice.getByRole("button", { name: "Thermal print" })).toBeVisible();
    await invoice.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Actions for POS-DETAIL", exact: true }).click();
    await page.getByRole("menuitem", { name: "View detail", exact: true }).click();
    await expect(page).toHaveURL(`/transaction-history/${orderID}`);
  });
}

for (const width of [390, 1280]) {
  test(`transaction can be edited and permanently deleted at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = await setup(page);
    await page.goto(`/transaction-history/${orderID}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit transaction" });
    await editor.getByLabel("Customer name", { exact: true }).fill("Edited customer");
    await editor.getByLabel("Order note", { exact: true }).fill("Updated note");
    await editor.getByLabel("Quantity for item 1", { exact: true }).fill("3");
    await editor.getByLabel("Unit price for item 1", { exact: true }).fill("45");
    await editor.getByRole("button", { name: "Add item", exact: true }).click();
    await editor.getByLabel("Item 2", { exact: true }).selectOption("second-variant");
    await editor.getByRole("button", { name: "Save transaction", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByText("Edited customer", { exact: true })).toBeVisible();
    expect(requests[0]).toEqual(
      expect.objectContaining({
        method: "PATCH",
        customer_name: "Edited customer",
        note: "Updated note",
        shop_id: shop,
        expected_updated_at: "2026-10-08T10:00:00Z",
        lines: expect.arrayContaining([
          expect.objectContaining({ quantity: "3", unit_price: "45" }),
          expect.objectContaining({ variant_id: "second-variant" }),
        ]),
      }),
    );
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Permanently delete transaction" });
    await expect(dialog).toContainText("This cannot be undone");
    await dialog.getByRole("button", { name: "Keep transaction", exact: true }).click();
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
    await expect(page).toHaveURL(/transaction-history$/);
    expect(requests[1]).toEqual(expect.objectContaining({ method: "DELETE", shop_id: shop }));
  });
}
test("failed transaction correction keeps the order visible and permits retry", async ({
  page,
}) => {
  const requests = await setup(page, "SIMPLE", { failUpdate: true });
  await page.goto(`/transaction-history/${orderID}`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Permanently delete transaction" });
  await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Transaction changed");
  await expect(page).toHaveURL(new RegExp(orderID));
  await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await expect(page).toHaveURL(/transaction-history$/);
  expect(requests[0].idempotency_key).toBe(requests[1].idempotency_key);
});

test("missing correction version explains disabled buttons and offers refresh", async ({
  page,
}) => {
  await setup(page, "SIMPLE", { missingVersion: true });
  await page.goto(`/transaction-history/${orderID}`);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await expect(
    page.getByText("This transaction response is missing its update timestamp.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh transaction", exact: true }),
  ).toBeEnabled();
});

test("staff retains invoice access without financial detail actions", async ({ page }) => {
  await setup(page, "SIMPLE", { role: "staff" });
  await page.goto("/transaction-history");
  await page.getByRole("button", { name: "Actions for POS-DETAIL", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "View detail", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "View invoice", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Invoice details" })).toContainText("POS-DETAIL");
});
test("old invoice links redirect and preserve the selected popup", async ({ page }) => {
  await setup(page, "NANO");
  await page.goto(`/invoices?invoice=${orderID}`);
  await expect(page).toHaveURL(`/transaction-history?invoice=${orderID}`);
  await expect(page.getByRole("dialog", { name: "Invoice details" })).toContainText("POS-DETAIL");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL("/transaction-history");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("invoice popup does not expose another shop's invoice", async ({ page }) => {
  await setup(page);
  await page.route("**/api/v1/invoices?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          { id: orderID, number: "OTHER-SHOP", shop_id: "other-shop", kind: "pos", items: [] },
        ],
      }),
    }),
  );
  await page.goto(`/transaction-history?invoice=${orderID}`);
  const invoice = page.getByRole("dialog", { name: "Invoice details" });
  await expect(invoice).toContainText("Invoice unavailable");
  await expect(invoice).not.toContainText("OTHER-SHOP");
});
