import { expect, test } from "@playwright/test";

test("rapid save clicks queue one product mutation", async ({ page }) => {
  const merchantID = "11111111-1111-1111-1111-111111111111";
  const shopID = "22222222-2222-2222-2222-222222222222";
  const user = {
    id: "44444444-4444-4444-4444-444444444444",
    membership_id: "55555555-5555-5555-5555-555555555555",
    merchant_id: merchantID,
    email: "owner@example.com",
    display_name: "Owner",
    is_active: true,
    platform_admin: false,
    roles: [
      {
        id: "66666666-6666-6666-6666-666666666666",
        code: "merchant",
        name: "Merchant",
        permission_codes: ["tenant.read", "tenant.write"],
      },
    ],
  };
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/catalog/products" && request.method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "product-1" } }),
      });
      return;
    }
    if (path === "/merchant") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: merchantID,
            name: "Catalog Merchant",
            slug: "catalog",
            default_currency_code: "USD",
            timezone: "UTC",
            pos_complexity_level: "COMPLEX",
            is_active: true,
          },
        }),
      });
      return;
    }
    if (path === "/auth/me") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: user }),
      });
      return;
    }
    const collections: Record<string, unknown[]> = {
      "/currencies": [{ code: "USD", name: "US Dollar", symbol: "$", decimal_places: 2 }],
      "/shops": [
        {
          id: shopID,
          name: "Main Shop",
          code: "MAIN",
          timezone: "UTC",
          is_active: true,
          module_codes: [],
        },
      ],
      "/catalog/products": [],
      "/catalog/categories": [],
      "/catalog/brands": [],
      "/units": [],
      "/catalog/attributes": [],
    };
    const key = Object.keys(collections).find(
      (candidate) => path === candidate || path.startsWith(`${candidate}?`),
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: key ? collections[key] : [],
        meta: { page_index: 0, page_size: 200, total: 0, total_pages: 1 },
      }),
    });
  });
  await page.addInitScript(
    ({ user }) => {
      localStorage.setItem(
        "bc.session",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "Bearer",
          expires_at: "2099-01-01T00:00:00Z",
          user,
        }),
      );
    },
    { user },
  );

  await page.goto("/products");
  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog", { name: "New product" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Product name").fill("travel-mate-p214");
  const save = dialog.getByRole("button", { name: "Save product" });
  await save.evaluate((button) => {
    const submit = button as HTMLButtonElement;
    submit.click();
    submit.click();
    submit.click();
  });

  await expect(dialog).toBeHidden();
  await expect(page.getByText("1 pending").first()).toBeVisible();
});
