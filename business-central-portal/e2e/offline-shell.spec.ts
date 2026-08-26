import { expect, test } from "@playwright/test";

test("installs the complete shell and cold-launches a cached operational route offline", async ({
  context,
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("Service worker did not activate.");
  });

  const cached = await page.evaluate(async () => {
    const cache = await caches.open("business-central-shell-v4");
    return Boolean(await cache.match("/pos"));
  });
  expect(cached).toBe(true);

  await context.setOffline(true);
  const mutationWasNotSynthesized = await page.evaluate(async () => {
    try {
      await fetch("/api/v1/offline-mutation-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(mutationWasNotSynthesized).toBe(true);
  const response = await page.goto("/pos", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).not.toBeEmpty();
});

test("activation removes obsolete Business Central shell caches", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await caches.open("business-central-shell-obsolete");
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    await navigator.serviceWorker.register("/sw.js?upgrade-proof=1");
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .not.toContain("business-central-shell-obsolete");
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toContain("business-central-shell-v4");
});

test("offline checkout survives a 24-hour outage and page restart", async ({
  context,
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const merchantId = "00000000-0000-0000-0000-000000000101";
    const membershipId = "00000000-0000-0000-0000-000000000102";
    const shopId = "00000000-0000-0000-0000-000000000103";
    const variantId = "00000000-0000-0000-0000-000000000104";
    const scopeKey = `${merchantId}:${membershipId}`;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1_000;
    const now = new Date(oneDayAgo).toISOString();
    localStorage.setItem("bc.current-shop", shopId);
    localStorage.setItem(
      "bc.session",
      JSON.stringify({
        access_token: "offline-test-access",
        refresh_token: "offline-test-refresh",
        token_type: "Bearer",
        expires_at: new Date(oneDayAgo).toISOString(),
        user: {
          id: "00000000-0000-0000-0000-000000000105",
          membership_id: membershipId,
          merchant_id: merchantId,
          email: "cashier@example.test",
          display_name: "Offline Cashier",
          shop_id: shopId,
          is_active: true,
          platform_admin: false,
          roles: [
            {
              id: "00000000-0000-0000-0000-000000000106",
              code: "staff",
              name: "Staff",
              permission_codes: ["tenant.read", "tenant.write"],
            },
          ],
        },
      }),
    );
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("business-central-portal-offline", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const resources = db.createObjectStore("resources", { keyPath: "key" });
        resources.createIndex("byScope", "scopeKey");
        const entities = db.createObjectStore("entities", { keyPath: "key" });
        entities.createIndex("byScope", "scopeKey");
        entities.createIndex("byScopeType", ["scopeKey", "entityType"]);
        const operations = db.createObjectStore("operations", { keyPath: "operationId" });
        operations.createIndex("byScope", "scopeKey");
        operations.createIndex("byScopeStatusCreated", ["scopeKey", "status", "clientCreatedAt"]);
        const metadata = db.createObjectStore("metadata", { keyPath: "key" });
        metadata.createIndex("byScope", "scopeKey");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["resources", "entities"], "readwrite");
    const resources = transaction.objectStore("resources");
    const putResource = (path: string, data: unknown) =>
      resources.put({
        key: `${scopeKey}:resource:${path}`,
        scopeKey,
        path,
        data,
        cachedAt: now,
      });
    putResource("/shops?page_index=0&page_size=100", [
      {
        id: shopId,
        name: "Offline shop",
        code: "OFF",
        is_active: true,
        module_codes: ["CORE"],
        include_tax: true,
        tax_rate: "10",
        tax_label: "Tax",
      },
    ]);
    putResource(`/pos/catalog?page_index=0&page_size=200&shop_id=${shopId}`, [
      {
        id: variantId,
        product_id: "00000000-0000-0000-0000-000000000107",
        product_name: "Offline widget",
        name: "Standard",
        sku: "OFF-1",
        base_unit_id: "00000000-0000-0000-0000-000000000108",
        unit_of_measure: "Each",
        is_stock_tracked: true,
        quantity_on_hand: "3",
        price: "10.00",
      },
    ]);
    putResource("/pos/catalog?page_index=0&page_size=200", [
      {
        id: variantId,
        product_id: "00000000-0000-0000-0000-000000000107",
        product_name: "Offline widget",
        name: "Standard",
        sku: "OFF-1",
        base_unit_id: "00000000-0000-0000-0000-000000000108",
        unit_of_measure: "Each",
        is_stock_tracked: true,
        quantity_on_hand: "3",
        price: "10.00",
      },
    ]);
    putResource("/promotions?page_index=0&page_size=100&filter=is_active:true", []);
    putResource(`/shops/${shopId}/deliveries?page_index=0&page_size=100`, []);
    transaction.objectStore("entities").put({
      key: `${scopeKey}:entity:MERCHANT:${merchantId}`,
      scopeKey,
      entityType: "MERCHANT",
      entityId: merchantId,
      payload: {
        id: merchantId,
        name: "Offline merchant",
        slug: "offline",
        default_currency_code: "USD",
        timezone: "UTC",
        is_active: true,
      },
      version: 0,
      cachedAt: now,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await context.setOffline(true);
  await page.goto("/pos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "New sale" })).toBeVisible({ timeout: 30_000 });
  const product = page.getByRole("button", { name: "Add Standard to cart" });
  await product.click();
  await product.click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator("#current-order-panel").getByText("2 items", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page.getByRole("heading", { name: "Provisional offline receipt" })).toBeVisible();
  await expect(page.getByRole("img", { name: /PENDING SYNCHRONIZATION/ })).toBeVisible();

  await page.close();
  const restarted = await context.newPage();
  await restarted.goto("/pos", { waitUntil: "domcontentloaded" });
  await expect(restarted.getByRole("heading", { name: "Offline checkouts" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(restarted.getByRole("button", { name: /PENDING/ })).toBeVisible();
  await expect(restarted.getByText(/1 available stock/)).toBeVisible({ timeout: 30_000 });
});
