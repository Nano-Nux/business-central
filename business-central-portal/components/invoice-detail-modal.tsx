"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Loading, Modal } from "./ui";
import { useTranslation } from "@/lib/i18n";
import { downloadInvoicePDF, invoiceCanvas } from "@/lib/invoice";
import {
  getActivePrinter,
  printInvoice,
  printerPaperWidthPixels,
  storedPrinterFontSizePx,
  storedPrinterPaperWidthMm,
} from "@/lib/thermal-printer";
import { useResource } from "@/lib/use-resource";
import type { Invoice, Shop } from "@/lib/types";
import { InvoiceReceipt } from "./invoice-receipt";
import { useShop } from "@/lib/shop";
import { formatShopAddress } from "@/lib/shop-address";
import { repairPaymentLabel } from "@/lib/repair-invoice";

type ApiInvoice = {
  id: string;
  number: string;
  customer: string | null;
  channel?: string;
  customer_phone?: string;
  merchant_name: string;
  shop_name?: string;
  shop_id?: string;
  shop_logo_url?: string;
  show_shop_logo?: boolean;
  currency_code: string;
  created_at: string;
  status: string;
  kind: "pos" | "service" | "repair";
  ticket_status?: string;
  payment_status?: string;
  waiting_start_date?: string;
  waiting_end_date?: string;
  waiting_days?: number;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  delivery_name?: string;
  delivery_fee?: string;
  delivery_payment_status?: Invoice["deliveryPaymentStatus"];
  delivery_contact?: string;
  note?: string;
  payment_type?: string;
  tax_label?: string;
  receipt_note?: string;
  footer_note?: string;
  ticket_fields?: Record<string, unknown>;
  work_items?: Array<{
    id: string;
    sequence_number: number;
    type: string;
    status: string;
    form_version: number;
    device_type: string;
    manufacturer?: string;
    model?: string;
    serial_number?: string;
    issue_description: string;
    issues?: string[];
    conditions?: string[];
    note?: string;
    fields?: Record<string, unknown>;
    additional_fee?: string;
    waiting_start_date?: string;
    waiting_end_date?: string;
    waiting_days?: number;
    subtotal?: string;
    discount_total?: string;
    tax_amount?: string;
    total?: string;
    paid?: string;
    balance?: string;
  }>;
  items: Array<{ name: string; quantity: string; unit_price: string; work_item_id?: string }>;
};
function mapInvoice(item: ApiInvoice): Invoice {
  const workItemPaid = (item.work_items ?? []).reduce(
    (total, workItem) => total + Number(workItem.paid ?? 0),
    0,
  );
  const amountPaid =
    item.kind === "repair"
      ? item.payment_status === "PAID"
        ? Number(item.grand_total)
        : workItemPaid
      : undefined;
  return {
    id: item.id,
    number: item.number,
    customer: item.customer ?? null,
    channel: item.channel,
    customerPhone: item.customer_phone,
    merchantName: item.merchant_name,
    currencyCode: item.currency_code,
    shopName: item.shop_name,
    shopId: item.shop_id,
    logoUrl: item.shop_logo_url,
    showLogo: item.show_shop_logo,
    deliveryName: item.delivery_name,
    deliveryFee: Number(item.delivery_fee ?? 0),
    deliveryPaymentStatus: item.delivery_payment_status,
    deliveryContact: item.delivery_contact,
    note: item.note,
    paymentType: item.payment_type,
    createdAt: item.created_at,
    status: item.status as Invoice["status"],
    kind: item.kind === "repair" ? "repair" : "pos",
    ticketStatus: item.ticket_status,
    paymentStatus: item.payment_status ? repairPaymentLabel(item.payment_status) : undefined,
    waitingStartDate: item.waiting_start_date,
    waitingEndDate: item.waiting_end_date,
    waitingDays: item.waiting_days,
    amountPaid,
    balanceDue:
      amountPaid === undefined ? undefined : Math.max(0, Number(item.grand_total) - amountPaid),
    subtotal: Number(item.subtotal),
    discount: Number(item.discount_total),
    tax: Number(item.tax_total),
    total: Number(item.grand_total),
    items: (item.items ?? []).map((line) => ({
      name: line.name,
      quantity: Number(line.quantity),
      price: Number(line.unit_price),
      work_item_id: line.work_item_id,
    })),
    work_items: item.work_items,
    ticket_fields: item.ticket_fields,
    taxLabel: item.tax_label,
    receiptNote: item.receipt_note,
    footerNote: item.footer_note,
  };
}

function ThermalProof({ invoice, shop }: { invoice: Invoice; shop: Shop | null }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    let active = true;
    void invoiceCanvas(
      invoice,
      storedPrinterFontSizePx(shop) / 14,
      printerPaperWidthPixels(storedPrinterPaperWidthMm(shop)),
    ).then((canvas) => {
      if (active) setPreview(canvas.toDataURL("image/png"));
    });
    return () => {
      active = false;
    };
  }, [invoice, shop]);
  return preview ? (
    <div className="image-proof">
      <p>Thermal image proof</p>
      <Image
        unoptimized
        width={576}
        height={700}
        src={preview}
        alt="Black and white thermal invoice preview"
      />
    </div>
  ) : null;
}

export function InvoiceDetailModal({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { currentShop } = useShop();
  const resource = useResource<ApiInvoice>("/invoices?page_index=0&page_size=200", undefined, true);
  const [message, setMessage] = useState("");
  const invoices = useMemo(
    () =>
      resource.data.map((item) => {
        const invoice = mapInvoice(item);
        if (item.kind === "repair") {
          const workItems = item.work_items ?? [];
          return {
            ...invoice,
            logoUrl: item.shop_logo_url || currentShop?.logo_url,
            shopTimezone: currentShop?.timezone,
            showLogo: item.show_shop_logo ?? currentShop?.show_logo_in_printed_invoice !== false,
            showDeviceCompletionStatus: currentShop?.show_device_completion_status === true,
            showDeviceType: currentShop?.show_device_type_in_repair_invoice === true,
            showDeviceBrand: currentShop?.show_device_brand_in_repair_invoice === true,
            shopAddress: formatShopAddress(currentShop?.address),
            shopContact: currentShop?.contact_info,
            shopNote: currentShop?.footer_note || currentShop?.receipt_note,
            footerNote: item.footer_note || currentShop?.footer_note,
            receiptNote: item.receipt_note || currentShop?.receipt_note,
            kind: "repair" as const,
            modelNumber: workItems
              .map((workItem) =>
                [
                  ...(currentShop?.show_device_type_in_repair_invoice === true
                    ? [workItem.device_type]
                    : []),
                  ...(currentShop?.show_device_brand_in_repair_invoice === true
                    ? [workItem.manufacturer]
                    : []),
                  workItem.model,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )
              .filter(Boolean)
              .join("; "),
            errorDescription: workItems
              .map((workItem) => workItem.issue_description)
              .filter(Boolean)
              .join("; "),
            imeiNumber: workItems.find((workItem) => workItem.serial_number)?.serial_number,
            work_items: item.work_items,
            ticket_fields: item.ticket_fields,
          };
        }
        return {
          ...invoice,
          logoUrl: item.shop_logo_url || currentShop?.logo_url,
          shopTimezone: currentShop?.timezone,
          showLogo: item.show_shop_logo ?? currentShop?.show_logo_in_printed_invoice !== false,
          showDeviceCompletionStatus: currentShop?.show_device_completion_status === true,
          shopAddress: formatShopAddress(currentShop?.address),
          shopContact: currentShop?.contact_info,
          footerNote: item.footer_note || currentShop?.footer_note,
        };
      }),
    [currentShop, resource.data],
  );
  const selected =
    invoices.find(
      (item) => item.id === invoiceId && (!currentShop || item.shopId === currentShop.id),
    ) ?? null;
  async function thermal() {
    if (!selected) return;
    const printer = getActivePrinter();
    if (!printer) {
      setMessage("Connect a printer in Settings → Printer before thermal printing.");
      return;
    }
    try {
      await printInvoice(
        printer,
        selected,
        storedPrinterFontSizePx(currentShop),
        storedPrinterPaperWidthMm(currentShop),
      );
      setMessage("Invoice sent to the thermal printer.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Printing failed.");
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Invoice details"
      description={selected?.number}
      className="invoice-detail-modal"
    >
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <EmptyState title="Invoice could not load" message={resource.error} />
      ) : !selected ? (
        <EmptyState
          title="Invoice unavailable"
          message="No invoice was found for this transaction in the selected shop."
        />
      ) : (
        <>
          <div className="invoice-modal-body">
            <InvoiceReceipt
              invoice={selected}
              variant={selected.kind === "repair" ? "repair" : "pos"}
            />
            <ThermalProof invoice={selected} shop={currentShop} />
          </div>
          {message && <div className="notice">{message}</div>}
          <div className="modal-actions no-print">
            <Button variant="secondary" icon="printer" onClick={() => window.print()}>
              {t("common.print")}
            </Button>
            <Button variant="secondary" onClick={() => downloadInvoicePDF(selected)}>
              {t("repairs.download_pdf")}
            </Button>
            <Button icon="printer" onClick={thermal}>
              {t("repairs.thermal_print")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
