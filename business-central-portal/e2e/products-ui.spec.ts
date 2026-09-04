import { expect, test } from "@playwright/test";
import path from "path";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const user = {
  id: "44444444-4444-4444-4444-444444444444",
  membership_id: "55555555-5555-5555-5555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.com",
  display_name: "Test Merchant Owner",
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

const sampleCategories = [
  { id: "cat-1", name: "Electronics", parent_category_id: null },
  { id: "cat-2", name: "Audio", parent_category_id: "cat-1" },
];

const sampleBrands = [
  { id: "brand-1", name: "Sony" },
  { id: "brand-2", name: "Apple" },
];

const sampleProducts = [
  {
    id: "prod-1",
    name: "Wireless Noise Cancelling Headphones WH-1000XM5",
    description: "Premium industry-leading noise canceling over-ear headphones",
    product_type: "PHYSICAL",
    barcode: "4548736132566",
    brand_id: "brand-1",
    category_ids: ["cat-2"],
    is_active: true,
    images: [{ image_url: "/media/headphones.png" }],
  },
  {
    id: "prod-2",
    name: "Screen Repair & Replacement Service",
    description: "Full OLED screen replacement with certified warranty",
    product_type: "SERVICE",
    barcode: "SRV-SCR-001",
    brand_id: "brand-2",
    category_ids: ["cat-1"],
    is_active: true,
    images: [],
  },
  {
    id: "prod-3",
    name: "Archived Vintage Radio",
    description: "Old model discontinued in previous quarter",
    product_type: "PHYSICAL",
    barcode: "ARC-0099",
    brand_id: "brand-1",
    category_ids: ["cat-2"],
    is_active: false,
    images: [],
  },
];

const artifactDir = "C:\\Users\\lonsh\\.gemini\\antigravity-ide\\brain\\ed7ddf61-a76a-4c5e-b7dc-1bf50a51678c";

test.describe("Products page modern UI and responsiveness", () => {
  test("Desktop view renders stats, controls, tabs, and rich table", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const pathName = url.pathname.replace("/api/v1", "");

      if (pathName === "/auth/me") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: user }) });
      }
      if (pathName === "/merchant") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: merchantID,
              name: "Tech Hub Electronics",
              slug: "tech-hub",
              default_currency_code: "USD",
              timezone: "UTC",
              pos_complexity_level: "COMPLEX",
              is_active: true,
            },
          }),
        });
      }
      if (pathName === "/shops") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: [{ id: shopID, name: "Downtown Store", code: "DT01", is_active: true, module_codes: [] }],
          }),
        });
      }
      if (pathName === "/catalog/products") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleProducts,
            meta: { page_index: 0, page_size: 100, total: sampleProducts.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/categories") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleCategories,
            meta: { page_index: 0, page_size: 200, total: sampleCategories.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/brands") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleBrands,
            meta: { page_index: 0, page_size: 200, total: sampleBrands.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/attributes" || pathName === "/units") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { page_index: 0, page_size: 100, total: 0, total_pages: 1 } }),
        });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    // Verify stats grid
    await expect(page.locator(".products-stats-grid")).toBeVisible();
    await expect(page.getByText("Total Products")).toBeVisible();

    // Verify filter tabs
    await expect(page.getByRole("tab", { name: /All products/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Active/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Inactive/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Physical/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Services/ })).toBeVisible();

    // Verify desktop table items
    await expect(page.locator(".products-desktop-table")).toBeVisible();
    await expect(page.locator(".products-mobile-cards")).toBeHidden();
    const desktopTable = page.locator(".products-desktop-table");
    await expect(desktopTable.getByText("Wireless Noise Cancelling Headphones")).toBeVisible();
    await expect(desktopTable.getByText("Screen Repair & Replacement Service")).toBeVisible();

    // Test filter tabs interactivity
    await page.getByRole("tab", { name: /Services/ }).click();
    await expect(desktopTable.getByText("Screen Repair & Replacement Service")).toBeVisible();
    await expect(desktopTable.getByText("Wireless Noise Cancelling Headphones")).toBeHidden();

    // Reset to All
    await page.getByRole("tab", { name: /All products/ }).click();
    await expect(desktopTable.getByText("Wireless Noise Cancelling Headphones")).toBeVisible();

    // Screenshot desktop
    await page.screenshot({ path: path.join(artifactDir, "products_desktop.png"), fullPage: true });
  });

  test("Mobile phone view renders beautiful responsive cards without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const pathName = url.pathname.replace("/api/v1", "");

      if (pathName === "/auth/me") {
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: user }) });
      }
      if (pathName === "/merchant") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: merchantID,
              name: "Tech Hub Electronics",
              slug: "tech-hub",
              default_currency_code: "USD",
              timezone: "UTC",
              pos_complexity_level: "COMPLEX",
              is_active: true,
            },
          }),
        });
      }
      if (pathName === "/shops") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: [{ id: shopID, name: "Downtown Store", code: "DT01", is_active: true, module_codes: [] }],
          }),
        });
      }
      if (pathName === "/catalog/products") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleProducts,
            meta: { page_index: 0, page_size: 100, total: sampleProducts.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/categories") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleCategories,
            meta: { page_index: 0, page_size: 200, total: sampleCategories.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/brands") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: sampleBrands,
            meta: { page_index: 0, page_size: 200, total: sampleBrands.length, total_pages: 1 },
          }),
        });
      }
      if (pathName === "/catalog/attributes" || pathName === "/units") {
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { page_index: 0, page_size: 100, total: 0, total_pages: 1 } }),
        });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

    await page.goto("/products");
    await page.waitForLoadState("networkidle");

    // In mobile, desktop table should be hidden, mobile cards visible
    await expect(page.locator(".products-desktop-table")).toBeHidden();
    await expect(page.locator(".products-mobile-cards")).toBeVisible();
    await expect(page.locator(".product-mobile-card")).toHaveCount(3);

    // Verify no horizontal overflow
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.documentElement.clientWidth,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(0);
    expect(overflow.doc).toBeLessThanOrEqual(0);

    // Screenshot mobile
    await page.screenshot({ path: path.join(artifactDir, "products_mobile.png"), fullPage: true });
  });
});
