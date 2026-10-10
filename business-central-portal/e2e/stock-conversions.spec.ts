import { expect, test, type Page } from "@playwright/test";

const productId = "33333333-3333-3333-3333-333333333333";
const sourceId = "44444444-4444-4444-4444-444444444444";
const destinationId = "99999999-9999-9999-9999-999999999999";
const shopId = "22222222-2222-2222-2222-222222222222";
const locationId = "55555555-5555-5555-5555-555555555555";
const unitId = "66666666-6666-6666-6666-666666666666";
const product = {
  id: productId,
  name: "Cotton wool",
  product_type: "PHYSICAL",
  barcode: "CW001",
  is_active: true,
  category_ids: [],
  category_names: [],
};
const source = {
  id: sourceId,
  product_id: productId,
  name: "Large pack",
  sku: "CW-LARGE",
  base_unit_id: unitId,
  unit_of_measure: "pack",
  is_stock_tracked: true,
};
const small = { ...source, id: destinationId, name: "Small packet", sku: "CW-SMALL" };
const rule = {
  id: "rule-1",
  product_id: productId,
  product_name: product.name,
  source_variant_id: sourceId,
  source_variant_name: source.name,
  source_sku: source.sku,
  destination_variant_id: destinationId,
  destination_variant_name: small.name,
  destination_sku: small.sku,
  destination_quantity: 30,
  is_active: true,
};

async function setup(
  page: Page,
  mode: string,
  {
    role = "merchant",
    preset = false,
    readOnly = false,
    failOptions = false,
    failRules = false,
    failApply = false,
  } = {},
) {
  const user = {
    id: "user",
    membership_id: "membership",
    merchant_id: "11111111-1111-1111-1111-111111111111",
    display_name: "Pack user",
    email: "pack@example.test",
    is_active: true,
    platform_admin: false,
    roles: [
      {
        id: "role",
        code: role,
        name: role,
        permission_codes: readOnly
          ? ["tenant.read"]
          : ["tenant.read", "tenant.write", "membership.manage"],
      },
    ],
  };
  const calls: { path: string; body: Record<string, unknown>; key?: string }[] = [];
  const variants = preset ? [source, small] : [source];
  const rules = preset ? [rule] : [];
  const history: Record<string, unknown>[] = [];
  const rejectOptions = failOptions;
  const rejectRules = failRules;
  let rejectApply = failApply;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const body = request.method() === "GET" ? undefined : request.postDataJSON();
    if (body) calls.push({ path, body, key: request.headers()["idempotency-key"] });
    if (
      (path.endsWith("/variants") && rejectOptions) ||
      (path === "/inventory/stock-conversion-rules" && rejectRules) ||
      (path === "/inventory/stock-conversions" && body && rejectApply)
    ) {
      if (path === "/inventory/stock-conversions" && body) rejectApply = false;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "TEST_ERROR", message: "Temporary failure" } }),
      });
      return;
    }
    let data: unknown = [];
    let totalPages = 1;
    if (path === "/sync/handshake")
      data = {
        protocol_version: "1",
        schema_version: "1",
        server_sequence: 0,
        device: { id: "device" },
        session: { id: "sync-session", scope: "merchant" },
      };
    if (path === "/sync/pull")
      data = { changes: [], next_sequence: 0, current_sequence: 0, has_more: false };
    if (path === "/sync/push" && body) {
      const operations = body.operations as {
        operation_id: string;
        entity_id: string;
        entity_type: string;
        payload: Record<string, unknown>;
      }[];
      data = {
        results: operations.map((operation) => {
          if (operation.entity_type === "CATALOG_VARIANT")
            variants.push({
              ...small,
              ...operation.payload,
              id: operation.payload.sku ? small.id : operation.entity_id,
              sku: String(
                operation.payload.sku || `OPT-${operation.entity_id.replaceAll("-", "")}`,
              ),
              base_unit_id: String(operation.payload.base_unit_id || source.base_unit_id),
              unit_of_measure: String(operation.payload.unit_of_measure || source.unit_of_measure),
            });
          return { operation_id: operation.operation_id, status: "APPLIED", entity_version: 1 };
        }),
      };
    }
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: user.merchant_id,
        name: "Pack shop",
        slug: "pack",
        default_currency_code: "USD",
        pos_complexity_level: mode,
        is_active: true,
      };
    if (path === "/shops")
      data = [{ id: shopId, name: "Main shop", code: "MAIN", is_active: true, module_codes: [] }];
    if (path === "/units")
      data = [{ id: unitId, name: "Pcs", code: "PCS", is_active: true, allows_decimal: false }];
    if (path === "/catalog/products") {
      // The selected product is on a later page, exercising complete collection loading.
      totalPages = 2;
      data =
        url.searchParams.get("page_index") === "1"
          ? [product]
          : [{ ...product, id: "other-product", name: "Charger" }];
    }
    if (path === `/catalog/products/${productId}`) data = product;
    if (path === `/catalog/products/${productId}/variants`) {
      if (body) {
        const created = { ...small, ...body };
        variants.push(created);
        data = created;
      } else data = variants;
    }
    if (path === "/inventory/stock-conversion-rules") {
      if (body) {
        rules.splice(0, rules.length, { ...rule, ...body });
        data = rules[0];
      } else data = rules;
    }
    if (path === "/inventory/locations")
      data = [
        {
          id: locationId,
          name: "Stock room",
          shop_id: shopId,
          is_active: true,
          location_type: "SHOP",
        },
        {
          id: "other-location",
          name: "Other shop location",
          shop_id: "other-shop",
          is_active: true,
        },
      ];
    if (path === "/inventory/stock-conversions/preview") {
      const quantity = Number(url.searchParams.get("quantity"));
      data = {
        rule_id: rule.id,
        location_id: locationId,
        source_quantity: quantity,
        destination_quantity: quantity * 30,
        source_before: "10.000000",
        source_after: (10 - quantity).toFixed(6),
        destination_before: "0.000000",
        destination_after: (quantity * 30).toFixed(6),
      };
    }
    if (path === "/inventory/stock-conversions") {
      if (body) {
        const item = {
          id: "conversion-1",
          rule_id: rule.id,
          location_id: locationId,
          source_quantity: Number(body.quantity),
          destination_quantity: Number(body.quantity) * 30,
          applied_at: "2026-10-09T10:00:00Z",
        };
        history.push(item);
        data = item;
      } else data = history;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data,
        meta: { total_pages: totalPages, total: Array.isArray(data) ? data.length : 1 },
      }),
    });
  });
  await page.addInitScript(
    ({ user, shopId }) => {
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
      localStorage.setItem("bc.current-shop", shopId);
    },
    { user, shopId },
  );
  return calls;
}

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  for (const width of [1280, 390]) {
    test(`${mode} product, option creation, pack ratio and conversion at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const calls = await setup(page, mode);
      await page.goto("/stock-conversions");
      await expect(page.getByLabel("Search products", { exact: true })).toHaveCount(0);
      await page.getByLabel("Product", { exact: true }).selectOption(productId);
      await expect(page).toHaveURL(new RegExp(`product_id=${productId}`));
      await expect(
        page.getByText("This product has only one stock-tracked sellable option.", {
          exact: false,
        }),
      ).toBeVisible();
      await page.getByLabel("Larger pack to break", { exact: true }).selectOption(sourceId);
      await expect(
        page.getByLabel("Smaller unit to receive", { exact: true }).locator("option"),
      ).toHaveCount(1);
      await page.getByRole("button", { name: "Add sellable option", exact: true }).click();
      const editor = page.getByRole("dialog", {
        name: mode === "COMPLEX" ? "New variant" : "New sellable option",
        exact: true,
      });
      await editor
        .getByLabel(mode === "COMPLEX" ? "Variant name" : "Sellable option name", { exact: true })
        .fill(small.name);
      await editor.getByLabel("SKU", { exact: true }).fill(small.sku);
      await editor.getByLabel("Base unit", { exact: true }).selectOption(unitId);
      await page.evaluate(() => window.dispatchEvent(new Event("bc-resource-refresh")));
      await expect(
        editor.getByLabel(mode === "COMPLEX" ? "Variant name" : "Sellable option name", {
          exact: true,
        }),
      ).toHaveValue(small.name);
      await expect(editor.getByLabel("SKU", { exact: true })).toHaveValue(small.sku);

      await editor
        .getByRole("button", {
          name: mode === "COMPLEX" ? "Save variant" : "Save sellable option",
          exact: true,
        })
        .click();
      await expect(editor).toHaveCount(0);
      const optionsDialog = page.getByRole("dialog", {
        name: `Cotton wool \u00b7 ${mode === "COMPLEX" ? "Variants" : "Sellable options"}`,
        exact: true,
      });
      await expect(
        optionsDialog.getByRole("link", { name: "Stock conversion", exact: true }),
      ).toHaveAttribute("href", `/stock-conversions?product_id=${productId}`);
      await optionsDialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByLabel("Larger pack to break", { exact: true })).toHaveValue(sourceId);
      await expect(page.getByLabel("Product", { exact: true })).toHaveValue(productId);
      await page.getByLabel("Smaller unit to receive", { exact: true }).selectOption(destinationId);
      await page.getByLabel("Smaller units inside one larger pack", { exact: true }).fill("30");
      await expect(page.getByText("1 Large pack = 30 Small packet", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Save pack size", exact: true }).click();
      await expect(page.getByLabel("Pack size", { exact: true })).toHaveValue(rule.id);
      expect(calls.find((call) => call.path === "/inventory/stock-conversion-rules")?.body).toEqual(
        {
          source_variant_id: sourceId,
          destination_variant_id: destinationId,
          destination_quantity: 30,
          is_active: true,
        },
      );
      await expect(page.getByLabel("Pack size", { exact: true })).toHaveValue(rule.id);
      await expect(page.getByLabel("Stock location", { exact: true })).toHaveCount(0);
      await page.getByLabel("Packs to break", { exact: true }).fill("2");
      const confirm = page.getByRole("button", { name: "Confirm stock conversion", exact: true });
      await expect(confirm).toBeDisabled();
      await page.getByRole("button", { name: "Preview stock change", exact: true }).click();
      await expect(confirm).toBeEnabled();
      await page.getByLabel("Packs to break", { exact: true }).fill("3");
      await expect(confirm).toBeDisabled();
      await page.getByLabel("Packs to break", { exact: true }).fill("2");
      await expect(confirm).toBeDisabled();
      await page.getByLabel("Packs to break", { exact: true }).fill("3");
      await expect(
        page.getByText("Break 3 Large pack to receive 90 Small packet.", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Preview stock change", exact: true }).click();
      await expect(confirm).toBeEnabled();
      const stockPreview = page
        .getByRole("status")
        .filter({ hasText: "Stock change at Main shop" });
      await expect(stockPreview).toContainText("10");
      await expect(stockPreview).not.toContainText(".000000");
      await page.screenshot({
        path: testInfo.outputPath(`stock-conversion-${mode}-${width}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await confirm.click();
      await expect(
        page.getByText("Broke 3 Large pack into 90 Small packet.", { exact: true }),
      ).toBeVisible();
      const conversion = calls.find((call) => call.path === "/inventory/stock-conversions");
      expect(conversion?.key).toBeTruthy();
      expect(conversion?.body.location_id).toBe(locationId);
      await expect(
        page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: "Recent conversions", exact: true }) })
          .getByRole("listitem"),
      ).toHaveCount(1);
    });
  }
  test(`${mode} staff can convert but cannot configure packs`, async ({ page }) => {
    await setup(page, mode, { role: "staff", preset: true });
    await page.goto("/stock-conversions");
    await expect(page.getByRole("heading", { name: "Convert stock", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set up a pack size", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
    await page.getByRole("button", { name: "Preview stock change", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Confirm stock conversion", exact: true }),
    ).toBeEnabled();
  });
}

test("option load failures are distinct from missing options and recover", async ({ page }) => {
  // Isolate manual retry from the background refresh covered by the mode tests.
  await page.addInitScript(() =>
    window.addEventListener("bc-resource-refresh", (event) => event.stopImmediatePropagation()),
  );
  await setup(page, "NANO", { failOptions: true });
  await page.goto(`/stock-conversions?product_id=${productId}`);
  await expect(
    page.getByRole("alert").filter({ hasText: "Sellable options could not load" }),
  ).toBeVisible();
  await expect(
    page.getByText("This product has only one stock-tracked sellable option.", { exact: false }),
  ).toHaveCount(0);
  await page.route(`**/catalog/products/${productId}/variants?**`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [source], meta: { total_pages: 1 } }),
    }),
  );
  await page.getByRole("button", { name: "Retry options", exact: true }).click();
  await expect(page.getByLabel("Larger pack to break", { exact: true })).toBeVisible();
});

test("pack load failures are distinct from empty packs and recover", async ({ page }) => {
  await page.addInitScript(() =>
    window.addEventListener("bc-resource-refresh", (event) => event.stopImmediatePropagation()),
  );
  await setup(page, "MINI", { preset: true, failRules: true });
  await page.goto("/stock-conversions");
  await expect(
    page.getByRole("alert").filter({ hasText: "Pack sizes could not load" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "No pack sizes yet", exact: true })).toHaveCount(
    0,
  );
  await page.route("**/inventory/stock-conversion-rules", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [rule], meta: {} }),
    }),
  );
  await page.getByRole("button", { name: "Retry pack sizes", exact: true }).click();
  await expect(page.getByLabel("Pack size", { exact: true })).toBeVisible();
});

test("failed conversion retries retain the idempotency key", async ({ page }) => {
  const calls = await setup(page, "SIMPLE", { preset: true, failApply: true });
  await page.goto("/stock-conversions");
  await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
  await page.getByRole("button", { name: "Preview stock change", exact: true }).click();
  await page.getByRole("button", { name: "Confirm stock conversion", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Temporary failure" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm stock conversion", exact: true }).click();
  await expect(
    page.getByText("Broke 1 Large pack into 30 Small packet.", { exact: true }),
  ).toBeVisible();
  const conversions = calls.filter((call) => call.path === "/inventory/stock-conversions");
  expect(conversions).toHaveLength(2);
  expect(conversions[0].key).toBe(conversions[1].key);
});

test("read-only users cannot create options or convert", async ({ page }) => {
  await setup(page, "COMPLEX", { role: "staff", readOnly: true, preset: true });
  await page.goto("/stock-conversions");
  await expect(page.getByRole("heading", { name: "Convert stock", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add sellable option", exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
  await expect(
    page.getByRole("button", { name: "Preview stock change", exact: true }),
  ).toBeDisabled();
});

test("changing products clears pack options and offline disables mutations", async ({
  page,
  context,
}) => {
  const calls = await setup(page, "NANO", { preset: true });
  await page.goto(`/stock-conversions?product_id=${productId}`);
  await page.getByLabel("Larger pack to break", { exact: true }).selectOption(sourceId);
  await page.getByLabel("Smaller unit to receive", { exact: true }).selectOption(destinationId);
  await page.getByLabel("Smaller units inside one larger pack", { exact: true }).fill("30");
  await page.getByLabel("Product", { exact: true }).selectOption("other-product");
  await expect(
    page.getByText("This product has no stock-tracked sellable options.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Larger pack to break", { exact: true })).toHaveValue("");
  await page.getByLabel("Product", { exact: true }).selectOption(productId);
  await expect(page.getByLabel("Larger pack to break", { exact: true })).toHaveValue("");
  await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
  await page.getByRole("button", { name: "Preview stock change", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm stock conversion", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await expect(
    page.getByText(
      "Connect to set pack sizes or convert stock. Saved information can still be viewed.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add sellable option", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Confirm stock conversion", exact: true }),
  ).toBeDisabled();
  expect(calls.filter((call) => call.path === "/inventory/stock-conversions")).toHaveLength(0);
});

test("first sellable-option draft survives background refresh", async ({ page }) => {
  await setup(page, "NANO");
  await page.goto("/stock-conversions?product_id=other-product");
  await expect(
    page.getByText("This product has no stock-tracked sellable options.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sellable option", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "New sellable option", exact: true });
  await editor.getByLabel("Sellable option name", { exact: true }).fill("Large pack");
  await editor.getByLabel("SKU", { exact: true }).fill("FIRST-PACK");
  await page.evaluate(() => window.dispatchEvent(new Event("bc-resource-refresh")));
  await expect(editor.getByLabel("Sellable option name", { exact: true })).toHaveValue(
    "Large pack",
  );
  await expect(editor.getByLabel("SKU", { exact: true })).toHaveValue("FIRST-PACK");
});

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  test(`${mode} creates a sellable option using only its name`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const calls = await setup(page, mode);
    await page.goto(`/stock-conversions?product_id=${productId}`);
    await page.getByRole("button", { name: "Add sellable option", exact: true }).click();
    const editor = page.getByRole("dialog", {
      name: mode === "COMPLEX" ? "New variant" : "New sellable option",
      exact: true,
    });
    await expect(
      editor.locator("input[required], select[required], textarea[required]"),
    ).toHaveCount(1);
    await editor
      .getByLabel(mode === "COMPLEX" ? "Variant name" : "Sellable option name", { exact: true })
      .fill("Loose packet");
    await expect(editor.getByLabel("Unit label", { exact: true })).toHaveValue(
      source.unit_of_measure,
    );
    await expect(editor.getByLabel("SKU", { exact: true })).toHaveValue("");
    await editor
      .getByRole("button", {
        name: mode === "COMPLEX" ? "Save variant" : "Save sellable option",
        exact: true,
      })
      .click();
    await expect(editor).toHaveCount(0);
    const push = calls.find((call) => call.path === "/sync/push");
    expect(push).toBeTruthy();
    const operations = push!.body.operations as {
      entity_id: string;
      payload: Record<string, unknown>;
    }[];
    expect(operations[0].payload).toMatchObject({
      name: "Loose packet",
      sku: "",
      base_unit_id: source.base_unit_id,
      unit_of_measure: source.unit_of_measure,
      is_stock_tracked: true,
    });
    const manager = page.getByRole("dialog");
    await expect(
      manager.getByText(`OPT-${operations[0].entity_id.replaceAll("-", "")}`, { exact: true }),
    ).toBeVisible();
  });
}

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  test(`${mode} cannot convert using another shop's stock`, async ({ page }) => {
    const calls = await setup(page, mode, { preset: true });
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
    await page.goto("/stock-conversions");
    await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
    await expect(
      page.getByText("Stock is not configured for the selected shop.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preview stock change", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Confirm stock conversion", exact: true }),
    ).toBeDisabled();
    expect(calls.filter((call) => call.path === "/inventory/stock-conversions")).toHaveLength(0);
  });
}

test("conversion stock loading failures disable preview and recover", async ({ page }) => {
  await setup(page, "SIMPLE", { preset: true });
  await page.route("**/inventory/locations?**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Stock unavailable", code: "TEST_ERROR" } }),
    }),
  );
  await page.goto("/stock-conversions");
  await page.getByLabel("Pack size", { exact: true }).selectOption(rule.id);
  await expect(
    page.getByRole("alert").filter({ hasText: "Shop stock could not load" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview stock change", exact: true }),
  ).toBeDisabled();
  await page.route("**/inventory/locations?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: locationId,
            shop_id: shopId,
            location_type: "SHOP",
            is_active: true,
          },
        ],
        meta: { total_pages: 1 },
      }),
    }),
  );
  await page.getByRole("button", { name: "Retry shop stock", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview stock change", exact: true }),
  ).toBeEnabled();
});
