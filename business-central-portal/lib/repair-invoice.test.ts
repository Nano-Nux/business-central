import { describe, expect, it } from "vitest";
import { createRepairInvoice } from "./repair-invoice";
import type { RepairOrder } from "./types";

describe("repair invoice service lines", () => {
  it("keeps every backend service item as a separate billable line", () => {
    const repair = {
      id: "repair-1",
      service_order_id: "service-order-1",
      device_id: "device-1",
      order_number: "REP-1",
      status: "RECEIVED",
      issue_description: "Screen repair",
      received_at: "2026-08-12T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "150.00",
      additional_fee: "0.00",
      tax_amount: "0.00",
      total_cost: "150.00",
    } satisfies RepairOrder;

    const invoice = createRepairInvoice({
      repair,
      serviceItems: [
        { description: "Screen replacement", quantity: "1", unit_price: "100.00" },
        { description: "Diagnostics", quantity: "1", unit_price: "50.00" },
      ],
      currencyCode: "USD",
    });

    expect(invoice.items.slice(0, 2)).toEqual([
      { name: "Screen replacement", quantity: 1, price: 100 },
      { name: "Diagnostics", quantity: 1, price: 50 },
    ]);
  });

  it("exposes the deposit and remaining balance on the repair invoice", () => {
    const repair = {
      id: "repair-2",
      service_order_id: "service-order-2",
      device_id: "device-2",
      order_number: "REP-2",
      status: "RECEIVED",
      issue_description: "Battery replacement",
      received_at: "2026-08-12T00:00:00.000Z",
      deposit_paid: "40.00",
      payment_status: "DEPOSIT_PAID",
      labor_fee: "150.00",
      additional_fee: "0.00",
      tax_amount: "0.00",
      total_cost: "150.00",
    } satisfies RepairOrder;

    const invoice = createRepairInvoice({ repair, currencyCode: "USD" });

    expect(invoice.amountPaid).toBe(40);
    expect(invoice.balanceDue).toBe(110);
    expect(invoice.paymentStatus).toBe("Deposit");
  });

  it("hides device type and brand by default and exposes each enabled detail", () => {
    const repair = {
      id: "repair-device-display",
      service_order_id: "service-device-display",
      device_id: "device-display",
      order_number: "REP-DISPLAY",
      status: "RECEIVED",
      issue_description: "Won't start",
      received_at: "2026-08-25T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "0.00",
      additional_fee: "0.00",
      tax_amount: "0.00",
      total_cost: "0.00",
    } satisfies RepairOrder;
    const device = {
      id: "device-display",
      device_type: "LAPTOP",
      manufacturer: "Example",
      model: "Pro 14",
    };

    const hidden = createRepairInvoice({ repair, device, currencyCode: "USD" });
    const brandVisible = createRepairInvoice({
      repair,
      device,
      currencyCode: "USD",
      shop: {
        id: "shop-1",
        name: "Repair shop",
        code: "REPAIR",
        is_active: true,
        module_codes: ["repair"],
        include_tax: false,
        tax_rate: "0",
        show_device_brand_in_repair_invoice: true,
      },
    });
    const allVisible = createRepairInvoice({
      repair,
      device,
      currencyCode: "USD",
      shop: {
        id: "shop-1",
        name: "Repair shop",
        code: "REPAIR",
        is_active: true,
        module_codes: ["repair"],
        include_tax: false,
        tax_rate: "0",
        show_device_type_in_repair_invoice: true,
        show_device_brand_in_repair_invoice: true,
      },
    });

    expect(hidden.showDeviceType).toBe(false);
    expect(hidden.showDeviceBrand).toBe(false);
    expect(hidden.modelNumber).toBe("Pro 14");
    expect(brandVisible.showDeviceType).toBe(false);
    expect(brandVisible.showDeviceBrand).toBe(true);
    expect(brandVisible.modelNumber).toBe("Example · Pro 14");
    expect(allVisible.showDeviceType).toBe(true);
    expect(allVisible.showDeviceBrand).toBe(true);
    expect(allVisible.modelNumber).toBe("LAPTOP · Example · Pro 14");
  });

  it("keeps device fees on work items and out of service and part lines", () => {
    const repair = {
      id: "repair-3",
      service_order_id: "service-order-3",
      device_id: "device-3",
      order_number: "REP-3",
      status: "RECEIVED",
      issue_description: "Multiple devices",
      received_at: "2026-08-12T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "0.00",
      additional_fee: "12.50",
      tax_amount: "0.00",
      total_cost: "12.50",
    } satisfies RepairOrder;

    const invoice = createRepairInvoice({
      repair,
      workItems: [
        {
          id: "work-item-1",
          service_order_id: "service-order-3",
          sequence_number: 1,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-3", device_type: "PHONE" },
          issue_description: "Cracked screen",
          additional_fee: "12.50",
        },
        {
          id: "work-item-2",
          service_order_id: "service-order-3",
          sequence_number: 2,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-4", device_type: "TABLET" },
          issue_description: "Battery issue",
          additional_fee: "0.00",
        },
      ],
      currencyCode: "USD",
    });

    expect(invoice.items).toEqual([]);
    expect(invoice.work_items?.map((item) => item.additional_fee)).toEqual(["12.50", undefined]);
  });

  it("keeps multiple optional issues and conditions on each printable device", () => {
    const repair = {
      id: "repair-lists",
      service_order_id: "service-lists",
      device_id: "device-lists",
      order_number: "REP-LISTS",
      status: "RECEIVED",
      issue_description: "Screen flickers",
      received_at: "2026-08-25T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "0.00",
      additional_fee: "0.00",
      tax_amount: "0.00",
      total_cost: "0.00",
    } satisfies RepairOrder;
    const invoice = createRepairInvoice({
      repair,
      workItems: [
        {
          id: "work-lists",
          service_order_id: "service-lists",
          sequence_number: 1,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-lists", device_type: "PHONE" },
          issue_description: "Screen flickers",
          issues: ["Screen flickers", "Battery drains"],
          conditions: ["Scratched frame", "Back glass cracked"],
        },
      ],
      currencyCode: "USD",
    });

    expect(invoice.work_items?.[0].issues).toEqual(["Screen flickers", "Battery drains"]);
    expect(invoice.work_items?.[0].conditions).toEqual(["Scratched frame", "Back glass cracked"]);
  });

  it("projects device and whole-ticket waiting periods onto the invoice", () => {
    const repair = {
      id: "repair-waiting",
      service_order_id: "service-waiting",
      device_id: "device-waiting-1",
      order_number: "REP-WAITING",
      status: "RECEIVED",
      issue_description: "Screen",
      received_at: "2026-08-26T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "0.00",
      additional_fee: "0.00",
      tax_amount: "0.00",
      total_cost: "0.00",
    } satisfies RepairOrder;
    const invoice = createRepairInvoice({
      repair,
      workItems: [
        {
          id: "work-waiting-1",
          service_order_id: "service-waiting",
          sequence_number: 1,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-waiting-1", device_type: "PHONE" },
          issue_description: "Screen",
          waiting_start_date: "2026-08-26",
          waiting_end_date: "2026-08-29",
          waiting_days: 3,
        },
        {
          id: "work-waiting-2",
          service_order_id: "service-waiting",
          sequence_number: 2,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-waiting-2", device_type: "TABLET" },
          issue_description: "Battery",
          waiting_start_date: "2026-08-27",
          waiting_end_date: "2026-09-02",
          waiting_days: 6,
        },
      ],
      currencyCode: "USD",
    });

    expect(invoice.waitingStartDate).toBe("2026-08-26");
    expect(invoice.waitingEndDate).toBe("2026-09-02");
    expect(invoice.waitingDays).toBe(7);
    expect(invoice.work_items?.map((item) => item.waiting_days)).toEqual([3, 6]);
  });

  it("shows only explicitly attached services and parts in invoice items", () => {
    const repair = {
      id: "repair-4",
      service_order_id: "service-order-4",
      device_id: "device-4",
      order_number: "REP-4",
      status: "RECEIVED",
      issue_description: "Charging issue",
      received_at: "2026-08-12T00:00:00.000Z",
      deposit_paid: "0.00",
      payment_status: "UNPAID",
      labor_fee: "90.00",
      additional_fee: "15.00",
      tax_amount: "0.00",
      total_cost: "125.00",
    } satisfies RepairOrder;

    const invoice = createRepairInvoice({
      repair,
      workItems: [
        {
          id: "work-item-4",
          service_order_id: "service-order-4",
          sequence_number: 1,
          type: "DEVICE",
          status: "OPEN",
          device: { id: "device-4", device_type: "PHONE" },
          issue_description: "Charging issue",
          additional_fee: "15.00",
        },
      ],
      serviceItems: [{ description: "Port cleaning", quantity: "1", unit_price: "10.00" }],
      parts: [{ variant_id: "variant-1", quantity: "1", unit_price: "10.00" }],
      variants: [{ id: "variant-1", name: "Charging port" }],
      currencyCode: "USD",
    });

    expect(invoice.items.map((item) => item.name)).toEqual(["Port cleaning", "Charging port"]);
  });
});
