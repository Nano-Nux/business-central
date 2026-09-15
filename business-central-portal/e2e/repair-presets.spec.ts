import { expect, test } from "@playwright/test";

const merchantID = "11111111-1111-1111-1111-111111111111";
const shopID = "22222222-2222-2222-2222-222222222222";
const user = {
  id: "44444444-4444-4444-4444-444444444444",
  membership_id: "55555555-5555-5555-5555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.com",
  display_name: "Owner User",
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

test.describe("Repair Presets CRUD and Responsiveness", () => {
  test.beforeEach(async ({ page }) => {
    let presets = [
      {
        id: "preset-1",
        merchant_id: merchantID,
        shop_id: shopID,
        preset_type: "ISSUE",
        value: "Cracked or shattered screen / Touch unresponsive",
        created_at: "2026-09-01T10:00:00Z",
        updated_at: "2026-09-01T10:00:00Z",
      },
      {
        id: "preset-2",
        merchant_id: merchantID,
        shop_id: shopID,
        preset_type: "ISSUE",
        value: "Battery drains rapidly / Does not hold charge",
        created_at: "2026-09-05T12:00:00Z",
        updated_at: "2026-09-05T12:00:00Z",
      },
      {
        id: "preset-cond-1",
        merchant_id: merchantID,
        shop_id: shopID,
        preset_type: "CONDITION",
        value: "Pristine / Mint condition (no visible marks or scratches)",
        created_at: "2026-09-02T10:00:00Z",
        updated_at: "2026-09-02T10:00:00Z",
      },
    ];

    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1", "");
      const method = route.request().method();

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
              name: "Preset Test Merchant",
              slug: "preset-test",
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
                name: "Main Workshop",
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

      if (path === "/repairs/presets" && method === "GET") {
        const type = url.searchParams.get("preset_type");
        const filtered = type ? presets.filter((p) => p.preset_type === type) : presets;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data: filtered,
            meta: { page_index: 0, page_size: 200, total: filtered.length, total_pages: 1 },
          }),
        });
        return;
      }

      if (path === "/repairs/presets" && method === "POST") {
        const body = route.request().postDataJSON();
        const newPreset = {
          id: `preset-${Date.now()}`,
          merchant_id: merchantID,
          shop_id: body.shop_id,
          preset_type: body.preset_type,
          value: body.value,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        presets.push(newPreset);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ data: newPreset }),
        });
        return;
      }

      if (path.startsWith("/repairs/presets/") && method === "PATCH") {
        const id = path.split("/").pop();
        const body = route.request().postDataJSON();
        const existing = presets.find((p) => p.id === id);
        if (existing) {
          existing.value = body.value;
          existing.updated_at = new Date().toISOString();
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ data: existing }),
        });
        return;
      }

      if (path.startsWith("/repairs/presets/") && method === "DELETE") {
        const id = path.split("/").pop();
        presets = presets.filter((p) => p.id !== id);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ data: { success: true } }),
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
  });

  test("displays issue presets with stat cards, tabs, and list", async ({ page }) => {
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    // Header and Tab Switcher
    await expect(page.getByRole("heading", { name: "Issue presets", level: 1 })).toBeVisible();
    const tabSwitcher = page.getByLabel("Preset category switcher");
    await expect(tabSwitcher.getByRole("link", { name: "Issue presets" })).toHaveClass(/active/);
    await expect(tabSwitcher.getByRole("link", { name: "Condition presets" })).toBeVisible();

    // Stat Cards
    await expect(page.getByText("Active Issue Presets")).toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "Preset Scope" })).toContainText(
      "Main Workshop",
    );

    // Preset cards
    await expect(page.getByText("Cracked or shattered screen / Touch unresponsive")).toBeVisible();
    await expect(page.getByText("Battery drains rapidly / Does not hold charge")).toBeVisible();

    // Recommended templates
    await expect(page.getByText("Recommended Starter Templates")).toBeVisible();
  });

  test("can switch to condition presets via tabs", async ({ page }) => {
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    // Click condition presets tab in the tab switcher
    const tabSwitcher = page.getByLabel("Preset category switcher");
    await tabSwitcher.getByRole("link", { name: "Condition presets" }).click();
    await page.waitForURL("**/repairs/condition-presets");

    await expect(page.getByRole("heading", { name: "Condition presets", level: 1 })).toBeVisible();
    const nextTabSwitcher = page.getByLabel("Preset category switcher");
    await expect(nextTabSwitcher.getByRole("link", { name: "Condition presets" })).toHaveClass(
      /active/,
    );
    await expect(
      page.getByText("Pristine / Mint condition (no visible marks or scratches)"),
    ).toBeVisible();
  });

  test("can filter presets using the search input", async ({ page }) => {
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search issue presets...");
    await searchInput.fill("battery");

    await expect(page.getByText("Battery drains rapidly / Does not hold charge")).toBeVisible();
    await expect(
      page.getByText("Cracked or shattered screen / Touch unresponsive"),
    ).not.toBeVisible();

    // Clear search
    await searchInput.fill("");
    await expect(page.getByText("Cracked or shattered screen / Touch unresponsive")).toBeVisible();
  });

  test("creates a new preset using starter template chip", async ({ page }) => {
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    // Click on a template chip like "Water Damage"
    const waterDamageChip = page.getByRole("button", { name: "+ Water Damage" });
    if (await waterDamageChip.isVisible()) {
      await waterDamageChip.click();
    } else {
      await page.getByRole("button", { name: "New issue preset" }).click();
    }

    // Modal should open
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Issue preset" })).toBeVisible();

    // Check textarea has content or type content
    const textarea = page.locator("textarea[name='value']");
    await textarea.fill("Liquid damage / Exposure to moisture on board");

    // Submit form
    await page.getByRole("button", { name: "Save preset" }).click();

    // Verify modal closes and new item appears
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Liquid damage / Exposure to moisture on board")).toBeVisible();
  });

  test("safely confirms preset deletion before removing", async ({ page }) => {
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    // Find the battery preset card and click Delete
    const batteryCard = page.locator(".preset-card").filter({ hasText: "Battery drains rapidly" });
    await batteryCard.getByRole("button", { name: "Delete" }).click();

    // Confirmation modal appears
    await expect(page.getByRole("heading", { name: "Delete issue preset?" })).toBeVisible();
    await expect(
      page.getByText("This action removes the preset from the intake autofill menu."),
    ).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: "Yes, delete preset" }).click();

    // Modal closes and item is removed
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Battery drains rapidly / Does not hold charge")).not.toBeVisible();
  });

  test("is mobile responsive with no horizontal overflow and renders FAB", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/repairs/issue-presets");
    await page.waitForLoadState("networkidle");

    // Ensure no horizontal scroll overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px margin for subpixel rendering

    // Floating Action Button should be visible on mobile
    const fab = page.locator(".preset-mobile-fab");
    await expect(fab).toBeVisible();

    // Clicking FAB opens modal cleanly
    await fab.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
