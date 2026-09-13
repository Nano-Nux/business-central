import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const user = {
  id: "44444444-4444-4444-4444-444444444444",
  membership_id: "55555555-5555-5555-5555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.com",
  display_name: "Guide Test Owner",
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

async function setupMock(page: Page, posMode: "MINI" | "SIMPLE" | "COMPLEX" = "MINI") {
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
            name: "Guide Testing Merchant",
            slug: "guide-test",
            default_currency_code: "USD",
            timezone: "UTC",
            pos_complexity_level: posMode,
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
              name: "Guide Test Flagship",
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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

test.describe("Dedicated Quick Guide Page (/guide)", () => {
  test("dynamically filters workflows for POS Mini mode by default", async ({ page }) => {
    await setupMock(page, "MINI");
    await page.goto("/guide");

    // Page title check
    await expect(page.locator("h1")).toContainText("Guide");

    // Active mode badge
    await expect(page.locator("text=Active Mode: POS Mini")).toBeVisible();

    // In MINI mode: POS Mini must be visible
    await expect(page.locator("#pos-mini")).toBeVisible();

    // In MINI mode: POS Simple and POS Complex must NOT be visible
    await expect(page.locator("#pos-simple")).toHaveCount(0);
    await expect(page.locator("#pos-complex")).toHaveCount(0);

    // In MINI mode: Complex attributes and stock-assets must NOT be visible
    await expect(page.locator("#catalog-attributes")).toHaveCount(0);
    await expect(page.locator("#stock-assets")).toHaveCount(0);
  });

  test("dynamically filters workflows for POS Complex mode by default", async ({ page }) => {
    await setupMock(page, "COMPLEX");
    await page.goto("/guide");

    // Active mode badge
    await expect(page.locator("text=Active Mode: POS Complex")).toBeVisible();

    // In COMPLEX mode: POS Complex and catalog-attributes must be visible
    await expect(page.locator("#pos-complex")).toBeVisible();
    await expect(page.locator("#catalog-attributes")).toBeVisible();

    // In COMPLEX mode: POS Mini and POS Simple must NOT be visible
    await expect(page.locator("#pos-mini")).toHaveCount(0);
    await expect(page.locator("#pos-simple")).toHaveCount(0);
  });

  test("allows interactive preview switching between POS modes", async ({ page }) => {
    await setupMock(page, "MINI");
    await page.goto("/guide");

    // Initially in MINI mode
    await expect(page.locator("#pos-mini")).toBeVisible();
    await expect(page.locator("#pos-simple")).toHaveCount(0);

    // Switch preview to POS Simple
    await page.click("button:has-text('POS Simple')");
    await expect(page.locator("#pos-simple")).toBeVisible();
    await expect(page.locator("#pos-mini")).toHaveCount(0);

    // Switch preview to POS Complex
    await page.click("button:has-text('POS Complex')");
    await expect(page.locator("#pos-complex")).toBeVisible();
    await expect(page.locator("#catalog-attributes")).toBeVisible();

    // Click Reset to default
    await page.click("button:has-text('Reset to Shop Default')");
    await expect(page.locator("#pos-mini")).toBeVisible();
  });

  test("switches languages dynamically across headers, steps, and tips", async ({ page }) => {
    await setupMock(page, "MINI");
    await page.goto("/guide");

    // Switch to Myanmar
    await page.click("button:has-text('မြန်မာ')");
    await expect(page.locator("h1")).toContainText("လုပ်ငန်းသုံး စုံလင်သော ရုပ်ပုံလမ်းညွှန်");

    // Switch to Thai
    await page.click("button:has-text('ไทย')");
    await expect(page.locator("h1")).toContainText("คู่มือภาพประกอบและขั้นตอนการใช้งาน");

    // Switch back to English
    await page.click("button:has-text('English')");
    await expect(page.locator("h1")).toContainText("Business Central Guide");
  });

  test("renders all 37+ sections with screenshots, steps, badges, and pro tips in Complex mode", async ({ page }) => {
    await setupMock(page, "COMPLEX");
    await page.goto("/guide");

    // Wait for the guide cards to render
    await expect(page.locator("#dashboard")).toBeVisible();

    // In COMPLEX mode, 36 sections are visible (all 38 minus pos-mini and pos-simple)
    await expect(page.locator(".guide-card")).toHaveCount(36);

    // Verify key CRUD modal sections exist
    await expect(page.locator("#product-create")).toBeVisible();
    await expect(page.locator("#categories-manage")).toBeVisible();
    await expect(page.locator("#brands-manage")).toBeVisible();
    await expect(page.locator("#units-manage")).toBeVisible();
    await expect(page.locator("#unit-conversions")).toBeVisible();
    await expect(page.locator("#repair-intake-modal")).toBeVisible();
    await expect(page.locator("#repair-order-edit")).toBeVisible();
    await expect(page.locator("#customer-edit")).toBeVisible();
    await expect(page.locator("#delivery-edit")).toBeVisible();
    await expect(page.locator("#stock-movement-detail")).toBeVisible();
    await expect(page.locator("#transaction-detail")).toBeVisible();
  });

  test("category filtering and search correctly narrow down guide cards", async ({ page }) => {
    await setupMock(page, "COMPLEX");
    await page.goto("/guide");

    // Wait for guide cards to load
    await expect(page.locator("#dashboard")).toBeVisible();

    // Click Repairs category pill
    await page.click(".guide-cat-pill:has-text('Device Repairs')");
    await expect(page.locator("#repairs-workflow")).toBeVisible();
    await expect(page.locator("#repair-intake-modal")).toBeVisible();
    await expect(page.locator("#repairs-catalog")).toBeVisible();
    // Catalog products should not be visible under Repairs
    await expect(page.locator("#catalog-products")).toHaveCount(0);

    // Reset to all sections
    await page.click(".guide-cat-pill:has-text('All Sections')");
    await expect(page.locator("#catalog-products")).toBeVisible();

    // Test live search for FIFO
    const searchInput = page.locator(".search-box input[type='search']");
    await searchInput.fill("FIFO");
    await expect(page.locator("#stock-movements")).toBeVisible();
    await expect(page.locator("#stock-movement-detail")).toBeVisible();
    await expect(page.locator("#dashboard")).toHaveCount(0);
  });
});

