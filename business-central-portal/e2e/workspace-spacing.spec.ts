import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const user = {
  id: "44444444-4444-4444-4444-444444444444",
  membership_id: "55555555-5555-5555-5555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.com",
  display_name: "Executive Test Owner",
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

async function setupExecutiveSession(
  page: Page,
  activeTheme = "default-theme",
  activeLayout = "modern-executive-layout",
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
            name: "Executive Luxe Store",
            slug: "executive-luxe",
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
              merchant_id: merchantID,
              name: "Flagship Luxury Boutique",
              code: "LUXE-01",
              is_active: true,
              business_type_name: "High-End Retail & Repairs",
              module_codes: ["pos", "repair", "inventory", "delivery", "accounts"],
              address: {
                address_line1: "100 Prestige Avenue",
                city: "Metropolis",
                state: "NY",
                postal_code: "10001",
                country: "US",
              },
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
          data: [
            {
              id: "prod-101",
              product_name: "Executive Smart Watches",
              name: "Executive Smart Watch Titanium",
              price: "599.00",
              sku: "WATCH-TI",
              is_stock_tracked: true,
              quantity_on_hand: "18",
            },
            {
              id: "prod-102",
              product_name: "Accessories",
              name: "Sapphire Crystal Protector",
              price: "49.00",
              sku: "PROT-SAPPH",
              is_stock_tracked: true,
              quantity_on_hand: "45",
            },
          ],
          meta: { page_index: 0, page_size: 200, total: 2, total_pages: 1 },
        }),
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
    ({ testUser, selectedShopID, layout, theme }) => {
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
      localStorage.setItem("bc.layout", layout);
      localStorage.setItem("layout", layout);
      localStorage.setItem("bc_layout", layout);
      localStorage.setItem("bc.theme", theme);
      localStorage.setItem("theme", theme);
      localStorage.setItem("bc_theme", theme);
      document.cookie = `bc.layout=${layout}; path=/; max-age=31536000`;
      document.cookie = `bc.theme=${theme}; path=/; max-age=31536000`;
    },
    {
      testUser: user,
      selectedShopID: shopID,
      layout: activeLayout,
      theme: activeTheme,
    },
  );
}

const routes = [
  "/merchant/dashboard",
  "/staff/dashboard",
  "/products",
  "/catalog",
  "/categories",
  "/brands",
  "/units",
  "/unit-conversions",
  "/pricing",
  "/stock-in",
  "/stock-conversions",
  "/storage",
  "/stock-assets",
  "/stock-movements",
  "/customers",
  "/deliveries",
  "/transaction-history",
  "/accounts",
  "/promotions",
  "/reports",
  "/repairs",
  "/repairs/desk",
  "/repairs/catalog",
  "/repairs/issue-presets",
  "/repairs/condition-presets",
  "/automations",
  "/automations/telegram",
  "/settings",
  "/settings/merchant",
  "/settings/staff",
  "/settings/payment-types",
  "/settings/printer",
  "/settings/language",
  "/settings/theme",
  "/settings/application",
  "/settings/repair-specs",
  "/settings/tax-notes",
  "/profile",
  "/guide",
  "/pos",
  "/ai-assistant",
];
for (const layout of ["default-layout", "compact-layout", "modern-executive-layout"]) {
  for (const width of [320, 390, 768, 1280]) {
    test(layout + " spacing and route coverage at " + width + "px", async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await setupExecutiveSession(page, "default-theme", layout);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator(".content")).toBeVisible();
        await expect(page.locator(".content")).not.toContainText("Application error");
        const metrics = await page.locator(".content").evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            padding: parseFloat(cs.paddingLeft),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });
        expect(metrics.overflow, route + " must fit the viewport").toBeLessThanOrEqual(1);
        const syncContext = await page.locator(".topbar-context").evaluate((element) => ({
          contentWidth: element.scrollWidth,
          width: element.clientWidth,
        }));
        expect(
          syncContext.contentWidth,
          route + " sync controls must not overlap",
        ).toBeLessThanOrEqual(syncContext.width + 1);
        if (!["/pos", "/ai-assistant"].includes(route)) {
          expect(metrics.padding, route + " gutter").toBeGreaterThanOrEqual(10);
          expect(metrics.padding, route + " gutter").toBeLessThanOrEqual(24);
        }
        if (
          [
            "/merchant/dashboard",
            "/products",
            "/stock-conversions",
            "/automations/telegram",
            "/settings",
            "/guide",
            "/pos",
          ].includes(route)
        ) {
          await page.screenshot({
            path: testInfo.outputPath(route.replaceAll("/", "_") + ".png"),
            fullPage: true,
          });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
