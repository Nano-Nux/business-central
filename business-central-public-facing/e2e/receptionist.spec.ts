import { expect, Page, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const slot = { start: "2026-10-21T03:00:00Z", end: "2026-10-21T03:30:00Z" };
const stamp = "2026-10-20T03:00:00Z";
const booking = {
  id: "22222222-2222-4222-8222-222222222222",
  conversation_id: id,
  name: "Visitor",
  email: "visitor@example.com",
  company: "Test store",
  notes: "POS demo",
  ...slot,
  timezone: "Asia/Bangkok",
  calendar_id: "primary",
  status: "CONFIRMED",
  event_id: "event123",
  event_url: "https://calendar.google.com/event?test=1",
  last_error: "",
  created_at: stamp,
};
const greeting = {
  id: "greeting",
  role: "assistant",
  content: "Hi! How can Nanonux help your business?",
  created_at: stamp,
};
const settings = {
  enabled: true,
  greeting: greeting.content,
  knowledge: "Verified POS and inventory features.",
  timezone: "Asia/Bangkok",
  calendar_id: "primary",
  duration_minutes: 30,
  start_hour: 9,
  end_hour: 17,
  weekdays: [1, 2, 3, 4, 5],
  daily_limit: 200,
  calendar_connected: true,
  oauth_configured: true,
};

async function publicMock(
  page: Page,
  uncertain = false,
  messageOptions: {
    wait?: Promise<void>;
    fail?: "before" | "after";
    slots?: (typeof slot)[];
    bookingError?: string;
    reply?: string;
    timezone?: string;
    disconnected?: boolean;
  } = {},
) {
  const conversation = {
    id,
    name: "",
    email: "",
    company: "",
    created_at: stamp,
    updated_at: stamp,
    messages: [greeting],
    bookings: [] as (typeof booking)[],
  };
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/public/receptionist/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    const respond = (data: unknown) =>
      route.fulfill({ json: { data }, headers });
    if (path.endsWith("/status"))
      return respond({
        ...settings,
        timezone: messageOptions.timezone || settings.timezone,
        calendar_connected: !messageOptions.disconnected,
      });
    if (path.endsWith("/conversations") && method === "POST")
      return respond({ conversation, token: "a".repeat(43) });
    expect(request.headers().authorization).toBe(`Bearer ${"a".repeat(43)}`);
    if (path.endsWith("/messages")) {
      await messageOptions.wait;
      if (messageOptions.fail === "before")
        return route.fulfill({
          status: 503,
          headers,
          json: {
            error: { code: "UNAVAILABLE", message: "Please try again." },
          },
        });
      const { message } = request.postDataJSON();
      conversation.messages.push(
        { ...greeting, id: "visitor-message", role: "user", content: message },
        {
          ...greeting,
          id: "reply",
          content:
            messageOptions.reply ||
            "Business Central supports POS. Select a time to arrange a demo.",
          slots: messageOptions.slots || [slot],
        } as typeof greeting,
      );
      if (messageOptions.fail === "after") return route.abort("failed");
      return respond(conversation);
    }
    if (path.endsWith("/slots")) return respond(messageOptions.slots || [slot]);
    if (path.endsWith("/bookings")) {
      requests.push(request.postDataJSON());
      if (messageOptions.bookingError)
        return route.fulfill({
          status: 409,
          headers,
          json: {
            error: {
              code: messageOptions.bookingError,
              message: "Please choose an available time again.",
            },
          },
        });
      if (uncertain && requests.length === 1) return route.abort("failed");
      conversation.bookings = [
        { ...booking, id: String(requests[0].request_id) },
      ];
      return respond(conversation.bookings[0]);
    }
    return respond(conversation);
  });
  return { conversation, requests };
}
async function fillBooking(page: Page) {
  await page.getByRole("button", { name: "Book a call", exact: true }).click();
  await page.getByLabel("Preferred date").fill("2026-10-21");
  await page.getByRole("button", { name: "Check times", exact: true }).click();
  await page.getByRole("button", { name: /Oct 21, 2026/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Visitor");
  await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
  await page.getByLabel("Business / company (optional)").fill("Test store");
  await page.getByLabel("What would you like to discuss?").fill("POS demo");
  await expect(
    page.getByRole("button", { name: "Confirm appointment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
}

test("chat shows the visitor message before a delayed AI response without duplicates", async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await publicMock(page, false, { wait });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await expect(page.getByText(greeting.content)).toBeVisible();
  const content = "Can you show me POS tomorrow?";
  await page.getByLabel("Your message").fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  try {
    await expect(
      page.getByRole("log").getByText(content, { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Your message")).toHaveValue("");
    await expect(page.getByText("Nanonux AI is replying…")).toBeVisible();
    await expect(
      page.getByText("Business Central supports POS.", { exact: false }),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await expect(
    page.getByText("Business Central supports POS.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("log").getByText(content, { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByText("Sending…", { exact: true })).toHaveCount(0);
});

for (const fail of ["before", "after"] as const) {
  test(`chat reconciles a failed request ${fail} the message is saved`, async ({
    page,
  }) => {
    await publicMock(page, false, { fail });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open Nanonux AI support chat" })
      .click();
    await expect(page.getByText(greeting.content)).toBeVisible();
    const content = "Help me choose a POS";
    await page.getByLabel("Your message").fill(content);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", {
          name: "Nanonux Business Central AI receptionist",
        })
        .getByRole("alert"),
    ).toBeVisible();
    await expect(page.getByLabel("Your message")).toBeEnabled();
    await expect(page.getByLabel("Your message")).toHaveValue(
      fail === "before" ? content : "",
    );
    await expect(
      page.getByRole("log").getByText(content, { exact: true }),
    ).toHaveCount(fail === "before" ? 0 : 1);
  });
}

test("public chat uses persisted support replies and displays selectable tool slots", async ({
  page,
}) => {
  const mock = await publicMock(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await expect(page.getByText(greeting.content)).toBeVisible();
  await page.getByLabel("Your message").fill("Can you show me POS tomorrow?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Business Central supports POS.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Oct 21, 2026/ }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Preferred date")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check times", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Appointment times are shown in Asia/Bangkok."),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Visitor");
  await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
  expect(mock.requests).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Confirm appointment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  await expect(
    page.getByText("Appointment confirmed", { exact: true }),
  ).toBeVisible();
  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0].start).toBe(slot.start);
  await expect(page.getByLabel("Your message")).toBeVisible();
});

test("changing a chat-selected time keeps contact details and the selected business-local date", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const morning = {
    start: "2026-10-21T00:30:00Z",
    end: "2026-10-21T01:00:00Z",
  };
  await publicMock(page, false, {
    slots: [morning],
    timezone: "America/Los_Angeles",
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await page.getByLabel("Your message").fill("Can we discuss the packages?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: /Oct 20, 2026/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Visitor");
  await page.getByLabel("Email", { exact: true }).fill("visitor@example.com");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Change time", exact: true }).click();
  await expect(page.getByLabel("Preferred date")).toHaveValue("2026-10-20");
  await page.getByRole("button", { name: /Oct 20, 2026/ }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Visitor");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "visitor@example.com",
  );
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByLabel("Preferred date")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/receptionist-contact-details.png",
  });
});

for (const bookingError of ["SLOT_EXPIRED", "SLOT_UNAVAILABLE"]) {
  test(`${bookingError} returns to available-time selection and keeps contact details`, async ({
    page,
  }) => {
    await publicMock(page, false, { bookingError });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Open Nanonux AI support chat" })
      .click();
    await expect(page.getByText(greeting.content)).toBeVisible();
    await fillBooking(page);
    await page
      .getByRole("button", { name: "Confirm appointment", exact: true })
      .click();
    await expect(page.getByLabel("Preferred date")).toHaveValue("2026-10-21");
    await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Check times", exact: true })
      .click();
    await page.getByRole("button", { name: /Oct 21, 2026/ }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Visitor",
    );
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });
}

test("walkthrough CTA opens scheduling, explains an empty date and can return to chat", async ({
  page,
}) => {
  await publicMock(page, false, { slots: [] });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Schedule a Walkthrough", exact: true })
    .click();
  await page.getByLabel("Preferred date").fill("2026-10-21");
  await page.getByRole("button", { name: "Check times", exact: true }).click();
  await expect(
    page.getByText("No available appointments for this date.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm appointment", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Your message")).toBeVisible();
  await expect(page.getByText(greeting.content)).toBeVisible();
});

test("disconnected calendar offers chat without a dead-end booking form", async ({
  page,
}) => {
  await publicMock(page, false, { disconnected: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Schedule a Walkthrough", exact: true })
    .click();
  await expect(
    page.getByText("Online booking is not connected yet.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Preferred date")).toHaveCount(0);
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByLabel("Your message")).toBeVisible();
});

test("model formatting is readable text and never executes HTML", async ({
  page,
}) => {
  await publicMock(page, false, {
    reply:
      "**Choose a time below.**&#x20;&lt;img src=x onerror=window.receptionistInjected=true&gt;",
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await page.getByLabel("Your message").fill("A call please");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText(
        "Choose a time below. <img src=x onerror=window.receptionistInjected=true>",
        { exact: true },
      ),
  ).toBeVisible();
  await expect(page.getByRole("log").locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => Object.hasOwn(window, "receptionistInjected")),
  ).toBe(false);
});
test("visitor must confirm details before a real booking result is shown", async ({
  page,
}) => {
  const mock = await publicMock(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await expect(page.getByText(greeting.content)).toBeVisible();
  await fillBooking(page);
  expect(mock.requests).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  await expect(
    page.getByText("Appointment confirmed", { exact: true }),
  ).toBeVisible();
  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({
    confirmed: true,
    email: "visitor@example.com",
    start: slot.start,
  });
});
test("uncertain booking survives reload and retries with the identical request ID", async ({
  page,
}) => {
  const mock = await publicMock(page, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await expect(page.getByText(greeting.content)).toBeVisible();
  await fillBooking(page);
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry booking confirmation" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Nanonux AI support chat" })
    .click();
  await expect(page.getByText(greeting.content)).toBeVisible();
  await page.getByRole("button", { name: "Book a call", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry booking confirmation" })
    .click();
  await expect(
    page.getByText("Appointment confirmed", { exact: true }),
  ).toBeVisible();
  expect(mock.requests).toHaveLength(2);
  expect(mock.requests[1]).toEqual(mock.requests[0]);
});

async function adminMock(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "bc_admin_session",
      JSON.stringify({
        access_token: "admin-token",
        refresh_token: "refresh",
        user: {
          email: "admin@example.com",
          display_name: "Admin",
          platform_admin: true,
        },
      }),
    ),
  );
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/v1/admin/receptionist/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    expect(req.headers().authorization).toBe("Bearer admin-token");
    const conversation = {
      id,
      name: "Visitor",
      email: booking.email,
      company: booking.company,
      created_at: stamp,
      updated_at: stamp,
      messages: [
        greeting,
        {
          ...greeting,
          id: "user",
          role: "user",
          content: "Help with <script>window.exploited=true</script>",
        },
      ],
      bookings: [booking],
    };
    const reply = (data: unknown, meta?: unknown) =>
      route.fulfill({ json: { data, ...(meta ? { meta } : {}) }, headers });
    if (url.pathname.endsWith("/settings")) {
      if (req.method() === "PUT") writes.push(req.postDataJSON());
      return reply({ ...settings, ...writes.at(-1) });
    }
    if (url.pathname.endsWith("/google/connect"))
      return reply({ url: "http://127.0.0.1:3212/fake-google" });
    if (url.pathname.endsWith("/conversations"))
      return reply([conversation], {
        total: 26,
        limit: 25,
        offset: Number(url.searchParams.get("offset")),
      });
    if (url.pathname.endsWith(`/conversations/${id}`))
      return reply(conversation);
    if (url.pathname.endsWith("/bookings"))
      return reply([booking], { total: 1, limit: 25, offset: 0 });
    if (url.pathname.endsWith(`/bookings/${booking.id}`)) return reply(booking);
    throw new Error(`Unexpected API request ${req.url()}`);
  });
  return writes;
}
test("Admin reads full transcripts, paginates and follows booking details", async ({
  page,
}) => {
  await adminMock(page);
  await page.goto("http://127.0.0.1:3212/receptionist");
  await page.getByRole("button", { name: "View chat", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Help with <script>window.exploited=true</script>",
  );
  expect(
    await page.evaluate(
      () => (window as Window & { exploited?: boolean }).exploited,
    ),
  ).toBeUndefined();
  await page.getByRole("button", { name: /^Booking: CONFIRMED/ }).click();
  await expect(page.getByRole("dialog")).toContainText("POS demo");
  await expect(page.getByRole("dialog")).toContainText("Asia/Bangkok");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("26–26 of 26")).toBeVisible();
  await page.getByRole("tab", { name: "All bookings" }).click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(booking.email);
  await page.getByRole("button", { name: "View linked conversation" }).click();
  await expect(
    page.getByRole("heading", { name: "Conversation history" }),
  ).toBeVisible();
});
test("Admin edits approved content and schedule and begins Google connection", async ({
  page,
}) => {
  const writes = await adminMock(page);
  await page.route("**/fake-google", (route) =>
    route.fulfill({ body: "Google authorization would begin here." }),
  );
  await page.goto("http://127.0.0.1:3212/receptionist");
  await page.getByRole("tab", { name: "Settings & integrations" }).click();
  await page
    .getByLabel("Approved support knowledge")
    .fill("Verified product content updated by Admin.");
  await page.getByLabel("Daily chat turn limit (UTC)").fill("75");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Receptionist settings saved.")).toBeVisible();
  expect(writes[0]).toMatchObject({
    daily_limit: 75,
    knowledge: "Verified product content updated by Admin.",
  });
  await page.getByRole("button", { name: "Reconnect Google Calendar" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3212/fake-google");
});
test("Admin history requires a session in the browser", async ({ page }) => {
  await page.goto("http://127.0.0.1:3212/receptionist");
  await expect(
    page.getByRole("heading", { name: "Sign-in required" }),
  ).toBeVisible();
});
