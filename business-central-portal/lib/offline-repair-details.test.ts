import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineScope,
  getCachedResource,
  listOperations,
  putCachedResource,
} from "./offline-db";
import { deferredRequestFromPayload } from "./offline-deferred";
import { queueRepairDetailsUpdate, queueRepairPayment } from "./offline-repairs";
import type { RepairOrder } from "./types";

const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

beforeEach(async () => {
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("offline repair ticket detail edits", () => {
  it("projects a full final payment as a completed ticket", async () => {
    const repair = {
      id: "00000000-0000-0000-0000-000000000004",
      shop_id: "00000000-0000-0000-0000-000000000003",
      service_order_id: "00000000-0000-0000-0000-000000000005",
      device_id: "00000000-0000-0000-0000-000000000006",
      order_number: "REP-1",
      status: "READY_FOR_PICKUP",
      issue_description: "Ready",
      received_at: new Date().toISOString(),
      deposit_paid: "20",
      payment_status: "DEPOSIT_PAID",
      labor_fee: "100",
      additional_fee: "0",
      tax_amount: "0",
      total_cost: "100",
    } satisfies RepairOrder;
    const repairsPath = `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${repair.shop_id}`;
    await putCachedResource(scope, repairsPath, [repair]);

    await queueRepairPayment(scope, repair, {
      kind: "FINAL",
      method: "CASH",
      amount: "80",
      idempotency_key: "final-payment-1",
      allocations: [],
    });

    const repairCache = await getCachedResource<RepairOrder[]>(scope, repairsPath);
    expect(repairCache?.data[0]).toMatchObject({
      deposit_paid: "100.00",
      payment_status: "PAID",
      status: "COMPLETED",
    });
    expect(repairCache?.data[0].completed_at).toBeTruthy();
  });

  it("queues only the merchant intake-detail request", async () => {
    const repair = {
      id: "00000000-0000-0000-0000-000000000004",
      shop_id: "00000000-0000-0000-0000-000000000003",
      service_order_id: "00000000-0000-0000-0000-000000000005",
      device_id: "00000000-0000-0000-0000-000000000006",
      order_number: "REP-1",
      status: "RECEIVED",
      issue_description: "Old issue",
      received_at: new Date().toISOString(),
      deposit_paid: "0",
      payment_status: "UNPAID",
      labor_fee: "0",
      additional_fee: "0",
      tax_amount: "0",
      total_cost: "0",
    } satisfies RepairOrder;

    await queueRepairDetailsUpdate(scope, repair, {
      customer_name: "Updated customer",
      issue_description: "Updated issue",
      note: "Updated note",
    });

    const [operation] = await listOperations(scope);
    expect(deferredRequestFromPayload(operation.payload)).toMatchObject({
      path: `/repairs/orders/${repair.id}/details`,
      method: "PATCH",
      body: { issue_description: "Updated issue" },
    });
    expect(operation.payload).not.toHaveProperty("status", "COMPLETED");
  });

  it("projects child issue and note edits into both repair caches", async () => {
    const workItem = {
      id: "00000000-0000-0000-0000-000000000007",
      service_order_id: "00000000-0000-0000-0000-000000000005",
      sequence_number: 1,
      type: "DEVICE",
      status: "OPEN",
      device: {
        id: "00000000-0000-0000-0000-000000000006",
        device_type: "PHONE",
      },
      issue_description: "Old issue",
    };
    const repair = {
      id: "00000000-0000-0000-0000-000000000004",
      shop_id: "00000000-0000-0000-0000-000000000003",
      service_order_id: "00000000-0000-0000-0000-000000000005",
      device_id: "00000000-0000-0000-0000-000000000006",
      order_number: "REP-1",
      status: "RECEIVED",
      issue_description: "Old issue",
      received_at: new Date().toISOString(),
      deposit_paid: "0",
      payment_status: "UNPAID",
      labor_fee: "0",
      additional_fee: "0",
      tax_amount: "0",
      total_cost: "0",
      work_items: [workItem],
    } satisfies RepairOrder;
    const repairsPath = `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${repair.shop_id}`;
    const workItemsPath = `/repairs/orders/${repair.id}/work-items?page_index=0&page_size=100`;
    await putCachedResource(scope, repairsPath, [repair]);
    await putCachedResource(scope, workItemsPath, [workItem]);

    await queueRepairDetailsUpdate(scope, repair, {
      issue_description: "New issue",
      work_items: [
        {
          id: workItem.id,
          issue_description: "New issue",
          note: "New note",
          device: {
            device_type: "TABLET",
            manufacturer: "Acme",
            model: "T1",
            serial_number: "S1",
          },
        },
      ],
    });

    const repairCache = await getCachedResource<RepairOrder[]>(scope, repairsPath);
    const workItemCache = await getCachedResource<(typeof workItem)[]>(scope, workItemsPath);
    expect(repairCache?.data[0]).toMatchObject({
      issue_description: "New issue",
      work_items: [
        {
          issue_description: "New issue",
          note: "New note",
          device: {
            device_type: "TABLET",
            manufacturer: "Acme",
            model: "T1",
            serial_number: "S1",
          },
        },
      ],
    });
    expect(workItemCache?.data[0]).toMatchObject({
      issue_description: "New issue",
      note: "New note",
      device: {
        device_type: "TABLET",
        manufacturer: "Acme",
        model: "T1",
        serial_number: "S1",
      },
    });
  });
});
