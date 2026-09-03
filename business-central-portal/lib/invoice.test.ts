import { describe, expect, it, vi } from "vitest";
import { invoiceCanvas } from "./invoice";
import type { Invoice } from "./types";

function setupMockCanvas() {
  const renderedText: string[] = [];
  const mockCtx = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    lineWidth: 1,
    lineCap: "",
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      renderedText.push(text);
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
  };

  const mockCanvas = {
    width: 576,
    height: 1000,
    getContext: vi.fn((type: string) => (type === "2d" ? mockCtx : null)),
  };

  const originalDocument = globalThis.document;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: vi.fn((tag: string) => (tag === "canvas" ? mockCanvas : {})),
  };

  return {
    renderedText,
    restore: () => {
      (globalThis as unknown as { document: unknown }).document = originalDocument;
    },
  };
}

describe("invoiceCanvas repair layout", () => {
  const baseInvoice: Invoice = {
    id: "repair-uuid-1234",
    number: "REP-2026-0099",
    customer: "John Doe",
    customerPhone: "1234567890",
    currencyCode: "USD",
    shopName: "Central Tech",
    createdAt: "2026-08-26T10:00:00Z",
    kind: "repair",
    status: "Paid",
    paymentStatus: "Paid",
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    items: [],
    waitingStartDate: "2026-08-26",
    waitingEndDate: "2026-08-29",
    waitingDays: 3,
    work_items: [
      {
        id: "work-1",
        sequence_number: 1,
        type: "DEVICE",
        status: "OPEN",
        form_version: 1,
        device_type: "PHONE",
        model: "Pixel 8",
        issue_description: "Broken screen",
        waiting_start_date: "2026-08-26",
        waiting_end_date: "2026-08-29",
        waiting_days: 3,
      },
    ],
  };

  it("hides repair ticket ID by default and formats waiting period as days", async () => {
    const { renderedText, restore } = setupMockCanvas();
    try {
      await invoiceCanvas(baseInvoice);

      // Default: showRepairTicketId is false, should not render Ticket ID
      expect(renderedText).not.toContain("Ticket ID");
      expect(renderedText).not.toContain("REP-2026-0099");

      // Default waiting time format: DAYS -> "3 - days"
      expect(renderedText).toContain("3 - days");

      // Payment Status label (instead of Status)
      expect(renderedText).toContain("Payment Status");
      expect(renderedText).not.toContain("Status");

      // Order check: Ticket waiting period should appear before Payment Status
      const waitingPeriodIndex = renderedText.indexOf("Ticket waiting period");
      const paymentStatusIndex = renderedText.indexOf("Payment Status");
      expect(waitingPeriodIndex).toBeGreaterThan(-1);
      expect(paymentStatusIndex).toBeGreaterThan(-1);
      expect(waitingPeriodIndex).toBeLessThan(paymentStatusIndex);

      // Default customer labels: "Name" and "Phone" (not "Customer Name", not "Customer Phone")
      expect(renderedText).toContain("Name");
      expect(renderedText).toContain("Phone");
      expect(renderedText).not.toContain("Customer Name");
      expect(renderedText).not.toContain("Customer Phone");

      // Date label: "Date" (not "Current date")
      expect(renderedText).toContain("Date");
      expect(renderedText).not.toContain("Current date");
    } finally {
      restore();
    }
  });

  it("shows repair ticket ID when showRepairTicketId is true", async () => {
    const { renderedText, restore } = setupMockCanvas();
    try {
      await invoiceCanvas({
        ...baseInvoice,
        showRepairTicketId: true,
      });

      expect(renderedText).toContain("Ticket ID");
      expect(renderedText).toContain("REP-2026-0099");
    } finally {
      restore();
    }
  });

  it("formats waiting period with start date - end date when waitingTimeFormat is DATE_RANGE", async () => {
    const { renderedText, restore } = setupMockCanvas();
    try {
      await invoiceCanvas({
        ...baseInvoice,
        waitingTimeFormat: "DATE_RANGE",
      });

      // Shows start date - end date (e.g. Aug 26, 2026 – Aug 29, 2026)
      const dateRangeFound = renderedText.some((text) => text.includes("Aug 26, 2026"));
      expect(dateRangeFound).toBe(true);
      expect(renderedText).not.toContain("3 - days");
    } finally {
      restore();
    }
  });

  it("shows full customer labels when showFullCustomerLabels is true", async () => {
    const { renderedText, restore } = setupMockCanvas();
    try {
      await invoiceCanvas({
        ...baseInvoice,
        showFullCustomerLabels: true,
      });

      expect(renderedText).toContain("Customer Name");
      expect(renderedText).toContain("Customer Phone");
      expect(renderedText).toContain("Date");
    } finally {
      restore();
    }
  });

  it("shows Model label by default with brand and model value, and omits Model label when off", async () => {
    const { renderedText: defaultText, restore: restoreDefault } = setupMockCanvas();
    try {
      await invoiceCanvas({
        ...baseInvoice,
        showDeviceBrand: true,
        work_items: [
          {
            id: "work-brand-1",
            sequence_number: 1,
            type: "DEVICE",
            status: "OPEN",
            form_version: 1,
            device_type: "PHONE",
            manufacturer: "Google",
            model: "Pixel 8",
            issue_description: "Broken screen",
          },
        ],
      });

      // Default: showModelLabel is true, so "Model" label is rendered with "Google - Pixel 8"
      expect(defaultText).toContain("Model");
      expect(defaultText).toContain("Google - Pixel 8");
    } finally {
      restoreDefault();
    }

    const { renderedText: offText, restore: restoreOff } = setupMockCanvas();
    try {
      await invoiceCanvas({
        ...baseInvoice,
        showDeviceBrand: true,
        showModelLabel: false,
        work_items: [
          {
            id: "work-brand-1",
            sequence_number: 1,
            type: "DEVICE",
            status: "OPEN",
            form_version: 1,
            device_type: "PHONE",
            manufacturer: "Google",
            model: "Pixel 8",
            issue_description: "Broken screen",
          },
        ],
      });

      // When showModelLabel is false, "Model" label is omitted
      expect(offText).not.toContain("Model");
      expect(offText).toContain("1. Google - Pixel 8");
    } finally {
      restoreOff();
    }
  });
});
