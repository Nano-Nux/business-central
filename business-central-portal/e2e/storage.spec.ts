import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const locationID = "33333333-3333-3333-3333-333333333333";
const variantID = "44444444-4444-4444-4444-444444444444";

async function setup(page: Page, role = "merchant") {
  const user = {
    id: "55555555-5555-5555-5555-555555555555",
    membership_id: "66666666-6666-6666-6666-666666666666",
    merchant_id: merchantID,
    display_name: "Storage user",
    email: "storage@example.test",
    is_active: true,
    roles: [
      {
        id: "role",
        code: role,
        name: role,
        permission_codes: ["tenant.read", "tenant.write", "stock_in", "membership.manage"],
      },
    ],
  };
  let stock = 10;
  const calls: Array<{ path: string; body: Record<string, string> }> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: merchantID,
        name: "Storage test",
        slug: "storage-test",
        default_currency_code: "USD",
        timezone: "UTC",
        pos_complexity_level: "COMPLEX",
        is_active: true,
      };
    if (path === "/shops")
      data = [{ id: shopID, name: "Main shop", code: "MAIN", is_active: true, module_codes: [] }];
    if (path === "/inventory/locations")
      data = [
        { id: "other-location", shop_id: "other-shop", name: "Other stock", is_active: true },
        {
          id: locationID,
          shop_id: shopID,
          location_type: "SHOP",
          name: "Stock room",
          code: "STOCK",
          is_active: true,
        },
      ];
    // Deliberately include confidential values even for staff to prove UI hiding.
    if (path === "/inventory/storage")
      data = [
        {
          id: variantID,
          catalog: "Beverages",
          product_name: "Tea",
          variant_name: "Box",
          brand: "Brand",
          unit: "PCS",
          stock_count: String(stock),
          sell_price: "30.00",
          original_price: "12.00",
          profit: "18.00",
          manufacture_date: "2026-09-01",
          expired_date: "2027-09-01",
          is_stock_tracked: true,
          allows_decimal: false,
        },
      ];
    if (
      ["/inventory/stock-in", "/inventory/stock-reductions"].includes(path) &&
      request.method() === "POST"
    ) {
      const body = request.postDataJSON();
      calls.push({ path, body });
      stock += Number(body.quantity) * (path.endsWith("stock-in") ? 1 : -1);
      data = {
        id: "movement",
        ...body,
        movement_type: path.endsWith("stock-in") ? "RECEIPT" : "ADJUSTMENT",
      };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data,
        meta: { total: Array.isArray(data) ? data.length : 1, total_pages: 1, page_size: 10 },
      }),
    });
  });
  await page.addInitScript(
    ({ user, shopID }) => {
      localStorage.setItem(
        "bc.session",
        JSON.stringify({
          access_token: "test",
          refresh_token: "test-refresh",
          token_type: "Bearer",
          expires_at: "2099-01-01T00:00:00Z",
          user,
        }),
      );
      localStorage.setItem("bc.current-shop", shopID);
      // Exercise the direct online API path. Durable queue coverage is in Vitest.
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    },
    { user, shopID },
  );
  return calls;
}

test("merchant can increase and reduce stock on the merged Storage page", async ({ page }) => {
  const calls = await setup(page);
  await page.goto("/storage");
  await expect(
    page.getByRole("columnheader", { name: "Original price", exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Profit", exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Increase", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Increase stock" });
  await expect(dialog.getByLabel("Stock location")).toHaveCount(0);
  await dialog.getByLabel("Quantity to add (PCS)").fill("3");
  await dialog.getByLabel("Original price per unit", { exact: false }).fill("15");
  await dialog.getByRole("button", { name: "Add to stock" }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toMatchObject({
    path: "/inventory/stock-in",
    body: {
      variant_id: variantID,
      destination_location_id: locationID,
      quantity: "3",
      unit_cost: "15",
    },
  });
  await expect(page.getByRole("cell", { name: "13", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reduce", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Reduce stock" });
  await expect(dialog.getByLabel("Stock location")).toHaveCount(0);
  await dialog.getByLabel("Quantity to remove (PCS)").fill("2");
  await dialog.getByLabel("Reason for reduction").fill("Damaged boxes");
  await dialog.getByRole("button", { name: "Confirm reduction" }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]).toMatchObject({
    path: "/inventory/stock-reductions",
    body: {
      variant_id: variantID,
      source_location_id: locationID,
      quantity: "2",
      reason: "Damaged boxes",
    },
  });
  expect(calls[1].body.event_key).toMatch(/^storage-reduce:/);
  await expect(page.getByRole("cell", { name: "11", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stock in", exact: true })).toHaveCount(0);
});

for (const role of ["staff", "manager", "custom"]) {
  test(`${role} sees read-only stock and retail price despite write permissions`, async ({
    page,
  }) => {
    const calls = await setup(page, role);
    await page.goto("/storage");
    await expect(page.getByRole("cell", { name: "Tea", exact: true })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "RETAIL sell price", exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Stock count", exact: false }),
    ).toBeVisible();
    for (const name of [
      "Original price",
      "Profit",
      "Stock actions",
      "Catalog",
      "Brand",
      "Manufacture date",
      "Expiration date",
    ]) {
      await expect(page.getByRole("columnheader", { name, exact: false })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Increase", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reduce", exact: true })).toHaveCount(0);
    await page.goto("/stock-in");
    await expect(page).toHaveURL(/\/storage$/);
    await expect(page.getByRole("button", { name: "Increase", exact: true })).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });
}

test("Storage stock controls remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/storage");
  await page.getByRole("button", { name: "Reduce", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Reduce stock" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test("Storage stock writes are disabled when only another shop has stock configured", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.route("**/inventory/locations?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "other-location",
            shop_id: "other-shop",
            location_type: "SHOP",
            is_active: true,
          },
        ],
        meta: { total_pages: 1 },
      }),
    }),
  );
  await page.goto("/storage");
  await page.getByRole("button", { name: "Increase", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Increase stock" });
  await expect(
    dialog.getByText("Stock is not configured for the selected shop.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add to stock", exact: true })).toBeDisabled();
  expect(calls).toHaveLength(0);
});
