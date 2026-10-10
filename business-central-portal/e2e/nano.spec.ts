import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const productID = "33333333-3333-3333-3333-333333333333";
const variantID = "44444444-4444-4444-4444-444444444444";
const locationID = "55555555-5555-5555-5555-555555555555";
const unitID = "66666666-6666-6666-6666-666666666666";

async function setup(
  page: Page,
  {
    role = "merchant",
    failReceipt = false,
    failBrand = false,
    mode = "NANO",
    packs = false,
    noLocation = false,
    aiEnabled = true,
  } = {},
) {
  const user = {
    id: "77777777-7777-7777-7777-777777777777",
    membership_id: "88888888-8888-8888-8888-888888888888",
    merchant_id: merchantID,
    display_name: "Nano user",
    email: "nano@example.test",
    is_active: true,
    platform_admin: false,
    roles: [
      {
        id: "role",
        code: role,
        name: role,
        permission_codes: ["tenant.read", "tenant.write", "membership.manage", "ai.chat"],
      },
    ],
  };
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let product: Record<string, unknown> | undefined;
  let stock = 0;
  let rejectReceipt = failReceipt;
  const categories: Record<string, unknown>[] = [];
  const brands: Record<string, unknown>[] = [];
  let rejectBrand = failBrand;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const body = request.method() === "GET" ? undefined : request.postDataJSON();
    if (body) calls.push({ path, body });
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: merchantID,
        name: "Nano shop",
        slug: "nano",
        default_currency_code: "USD",
        pos_complexity_level: mode,
        ai_assistant_enabled: aiEnabled,
        is_active: true,
      };
    if (path === "/shops")
      data = [
        { id: shopID, name: "Main shop", code: "MAIN", is_active: true, module_codes: ["repair"] },
      ];
    if (path === "/reports/sales-summary")
      data = {
        order_count: 0,
        pos_order_count: 0,
        repair_count: 0,
        item_quantity: "0",
        gross_sales: "0",
        discounts: "0",
        net_sales: "0",
        refunds: "0",
        cost_of_goods_sold: "0",
        gross_profit: "0",
        gross_margin_percent: "0",
      };
    if (path === "/units")
      data = [{ id: unitID, code: "PCS", name: "Pcs", is_active: true, allows_decimal: false }];
    if (path === "/inventory/locations")
      data = noLocation
        ? []
        : [
            {
              id: "00000000-0000-0000-0000-000000000001",
              shop_id: "other-shop",
              name: "Other shop",
              location_type: "SHOP",
              is_active: true,
            },
            {
              id: "00000000-0000-0000-0000-000000000002",
              shop_id: shopID,
              name: "Warehouse",
              location_type: "WAREHOUSE",
              is_active: true,
            },
            {
              id: locationID,
              shop_id: shopID,
              name: "Stock room",
              code: "STOCK",
              location_type: "SHOP",
              is_active: true,
            },
          ];
    if (path === "/catalog/categories") {
      if (body) {
        data = { id: "new-category", ...body };
        categories.push(data as Record<string, unknown>);
      } else data = categories;
    }
    if (path === "/catalog/brands") {
      if (body) {
        if (rejectBrand) {
          rejectBrand = false;
          await route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "VALIDATION_ERROR", message: "Brand rejected for review" },
            }),
          });
          return;
        }
        data = { id: "new-brand", ...body };
        brands.push(data as Record<string, unknown>);
      } else data = brands;
    }
    if (path === "/catalog/products" && body)
      product = { id: productID, ...body, category_names: [] };
    if (path === `/catalog/products/${productID}` && body) product = { ...product, ...body };
    if (path === "/catalog/products") data = body ? product : product ? [product] : [];
    if (path === `/catalog/products/${productID}`) data = product;
    if (path === "/pricing/price-lists")
      data = [{ id: "retail-list", code: "RETAIL", currency_code: "USD", is_default: true }];
    if (path === "/pricing/price-lists/retail-list/prices")
      data = [
        {
          price_list_id: "retail-list",
          variant_id: variantID,
          amount: "5.00",
          valid_from: "2026-01-01T00:00:00Z",
        },
        ...(packs
          ? [
              {
                price_list_id: "retail-list",
                variant_id: "pack-variant",
                amount: "20.00",
                valid_from: "2026-01-01T00:00:00Z",
              },
            ]
          : []),
      ];
    if (path.endsWith("/variants"))
      data = [
        {
          id: variantID,
          product_id: productID,
          sku: packs ? "TEA-PCS" : `STD-${productID.replaceAll("-", "")}`,
          name: product?.name,
          base_unit_id: unitID,
          unit_of_measure: "PCS",
          is_stock_tracked: true,
        },
        ...(packs
          ? [
              {
                id: "pack-variant",
                product_id: productID,
                sku: "TEA-BOX",
                name: "Box of 6",
                base_unit_id: unitID,
                unit_of_measure: "PCS",
                is_stock_tracked: true,
              },
            ]
          : []),
      ];
    if (path === "/inventory/stock-in" && body) {
      if (rejectReceipt) {
        rejectReceipt = false;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "VALIDATION_ERROR", message: "Receipt rejected for review" },
          }),
        });
        return;
      }
      stock += Number(body.quantity);
      data = { id: "receipt", ...body };
    }
    if (path === "/inventory/stock-reductions" && body) {
      stock -= Number(body.quantity);
      data = { id: "reduction", ...body };
    }
    if (path === "/inventory/storage")
      data = product
        ? [
            {
              id: variantID,
              base_unit_id: unitID,
              product_name: product.name,
              variant_name: product.name,
              catalog: "",
              unit: "PCS",
              stock_count: String(stock),
              original_price: "2.00",
              sell_price: "5.00",
              profit: "3.00",
              is_stock_tracked: true,
              allows_decimal: false,
            },
            {
              id: "other-product-variant",
              product_name: product.name,
              variant_name: product.name,
              catalog: "",
              unit: "PCS",
              stock_count: "999",
              sell_price: "99.00",
            },
          ]
        : [];
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
  return calls;
}

for (const width of [1280, 390]) {
  test(`Nano product, opening stock, categories and stock editing at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await setup(page);
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Products & storage" })).toBeVisible();
    await page.getByRole("button", { name: "New product", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
    await dialog.getByLabel("Original price (cost)", { exact: true }).fill("2");
    await dialog.getByLabel("Sell price (retail)", { exact: true }).fill("5");
    await dialog.getByText("Add a category", { exact: true }).click();
    await dialog.getByLabel("New category name").fill("Beverages");
    await dialog.getByRole("button", { name: "Add category", exact: true }).click();
    await expect(dialog.getByLabel("Category (optional)", { exact: true })).toHaveValue(
      "new-category",
    );
    await dialog.getByLabel("Category (optional)", { exact: true }).selectOption("");
    await dialog.getByText("More details", { exact: false }).click();
    await dialog.getByText("Add a brand", { exact: true }).click();
    const addBrand = dialog.getByRole("button", { name: "Add brand", exact: true });
    await expect(addBrand).toBeDisabled();
    await dialog.getByLabel("New brand name").fill("   ");
    await expect(addBrand).toBeDisabled();
    await dialog.getByLabel("New brand name").fill("  Tea House  ");
    await addBrand.click();
    await expect(dialog.getByLabel("Brand", { exact: true })).toHaveValue("new-brand");
    await expect(dialog.getByLabel("New brand name")).toHaveValue("");
    await expect(dialog.getByLabel("Product name", { exact: true })).toHaveValue("Tea");
    expect(calls.filter((call) => call.path === "/catalog/products")).toHaveLength(0);
    expect(calls.find((call) => call.path === "/catalog/brands")?.body).toEqual({
      name: "Tea House",
      is_active: true,
    });
    await dialog.getByLabel("Opening stock (optional)", { exact: true }).fill("10");
    await expect(dialog.getByLabel("Stock location", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(calls.find((call) => call.path === "/catalog/products")?.body.category_ids).toEqual([]);
    expect(calls.find((call) => call.path === "/catalog/products")?.body.brand_id).toBe(
      "new-brand",
    );
    expect(calls.find((call) => call.path === "/inventory/stock-in")?.body).toMatchObject({
      quantity: "10",
      variant_id: variantID,
      unit_id: unitID,
      destination_location_id: locationID,
      unit_cost: "2",
    });
    const table = page.getByRole("table", { name: "Products and storage" });
    await expect(page.getByRole("table")).toHaveCount(1);
    await expect(
      table.getByRole("columnheader", { name: "Stock count", exact: true }),
    ).toBeVisible();
    await expect(table.getByRole("cell", { name: /^(Stock count )?10$/ })).toBeVisible();
    await expect(table.getByRole("cell", { name: /^(Stock count )?999$/ })).toHaveCount(0);
    await expect(table.locator("tbody tr")).toHaveCount(1);
    const actions = table.getByRole("button", { name: "Actions for Tea", exact: true });
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await actions.click();
    const menu = page.getByRole("menu", { name: "Actions for Tea", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveCount(4);
    await expect(menu.getByRole("menuitem", { name: "Edit", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Pack sizes", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(actions).toBeFocused();
    await actions.click();
    await page.getByRole("heading", { name: "Products & storage", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await actions.click();
    await menu.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Edit product", exact: true })).toBeVisible();
    await expect(menu).toHaveCount(0);
    await expect(dialog.getByLabel("Sell price (retail)", { exact: true })).toHaveValue("5.00");
    await expect(dialog.getByLabel("Description", { exact: true })).not.toBeVisible();
    await dialog.getByText("More details", { exact: false }).click();
    await expect(dialog.getByLabel("Brand", { exact: true })).toHaveValue("new-brand");
    await dialog.getByLabel("Brand", { exact: true }).selectOption("");
    await page.screenshot({ path: testInfo.outputPath("nano-edit-product.png") });
    await dialog.getByLabel("Sell price (retail)", { exact: true }).fill("7");
    await dialog.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      calls.find((call) => call.path === `/catalog/products/${productID}`)?.body.brand_id,
    ).toBeUndefined();
    expect(calls.find((call) => call.path === "/pricing/prices")?.body).toMatchObject({
      price_list_id: "retail-list",
      variant_id: variantID,
      amount: "7",
      valid_from: "2026-01-01T00:00:00Z",
    });
    await actions.click();
    await menu.getByRole("menuitem", { name: "Pack sizes", exact: true }).click();
    await expect(dialog.getByRole("link", { name: "Manage prices", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await actions.click();
    await expect(page.getByRole("heading", { name: "Storage", exact: true })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Adjust stock", exact: true }).click();
    await expect(dialog.getByLabel("Stock location", { exact: true })).toHaveCount(0);
    await expect(dialog).toHaveAttribute("aria-label", "Adjust stock");
    await expect(dialog.getByLabel("Stock adjustment", { exact: true })).toHaveValue("increase");
    await dialog.getByLabel("Stock adjustment", { exact: true }).selectOption("reduce");
    await expect(dialog.getByLabel("Reason for reduction", { exact: true })).toBeVisible();
    await dialog.getByLabel("Stock adjustment", { exact: true }).selectOption("increase");
    await expect(dialog.getByLabel("Reason for reduction", { exact: true })).toHaveCount(0);

    await dialog.getByLabel("Quantity to add (PCS)", { exact: true }).fill("3");
    await dialog.getByRole("button", { name: "Add to stock", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(calls.filter((call) => call.path === "/inventory/stock-in").at(-1)?.body).toMatchObject({
      quantity: "3",
      destination_location_id: locationID,
    });
    await actions.click();
    await menu.getByRole("menuitem", { name: "Adjust stock", exact: true }).click();
    const reduction = page.getByRole("dialog", { name: "Adjust stock", exact: true });
    await reduction.getByLabel("Stock adjustment", { exact: true }).selectOption("reduce");
    await expect(reduction.getByLabel("Original price per unit", { exact: true })).toHaveCount(0);
    await expect(reduction.getByLabel("Stock location", { exact: true })).toHaveCount(0);
    await reduction.getByLabel("Quantity to remove (PCS)", { exact: true }).fill("2");
    await reduction.getByLabel("Reason for reduction", { exact: true }).fill("Damaged");
    await reduction.getByRole("button", { name: "Confirm reduction", exact: true }).click();
    await expect(reduction).not.toBeVisible();
    expect(calls.find((call) => call.path === "/inventory/stock-reductions")?.body).toMatchObject({
      quantity: "2",
      reason: "Damaged",
      source_location_id: locationID,
    });
    await expect(table.getByRole("cell", { name: /^(Stock count )?11$/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "New product", exact: true }).click();
    await dialog.getByText("More details", { exact: false }).click();
    await expect(dialog.getByLabel("Brand", { exact: true })).toHaveValue("");
  });
}

test("Nano brand creation failure keeps product details and allows retry", async ({ page }) => {
  const calls = await setup(page, { failBrand: true });
  await page.goto("/catalog");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
  await dialog.getByText("More details", { exact: false }).click();
  await dialog.getByText("Add a brand", { exact: true }).click();
  await dialog.getByLabel("New brand name").fill("Tea House");
  await dialog.getByRole("button", { name: "Add brand", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Brand rejected for review");
  await expect(dialog.getByLabel("Product name", { exact: true })).toHaveValue("Tea");
  await expect(dialog.getByLabel("New brand name")).toHaveValue("Tea House");
  await expect(dialog.getByLabel("Brand", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "Add brand", exact: true }).click();
  await expect(dialog.getByLabel("Brand", { exact: true })).toHaveValue("new-brand");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(calls.filter((call) => call.path === "/catalog/products")).toHaveLength(1);
  expect(calls.find((call) => call.path === "/catalog/products")?.body.brand_id).toBe("new-brand");
});

test("Nano receipt failure preserves the product and stock retry identity", async ({ page }) => {
  const calls = await setup(page, { failReceipt: true });
  await page.goto("/catalog");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
  await dialog.getByLabel("Original price (cost)", { exact: true }).fill("2");
  await dialog.getByLabel("Opening stock (optional)", { exact: true }).fill("3");
  await expect(dialog.getByLabel("Stock location", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(
    dialog.getByText("Product saved. Receipt rejected for review", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Stock to add (optional)", { exact: true })).toHaveValue("3");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(calls.filter((call) => call.path === "/catalog/products")).toHaveLength(1);
  const receipts = calls.filter((call) => call.path === "/inventory/stock-in");
  expect(receipts).toHaveLength(2);
  expect(receipts[0].body.event_key).toBe(receipts[1].body.event_key);
});

test("Nano customer/delivery tabs, service navigation and disabled AI exclusion", async ({
  page,
}) => {
  await setup(page, { aiEnabled: false });
  await page.goto("/customers");
  const tabs = page.getByRole("navigation", { name: "Customers and deliveries" });
  await expect(tabs.getByRole("link", { name: "Customers", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Deliveries", exact: true }).click();
  await expect(tabs.getByRole("link", { name: "Deliveries", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const sidebar = page.locator("aside");
  await expect(sidebar.getByRole("link", { name: "Repair", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Nanonux AI", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Automations", exact: true })).toHaveCount(0);
  await page.goto("/ai-assistant");
  await expect(page).toHaveURL(/\/pos$/);
});

test("Nano staff has read-only combined storage without product creation", async ({ page }) => {
  await setup(page, { role: "staff" });
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New product", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Original price", exact: false }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adjust stock", exact: true })).toHaveCount(0);
});

test("Nano explicit pack prices edit the canonical RETAIL list", async ({ page }) => {
  const calls = await setup(page, { packs: true });
  await page.goto("/catalog");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Actions for Tea", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Box of 6 retail price", { exact: true })).toHaveValue("20.00");
  await dialog.getByLabel("Box of 6 retail price", { exact: true }).fill("24");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const prices = calls.filter((call) => call.path === "/pricing/prices");
  expect(prices).toHaveLength(1);
  expect(prices[0].body).toMatchObject({
    price_list_id: "retail-list",
    variant_id: "pack-variant",
    amount: "24",
  });
});

test("Nano opening stock never uses another shop when its location is missing", async ({
  page,
}) => {
  const calls = await setup(page, { noLocation: true });
  await page.goto("/catalog");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
  await dialog.getByLabel("Original price (cost)", { exact: true }).fill("2");
  await dialog.getByLabel("Opening stock (optional)", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "current shop needs an active stock location",
  );
  expect(calls.filter((call) => call.path === "/catalog/products")).toHaveLength(0);
});

test("Mini keeps Manage prices in Pack sizes", async ({ page }) => {
  await setup(page, { mode: "MINI" });
  await page.goto("/products");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name", { exact: true }).fill("Tea");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Manage pack sizes for Tea", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Manage prices", exact: true })).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`Nano merchant can open Reports directly and from navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { name: "Financial Reports", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Financial breakdown summary", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/reports$/);
    await page.goto("/customers");
    if (width === 390) await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("aside").getByRole("link", { name: "Reports", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Financial Reports", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/reports$/);
  });
}

test("Nano staff cannot open merchant Reports", async ({ page }) => {
  await setup(page, { role: "staff" });
  await page.goto("/customers");
  await expect(
    page.locator("aside").getByRole("link", { name: "Reports", exact: true }),
  ).toHaveCount(0);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/pos$/);
});

for (const mode of ["MINI", "SIMPLE", "COMPLEX"]) {
  test(`${mode} customers and deliveries share tabs and sidebar entry`, async ({ page }) => {
    await setup(page, { mode });
    await page.goto("/customers");
    const tabs = page.getByRole("navigation", { name: "Customers and deliveries" });
    await expect(tabs.getByRole("link", { name: "Customers", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await tabs.getByRole("link", { name: "Deliveries", exact: true }).click();
    await expect(tabs.getByRole("link", { name: "Deliveries", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.locator("aside").getByRole("link", { name: "Deliveries", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator("aside").getByRole("link", { name: "Customers & deliveries", exact: true }),
    ).toHaveClass("active");
  });
}

for (const width of [390, 1280]) {
  test(`Mini reorganized catalog, storage and history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, { mode: "MINI" });
    await page.goto("/catalog");
    const main = page.locator("main");
    await expect(main.locator('a[href="/products"]')).toHaveCount(0);
    await expect(main.locator('a[href="/stock-conversions"]')).toBeVisible();
    await expect(main.locator('a[href="/stock-barcodes"]')).toBeVisible();
    await main.locator('a[href="/stock-conversions"]').click();
    await expect(
      page.getByRole("heading", { name: "Stock conversion", exact: true }),
    ).toBeVisible();
    await page.goto("/storage");
    await expect(
      page.getByRole("heading", { name: "Products & storage", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New product", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const productDialog = page.getByRole("dialog");
    await expect(productDialog.getByLabel("Category (optional)", { exact: true })).toBeVisible();
    await expect(productDialog.getByText("Add a category", { exact: true })).toHaveCount(0);
    await productDialog.getByText("More details", { exact: false }).click();
    await expect(productDialog.getByLabel("Brand", { exact: true })).toBeVisible();
    await expect(productDialog.getByText("Add a brand", { exact: true })).toHaveCount(0);
    await page.goto("/history");
    const tabs = page.getByRole("navigation", { name: "History", exact: true });
    await expect(tabs.locator('a[href="/history"]')).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Transaction history", exact: true }).click();
    await expect(
      tabs.getByRole("link", { name: "Transaction history", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      main.getByRole("heading", { name: "Transaction history", exact: true }),
    ).toBeVisible();
    await tabs.locator('a[href="/history"]').click();
    await expect(
      main.getByRole("heading", { name: "Stock Movement History", exact: true }),
    ).toBeVisible();
  });
}

for (const mode of ["NANO", "MINI"]) {
  for (const width of [390, 1280]) {
    test(`${mode} Products and storage header filters before pagination at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await setup(page, { mode });
      const products = Array.from({ length: 12 }, (_, index) => ({
        id: `filter-product-${index + 1}`,
        name: `Item ${String(index + 1).padStart(2, "0")}`,
        barcode: `CODE${index + 1}`,
        product_type: "PHYSICAL",
        is_active: index !== 11,
        category_ids: index === 11 ? ["filter-category"] : [],
        brand_id: index === 11 ? "filter-brand" : undefined,
        expired_date: index === 11 ? "2028-10-20" : undefined,
        manufacture_date: index === 11 ? "2026-05-02" : undefined,
      }));
      const fulfill = (route: import("@playwright/test").Route, data: unknown[]) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data,
            meta: { total: data.length, total_pages: 1, page_size: 100 },
          }),
        });
      await page.route("**/api/v1/catalog/products?*", (route) => fulfill(route, products));
      await page.route("**/api/v1/catalog/brands?*", (route) =>
        fulfill(route, [{ id: "filter-brand", name: "Tea House", is_active: true }]),
      );
      await page.route("**/api/v1/catalog/categories?*", (route) =>
        fulfill(route, [{ id: "filter-category", name: "Beverages", sort_order: 0 }]),
      );
      await page.route("**/api/v1/catalog/products/*/variants?*", (route) => {
        const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
        return fulfill(
          route,
          id === "filter-product-11"
            ? []
            : [
                { id: `variant-${id}`, product_id: id },
                ...(id === "filter-product-12" ? [{ id: "filter-pack", product_id: id }] : []),
              ],
        );
      });
      await page.route("**/api/v1/inventory/storage?*", (route) =>
        fulfill(route, [
          ...products
            .filter((product) => product.id !== "filter-product-11")
            .map((product, index) => ({
              id: `variant-${product.id}`,
              product_name: product.name,
              variant_name: `${product.name} piece`,
              unit: "PCS",
              stock_count: String(index + 1),
              sell_price: "5.00",
              original_price: "2.00",
              profit: "3.00",
              catalog: "",
            })),
          {
            id: "filter-pack",
            product_name: "Item 12",
            variant_name: "Box of 6",
            unit: "BOX",
            stock_count: "12.000",
            sell_price: "30.00",
            original_price: "12.00",
            profit: "18.00",
            catalog: "",
          },
          {
            id: "unrelated-variant",
            product_name: "Item 12",
            variant_name: "Unrelated",
            unit: "PCS",
            stock_count: "999",
          },
        ]),
      );
      await page.goto("/products-and-storage");
      const table = page.getByRole("table", { name: "Products and storage" });
      await expect(table.locator("tbody tr")).toHaveCount(10);
      await expect(page.getByRole("navigation", { name: "product rows pagination" })).toContainText(
        "13",
      );
      await page
        .getByRole("navigation", { name: "product rows pagination" })
        .getByRole("button", { name: "Next", exact: true })
        .click();
      await expect(table.getByRole("button", { name: /^Item 11 CODE11$/ })).toBeVisible();
      await table.getByLabel("Filter Product", { exact: true }).fill("CODE12");
      await expect(table.locator("tbody tr")).toHaveCount(2);
      await expect(page.getByRole("navigation", { name: "product rows pagination" })).toContainText(
        "1\u20132",
      );
      await table.getByLabel("Filter Product variant", { exact: true }).fill("Box");
      await expect(table.locator("tbody tr")).toHaveCount(1);
      for (const [label, value] of [
        ["Brand", "tea house"],
        ["Classification", "BEVERAGES"],
        ["Unit", "BOX"],
        ["Stock count", "12"],
        ["RETAIL sell price", "30"],
        ["Original price", "12"],
        ["Profit", "18"],
        ["Expiration date", "2028-10"],
        ["Manufacture date", "2026-05"],
      ]) {
        await table.getByLabel(`Filter ${label}`, { exact: true }).fill(value);
        await expect(table.getByRole("cell", { name: "Box of 6", exact: true })).toBeVisible();
      }
      await table.getByLabel("Filter Status", { exact: true }).selectOption("Active");
      await expect(table.getByText("No products found", { exact: true })).toBeVisible();
      await expect(table.getByLabel("Filter Brand", { exact: true })).toBeVisible();
      await table.getByLabel("Filter Status", { exact: true }).selectOption("Inactive");
      await expect(table.getByRole("cell", { name: "Box of 6", exact: true })).toBeVisible();
      await page.screenshot({ path: `playwright-column-filter-results/${mode}-${width}.png` });
      await table.getByRole("button", { name: "Clear filters", exact: true }).click();
      await expect(table.locator("tbody tr")).toHaveCount(10);
      await expect(table.getByLabel("Filter Product", { exact: true })).toHaveValue("");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
}
