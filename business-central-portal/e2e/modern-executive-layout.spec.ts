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

test.describe("Modern Executive Layout ('Million Dollar UI')", () => {
  test("Settings Appearance page renders Modern Executive layout option and activates it", async ({
    page,
  }) => {
    await setupExecutiveSession(page);
    await page.goto("/settings/theme");
    await page.waitForLoadState("networkidle");

    // Switch to Layout subtab
    const layoutTab = page.getByRole("button", { name: "Layout" });
    await expect(layoutTab).toBeVisible();
    await layoutTab.click();

    // Verify Modern Executive card is present with Million Dollar UI badge
    await expect(page.getByText("Modern Executive")).toBeVisible();
    await expect(page.getByText("Million Dollar UI")).toBeVisible();
    await expect(
      page.getByText("Floating island deck · Glassmorphic spatial register"),
    ).toBeVisible();

    // Verify data-layout attribute is set on html
    const layoutAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-layout"),
    );
    expect(layoutAttr).toBe("modern-executive-layout");

    await page.screenshot({
      path: "C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/settings_layout_selection.png",
    });
  });

  test("Desktop viewport displays floating island sidebar and topbar without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupExecutiveSession(page);
    await page.goto("/merchant/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify main area and sidebar are visible
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".main-area")).toBeVisible();

    await page.screenshot({
      path: "C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/dashboard_floating_island.png",
    });

    // Verify no page-level horizontal overflow
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test("Seamless theme compatibility with dark, neon, and high-contrast themes", async ({
    page,
  }) => {
    const themesToTest = [
      "default-theme",
      "midnight-dark-theme",
      "synthwave-neon-theme",
      "high-contrast-theme",
      "visual-clean-theme",
    ];

    for (const theme of themesToTest) {
      await setupExecutiveSession(page, theme);
      await page.goto("/pos");
      await page.waitForLoadState("networkidle");

      // Verify layout and theme attributes coexist smoothly
      const attributes = await page.evaluate(() => ({
        layout: document.documentElement.getAttribute("data-layout"),
        theme: document.documentElement.getAttribute("data-theme"),
      }));

      expect(attributes.layout).toBe("modern-executive-layout");
      expect(attributes.theme).toBe(theme);

      // Verify catalog and register elements are visible
      await expect(page.locator(".pos-page")).toBeVisible();
      await expect(page.locator(".product-grid")).toBeVisible();
      await expect(page.locator(".cart-panel")).toBeVisible();

      await page.screenshot({
        path: `C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/pos_theme_${theme}.png`,
      });

      // Verify no horizontal overflow
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `Theme ${theme} with Modern Executive must not cause overflow`).toBe(0);
    }
  });

  test("POS catalog product cards display price badges and steppers with luxury styling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupExecutiveSession(page);
    await page.goto("/pos");
    await page.waitForLoadState("networkidle");

    const card = page.locator(".product-tile").first();
    await expect(card).toBeVisible();
    await expect(card.locator("b")).toBeVisible();
    await expect(card.locator("b")).toContainText("599.00");

    await page.screenshot({
      path: "C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/pos_product_catalog.png",
    });
  });

  test("POS register takes full width and height across all layouts without card spacing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const layouts = ["default-layout", "compact-layout", "modern-executive-layout"];

    for (const layout of layouts) {
      await setupExecutiveSession(page, "charcoal-gold-theme", layout);

      await page.goto("/pos");
      await page.waitForLoadState("networkidle");

      const posMetrics = await page.evaluate(() => {
        const content = document.querySelector(".content");
        const cartPanel = document.querySelector(".cart-panel");

        const csContent = content ? window.getComputedStyle(content) : null;
        const csCart = cartPanel ? window.getComputedStyle(cartPanel) : null;

        const rContent = content?.getBoundingClientRect();
        const rCart = cartPanel?.getBoundingClientRect();

        return {
          contentPadding: csContent?.padding,
          cartBorderRadius: csCart?.borderRadius,
          cartRightGap: rContent && rCart ? Math.abs(rContent.right - rCart.right) : -1,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      // Assert zero padding on content
      expect(posMetrics.contentPadding).toContain("0px");
      // Assert cart panel is flush against the right edge (within 1px)
      expect(posMetrics.cartRightGap).toBeLessThanOrEqual(1);
      // Assert zero horizontal overflow
      expect(posMetrics.overflow).toBe(0);

      await page.screenshot({
        path: `C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/pos_fullwidth_${layout}.png`,
      });
    }
  });

  test("Universal theme-aligned scrollbars render with thin width and semantic colors", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const themesToTest = [
      "default-theme",
      "charcoal-gold-theme",
      "midnight-dark-theme",
      "synthwave-neon-theme",
    ];

    for (const theme of themesToTest) {
      await setupExecutiveSession(page, theme, "default-layout");
      await page.goto("/pos");
      await page.waitForLoadState("networkidle");

      const scrollbarMetrics = await page.evaluate(() => {
        const rootStyle = window.getComputedStyle(document.documentElement);
        const sidebarNav = document.querySelector(".sidebar nav");
        const navStyle = sidebarNav ? window.getComputedStyle(sidebarNav) : null;

        return {
          scrollbarWidth: rootStyle.scrollbarWidth,
          navScrollbarWidth: navStyle?.scrollbarWidth,
          thumbToken: rootStyle.getPropertyValue("--scrollbar-thumb").trim(),
          trackToken: rootStyle.getPropertyValue("--scrollbar-track").trim(),
        };
      });

      expect(scrollbarMetrics.scrollbarWidth).toBe("thin");
      expect(scrollbarMetrics.navScrollbarWidth).toBe("thin");
      expect(scrollbarMetrics.trackToken).toBe("transparent");
      expect(scrollbarMetrics.thumbToken.length).toBeGreaterThan(0);

      // Screenshot sidebar with custom scrollbar
      const sidebar = page.locator(".sidebar");
      await sidebar.screenshot({
        path: `C:/Users/lonsh/.gemini/antigravity-ide/brain/b02a1157-0878-4a58-bcb4-84fa353a119b/scrollbar_sidebar_${theme}.png`,
      });
    }
  });
});
