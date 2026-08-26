import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const user = {
  id: "44444444-4444-4444-4444-444444444444",
  membership_id: "55555555-5555-5555-5555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.com",
  display_name: "Responsive Test Owner",
  is_active: true,
  platform_admin: false,
  roles: [
    {
      id: "66666666-6666-6666-6666-666666666666",
      code: "merchant",
      name: "Merchant",
      permission_codes: ["tenant.read", "tenant.write", "membership.manage"],
    },
  ],
};

const workspaceRoutes = [
  "/merchant/dashboard",
  "/staff/dashboard",
  "/pos",
  "/catalog",
  "/catalog/attributes",
  "/products",
  "/categories",
  "/brands",
  "/units",
  "/unit-conversions",
  "/pricing",
  "/storage",
  "/stock-in",
  "/stock-assets",
  "/stock-movements",
  "/stock-movements/movement-id",
  "/transaction-history",
  "/transaction-history/transaction-id",
  "/customers",
  "/customers/customer-id/edit",
  "/deliveries",
  "/deliveries/delivery-id/edit",
  "/repairs",
  "/repairs/repair-id/edit",
  "/repairs/catalog",
  "/repairs/sync-review/operation-id",
  "/invoices",
  "/reports",
  "/promotions",
  "/accounts",
  "/settings",
  "/settings/application",
  "/settings/merchant",
  "/settings/printer",
  "/settings/repair-specs",
  "/settings/staff",
  "/settings/tax-notes",
];

async function mockWorkspace(
  page: Page,
  posCatalog: Record<string, unknown>[] = [],
  invoices: Record<string, unknown>[] = [],
) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/me") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: user }),
      });
      return;
    }
    if (path === "/merchant") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: merchantID,
            name: "Responsive Test Merchant",
            slug: "responsive-test",
            default_currency_code: "USD",
            timezone: "UTC",
            pos_complexity_level: "COMPLEX",
            is_active: true,
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
              name: "Main Shop With A Long Mobile Name",
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
    if (path === "/currencies") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: [{ code: "USD", name: "US Dollar", symbol: "$", decimal_places: 2 }],
        }),
      });
      return;
    }
    if (path === "/pos/catalog") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: posCatalog,
          meta: { page_index: 0, page_size: 200, total: posCatalog.length, total_pages: 1 },
        }),
      });
      return;
    }
    if (path === "/invoices") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: invoices,
          meta: { page_index: 0, page_size: 200, total: invoices.length, total_pages: 1 },
        }),
      });
      return;
    }
    if (/^\/(?:inventory\/movements|transaction-history)\/[^/]+$/.test(path)) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: null }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: { page_index: 0, page_size: 200, total: 0, total_pages: 1 },
      }),
    });
  });
  await page.addInitScript(
    ({ testUser, selectedShopID }) => {
      localStorage.setItem(
        "bc.session",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "Bearer",
          expires_at: "2099-01-01T00:00:00Z",
          user: testUser,
        }),
      );
      localStorage.setItem("bc.current-shop", selectedShopID);
    },
    { testUser: user, selectedShopID: shopID },
  );
}

for (const viewport of [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe(`${viewport.name} workspace`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of workspaceRoutes) {
      test(`${route} stays within the viewport`, async ({ page }) => {
        await mockWorkspace(page);
        await page.goto(route);
        await page.waitForLoadState("networkidle");

        await expect(page.locator(".main-area")).toBeVisible();
        const overflow = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                element,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              };
            })
            .filter(
              ({ element, left, right, width }) =>
                width > 0 &&
                (right > viewportWidth + 1 || left < -1) &&
                getComputedStyle(element).position !== "fixed",
            )
            .slice(0, 8)
            .map(({ element, left, right, width }) => ({
              node: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${
                element.className && typeof element.className === "string"
                  ? `.${element.className.trim().replace(/\s+/g, ".")}`
                  : ""
              }`,
              left,
              right,
              width,
            }));
          return {
            body: document.body.scrollWidth - viewportWidth,
            document: document.documentElement.scrollWidth - viewportWidth,
            offenders,
          };
        });
        expect(
          { body: overflow.body, document: overflow.document },
          `${route} must not create page-level horizontal scrolling. Offenders: ${JSON.stringify(overflow.offenders)}`,
        ).toEqual({ body: 0, document: 0 });
      });
    }
  });
}

test("public entry pages stay within a narrow phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of ["/login", "/offline"]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} must not create page-level horizontal scrolling`).toBe(0);
  }
});

test.describe("phone interactions", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("navigation drawer remains usable and dismissible", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/merchant/dashboard");
    await page.getByRole("button", { name: "Open menu" }).click();
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toHaveClass(/open/);
    await expect(sidebar).toBeInViewport();
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(sidebar).not.toHaveClass(/open/);
  });

  test("POS current order expands without leaving the viewport", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/pos");
    const toggle = page.locator(".mobile-cart-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Current order" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("POS product cards show and adjust cart quantity", async ({ page }) => {
    await mockWorkspace(page, [
      {
        id: "77777777-7777-7777-7777-777777777777",
        product_name: "Phone cases",
        name: "Blue phone case",
        sku: "CASE-BLUE",
        price: "12.50",
        is_stock_tracked: true,
        quantity_on_hand: "5",
      },
    ]);
    await page.goto("/pos");

    const product = page.locator(".product-tile").filter({ hasText: "Blue phone case" });
    const quantity = product.getByLabel("Blue phone case quantity in cart");
    await expect(quantity).toHaveText("0");

    await product.getByRole("button", { name: "Add Blue phone case to cart" }).click();
    await product.getByRole("button", { name: "Add Blue phone case to cart" }).click();
    await expect(quantity).toHaveText("2");

    await product.getByRole("button", { name: "Decrease Blue phone case quantity" }).click();
    await expect(quantity).toHaveText("1");
    await product.getByRole("button", { name: "Increase Blue phone case quantity" }).click();
    await expect(quantity).toHaveText("2");
  });

  test("invoice preview opens from the full row", async ({ page }) => {
    await mockWorkspace(
      page,
      [],
      [
        {
          id: "88888888-8888-8888-8888-888888888888",
          number: "INV-ROW-001",
          customer: "Walk-in customer",
          merchant_name: "Responsive Test Merchant",
          shop_name: "Main Shop With A Long Mobile Name",
          shop_id: shopID,
          currency_code: "USD",
          created_at: "2026-08-15T10:00:00Z",
          status: "Paid",
          kind: "pos",
          subtotal: "12.50",
          discount_total: "0",
          tax_total: "0",
          grand_total: "12.50",
          items: [{ name: "Blue phone case", quantity: "1", unit_price: "12.50" }],
        },
      ],
    );
    await page.goto("/invoices");

    const row = page.locator(".invoice-row");
    await row.getByText("Walk-in customer").click();
    const dialog = page.getByRole("dialog", { name: "Invoice details" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("INV-ROW-001");
    await dialog.getByRole("button", { name: "Close" }).click();

    await row.focus();
    await row.press("Enter");
    await expect(dialog).toBeVisible();
  });

  test("shared create modal fits the phone viewport", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dialog = page.getByRole("dialog", { name: "New product" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  });
});
