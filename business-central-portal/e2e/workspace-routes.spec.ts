import { expect, test, type Page } from "@playwright/test";
import { getFilteredNavigationGroups } from "../lib/navigation";

async function setup(
  page: Page,
  mode: string,
  role = "merchant",
  defaultView = "/pos",
  aiEnabled = true,
) {
  const user = {
    id: "route-user",
    membership_id: "route-membership",
    merchant_id: "route-merchant",
    display_name: "Route user",
    email: "routes@example.test",
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
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    if (path === "/merchant")
      data = {
        id: "route-merchant",
        name: "Routes",
        slug: "routes",
        default_currency_code: "USD",
        pos_complexity_level: mode,
        is_active: true,
        ai_assistant_enabled: aiEnabled,
      };
    if (path === "/shops")
      data = [
        {
          id: "route-shop",
          name: "Main",
          code: "MAIN",
          is_active: true,
          module_codes: ["repair"],
          default_view: defaultView,
        },
      ];
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data,
        meta: { total: Array.isArray(data) ? data.length : 1, total_pages: 1, page_size: 100 },
      }),
    });
  });
  await page.addInitScript(
    ({ user }) => {
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
      localStorage.setItem("bc.current-shop", "route-shop");
    },
    { user },
  );
  return (enabled: boolean) => {
    aiEnabled = enabled;
  };
}

for (const mode of ["NANO", "MINI", "SIMPLE", "COMPLEX"]) {
  for (const width of [390, 1280]) {
    test(`${mode}: admin AI toggle controls the whole AI section at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const setAiEnabled = await setup(page, mode, "merchant", "/automations", false);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/settings/application");
      const sidebar = page.locator(".sidebar nav");
      const landing = page.getByRole("combobox").nth(1);
      await expect(landing).toBeAttached();
      await expect(sidebar.locator('a[href="/ai-assistant"], a[href="/automations"]')).toHaveCount(
        0,
      );
      await expect(
        landing.locator('option[value="/ai-assistant"], option[value="/automations"]'),
      ).toHaveCount(0);
      for (const path of [
        "/ai-assistant",
        "/automations",
        "/automations/telegram",
        "/automations/whatsapp",
        "/automations/facebook",
      ]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/pos$/);
      }
      setAiEnabled(true);
      await page.goto("/settings/application");
      await expect(sidebar.locator('a[href="/ai-assistant"], a[href="/automations"]')).toHaveCount(
        2,
      );
      await expect(
        landing.locator('option[value="/ai-assistant"], option[value="/automations"]'),
      ).toHaveCount(2);
      await page.goto("/automations");
      await expect(page.getByRole("heading", { name: "Automations", exact: true })).toBeVisible();
      await page.goto("/ai-assistant");
      await expect(page.locator('.sidebar nav a[href="/ai-assistant"]')).toHaveClass(/active/);
      setAiEnabled(false);
      await page.reload();
      await expect(page).toHaveURL(/\/pos$/);
      await expect(sidebar.locator('a[href="/ai-assistant"], a[href="/automations"]')).toHaveCount(
        0,
      );
    });
  }

  test(`${mode}: every navigation link opens its named route`, async ({ page }) => {
    test.setTimeout(90_000);
    await setup(page, mode);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/pos");
    const items = getFilteredNavigationGroups({
      posComplexityLevel: mode,
      moduleCodes: ["repair"],
      aiAssistantEnabled: true,
    }).flatMap((group) => group.items);
    for (const item of items) {
      const link = page.locator(`.sidebar nav a[href="${item.href}"]`);
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${item.href}$`));
      await expect(link).toHaveClass(/active/);
      await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
    }
  });

  test(`${mode}: legacy links preserve queries and delivery tab selection`, async ({ page }) => {
    await setup(page, mode);
    for (const [legacy, canonical] of [
      ["/customers", "/customers-and-deliveries"],
      ["/deliveries", "/customers-and-deliveries/deliveries"],
      ["/stock-assets", "/stock-barcodes"],
      ["/stock-movements", "/stock-history"],
      ["/accounts", "/staff-accounts"],
      ["/catalog/attributes", "/catalog/variant-attributes"],
      [
        mode === "NANO" ? "/catalog" : "/storage",
        mode === "NANO" || mode === "MINI" ? "/products-and-storage" : "/storage",
      ],
    ]) {
      await page.goto(`${legacy}?from=bookmark#saved`);
      await expect(page).toHaveURL(`${new URL(page.url()).origin}${canonical}?from=bookmark#saved`);
    }
    await page.goto("/customers-and-deliveries");
    const tabs = page.getByRole("navigation", { name: "Customers and deliveries" });
    await tabs.getByRole("link", { name: "Deliveries", exact: true }).click();
    await expect(page).toHaveURL(/\/customers-and-deliveries\/deliveries$/);
    await expect(tabs.getByRole("link", { name: "Deliveries", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator('.sidebar nav a[href="/customers-and-deliveries"]')).toHaveClass(
      /active/,
    );
  });
}

test("Nano staff can access combined products but staff accounts retain the merchant guard", async ({
  page,
}) => {
  await setup(page, "NANO", "staff");
  await page.goto("/products-and-storage");
  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toBeVisible();
  await page.goto("/staff-accounts");
  await expect(page).toHaveURL(/\/pos$/);
});

test("Nano saved Catalog landing choice migrates when selecting a shop", async ({ page }) => {
  await setup(page, "NANO", "merchant", "/catalog");
  await page.goto("/select-shop");
  await page.getByRole("button", { name: /Main/ }).click();
  await expect(page).toHaveURL(/\/products-and-storage$/);
});
