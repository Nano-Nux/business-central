import { expect, test } from "@playwright/test";

test("creates one repair ticket with two financially allocated devices", async ({ page }) => {
  const merchantID = "11111111-1111-1111-1111-111111111111";
  const shopID = "22222222-2222-2222-2222-222222222222";
  const serviceID = "33333333-3333-3333-3333-333333333333";
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
  let ticketPayload: Record<string, unknown> | undefined;
  let finalPaymentPayload: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/repairs/tickets" && request.method() === "POST") {
      ticketPayload = request.postDataJSON() as Record<string, unknown>;
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "ticket" } }),
      });
      return;
    }
    if (path === "/repairs/orders/ticket/payments" && request.method() === "POST") {
      finalPaymentPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "final-payment",
            repair_order_id: "ticket",
            kind: "FINAL",
            method: "CASH",
            status: "CAPTURED",
            amount: "27",
          },
        }),
      });
      return;
    }
    if (path === "/sync/handshake" && request.method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            protocol_version: "1",
            schema_version: "1",
            server_sequence: 0,
            device: { id: "device" },
            session: { id: "session", scope: "merchant" },
          },
        }),
      });
      return;
    }
    if (path === "/sync/pull" && request.method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: { changes: [], next_sequence: 0, current_sequence: 0, has_more: false },
        }),
      });
      return;
    }
    const collections: Record<string, unknown[]> = {
      "/currencies": [{ code: "USD", name: "US Dollar", symbol: "$", decimal_places: 2 }],
      "/shops": [
        {
          id: shopID,
          name: "Repair Shop",
          code: "MAIN",
          timezone: "UTC",
          is_active: true,
          module_codes: ["repair"],
          include_tax: false,
          tax_rate: "0",
        },
      ],
      "/repairs/orders": ticketPayload
        ? [
            {
              id: "ticket",
              service_order_id: "service-order",
              device_id: "device-primary",
              order_number: "REP-TEST",
              status: finalPaymentPayload ? "COMPLETED" : "READY_FOR_PICKUP",
              issue_description: "Broken screen",
              received_at: "2026-08-15T00:00:00Z",
              customer_name: "Multi Device Customer",
              deposit_paid: finalPaymentPayload ? "37" : "10",
              payment_status: finalPaymentPayload ? "PAID" : "DEPOSIT_PAID",
              labor_fee: "25",
              additional_fee: "12",
              tax_amount: "0",
              total_cost: "37",
              work_items: ticketPayload.work_items,
            },
          ]
        : [],
      "/repairs/devices": [],
      "/pos/catalog": [],
      "/promotions": [],
      "/services/catalog": [
        { id: serviceID, code: "DIAG", name: "Diagnostics", labor_fee: "25.00", is_active: true },
      ],
      "/services/forms/definitions": [],
    };
    const key = Object.keys(collections).find(
      (candidate) => path === candidate || path.startsWith(`${candidate}?`),
    );
    if (key) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: collections[key],
          meta: { page_index: 0, page_size: 200, total: collections[key].length, total_pages: 1 },
        }),
      });
      return;
    }
    if (path === "/merchant") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: merchantID,
            name: "Repair Merchant",
            slug: "repair",
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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

  await page.goto("/repairs");
  await page.getByRole("button", { name: "Create repair ticket" }).click();
  const dialog = page.getByRole("dialog", { name: "New repair ticket" });
  await dialog.getByLabel("Customer name").fill("Multi Device Customer");
  await dialog.getByLabel("Device type").first().selectOption("PHONE");
  await dialog
    .getByPlaceholder("Enter or scan IMEI / serial number")
    .first()
    .fill("SN-PRIMARY-001");
  await dialog.getByLabel("Issue 1 *").first().fill("Broken screen");
  await dialog.getByLabel("Price", { exact: true }).first().fill("5");
  const waitingStart = await dialog.getByLabel("Waiting start date").first().inputValue();
  const addWaitingDays = (days: number) => {
    const date = new Date(`${waitingStart}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  await dialog.getByLabel("Waiting time (days)").first().fill("3");
  await expect(dialog.getByLabel("Waiting end date").first()).toHaveValue(addWaitingDays(3));
  await dialog.getByRole("button", { name: "Add device to this ticket" }).click();
  await dialog.getByLabel("Device type").nth(1).selectOption("TABLET");
  await dialog.getByLabel("Issue 1 *").nth(1).fill("Battery replacement");
  await dialog.getByLabel("Price", { exact: true }).nth(1).fill("7");
  await dialog.getByLabel("Waiting end date").nth(1).fill(addWaitingDays(5));
  await expect(dialog.getByLabel("Waiting time (days)").nth(1)).toHaveValue("5");
  const optionalService = dialog.getByLabel("Service 1 (optional)");
  await expect(optionalService).not.toHaveAttribute("required", "");
  await optionalService.selectOption(serviceID);
  await dialog.getByLabel("Work item").selectOption("1");
  await dialog.getByLabel("Payment status").selectOption("DEPOSIT_PAID");
  await dialog.getByLabel("Deposit amount").fill("10");
  await dialog.getByRole("button", { name: "Preview repair invoice" }).click();
  const invoicePreview = page.getByRole("dialog", { name: "Repair ticket invoice preview" });
  await expect(
    invoicePreview.getByRole("img", { name: "Repair ticket invoice REPAIR-PREVIEW" }),
  ).toBeVisible();
  await expect(invoicePreview.getByRole("button", { name: "Thermal print" })).toBeVisible();
  await invoicePreview.getByRole("button", { name: "Close" }).click();
  await dialog.getByRole("button", { name: "Create ticket" }).click();

  await expect(page.getByText("Pending sync")).toBeVisible();
  await expect.poll(() => ticketPayload).toBeTruthy();
  const workItems = ticketPayload!.work_items as Array<Record<string, unknown>>;
  const serviceItems = ticketPayload!.service_items as Array<Record<string, unknown>>;
  expect(workItems).toHaveLength(2);
  expect(workItems.map((item) => item.additional_fee)).toEqual(["5", "7"]);
  expect(workItems.map((item) => item.waiting_days)).toEqual([3, 5]);
  expect(workItems.map((item) => item.waiting_end_date)).toEqual([
    addWaitingDays(3),
    addWaitingDays(5),
  ]);
  expect((workItems[0].device as Record<string, unknown>).serial_number).toBe("SN-PRIMARY-001");
  expect(serviceItems[0].work_item_id).toBe(workItems[1].id);
  expect(ticketPayload!.additional_fee).toBe("0");
  expect(ticketPayload!.deposit_amount).toBe("10");
  await expect(page.getByText("Pending sync")).toBeHidden();

  await page.getByTitle("Open ticket").click();
  const ticketDetails = page.getByRole("dialog", { name: "REP-TEST" });
  await ticketDetails.getByRole("button", { name: "Preview / print invoice" }).click();
  const receivedInvoice = page.getByRole("dialog", { name: "Repair ticket invoice" });
  await expect(receivedInvoice.getByRole("button", { name: "Thermal print" })).toBeVisible();
  await receivedInvoice.getByRole("button", { name: "Close" }).click();
  await ticketDetails.getByRole("button", { name: "Record final payment" }).click();
  const paymentDialog = page.getByRole("dialog", { name: "Record final payment" });
  await paymentDialog.getByRole("button", { name: "Save payment & complete" }).click();
  await expect.poll(() => finalPaymentPayload).toBeTruthy();
  expect(finalPaymentPayload!.amount).toBe("27.00");
  await expect(paymentDialog).toBeHidden();
  await expect(ticketDetails).toBeHidden();
  await expect(page.locator(".repair-summary").getByText("Completed").locator("..")).toContainText(
    "1",
  );
  await page.getByTitle("Open ticket").click();
  const completedTicketDetails = page.getByRole("dialog", { name: "REP-TEST" });
  await completedTicketDetails.getByRole("button", { name: "Preview / print invoice" }).click();
  const completedInvoice = page.getByRole("dialog", { name: "Repair ticket invoice" });
  await expect(completedInvoice.getByRole("button", { name: "Thermal print" })).toBeVisible();
  await completedInvoice.getByRole("button", { name: "Close" }).click();
  await completedTicketDetails.getByRole("button", { name: "Close", exact: true }).click();

  ticketPayload = undefined;
  await page.getByRole("button", { name: "Create repair ticket" }).click();
  const optionalDialog = page.getByRole("dialog", { name: "New repair ticket" });
  await expect(optionalDialog.getByLabel("Service 1 (optional)")).toHaveValue("");
  await optionalDialog.getByRole("button", { name: "Create ticket" }).click();
  await expect.poll(() => ticketPayload).toBeTruthy();
  expect(ticketPayload!.service_id).toBeUndefined();
  expect(ticketPayload!.service_items).toEqual([]);
});
