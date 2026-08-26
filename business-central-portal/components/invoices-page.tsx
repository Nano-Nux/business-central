"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  ListControls,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  useListPagination,
} from "./ui";
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
import { formatMoney } from "@/lib/currency";
import { formatShopDateTime } from "@/lib/date-time";
import { InvoiceReceipt } from "./invoice-receipt";
import { useShop } from "@/lib/shop";
import { formatShopAddress } from "@/lib/shop-address";
import { repairPaymentLabel } from "@/lib/repair-invoice";

type ApiInvoice = {
  id: string;
  number: string;
  customer: string;
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
    customer: item.customer,
    customerPhone: item.customer_phone,
    merchantName: item.merchant_name,
    currencyCode: item.currency_code,
    shopName: item.shop_name,
    shopId: item.shop_id,
    logoUrl: item.shop_logo_url,
    showLogo: item.show_shop_logo,
    deliveryName: item.delivery_name,
    deliveryFee: Number(item.delivery_fee ?? 0),
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
    items: item.items.map((line) => ({
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

export function InvoicesPage() {
  const { currentShop } = useShop();
  const params = useSearchParams();
  const resource = useResource<ApiInvoice>("/invoices?page_index=0&page_size=200");
  const [manualSelection, setManualSelection] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
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
                  .join(" Â· "),
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
  const visible = useMemo(
    () =>
      invoices
        .filter(
          (item) =>
            (!currentShop || item.shopId === currentShop.id) &&
            `${item.number} ${item.customer}`.toLowerCase().includes(query.toLowerCase()) &&
            (filter === "ALL" ||
              filter === item.kind?.toUpperCase() ||
              filter === item.status.toUpperCase()),
        )
        .sort((a, b) => {
          if (sort === "OLDEST")
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (sort === "CUSTOMER") return a.customer.localeCompare(b.customer);
          if (sort === "TOTAL_DESC") return b.total - a.total;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
    [currentShop, filter, invoices, query, sort],
  );
  const pagination = useListPagination(
    visible,
    10,
    `${currentShop?.id}|${query}|${filter}|${sort}`,
  );
  const selectedId = manualSelection || params.get("invoice") || "";
  const selected = invoices.find((item) => item.id === selectedId) ?? null;
  function openInvoice(id: string) {
    setManualSelection(id);
    setMessage("");
  }
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
    <>
      <PageHeader
        eyebrow="Sales"
        title="Invoices"
        description="Find, download and print invoices from canonical sales and service orders."
      />
      <ListControls
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search invoice or customer"
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter invoices"
        filterOptions={[
          { value: "ALL", label: "All invoices" },
          { value: "POS", label: "Sales" },
          { value: "REPAIR", label: "Repairs" },
          { value: "PAID", label: "Paid" },
          { value: "REFUNDED", label: "Refunded" },
        ]}
        sort={sort}
        onSortChange={setSort}
        sortLabel="Sort invoices"
        sortOptions={[
          { value: "NEWEST", label: "Newest first" },
          { value: "OLDEST", label: "Oldest first" },
          { value: "CUSTOMER", label: "Customer A–Z" },
          { value: "TOTAL_DESC", label: "Highest total" },
        ]}
      />
      <div className="table-card">
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <EmptyState icon="receipt" title="Invoices could not load" message={resource.error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No invoices found"
            message={
              query
                ? "No invoice matches this search."
                : "A POS sale or repair ticket creates an invoice here, ready to print in any payment status."
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => (
                <tr
                  className="invoice-row"
                  key={item.id}
                  tabIndex={0}
                  aria-label={`Open ${item.number}`}
                  onClick={() => openInvoice(item.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openInvoice(item.id);
                    }
                  }}
                >
                  <td>
                    <strong>{item.number}</strong>
                  </td>
                  <td>{item.customer}</td>
                  <td>{formatShopDateTime(item.createdAt, currentShop?.timezone)}</td>
                  <td>
                    <Badge
                      tone={
                        item.status === "Paid"
                          ? "success"
                          : item.status === "Refunded"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {item.status}
                    </Badge>
                  </td>
                  <td>
                    <strong>{formatMoney(item.total, item.currencyCode)}</strong>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openInvoice(item.id);
                        }}
                        aria-label={`Open ${item.number}`}
                      >
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="invoices"
        onPageChange={pagination.setPageIndex}
      />
      <Modal
        open={!!selected}
        onClose={() => setManualSelection("__closed__")}
        title="Invoice details"
        description={selected?.number}
      >
        {selected && (
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
                Print
              </Button>
              <Button variant="secondary" onClick={() => downloadInvoicePDF(selected)}>
                Download PDF
              </Button>
              <Button icon="printer" onClick={thermal}>
                Thermal print
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
