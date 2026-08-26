import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineScope,
  getCachedResource,
  listOperations,
  putCachedResource,
} from "./offline-db";
import { deferredRequestFromPayload } from "./offline-deferred";
import { queueRepairTicketCreate, queueRepairWorkItemStatus } from "./offline-repairs";
import type { RepairOrder } from "./types";

const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline multi-work-item repair tickets", () => {
  it("keeps stable work-item IDs and child assignments in the aggregate", async () => {
    const repairID = "00000000-0000-0000-0000-000000000004";
    const shopID = "00000000-0000-0000-0000-000000000003";
    const body = {
      idempotency_key: "repair-ticket-multi-1",
      order_number: "REP-MULTI-1",
      shop_id: shopID,
      work_items: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          type: "DEVICE",
          device: { device_type: "PHONE" },
          issue_description: "Screen",
        },
        {
          id: "00000000-0000-0000-0000-000000000011",
          type: "DEVICE",
          device: { device_type: "LAPTOP" },
          issue_description: "Battery",
        },
      ],
      parts: [
        {
          work_item_id: "00000000-0000-0000-0000-000000000011",
          variant_id: "variant-1",
          quantity: "1",
        },
        { variant_id: "variant-ticket", quantity: "1" },
      ],
      images: [
        {
          work_item_id: "00000000-0000-0000-0000-000000000010",
          filename: "screen.jpg",
          content_type: "image/jpeg",
          data_base64: "aW1hZ2U=",
        },
        { filename: "ticket.jpg", content_type: "image/jpeg", data_base64: "aW1hZ2U=" },
      ],
    };
    const projection = {
      id: repairID,
      shop_id: shopID,
      service_order_id: "offline-service-order",
      device_id: "offline-device",
      order_number: "REP-MULTI-1",
      status: "RECEIVED",
      issue_description: "Screen",
      received_at: new Date().toISOString(),
      deposit_paid: "0",
      payment_status: "UNPAID",
      labor_fee: "0",
      additional_fee: "0",
      tax_amount: "0",
      total_cost: "0",
    } satisfies RepairOrder;

    const repairsPath = `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${shopID}`;
    await putCachedResource(scope, repairsPath, []);
    await queueRepairTicketCreate(scope, shopID, body, projection);

    const [operation] = await listOperations(scope);
    const request = deferredRequestFromPayload(operation.payload);
    expect(request).not.toBeNull();
    const requestBody = request!.body as {
      work_items: unknown[];
      parts: unknown[];
      images: unknown[];
    };
    expect(requestBody.work_items).toEqual([
      expect.objectContaining({ id: body.work_items[0].id }),
      expect.objectContaining({ id: body.work_items[1].id }),
    ]);
    expect(requestBody.parts[0]).toMatchObject({ work_item_id: body.work_items[1].id });
    expect(requestBody.images[0]).toMatchObject({ work_item_id: body.work_items[0].id });
    expect(requestBody.parts[1]).not.toHaveProperty("work_item_id");
    expect(requestBody.images[1]).not.toHaveProperty("work_item_id");
    const cached = await getCachedResource<RepairOrder[]>(scope, repairsPath);
    expect(cached?.data[0].work_items?.map((item) => item.id)).toEqual(
      body.work_items.map((item) => item.id),
    );
  });

  it("queues a work-item status change behind the parent ticket", async () => {
    const repairID = "00000000-0000-0000-0000-000000000014";
    const workItemID = "00000000-0000-0000-0000-000000000015";
    const repairsPath = `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${"00000000-0000-0000-0000-000000000003"}`;
    const workItemsPath = `/repairs/orders/${repairID}/work-items?page_index=0&page_size=100`;
    const workItem = {
      id: workItemID,
      service_order_id: "service-order",
      sequence_number: 1,
      type: "DEVICE",
      status: "OPEN",
      form_version: 1,
      device: { id: "device", device_type: "PHONE" },
      issue_description: "Screen",
    };
    const repair = {
      id: repairID,
      shop_id: "00000000-0000-0000-0000-000000000003",
      service_order_id: "service-order",
      device_id: "device",
      order_number: "REP-MULTI-2",
      status: "RECEIVED",
      issue_description: "Screen",
      received_at: new Date().toISOString(),
      deposit_paid: "0",
      payment_status: "UNPAID",
      labor_fee: "0",
      additional_fee: "0",
      tax_amount: "0",
      total_cost: "0",
      work_items: [workItem],
    } satisfies RepairOrder;
    await putCachedResource(scope, repairsPath, [repair]);
    await putCachedResource(scope, workItemsPath, [workItem]);

    await queueRepairWorkItemStatus(scope, repair, workItemID, "IN_PROGRESS");

    const [operation] = await listOperations(scope);
    const request = deferredRequestFromPayload(operation.payload);
    expect(operation).toMatchObject({
      entityType: "REPAIR_WORK_ITEM",
      entityId: workItemID,
      operationType: "UPDATE",
    });
    expect(request).toMatchObject({
      path: `/repairs/work-items/${workItemID}`,
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
    });
    await expect(getCachedResource<RepairOrder[]>(scope, repairsPath)).resolves.toMatchObject({
      data: [{ work_items: [{ status: "IN_PROGRESS" }] }],
    });
    await expect(
      getCachedResource<(typeof workItem)[]>(scope, workItemsPath),
    ).resolves.toMatchObject({ data: [{ status: "IN_PROGRESS" }] });
  });
});
