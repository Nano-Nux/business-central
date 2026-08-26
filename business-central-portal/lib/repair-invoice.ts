import { formatShopAddress } from "./shop-address";
import { dateOnlyDaysBetween } from "./date-time";
import type {
  CustomFieldDefinition,
  Invoice,
  RepairDevice,
  RepairOrder,
  RepairWorkItem,
  Shop,
} from "./types";

type RepairPart = {
  work_item_id?: string;
  variant_id?: string;
  quantity: string;
  unit_price: string;
  status?: string;
};

type RepairServiceItem = {
  description: string;
  quantity: string | number;
  unit_price: string | number;
};

type RepairVariant = {
  id: string;
  name: string;
  product_name?: string;
};

function amount(value?: string | number) {
  return Number(value ?? 0);
}

function distinctLabels(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const label = value?.trim();
    if (!label) return false;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function printableFieldEntries(
  values: Record<string, unknown> | undefined,
  definitions: CustomFieldDefinition[] | undefined,
) {
  if (!values) return [] as Array<[string, unknown]>;
  const allowed = definitions
    ? new Set(
        definitions
          .filter((definition) => definition.printable)
          .map((definition) => definition.field_code),
      )
    : undefined;
  return Object.entries(values).filter(
    ([key, value]) =>
      (!allowed || allowed.has(key)) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== "",
  );
}

export function repairPaymentLabel(status?: string) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "DEPOSIT_PAID":
    case "AMOUNT_PAID":
      return "Deposit";
    default:
      return "Unpaid";
  }
}

export function repairDeviceImei(device?: RepairDevice) {
  const metadata = device?.metadata;
  const metadataValue =
    metadata &&
    ["imei", "imei_number", "serial_imei"]
      .map((key) => metadata[key])
      .find((value) => typeof value === "string" && value.trim());
  return typeof metadataValue === "string" && metadataValue.trim()
    ? metadataValue
    : device?.serial_number;
}

export function createRepairInvoice({
  repair,
  device,
  workItems,
  serviceItems = [],
  parts = [],
  variants = [],
  shop,
  currencyCode,
  ticketFieldDefinitions,
  workItemFieldDefinitions,
}: {
  repair: RepairOrder;
  device?: RepairDevice;
  workItems?: RepairWorkItem[];
  serviceItems?: RepairServiceItem[];
  parts?: RepairPart[];
  variants?: RepairVariant[];
  serviceName?: string;
  shop?: Shop | null;
  currencyCode: string;
  ticketFieldDefinitions?: CustomFieldDefinition[];
  workItemFieldDefinitions?: CustomFieldDefinition[];
}): Invoice {
  const items: Invoice["items"] = [];
  const subjects = workItems?.length
    ? workItems
    : device
      ? [
          {
            device,
            issue_description: repair.issue_description,
            additional_fee: repair.additional_fee,
          } as RepairWorkItem,
        ]
      : [];
  const waitingStartDate =
    repair.waiting_start_date ||
    subjects
      .map((item) => item.waiting_start_date)
      .filter(Boolean)
      .sort()[0];
  const waitingEndDate =
    repair.waiting_end_date ||
    subjects
      .map((item) => item.waiting_end_date)
      .filter(Boolean)
      .sort()
      .at(-1);
  for (const serviceItem of serviceItems) {
    items.push({
      name: serviceItem.description || "Repair service",
      quantity: amount(serviceItem.quantity),
      price: amount(serviceItem.unit_price),
    });
  }
  for (const part of parts) {
    const variant = variants.find((item) => item.id === part.variant_id);
    const workItem = subjects.find((item) => item.id === part.work_item_id);
    items.push({
      name:
        distinctLabels([variant?.product_name, variant?.name]).join(" · ") || "Replacement part",
      quantity: amount(part.quantity),
      price: amount(part.unit_price),
      work_item_id: part.work_item_id,
    });
    if (workItem)
      items[items.length - 1].name = `${workItem.sequence_number}. ${items[items.length - 1].name}`;
  }
  return {
    id: repair.id,
    number: repair.order_number,
    customer: repair.customer_name || "Customer not recorded",
    customerPhone: repair.customer_phone,
    currencyCode,
    shopName: shop?.name,
    shopTimezone: shop?.timezone,
    logoUrl: shop?.logo_url,
    showLogo: shop?.show_logo_in_printed_invoice !== false,
    showDeviceCompletionStatus: shop?.show_device_completion_status === true,
    showDeviceType: shop?.show_device_type_in_repair_invoice === true,
    showDeviceBrand: shop?.show_device_brand_in_repair_invoice === true,
    waitingStartDate,
    waitingEndDate,
    waitingDays:
      repair.waiting_days ??
      (waitingStartDate && waitingEndDate
        ? dateOnlyDaysBetween(waitingStartDate, waitingEndDate)
        : undefined),
    shopAddress: formatShopAddress(shop?.address),
    shopContact: shop?.contact_info,
    createdAt: repair.received_at,
    status: repair.payment_status === "PAID" ? "Paid" : "Pending",
    kind: "repair",
    ticketStatus: repair.status,
    paymentStatus: repairPaymentLabel(repair.payment_status),
    amountPaid: amount(repair.deposit_paid),
    balanceDue: Math.max(0, amount(repair.total_cost) - amount(repair.deposit_paid)),
    modelNumber: subjects
      .map((subject) =>
        [
          ...(shop?.show_device_type_in_repair_invoice === true
            ? [subject.device.device_type]
            : []),
          ...(shop?.show_device_brand_in_repair_invoice === true
            ? [subject.device.manufacturer]
            : []),
          subject.device.model,
        ]
          .filter(Boolean)
          .join(" · "),
      )
      .filter(Boolean)
      .join("; "),
    errorDescription: subjects.length
      ? subjects.map((subject) => subject.issue_description).join("; ")
      : repair.issue_description,
    imeiNumber: repairDeviceImei(subjects[0]?.device ?? device),
    subtotal: amount(repair.subtotal ?? repair.total_cost),
    discount: amount(repair.discount_total),
    tax: amount(repair.tax_amount),
    total: amount(repair.total_cost),
    items,
    work_items: subjects.map((subject, index) => ({
      id: subject.id || `preview-${index + 1}`,
      sequence_number: subject.sequence_number || index + 1,
      type: subject.type || "DEVICE",
      status: subject.status || "OPEN",
      form_version: subject.form_version || 1,
      device_type: subject.device.device_type,
      manufacturer: subject.device.manufacturer,
      model: subject.device.model,
      serial_number: subject.device.serial_number,
      issue_description: subject.issue_description,
      issues:
        subject.issues?.filter((value) => value.trim()) ??
        (subject.issue_description.trim() ? [subject.issue_description] : []),
      conditions: subject.conditions?.filter((value) => value.trim()) ?? [],
      note: subject.note,
      fields: Object.fromEntries(printableFieldEntries(subject.fields, workItemFieldDefinitions)),
      additional_fee: amount(subject.additional_fee) > 0 ? subject.additional_fee : undefined,
      waiting_start_date: subject.waiting_start_date,
      waiting_end_date: subject.waiting_end_date,
      waiting_days: subject.waiting_days,
      subtotal: subject.financials?.subtotal,
      discount_total: subject.financials?.discount_total,
      tax_amount: subject.financials?.tax_amount,
      total: subject.financials?.total,
      paid: subject.financials?.paid,
      balance: subject.financials?.balance,
    })),
    ticket_fields: Object.fromEntries(printableFieldEntries(repair.fields, ticketFieldDefinitions)),
    note: repair.note,
    shopNote: shop?.footer_note || shop?.receipt_note,
    footerNote: shop?.footer_note,
    receiptNote: shop?.receipt_note,
    taxLabel: shop?.tax_label,
  };
}
