import { expect, test, type Page } from "@playwright/test";

const merchantID = "11111111-1111-4111-8111-111111111111";
const shopID = "22222222-2222-4222-8222-222222222222";
const otherShopID = "33333333-3333-4333-8333-333333333333";
const user = {
  id: "44444444-4444-4444-8444-444444444444",
  membership_id: "55555555-5555-4555-8555-555555555555",
  merchant_id: merchantID,
  email: "owner@example.test",
  display_name: "AI Test Owner",
  is_active: true,
  platform_admin: false,
  roles: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      code: "merchant",
      name: "Merchant",
      permission_codes: ["tenant.read", "tenant.write", "ai.chat"],
    },
  ],
};
const now = "2026-10-11T00:00:00Z";
function conversation(sid: string) {
  return {
    id: sid === shopID ? "main-chat" : "other-chat",
    merchant_id: merchantID,
    membership_id: user.membership_id,
    shop_id: sid,
    shop_name: sid === shopID ? "Main Shop" : "Other Shop",
    title: sid === shopID ? "Main history" : "Other history",
    created_at: now,
    updated_at: now,
  };
}
async function setup(page: Page) {
  const scopedRequests: string[] = [];
  const chatRequests: Record<string, unknown>[] = [];
  await page.addInitScript(
    ({ testUser, sid }) => {
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
      if (!localStorage.getItem("bc.current-shop")) localStorage.setItem("bc.current-shop", sid);
    },
    { testUser: user, sid: shopID },
  );
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    let data: unknown = [];
    if (path === "/auth/me") data = user;
    else if (path === "/merchant")
      data = {
        id: merchantID,
        name: "AI Merchant",
        slug: "ai-test",
        default_currency_code: "USD",
        pos_complexity_level: "COMPLEX",
        ai_assistant_enabled: true,
        ai_usage_count: 0,
        ai_usage_limit: 50,
        is_active: true,
      };
    else if (path === "/shops")
      data = [
        {
          id: shopID,
          name: "Main Shop",
          code: "MAIN",
          timezone: "UTC",
          is_active: true,
          module_codes: ["repair"],
        },
        {
          id: otherShopID,
          name: "Other Shop",
          code: "OTHER",
          timezone: "UTC",
          is_active: true,
          module_codes: ["repair"],
        },
      ];
    else if (path === "/currencies")
      data = [{ code: "USD", name: "US Dollar", symbol: "$", decimal_places: 2 }];
    else if (path === "/ai/usage")
      data = { usage_count: 0, usage_limit: 50, remaining: 50, is_limit_reached: false };
    else if (path === "/ai/conversations") {
      const sid = url.searchParams.get("shop_id");
      expect([shopID, otherShopID]).toContain(sid);
      scopedRequests.push(sid!);
      data = [conversation(sid!)];
    } else if (path.endsWith("/messages") && path.startsWith("/ai/conversations/")) {
      const sid = url.searchParams.get("shop_id");
      expect([shopID, otherShopID]).toContain(sid);
      expect(path).toContain(conversation(sid!).id);
      data = {
        conversation: conversation(sid!),
        messages: [
          {
            id: "history-answer",
            conversation_id: conversation(sid!).id,
            merchant_id: merchantID,
            membership_id: user.membership_id,
            sender_type: "ASSISTANT",
            content: `<p>${sid === shopID ? "Main shop historical data" : "Other shop historical data"}</p><img src="https://ai-attacker.invalid/steal"><script>window.__aiPwned=true</script><a href="javascript:alert(1)">Unsafe link</a>`,
            created_at: now,
          },
        ],
      };
    } else if (path === "/ai/chat") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      chatRequests.push(payload);
      expect(payload.shop_id).toBe(shopID);
      data = {
        conversation_id: "main-chat",
        shop_id: shopID,
        user_message: {
          id: "user-new",
          sender_type: "USER",
          content: payload.message,
          created_at: now,
        },
        ai_message: {
          id: "ai-new",
          sender_type: "ASSISTANT",
          content:
            '<div class="ai-stat-card"><strong>Gross profit 10.00 USD</strong></div><svg onload="window.__aiPwned=true"></svg><iframe src="https://ai-attacker.invalid/steal"></iframe>',
          created_at: now,
        },
        ai_usage_count: 1,
        ai_usage_limit: 50,
      };
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data, meta: { total: 0 } }),
    });
  });
  return { scopedRequests, chatRequests };
}
test("AI requests carry the selected shop and unsafe response HTML cannot execute", async ({
  page,
}) => {
  const { chatRequests } = await setup(page);
  const external: string[] = [];
  await page.route("https://ai-attacker.invalid/**", (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto("/ai-assistant");
  await expect(page.getByText("Main shop historical data")).toBeVisible();
  await expect(
    page.locator(".ai-message-html img,.ai-message-html script,.ai-message-html a[href]"),
  ).toHaveCount(0);
  await page.locator("textarea").fill("total profit this month");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Gross profit 10.00 USD")).toBeVisible();
  expect(chatRequests).toHaveLength(1);
  expect(chatRequests[0].conversation_id).toBe("main-chat");
  await expect(page.locator(".ai-message-html svg,.ai-message-html iframe")).toHaveCount(0);
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, "__aiPwned"))).toBe(
    false,
  );
  expect(external).toEqual([]);
});
test("switching shops loads only that shop's history", async ({ page }) => {
  const { scopedRequests } = await setup(page);
  await page.goto("/ai-assistant");
  await expect(page.getByText("Main shop historical data")).toBeVisible();
  await page.goto("/select-shop");
  await page.getByRole("button", { name: /Other Shop/ }).click();
  await expect(page).toHaveURL(/reports/);
  await page.goto("/ai-assistant");
  await expect(page.getByText("Other shop historical data")).toBeVisible();
  await expect(page.getByText("Main shop historical data")).toHaveCount(0);
  expect(scopedRequests).toContain(shopID);
  expect(scopedRequests).toContain(otherShopID);
});
