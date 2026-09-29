import { expect, test, type Page } from "@playwright/test";

const shopID = "22222222-2222-2222-2222-222222222222";
const secondShopID = "33333333-3333-3333-3333-333333333333";
const user = {
  id: "owner",
  membership_id: "membership",
  merchant_id: "merchant",
  email: "owner@example.com",
  display_name: "Shop owner",
  is_active: true,
  platform_admin: false,
  roles: [
    {
      id: "role",
      code: "merchant",
      name: "Merchant",
      permission_codes: ["tenant.read", "tenant.write", "membership.manage"],
    },
  ],
};
const group = {
  id: "group-main",
  shop_id: shopID,
  telegram_chat_id: -100123456789,
  group_title: "Downtown · Sales & Customer Orders",
  group_type: "supergroup",
  group_username: "downtown_orders",
  connection_status: "ACTIVE",
  auto_confirm_orders: false,
  bot_membership_status: "administrator",
  bot_admin_status: true,
  bot_permission_snapshot: { can_manage_chat: true, can_send_messages: true },
  member_count: 128,
  first_seen_at: "2026-09-26T10:00:00Z",
  connected_at: "2026-09-26T10:00:00Z",
  last_seen_at: "2026-09-29T10:00:00Z",
  connected_by: "Shop owner",
  last_refreshed_at: "2026-09-29T10:00:00Z",
};
const makeOrder = (id: string, status = "DRAFT") => ({
  id,
  telegram_group_connection_id: group.id,
  group_title: group.group_title,
  order_number: `TG-${id}`,
  status,
  description: "Electric wheelchair — compact folding model",
  quantity: "2",
  unit_price: "450.00",
  grand_total: "900.00",
  customer_name: id === "1002" ? null : "Ma Hnin",
  payment_status: status === "CONFIRMED" ? "Paid" : status === "DRAFT" ? "Pending" : "Cancelled",
  items: [
    {
      line_number: 1,
      variant_id: "variant-1",
      sku: "WC-002",
      description: "Electric wheelchair — compact folding model",
      quantity: "1",
      unit_price: "450.00",
      line_total: "450.00",
    },
    {
      line_number: 2,
      variant_id: "variant-2",
      sku: "WO-001",
      description: "wo phone",
      quantity: "1",
      unit_price: "450.00",
      line_total: "450.00",
    },
  ],
  currency_code: "USD",
  created_at: "2026-09-29T10:00:00Z",
  expires_at: "2099-09-29T10:15:00Z",
});

async function mockTelegram(
  page: Page,
  {
    empty = false,
    failPairing = false,
    failAutoConfirm = false,
    readOnly = false,
    botName = "NanonuxBusinessCentralBot",
  } = {},
) {
  const mockUser = readOnly
    ? {
        ...user,
        roles: [
          { ...user.roles[0], code: "staff", name: "Staff", permission_codes: ["tenant.read"] },
        ],
      }
    : user;
  let groups = empty
    ? []
    : [
        group,
        {
          ...group,
          id: "group-second",
          group_title: "Warehouse dispatch",
          group_username: "",
          connection_status: "PAUSED",
          bot_admin_status: false,
          member_count: 34,
        },
      ];
  const orders = [
    makeOrder("1001"),
    makeOrder("1002"),
    makeOrder("1003", "CONFIRMED"),
    makeOrder("1004", "EXPIRED"),
  ];
  let authorized = true;
  const calls: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    let data: unknown = [];
    if (path === "/auth/me") data = mockUser;
    else if (path === "/invoices")
      data = orders
        .filter((order) => !["CANCELLED", "EXPIRED"].includes(order.status))
        .map((order) => ({
          id: order.id,
          number: order.order_number,
          customer: order.customer_name,
          channel: "TELEGRAM",
          merchant_name: "Test merchant",
          shop_name: "Downtown",
          shop_id: shopID,
          currency_code: "USD",
          created_at: order.created_at,
          status: order.payment_status,
          kind: "pos",
          subtotal: "900.00",
          discount_total: "0.00",
          tax_total: "0.00",
          grand_total: "900.00",
          payment_type: "Telegram",
          items: order.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
        }));
    else if (path === "/telegram/bot") data = { username: botName };
    else if (path === "/sync/handshake")
      data = {
        protocol_version: "1",
        schema_version: "1",
        server_sequence: 0,
        device: { id: "device" },
        session: { id: "session", scope: "merchant" },
      };
    else if (path === "/sync/pull")
      data = { changes: [], next_sequence: 0, current_sequence: 0, has_more: false };
    else if (path === "/merchant")
      data = {
        id: "merchant",
        name: "Downtown Retail",
        slug: "downtown",
        default_currency_code: "USD",
        timezone: "UTC",
        pos_complexity_level: "COMPLEX",
        is_active: true,
      };
    else if (path === "/shops")
      data = [
        {
          id: shopID,
          name: "Downtown flagship",
          code: "MAIN",
          timezone: "UTC",
          is_active: true,
          module_codes: [],
        },
        {
          id: secondShopID,
          name: "Riverside branch",
          code: "SECOND",
          timezone: "UTC",
          is_active: true,
          module_codes: [],
        },
      ];
    else if (path === `/telegram/shops/${shopID}/groups`) data = groups;
    else if (path === "/telegram/orders") data = orders;
    else if (path.endsWith("/users"))
      data = [
        {
          telegram_user_id: 12345,
          display_name_snapshot: "Alex Morgan",
          username_snapshot: "alexm",
          telegram_role: "administrator",
          can_create_orders: authorized,
          last_seen_at: "2026-09-29T10:00:00Z",
        },
      ];
    else if (path.startsWith("/telegram/") && method !== "GET") {
      calls.push(`${method} ${path}`);
      if (path.endsWith("pairing-codes") || path.endsWith("rotate-pairing-code")) {
        if (failPairing) {
          await route.fulfill({
            status: 403,
            json: {
              error: {
                code: "DISABLED",
                message: "Telegram automation is not enabled for this merchant.",
              },
            },
          });
          return;
        }
        data = {
          id: "pairing",
          shop_id: shopID,
          code: "BC-TEST-123",
          status: "PENDING",
          expires_at: "2099-09-29T10:15:00Z",
        };
      }
      if (path.endsWith("/auto-confirm")) {
        if (failAutoConfirm) {
          await route.fulfill({
            status: 503,
            json: {
              error: {
                code: "UNAVAILABLE",
                message: "Automatic confirmation setting could not be saved.",
              },
            },
          });
          return;
        }
        groups = groups.map((g) =>
          path.includes(g.id)
            ? { ...g, auto_confirm_orders: route.request().postDataJSON().auto_confirm_orders }
            : g,
        );
      }
      if (path.endsWith("/status"))
        groups = groups.map((g) =>
          g.id === group.id
            ? { ...g, connection_status: route.request().postDataJSON().status }
            : g,
        );
      if (method === "DELETE") groups = groups.filter((g) => !path.endsWith(g.id));
      if (path.endsWith("/revoke")) authorized = false;
      if (path.endsWith("/confirm") || path.endsWith("/cancel")) {
        const order = orders.find((o) => path.includes(o.id));
        if (order) {
          order.status = path.endsWith("/confirm") ? "CONFIRMED" : "CANCELLED";
          order.payment_status = path.endsWith("/confirm") ? "Paid" : "Cancelled";
        }
      }
    }
    await route.fulfill({ json: { data } });
  });
  await page.addInitScript(
    ({ user, shopID }) => {
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
      localStorage.setItem("bc.current-shop", shopID);
    },
    { user: mockUser, shopID },
  );
  return calls;
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      amount: document.documentElement.scrollWidth - width,
      elements: [...document.querySelectorAll<HTMLElement>(".main-area *")]
        .filter((el) => el.getBoundingClientRect().right > width + 1)
        .map((el) => ({ node: el.className, right: el.getBoundingClientRect().right }))
        .slice(0, 12),
    };
  });
  expect(overflow.amount, JSON.stringify(overflow.elements)).toBe(0);
}

test("Automations distinguishes available and planned integrations across screen sizes", async ({
  page,
}, testInfo) => {
  await mockTelegram(page);
  await page.goto("/automations");
  const available = page.getByRole("article", { name: "Telegram", exact: true });
  const upcoming = page.getByRole("article", { name: /coming soon/ });
  await expect(available).toContainText("Available");
  await expect(available).toHaveCSS("border-top-style", "solid");
  await expect(upcoming).toHaveCount(2);
  for (const card of await upcoming.all()) {
    await expect(card).toHaveCSS("border-top-style", "dashed");
    await expect(card).toContainText("Not available yet");
    await expect(card.getByRole("link")).toHaveCount(0);
  }
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`automations-${width}.png`),
      fullPage: true,
    });
  }
  await page.evaluate(() => localStorage.setItem("bc.theme", "midnight-dark-theme"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight-dark-theme");
  await expect(available).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("automations-dark.png"), fullPage: true });
  await page.getByRole("link", { name: "Manage Telegram" }).click();
  await expect(page).toHaveURL(/\/automations\/telegram$/);
  await expect(page.getByRole("heading", { name: "Telegram", exact: true })).toBeVisible();
});

for (const width of [320, 768, 1440]) {
  test(`Telegram views fit ${width}px and show populated states`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockTelegram(page);
    await page.goto("/automations/telegram");
    await expect(page.getByRole("heading", { name: group.group_title })).toBeVisible();
    await expect(page.getByText("Alex Morgan")).toBeVisible();
    await expect(page.locator('[class*="manager-module"][class*="workspace"]')).toHaveCSS(
      "display",
      "grid",
    );
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("groups.png"), fullPage: true });
    await page.getByRole("button", { name: /^Orders/ }).click();
    await expect(page.getByText("TG-1001", { exact: true })).toBeVisible();
    const orderCard = page.locator("article").filter({ hasText: "TG-1001" });
    await expect(orderCard.getByRole("heading", { name: "Customer: Ma Hnin" })).toBeVisible();
    await expect(orderCard.getByText("wo phone", { exact: true })).toBeVisible();
    await expect(
      orderCard.getByText("Electric wheelchair — compact folding model", { exact: true }),
    ).toBeVisible();
    await expect(orderCard.getByRole("button", { name: "Confirm order", exact: true })).toHaveCount(
      1,
    );
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("orders.png"), fullPage: true });
    await page.getByRole("button", { name: /^Cancelled & expired/ }).click();
    await expect(page.getByText("TG-1004", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Setup guide", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Set up Telegram in 5 steps" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seller commands" })).toBeVisible();
    await expect(page.getByText("Customer and multiple products", { exact: true })).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("guide.png"), fullPage: true });
  });
}

test("Telegram actions retain their endpoints and update the workspace", async ({ page }) => {
  const calls = await mockTelegram(page);
  await page.goto("/automations/telegram");
  await page.getByRole("button", { name: "Connect Telegram group", exact: true }).click();
  await expect(
    page.getByText("/connect@NanonuxBusinessCentralBot BC-TEST-123", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh health", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh health", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rotate code", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rotate code", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Revoke access", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await page.getByText("Connection details", { exact: true }).click();
  await expect(
    page.getByText("Manage chat; send and edit messages", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Orders/ }).click();
  await page.getByRole("button", { name: "Confirm order", exact: true }).first().click();
  await expect(page.getByText("TG-1001", { exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();
  await page.getByRole("button", { name: /^Confirmed/ }).click();
  await expect(page.getByText("TG-1001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Groups/ }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Warehouse dispatch", exact: true }),
  ).toBeVisible();
  expect(calls).toEqual(
    expect.arrayContaining([
      `POST /telegram/shops/${shopID}/pairing-codes`,
      "POST /telegram/groups/group-main/refresh",
      "PATCH /telegram/groups/group-main/status",
      "POST /telegram/groups/group-main/rotate-pairing-code",
      "POST /telegram/groups/group-main/users/12345/revoke",
      "POST /telegram/orders/1001/confirm",
      "POST /telegram/orders/1002/cancel",
      "DELETE /telegram/groups/group-main",
    ]),
  );
  await page.getByLabel("Telegram shop").selectOption(secondShopID);
  await expect(
    page.getByRole("heading", { name: "Bring your Telegram orders into one place" }),
  ).toBeVisible();
  await expect(
    page.getByText("/connect@NanonuxBusinessCentralBot BC-TEST-123", { exact: true }),
  ).not.toBeVisible();
});

test("Telegram empty and error states remain useful", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockTelegram(page, { empty: true, failPairing: true });
  await page.goto("/automations/telegram");
  await expect(
    page.getByRole("heading", { name: "Bring your Telegram orders into one place" }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("empty.png"), fullPage: true });
  await page.getByRole("button", { name: "Connect Telegram group", exact: true }).first().click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Telegram automation is not enabled" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Telegram group", exact: true }).first(),
  ).toBeEnabled();
});

test("Telegram does not offer placeholder pairing commands when bot name is missing", async ({
  page,
}) => {
  const calls = await mockTelegram(page, { botName: "" });
  await page.goto("/automations/telegram");
  await expect(
    page.getByText("Telegram bot username is not configured.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Telegram group", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rotate code", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Setup guide", exact: true }).click();
  await expect(page.getByText("BotUsername", { exact: false })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("Telegram supports dark themes, compact layout, and copying commands", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockTelegram(page);
  await page.addInitScript(() => {
    localStorage.setItem("bc.theme", "midnight-dark-theme");
    localStorage.setItem("bc.layout", "compact-layout");
  });
  await page.goto("/automations/telegram");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight-dark-theme");
  await expect(page.getByRole("heading", { name: group.group_title })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("dark-groups.png"), fullPage: true });
  await page.getByRole("button", { name: "Connect Telegram group", exact: true }).click();
  await page.getByRole("button", { name: "Copy pairing command" }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByText("/connect@NanonuxBusinessCentralBot BC-TEST-123", { exact: true }),
  ).toHaveCSS("font-family", /Telegram Pairing Mono/);
  expect(await page.evaluate(() => document.fonts.check('14px "Telegram Pairing Mono"'))).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("pairing-font.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "Copy pairing command" })).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "/connect@NanonuxBusinessCentralBot BC-TEST-123",
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Setup guide", exact: true }).click();
  await page.getByRole("button", { name: "Copy by sku command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "/takeorder quantity=2 WC-002",
  );
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("dark-guide.png"), fullPage: true });
});

test("Telegram invoices keep unnamed customers blank and become Paid after confirmation", async ({
  page,
}) => {
  await mockTelegram(page);
  await page.goto("/invoices");
  const named = page.getByRole("row", { name: "Open TG-1001", exact: true });
  const unnamed = page.getByRole("row", { name: "Open TG-1002", exact: true });
  await expect(named).toContainText("Ma Hnin");
  await expect(named).toContainText("Pending");
  await expect(unnamed.getByRole("cell").nth(1)).toHaveText("");
  await expect(unnamed).not.toContainText("Walk-in customer");
  await expect(unnamed).not.toContainText("Online-Telegram-Customer");
  await page.goto("/automations/telegram");
  await page.getByRole("button", { name: /^Orders/ }).click();
  await expect(page.locator("article").filter({ hasText: "TG-1001" })).toContainText(
    "Payment: Pending",
  );
  await page.getByRole("button", { name: "Confirm order", exact: true }).first().click();
  await page.goto("/invoices");
  await expect(named).toContainText("Paid");
  await expect(named).toContainText("Ma Hnin");
  await expect(unnamed.getByRole("cell").nth(1)).toHaveText("");
});

test("Automatic confirmation defaults OFF, persists, and leaves old drafts pending", async ({
  page,
}) => {
  const calls = await mockTelegram(page);
  await page.goto("/automations/telegram");
  const toggle = page.getByRole("switch", { name: "Automatically Confirm Order" });
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: /^Orders/ }).click();
  await expect(page.getByText("TG-1001", { exact: true })).toBeVisible();
  await expect(page.getByText("Payment: Pending").first()).toBeVisible();
  await page.getByRole("button", { name: /^Groups/ }).click();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  expect(
    calls.filter((call) => call === "PATCH /telegram/groups/group-main/auto-confirm"),
  ).toHaveLength(2);
});

test("Automatic confirmation errors keep the saved switch state", async ({ page }) => {
  await mockTelegram(page, { failAutoConfirm: true });
  await page.goto("/automations/telegram");
  const toggle = page.getByRole("switch", { name: "Automatically Confirm Order" });
  await toggle.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Automatic confirmation setting could not be saved." }),
  ).toBeVisible();
  await expect(toggle).not.toBeChecked();
});

test("Read-only users cannot change automatic confirmation", async ({ page }) => {
  await mockTelegram(page, { readOnly: true });
  await page.goto("/automations/telegram");
  await expect(page.getByRole("switch", { name: "Automatically Confirm Order" })).toBeDisabled();
});
