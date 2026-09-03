import type { Invoice } from "./types";
import { formatMoney, formatQuantity } from "./currency";
import { dateOnlyDaysBetween, formatDateOnly, formatShopDateTime } from "./date-time";
import { resolveMediaURL } from "./media-url";

export const INVOICE_FOOTER_PROMOTION = "More business solution? Contact to https://nanonux.com";

const printable = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Not recorded";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

function paymentStatus(invoice: Invoice) {
  if (invoice.paymentStatus) return invoice.paymentStatus;
  if (invoice.status === "Paid") return "Paid";
  if (invoice.status === "Refunded") return "Refunded";
  return "Unpaid";
}

function loadLogo(invoice: Invoice): Promise<HTMLImageElement | null> {
  if (invoice.showLogo === false || !invoice.logoUrl?.trim()) return Promise.resolve(null);
  const logoURL = resolveMediaURL(invoice.logoUrl);
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), 5000);
    const finish = (value: HTMLImageElement | null) => {
      window.clearTimeout(timer);
      resolve(value);
    };
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    if (/^https?:/i.test(logoURL)) image.crossOrigin = "anonymous";
    image.src = logoURL;
  });
}

class ReceiptPainter {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly padding: number;
  readonly verticalPadding: number;
  readonly scale: number;
  y: number;

  constructor(canvas: HTMLCanvasElement, scale: number, horizontalPadding?: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    this.ctx = ctx;
    this.width = canvas.width;
    this.padding = horizontalPadding ?? Math.max(18, Math.round(30 * scale));
    this.verticalPadding = Math.max(18, Math.round(30 * scale));
    this.scale = scale;
    this.y = this.verticalPadding;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
  }

  font(size = 14, bold = false) {
    this.ctx.font = `${bold ? "bold " : ""}${Math.max(9, Math.round(size * this.scale))}px Arial`;
  }

  lineHeight(size = 14) {
    return Math.max(14, Math.round((size + 7) * this.scale));
  }

  wrappedLines(value: string, maxWidth: number) {
    const result: string[] = [];
    for (const paragraph of String(value).split(/\r?\n/)) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        result.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
        else {
          result.push(line);
          line = word;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }

  text(
    value: string,
    options: {
      x?: number;
      width?: number;
      size?: number;
      bold?: boolean;
      align?: CanvasTextAlign;
      gap?: number;
    } = {},
  ) {
    const size = options.size ?? 14;
    const x = options.x ?? this.padding;
    const width = options.width ?? this.width - this.padding * 2;
    const align = options.align ?? "left";
    this.font(size, options.bold);
    this.ctx.textAlign = align;
    const lines = this.wrappedLines(value, width);
    const height = this.lineHeight(size);
    for (const line of lines) {
      this.y += height;
      this.ctx.fillText(line, x, this.y);
    }
    this.y += options.gap ?? 0;
    return lines.length * height;
  }

  rule(dashed = false) {
    this.y += Math.round(10 * this.scale);
    this.ctx.save();
    if (dashed) this.ctx.setLineDash([5, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.y);
    this.ctx.lineTo(this.width - this.padding, this.y);
    this.ctx.stroke();
    this.ctx.restore();
    this.y += Math.round(8 * this.scale);
  }

  dottedBox(drawContent: () => void) {
    const horizontalInset = Math.min(this.padding, Math.round(8 * this.scale));
    const verticalInset = Math.round(7 * this.scale);
    const top = this.y;
    const left = this.padding - horizontalInset;

    this.y += verticalInset;
    drawContent();
    this.y += verticalInset;

    this.ctx.save();
    this.ctx.lineWidth = Math.max(1, Math.round(this.scale));
    this.ctx.lineCap = "round";
    this.ctx.setLineDash([
      Math.max(1, Math.round(this.scale)),
      Math.max(3, Math.round(4 * this.scale)),
    ]);
    this.ctx.strokeRect(left, top, this.width - left * 2, this.y - top);
    this.ctx.restore();

    this.y += Math.round(5 * this.scale);
  }

  row(
    label: string,
    value: string,
    options: { bold?: boolean; size?: number; labelWidth?: number } = {},
  ) {
    const size = options.size ?? 14;
    const labelWidth = options.labelWidth ?? Math.round((this.width - this.padding * 2) * 0.42);
    const valueWidth = this.width - this.padding * 2 - labelWidth - 10;
    this.font(size, false);
    const labelLines = this.wrappedLines(label, labelWidth);
    this.font(size, options.bold);
    const valueLines = this.wrappedLines(value, valueWidth);
    const lines = Math.max(labelLines.length, valueLines.length);
    const lineHeight = this.lineHeight(size);
    for (let index = 0; index < lines; index += 1) {
      this.y += lineHeight;
      this.ctx.textAlign = "left";
      this.font(size, false);
      if (labelLines[index]) this.ctx.fillText(labelLines[index], this.padding, this.y);
      this.ctx.textAlign = "right";
      this.font(size, options.bold);
      if (valueLines[index])
        this.ctx.fillText(valueLines[index], this.width - this.padding, this.y);
    }
  }

  heading(value: string) {
    this.text(value.toUpperCase(), { size: 11, bold: true, gap: 2 });
  }
}

function estimatedHeight(invoice: Invoice, scale: number) {
  const workItems = invoice.work_items ?? [];
  const customFields =
    Object.keys(invoice.ticket_fields ?? {}).length +
    workItems.reduce((sum, item) => sum + Object.keys(item.fields ?? {}).length, 0);
  const textLength = [
    invoice.shopAddress,
    invoice.shopContact,
    invoice.customer,
    invoice.customerPhone,
    invoice.deliveryName,
    invoice.deliveryContact,
    invoice.note,
    invoice.shopNote,
    invoice.receiptNote,
    invoice.footerNote,
    ...invoice.items.map((item) => item.name),
    ...workItems.flatMap((item) => [
      item.device_type,
      item.manufacturer,
      item.model,
      item.issue_description,
      item.note,
    ]),
  ]
    .filter(Boolean)
    .join(" ").length;
  return Math.ceil(
    (900 +
      invoice.items.length * 80 +
      workItems.length * 210 +
      customFields * 70 +
      textLength * 1.5) *
      Math.max(1, scale),
  );
}

function drawLogo(painter: ReceiptPainter, logo: HTMLImageElement | null) {
  if (!logo) return;
  const maxWidth = Math.min(96 * painter.scale, painter.width * 0.34);
  const maxHeight = 64 * painter.scale;
  const ratio = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight, 1);
  const width = logo.naturalWidth * ratio;
  const height = logo.naturalHeight * ratio;
  painter.ctx.drawImage(logo, (painter.width - width) / 2, painter.y, width, height);
  painter.y += height + Math.round(8 * painter.scale);
}

function drawHeader(
  painter: ReceiptPainter,
  invoice: Invoice,
  title: string,
  logo: HTMLImageElement | null,
) {
  drawLogo(painter, logo);
  painter.text(invoice.shopName || "Shop", {
    x: painter.width / 2,
    width: painter.width - painter.padding * 2,
    align: "center",
    size: 20,
    bold: true,
  });
  if (invoice.shopAddress)
    painter.text(invoice.shopAddress, { x: painter.width / 2, align: "center", size: 11 });
  if (invoice.shopContact)
    painter.text(invoice.shopContact, { x: painter.width / 2, align: "center", size: 11 });
  painter.text(title, { x: painter.width / 2, align: "center", size: 12, bold: true });
  painter.rule(true);
}

function drawPosInvoice(painter: ReceiptPainter, invoice: Invoice, logo: HTMLImageElement | null) {
  drawHeader(painter, invoice, "Sales invoice", logo);
  painter.row("Invoice", invoice.number, { bold: true });
  painter.row("Date", formatShopDateTime(invoice.createdAt, invoice.shopTimezone));
  painter.row("Customer", invoice.customer || "Walk-in customer", { bold: true });
  if (invoice.customerPhone) painter.row("Customer phone", invoice.customerPhone);
  if (invoice.deliveryName) painter.row("Delivery", invoice.deliveryName, { bold: true });
  if (invoice.deliveryContact) painter.row("Delivery contact", invoice.deliveryContact);
  if (invoice.paymentType) painter.row("Payment", invoice.paymentType.replaceAll("_", " "));
  painter.rule();
  painter.heading("Items");
  for (const item of invoice.items) {
    painter.text(`${formatQuantity(item.quantity)} × ${item.name}`, { bold: true, size: 13 });
    painter.row(
      `${formatQuantity(item.quantity)} × ${formatMoney(item.price, invoice.currencyCode)}`,
      formatMoney(item.quantity * item.price, invoice.currencyCode),
      { size: 12 },
    );
  }
  painter.rule();
  painter.row("Subtotal", formatMoney(invoice.subtotal, invoice.currencyCode));
  if (invoice.discount > 0)
    painter.row("Promotion discount", `−${formatMoney(invoice.discount, invoice.currencyCode)}`);
  if (invoice.tax > 0)
    painter.row(invoice.taxLabel || "Tax", formatMoney(invoice.tax, invoice.currencyCode));
  if (invoice.deliveryFee)
    painter.row("Delivery fee", formatMoney(invoice.deliveryFee, invoice.currencyCode));
  painter.row("TOTAL", formatMoney(invoice.total, invoice.currencyCode), { bold: true, size: 18 });
  if (invoice.note) {
    painter.rule();
    painter.heading("Note");
    painter.text(invoice.note, { size: 12 });
  }
  painter.rule();
  painter.text(invoice.receiptNote || invoice.footerNote || "Thank you for your business.", {
    x: painter.width / 2,
    align: "center",
    size: 12,
  });
  painter.text(INVOICE_FOOTER_PROMOTION, {
    x: painter.width / 2,
    align: "center",
    size: 10,
  });
}

function formatWaitingTime(
  format: "DAYS" | "DATE_RANGE" = "DAYS",
  days?: number,
  startDate?: string,
  endDate?: string,
) {
  if (format === "DATE_RANGE") {
    if (startDate && endDate) {
      return `${formatDateOnly(startDate)} – ${formatDateOnly(endDate)}`;
    }
    if (startDate) return formatDateOnly(startDate);
  }
  const count =
    days !== undefined
      ? days
      : startDate && endDate
        ? dateOnlyDaysBetween(startDate, endDate)
        : 0;
  return `${count} - days`;
}

function drawRepairInvoice(
  painter: ReceiptPainter,
  invoice: Invoice,
  logo: HTMLImageElement | null,
) {
  drawHeader(painter, invoice, "Repair ticket invoice", logo);
  const nameLabel = invoice.showFullCustomerLabels ? "Customer Name" : "Name";
  const phoneLabel = invoice.showFullCustomerLabels ? "Customer Phone" : "Phone";
  painter.row(nameLabel, invoice.customer || "Not recorded", { bold: true });
  painter.row(phoneLabel, invoice.customerPhone || "Not recorded");
  painter.row("Date", formatShopDateTime(invoice.createdAt, invoice.shopTimezone));
  if (invoice.showRepairTicketId) {
    painter.row("Ticket ID", invoice.number, { bold: true });
  }
  painter.rule(true);

  if (invoice.work_items?.length) {
    const workItems = invoice.work_items;
    painter.heading("Devices / work items");
    for (const [index, item] of workItems.entries()) {
      painter.dottedBox(() => {
        const brandModelParts = [
          ...(invoice.showDeviceBrand && item.manufacturer ? [item.manufacturer] : []),
          item.model,
        ].filter(Boolean);
        const modelValue = brandModelParts.join(" - ") || item.model || "Not recorded";

        if (invoice.showModelLabel !== false) {
          if (invoice.showDeviceType && item.device_type) {
            painter.text(
              workItems.length > 1 ? `${index + 1}. ${item.device_type}` : item.device_type,
              { bold: true, size: 13 },
            );
          } else if (workItems.length > 1) {
            painter.text(`Device ${index + 1}`, { bold: true, size: 13 });
          }
          painter.row("Model", modelValue, { bold: true });
        } else {
          const deviceHeading = [
            ...(invoice.showDeviceType ? [item.device_type] : []),
            modelValue,
          ]
            .filter(Boolean)
            .join(" · ");
          painter.text(`${index + 1}. ${deviceHeading || "Work item"}`, { bold: true, size: 13 });
        }

        if (invoice.showDeviceCompletionStatus)
          painter.row("Status", item.status.replaceAll("_", " "));
        if (item.waiting_start_date || item.waiting_end_date || item.waiting_days !== undefined) {
          painter.row(
            "Waiting time",
            formatWaitingTime(
              invoice.waitingTimeFormat,
              item.waiting_days,
              item.waiting_start_date,
              item.waiting_end_date,
            ),
          );
        }
        painter.row("Serial / IMEI", item.serial_number || "Not recorded");
        const issues =
          item.issues?.filter((value) => value.trim()) ??
          (item.issue_description?.trim() ? [item.issue_description] : []);
        for (const [issueIndex, issue] of issues.entries())
          painter.row(issues.length > 1 ? `Issue ${issueIndex + 1}` : "Issue", issue);
        for (const [conditionIndex, condition] of (item.conditions ?? [])
          .filter((value) => value.trim())
          .entries())
          painter.row(
            (item.conditions?.filter((value) => value.trim()).length ?? 0) > 1
              ? `Condition ${conditionIndex + 1}`
              : "Condition",
            condition,
          );
        if (item.note) painter.row("Note", item.note);
        if (Number(item.additional_fee || 0) > 0) {
          painter.row("Price", formatMoney(Number(item.additional_fee), invoice.currencyCode), {
            bold: true,
          });
        }
        for (const [key, value] of Object.entries(item.fields ?? {})) {
          painter.row(key, printable(value));
        }
      });
    }
  } else {
    painter.dottedBox(() => {
      if (invoice.showModelLabel !== false) {
        painter.row("Model", invoice.modelNumber || "Not recorded", { bold: true });
      } else {
        painter.text(invoice.modelNumber || "Not recorded", { bold: true, size: 13 });
      }
      painter.row("Error", invoice.errorDescription || "Not recorded");
      painter.row("IMEI number", invoice.imeiNumber || "Not recorded");
    });
  }

  if (invoice.items.length) {
    painter.rule();
    painter.heading("Repair services & parts");
    for (const item of invoice.items) {
      painter.text(`${formatQuantity(item.quantity)} × ${item.name}`, { bold: true, size: 13 });
      painter.row(
        `${formatQuantity(item.quantity)} × ${formatMoney(item.price, invoice.currencyCode)}`,
        formatMoney(item.quantity * item.price, invoice.currencyCode),
        { size: 12 },
      );
    }
  }

  const ticketFields = Object.entries(invoice.ticket_fields ?? {});
  if (ticketFields.length) {
    painter.rule();
    painter.heading("Ticket details");
    for (const [key, value] of ticketFields) painter.row(key, printable(value));
  }

  painter.rule();
  if (invoice.discount > 0)
    painter.row("Promotion discount", `−${formatMoney(invoice.discount, invoice.currencyCode)}`);
  if (invoice.tax > 0)
    painter.row(invoice.taxLabel || "Tax", formatMoney(invoice.tax, invoice.currencyCode));
  painter.row("Total Price", formatMoney(invoice.total, invoice.currencyCode), {
    bold: true,
    size: 18,
  });
  if ((invoice.amountPaid ?? 0) > 0) {
    painter.row(
      invoice.paymentStatus === "Deposit" ? "Deposit paid" : "Amount paid",
      `−${formatMoney(invoice.amountPaid ?? 0, invoice.currencyCode)}`,
    );
    painter.row(
      "Balance due",
      formatMoney(
        invoice.balanceDue ?? Math.max(0, invoice.total - (invoice.amountPaid ?? 0)),
        invoice.currencyCode,
      ),
      { bold: true },
    );
  }
  painter.rule();
  if (
    invoice.waitingStartDate ||
    invoice.waitingEndDate ||
    invoice.waitingDays !== undefined
  ) {
    painter.row(
      "Ticket waiting period",
      formatWaitingTime(
        invoice.waitingTimeFormat,
        invoice.waitingDays,
        invoice.waitingStartDate,
        invoice.waitingEndDate,
      ),
    );
  }
  painter.row("Payment Status", paymentStatus(invoice), { bold: true });
  if (invoice.note) {
    painter.heading("Repair ticket note");
    painter.text(invoice.note, { size: 12 });
  }
  const shopNote = invoice.shopNote || invoice.receiptNote || invoice.footerNote;
  if (shopNote) {
    painter.heading("Shop note");
    painter.text(shopNote, { size: 12 });
  }
  painter.rule();
  painter.text(INVOICE_FOOTER_PROMOTION, {
    x: painter.width / 2,
    align: "center",
    size: 10,
  });
}

export async function invoiceCanvas(
  invoice: Invoice,
  fontScale = 1,
  width = 576,
  horizontalPadding?: number,
) {
  const logo = await loadLogo(invoice);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = estimatedHeight(invoice, fontScale);
  const painter = new ReceiptPainter(canvas, fontScale, horizontalPadding);
  if (invoice.kind === "repair") drawRepairInvoice(painter, invoice, logo);
  else drawPosInvoice(painter, invoice, logo);

  const height = Math.max(220, Math.ceil(painter.y + painter.verticalPadding));
  if (height >= canvas.height) return canvas;
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  const context = cropped.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, cropped.width, cropped.height);
  context.drawImage(canvas, 0, 0);
  return cropped;
}

export async function downloadInvoicePDF(invoice: Invoice, fontScale = 1) {
  const [{ jsPDF }, canvas] = await Promise.all([
    import("jspdf"),
    invoiceCanvas(invoice, fontScale),
  ]);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, Math.max(110, (canvas.height * 80) / canvas.width)],
  });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 80, (canvas.height * 80) / canvas.width);
  pdf.save(`${invoice.number}.pdf`);
}
