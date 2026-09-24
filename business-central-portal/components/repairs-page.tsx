"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  ListControls,
  Modal,
  PageHeader,
  Pagination,
  StatusBadge,
  statusTone,
  useListPagination,
} from "./ui";
import { useTranslation } from "@/lib/i18n";
import { patch, post } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useShop } from "@/lib/shop";
import { useOffline } from "@/lib/offline";
import { queueRepairDiagnostic } from "@/lib/offline-repair-diagnostics";
import {
  addPendingRepairChild,
  queueRepairPart,
  queueRepairImage,
  queueRepairPayment,
  queueRepairStatusUpdate,
  queueRepairWorkItemStatus,
  queueRepairTicketCreate,
  updateRepairProjection,
} from "@/lib/offline-repairs";
import { useAuth } from "@/lib/auth";
import { formatMoney, formatQuantity } from "@/lib/currency";
import {
  currentDateOnly,
  dateOnlyDaysBetween,
  formatDateOnly,
  formatShopDateTime,
} from "@/lib/date-time";
import { downloadInvoicePDF } from "@/lib/invoice";
import { createRepairInvoice } from "@/lib/repair-invoice";
import {
  getActivePrinter,
  printInvoice,
  storedPrinterFontSizePx,
  storedPrinterPaperWidthMm,
} from "@/lib/thermal-printer";
import { InvoiceReceipt } from "./invoice-receipt";
import { RepairWaitingFields } from "./repair-waiting-fields";
import { BarcodeScanner } from "./barcode-scanner";
import { formatShopAddress } from "@/lib/shop-address";
import { resolveMediaURL } from "@/lib/media-url";
import { ImageSourceField, prepareImageSubmissions } from "./image-source-input";
import { imageUploadMarker } from "@/lib/offline-images";
import type {
  Invoice,
  Promotion,
  RepairDevice,
  RepairImage,
  RepairOrder,
  RepairPayment,
  RepairApproval,
  RepairWarranty,
  RepairWorkItem,
  CustomFieldDefinition,
  Brand,
  RepairPreset,
  PaymentType,
  Variant,
} from "@/lib/types";

function RepeatableDeviceValues({
  label,
  values,
  presets,
  required = false,
  onChange,
}: {
  label: "Issue" | "Condition";
  values: string[];
  presets: RepairPreset[];
  required?: boolean;
  onChange: (values: string[]) => void;
}) {
  const entries = values.length ? values : [""];
  return (
    <div className="wide repair-repeatable-values">
      {entries.map((value, index) => (
        <div className="repair-repeatable-value" key={`${label}-${index}`}>
          <Field label={`${label} ${index + 1}${required && index === 0 ? " *" : ""}`}>
            <textarea
              value={value}
              onChange={(event) =>
                onChange(
                  entries.map((current, itemIndex) =>
                    itemIndex === index ? event.target.value : current,
                  ),
                )
              }
              required={required && index === 0}
            />
          </Field>
          <Field label={`${label} preset`}>
            <select
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                onChange(
                  entries.map((current, itemIndex) =>
                    itemIndex === index ? event.target.value : current,
                  ),
                );
              }}
            >
              <option value="">Choose preset</option>
              {presets.map((preset) => (
                <option value={preset.value} key={preset.id}>
                  {preset.value}
                </option>
              ))}
            </select>
          </Field>
          {entries.length > 1 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onChange(entries.filter((_, itemIndex) => itemIndex !== index))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <button type="button" className="text-link" onClick={() => onChange([...entries, ""])}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

type ServiceCatalog = {
  id: string;
  name: string;
  code: string;
  labor_fee: string;
  is_active: boolean;
};
type ServiceLineDraft = {
  serviceId: string;
  quantity: string;
  workItemIndex: number;
};
type ServiceOrderItem = {
  id: string;
  service_id?: string;
  variant_id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  status: string;
  work_item_id?: string;
};
type RepairPart = {
  id: string;
  work_item_id?: string;
  variant_id?: string;
  quantity: string;
  unit_price: string;
  status: string;
  repair_total?: string;
};
type Diagnostic = {
  id: string;
  work_item_id?: string;
  diagnosis: string;
  estimated_cost?: string;
  created_at: string;
};
const statuses = ["RECEIVED", "IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED", "REFUNDED"];
const statusLabels: Record<string, string> = {
  RECEIVED: "Received",
  IN_PROGRESS: "In progress",
  READY_FOR_PICKUP: "Ready for pickup",
  COMPLETED: "Complete and closed",
  REFUNDED: "Refund",
};
const statusDescriptions: Record<string, string> = {
  RECEIVED: "Ticket logged and waiting for the repair team.",
  IN_PROGRESS: "Diagnosis or repair work is underway.",
  READY_FOR_PICKUP: "Work is finished and the device can be collected.",
  COMPLETED: "Device collected and the ticket is closed.",
  REFUNDED: "Ticket closed after the repair payment is refunded.",
};
function dynamicFieldVisible(definition: CustomFieldDefinition, values: Record<string, unknown>) {
  const rules = definition.visibility_rules;
  if (!rules || Object.keys(rules).length === 0) return true;
  const match = (rule: Record<string, unknown>): boolean => {
    if (Array.isArray(rule.all))
      return rule.all.every(
        (item) => item && typeof item === "object" && match(item as Record<string, unknown>),
      );
    if (Array.isArray(rule.any))
      return rule.any.some(
        (item) => item && typeof item === "object" && match(item as Record<string, unknown>),
      );
    const nested = rule.when;
    if (nested && typeof nested === "object") return match(nested as Record<string, unknown>);
    const field =
      typeof rule.field === "string"
        ? rule.field
        : typeof rule.field_code === "string"
          ? rule.field_code
          : "";
    if (!field) return true;
    const exists = Object.prototype.hasOwnProperty.call(values, field);
    const operator = typeof rule.operator === "string" ? rule.operator : "equals";
    if (operator === "exists")
      return exists === (rule.value === undefined ? true : Boolean(rule.value));
    const actual = values[field];
    const expected = rule.value ?? rule.equals;
    if (!exists) return operator === "not_equals" || operator === "not_in";
    if (operator === "in" || operator === "not_in") {
      const contains = Array.isArray(expected) && expected.some((item) => Object.is(item, actual));
      return operator === "not_in" ? !contains : contains;
    }
    const equal =
      Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
    return operator === "not_equals" ? !equal : equal;
  };
  return match(rules);
}

function DynamicFieldGroup({
  definitions,
  values,
  onChange,
  title,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (code: string, value: unknown) => void;
  title: string;
}) {
  const visibleDefinitions = definitions.filter((definition) =>
    dynamicFieldVisible(definition, values),
  );
  if (!visibleDefinitions.length) return null;
  const sections = visibleDefinitions.reduce<Map<string, CustomFieldDefinition[]>>(
    (groups, definition) => {
      const key = definition.section?.trim() || "Details";
      const current = groups.get(key) ?? [];
      current.push(definition);
      groups.set(key, current);
      return groups;
    },
    new Map(),
  );
  return (
    <div className="configuration-card">
      <h4>{title}</h4>
      {Array.from(sections, ([section, sectionDefinitions]) => (
        <div key={section} className="dynamic-field-section">
          {sections.size > 1 && <h5>{section}</h5>}
          <div className="form-grid">
            {sectionDefinitions.map((definition) => {
              const value = values[definition.field_code];
              const options = Array.isArray(definition.options) ? definition.options : [];
              const stringValue =
                typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
              return (
                <Field
                  key={definition.id}
                  label={`${definition.label}${definition.is_required ? " *" : ""}`}
                >
                  {definition.value_type === "SELECT" ? (
                    <select
                      value={stringValue}
                      required={definition.is_required}
                      onChange={(event) => onChange(definition.field_code, event.target.value)}
                    >
                      <option value="">Choose...</option>
                      {options.map((option, index) => {
                        const item =
                          typeof option === "object" && option !== null
                            ? (option as { value?: unknown; label?: unknown })
                            : { value: option, label: option };
                        return (
                          <option
                            key={`${definition.id}-${index}`}
                            value={String(item.value ?? "")}
                          >
                            {String(item.label ?? item.value ?? "")}
                          </option>
                        );
                      })}
                    </select>
                  ) : definition.value_type === "BOOLEAN" ? (
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) => onChange(definition.field_code, event.target.checked)}
                      />{" "}
                      <span>{definition.label}</span>
                    </label>
                  ) : definition.value_type === "JSON" ? (
                    <textarea
                      value={stringValue}
                      required={definition.is_required}
                      onChange={(event) => {
                        try {
                          onChange(definition.field_code, JSON.parse(event.target.value));
                        } catch {
                          onChange(definition.field_code, event.target.value);
                        }
                      }}
                    />
                  ) : (
                    <input
                      type={
                        definition.value_type === "NUMBER"
                          ? "number"
                          : definition.value_type === "DATE"
                            ? "date"
                            : "text"
                      }
                      value={stringValue}
                      required={definition.is_required}
                      onChange={(event) =>
                        onChange(
                          definition.field_code,
                          definition.value_type === "NUMBER"
                            ? event.target.value === ""
                              ? ""
                              : Number(event.target.value)
                            : event.target.value,
                        )
                      }
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketDetails({
  repair,
  device,
  services,
  variants,
  ticketDefinitions,
  workItemDefinitions,
  onClose,
  onChanged,
}: {
  repair: RepairOrder;
  device?: RepairDevice;
  services: ServiceCatalog[];
  variants: Variant[];
  ticketDefinitions: CustomFieldDefinition[];
  workItemDefinitions: CustomFieldDefinition[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { merchant } = useAuth();
  const { currentShop } = useShop();
  const offline = useOffline();
  const parts = useResource<RepairPart>(
    `/repairs/orders/${repair.id}/parts?page_index=0&page_size=100`,
  );
  const diagnostics = useResource<Diagnostic>(
    `/repairs/orders/${repair.id}/diagnostics?page_index=0&page_size=100`,
  );
  const payments = useResource<RepairPayment>(
    `/repairs/orders/${repair.id}/payments?page_index=0&page_size=100`,
  );
  const paymentTypes = useResource<PaymentType>("/payment-types?active_only=true");
  const usablePaymentTypes = useMemo(() => {
    const active = paymentTypes.data.filter((item) => item.category_code !== "DIGITAL");
    if (active.length > 0) return active;
    return [{ id: "cash", merchant_id: "", name: "Cash", category_code: "CASH" as const, is_active: true, created_at: "", updated_at: "" }];
  }, [paymentTypes.data]);
  const images = useResource<RepairImage>(
    `/repairs/orders/${repair.id}/images?page_index=0&page_size=100`,
  );
  const workItems = useResource<RepairWorkItem>(
    `/repairs/orders/${repair.id}/work-items?page_index=0&page_size=100`,
  );
  const serviceItems = useResource<ServiceOrderItem>(
    `/services/orders/${repair.service_order_id}/items?page_index=0&page_size=100`,
  );
  const approvals = useResource<RepairApproval>(
    `/repairs/orders/${repair.id}/approvals?page_index=0&page_size=100`,
  );
  const warranties = useResource<RepairWarranty>(
    `/repairs/orders/${repair.id}/warranties?page_index=0&page_size=100`,
  );
  const [status, setStatus] = useState(repair.status);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosticNotice, setDiagnosticNotice] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [refundPayment, setRefundPayment] = useState<RepairPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [invoicePreview, setInvoicePreview] = useState(false);
  const [thermalPrintBusy, setThermalPrintBusy] = useState(false);
  const [thermalPrintMessage, setThermalPrintMessage] = useState("");
  const [thermalPrintError, setThermalPrintError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("PENDING");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [warrantyStartsAt, setWarrantyStartsAt] = useState("");
  const [warrantyEndsAt, setWarrantyEndsAt] = useState("");
  const [warrantyTerms, setWarrantyTerms] = useState("");
  const paid = Math.max(0, Number(repair.deposit_paid || 0));
  const balance = Math.max(0, Number(repair.total_cost || 0) - paid);
  const repairService = services.find((service) => service.id === repair.service_id);
  const availableWorkItems = workItems.data.length ? workItems.data : (repair.work_items ?? []);
  const activeWorkItemId = selectedWorkItemId || availableWorkItems[0]?.id || "";
  const repairInvoice = createRepairInvoice({
    repair,
    device,
    workItems: workItems.data,
    serviceItems: serviceItems.data.filter((item) => Boolean(item.service_id)),
    parts: parts.data,
    variants,
    serviceName: repairService ? `${repairService.code} · ${repairService.name}` : undefined,
    shop: currentShop,
    currencyCode: merchant?.default_currency_code ?? "USD",
    ticketFieldDefinitions: ticketDefinitions,
    workItemFieldDefinitions: workItemDefinitions,
  });
  async function thermalPrint() {
    setThermalPrintMessage("");
    setThermalPrintError("");
    const printer = getActivePrinter();
    if (!printer) {
      setThermalPrintError("Connect a printer in Settings → Printer before thermal printing.");
      return;
    }
    setThermalPrintBusy(true);
    try {
      await printInvoice(
        printer,
        repairInvoice,
        storedPrinterFontSizePx(currentShop),
        storedPrinterPaperWidthMm(currentShop),
      );
      setThermalPrintMessage("Repair ticket invoice sent to the thermal printer.");
    } catch (reason) {
      setThermalPrintError(reason instanceof Error ? reason.message : "Thermal printing failed.");
    } finally {
      setThermalPrintBusy(false);
    }
  }
  async function addImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImageBusy(true);
    setPaymentError("");
    try {
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save repair images while disconnected.");
      }
      const values = new FormData(event.currentTarget);
      const submissions = await prepareImageSubmissions(values, "repair_image", {
        deferUploads: offline.status === "offline" || !navigator.onLine,
      });
      if (!submissions.length) throw new Error("Choose an image source before adding an image.");
      for (const image of submissions) {
        const imageURL = image.offline_upload
          ? imageUploadMarker(image.offline_upload.id)
          : image.image_url;
        const body = {
          work_item_id: activeWorkItemId || undefined,
          image_url: imageURL,
          source_type: image.source_type,
          filename: image.filename,
          content_type: image.content_type,
        };
        if (offline.scope && offline.storageAvailable) {
          const localImageUrl = image.offline_upload
            ? `data:${image.offline_upload.content_type};base64,${image.offline_upload.data_base64}`
            : image.image_url;
          const operation = await queueRepairImage(offline.scope, repair, body, {
            offlineImageUpload: image.offline_upload,
            localImageUrl,
          });
          const localImage: RepairImage = {
            id: operation.entityId,
            repair_order_id: repair.id,
            work_item_id: activeWorkItemId || undefined,
            filename: image.filename,
            content_type: image.content_type,
            image_url: localImageUrl,
            source_type: image.source_type,
            created_at: new Date().toISOString(),
          };
          await addPendingRepairChild(offline.scope, repair, "images", localImage);
          images.updateLocal((items) => [...items, localImage]);
        } else {
          await post(`/repairs/orders/${repair.id}/images`, body);
        }
      }
      if (offline.scope && offline.storageAvailable) {
        if (navigator.onLine) await offline.syncNow();
      } else await images.reload();
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Image upload failed.");
    } finally {
      setImageBusy(false);
    }
  }
  async function takePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPaymentError("");
    try {
      const paymentTypeId = String(values.get("payment_type_id"));
      const paymentType = usablePaymentTypes.find((item) => item.id === paymentTypeId);
      if (!paymentType) throw new Error("Select an active payment type.");
      if (offline.status === "offline" && paymentType.category_code !== "CASH") {
        throw new Error("External repair payment authorization requires a connection.");
      }
      const paymentAmount = Number(values.get("amount"));
      let remainingAllocation = paymentAmount;
      const allocations = availableWorkItems.flatMap((item, index) => {
        if (remainingAllocation <= 0) return [];
        const knownBalance = Number(item.financials?.balance ?? 0);
        const allocated =
          knownBalance > 0
            ? Math.min(knownBalance, remainingAllocation)
            : index === 0
              ? remainingAllocation
              : 0;
        if (allocated <= 0) return [];
        remainingAllocation = Math.max(0, remainingAllocation - allocated);
        return [{ work_item_id: item.id, amount: allocated.toFixed(2) }];
      });
      if (remainingAllocation > 0.005 && allocations.length > 0) {
        const last = allocations[allocations.length - 1];
        last.amount = (Number(last.amount) + remainingAllocation).toFixed(2);
      }
      const body = {
        kind: "FINAL",
        payment_type_id: paymentType.id,
        method: paymentType.name,
        amount: String(values.get("amount")),
        idempotency_key: `repair-${repair.id}-${crypto.randomUUID()}`,
        allocations,
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save a repair payment while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueRepairPayment(offline.scope, repair, body);
        await addPendingRepairChild(offline.scope, repair, "payments", {
          id: crypto.randomUUID(),
          repair_order_id: repair.id,
          ...body,
          status: "PENDING_SYNCHRONIZATION",
          created_at: new Date().toISOString(),
        });
        if (navigator.onLine) await offline.syncNow().catch(() => undefined);
      } else await post(`/repairs/orders/${repair.id}/payments`, body);
      setPaymentOpen(false);
      onClose();
      void onChanged();
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Payment could not be recorded.");
    }
  }
  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!refundPayment) return;
    setRefundBusy(true);
    setPaymentError("");
    try {
      if (offline.status === "offline") {
        throw new Error("Refunds require an online connection.");
      }
      await post(`/repairs/orders/${repair.id}/refunds`, {
        payment_id: refundPayment.id,
        amount: refundAmount,
        reason: refundReason.trim() || undefined,
        idempotency_key: `repair-refund:${repair.id}:${refundPayment.id}:${crypto.randomUUID()}`,
      });
      setRefundPayment(null);
      setRefundReason("");
      await Promise.all([payments.reload(), onChanged()]);
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : "Refund could not be recorded.");
    } finally {
      setRefundBusy(false);
    }
  }
  async function updateStatus() {
    setBusy(true);
    setError("");
    try {
      const body = {
        service_order_id: repair.service_order_id,
        device_id: repair.device_id,
        order_number: repair.order_number,
        status,
        issue_description: repair.issue_description,
        received_at: repair.received_at,
        completed_at: status === "COMPLETED" ? new Date().toISOString() : repair.completed_at,
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to update repair status while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueRepairStatusUpdate(offline.scope, repair, body);
        if (navigator.onLine) await offline.syncNow();
      } else await patch(`/repairs/orders/${repair.id}`, body);
      // A successful status change is complete regardless of the target status.
      // Keep the detail dialog from remaining open while the list refreshes.
      onClose();
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  async function updateWorkItemStatus(workItem: RepairWorkItem, nextStatus: string) {
    setBusy(true);
    setError("");
    try {
      if (
        offline.status === "offline" &&
        (!offline.scope || !offline.storageAvailable || !repair.shop_id)
      ) {
        throw new Error(
          "Offline storage and a shop-scoped repair are required to update work item status.",
        );
      }
      if (offline.scope && offline.storageAvailable && repair.shop_id) {
        await queueRepairWorkItemStatus(offline.scope, repair, workItem.id, nextStatus);
        if (navigator.onLine) await offline.syncNow();
      } else {
        await patch(`/repairs/work-items/${encodeURIComponent(workItem.id)}`, {
          status: nextStatus,
        });
      }
      await Promise.all([workItems.reload(), onChanged()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Work item status could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  function workItemLabel(workItemId?: string) {
    if (!workItemId) return "Ticket-level";
    const item = availableWorkItems.find((candidate) => candidate.id === workItemId);
    return item
      ? `${item.sequence_number}. ${item.summary || item.device.device_type || "Work item"}`
      : "Work item";
  }
  async function addApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (offline.status === "offline") throw new Error("Approval changes require a connection.");
      const version = Math.max(0, ...approvals.data.map((item) => item.approval_version)) + 1;
      await post(`/repairs/orders/${repair.id}/approvals`, {
        work_item_id: activeWorkItemId || undefined,
        approval_version: version,
        status: approvalStatus,
        approved_amount: approvedAmount || undefined,
        approved_at: approvalStatus === "APPROVED" ? new Date().toISOString() : undefined,
      });
      setApprovedAmount("");
      await approvals.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Approval could not be saved.");
    }
  }
  async function addWarranty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (offline.status === "offline") throw new Error("Warranty changes require a connection.");
      if (!warrantyStartsAt || !warrantyEndsAt)
        throw new Error("Warranty start and end dates are required.");
      await post(`/repairs/orders/${repair.id}/warranties`, {
        work_item_id: activeWorkItemId || undefined,
        starts_at: `${warrantyStartsAt}T00:00:00Z`,
        ends_at: `${warrantyEndsAt}T23:59:59Z`,
        terms: warrantyTerms.trim() || undefined,
      });
      setWarrantyTerms("");
      await warranties.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Warranty could not be saved.");
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={repair.order_number}
      description={repair.issue_description}
      className="repair-ticket-modal"
    >
      <div className="configuration-section repair-payment-section">
        <h3>Customer & payment</h3>
        <div className="repair-customer-summary">
          <span className="repair-customer-avatar" aria-hidden="true">
            {(repair.customer_name || "C").trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <small>Customer</small>
            <strong>{repair.customer_name || "Customer not recorded"}</strong>
            <span>{repair.customer_phone || "Phone number not recorded"}</span>
          </div>
        </div>
        <div className="inline-form">
          <strong>{formatMoney(String(balance), merchant?.default_currency_code)} due</strong>
          <Button variant="secondary" icon="receipt" onClick={() => setInvoicePreview(true)}>
            Preview / print invoice
          </Button>
          <Button
            disabled={balance <= 0 || repair.status === "REFUNDED"}
            onClick={() => setPaymentOpen(true)}
          >
            Record final payment
          </Button>
        </div>
        <div className="repair-billing-grid">
          <div>
            <span>Catalog labor</span>
            <strong>{formatMoney(repair.labor_fee, merchant?.default_currency_code)}</strong>
          </div>
          {Number(repair.additional_fee || 0) > 0 && (
            <div>
              <span>Device prices</span>
              <strong>{formatMoney(repair.additional_fee, merchant?.default_currency_code)}</strong>
            </div>
          )}
          <div>
            <span>Deposit paid</span>
            <strong>{formatMoney(String(paid), merchant?.default_currency_code)}</strong>
          </div>
          <div className="repair-billing-balance">
            <span>Balance due</span>
            <strong>{formatMoney(String(balance), merchant?.default_currency_code)}</strong>
          </div>
          <div>
            <span>Payment status</span>
            <StatusBadge status={repair.payment_status} />
          </div>
          {repair.waiting_start_date && repair.waiting_end_date && (
            <div>
              <span>Ticket waiting period</span>
              <strong>
                {formatDateOnly(repair.waiting_start_date)} –{" "}
                {formatDateOnly(repair.waiting_end_date)}
                {` (${repair.waiting_days ?? 0} days)`}
              </strong>
            </div>
          )}
        </div>
        {Number(repair.discount_total ?? 0) > 0 && (
          <div className="notice">
            Promotion discount: −
            {formatMoney(repair.discount_total, merchant?.default_currency_code)} from{" "}
            {formatMoney(repair.subtotal ?? repair.total_cost, merchant?.default_currency_code)}.
          </div>
        )}
        {payments.data.map((item) => (
          <div className="variant-list" key={item.id}>
            <div>
              <strong>
                {item.kind} · {item.method}
              </strong>
              <small>
                {formatMoney(item.amount, merchant?.default_currency_code)} ·{" "}
                <StatusBadge status={item.status} />
              </small>
            </div>
            {!["REFUNDED", "PARTIALLY_REFUNDED"].includes(item.status) &&
              ["CAPTURED", "SUCCEEDED"].includes(item.status) && (
                <Button
                  variant="secondary"
                  disabled={offline.status === "offline"}
                  onClick={() => {
                    setRefundPayment(item);
                    setRefundAmount(item.amount);
                  }}
                >
                  Refund
                </Button>
              )}
          </div>
        ))}
      </div>
      <div className="configuration-section">
        <h3>Work item context</h3>
        <p>New diagnostics, parts, and images are linked to the selected work item.</p>
        <Field label="Selected work item">
          <select
            value={activeWorkItemId}
            onChange={(event) => setSelectedWorkItemId(event.target.value)}
          >
            {availableWorkItems.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.summary || item.device.device_type || "Work item"}
              </option>
            ))}
          </select>
        </Field>
        <div className="variant-list repair-work-items">
          {availableWorkItems.map((item, index) => (
            <div className="repair-work-item" key={item.id}>
              <div className="repair-work-copy">
                <strong>
                  {index + 1}. {item.summary || item.device.device_type || "Work item"}
                </strong>
                <dl className="repair-device-details">
                  <div>
                    <dt>Device</dt>
                    <dd>{item.device.device_type || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{item.device.manufacturer || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{item.device.model || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Serial / IMEI</dt>
                    <dd>{item.device.serial_number || "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Waiting time</dt>
                    <dd>
                      {item.waiting_days ?? 0} days · {formatDateOnly(item.waiting_start_date)} –{" "}
                      {formatDateOnly(item.waiting_end_date)}
                    </dd>
                  </div>
                </dl>
                <div className="repair-work-issue">
                  <span>Reported issues</span>
                  {(item.issues?.length ? item.issues : [item.issue_description])
                    .filter(Boolean)
                    .map((issue, issueIndex) => (
                      <p key={`${item.id}-issue-${issueIndex}`}>{issue}</p>
                    ))}
                </div>
                {!!item.conditions?.filter(Boolean).length && (
                  <div className="repair-work-issue">
                    <span>Conditions</span>
                    {item.conditions.filter(Boolean).map((condition, conditionIndex) => (
                      <p key={`${item.id}-condition-${conditionIndex}`}>{condition}</p>
                    ))}
                  </div>
                )}
                {item.financials && (
                  <div className="repair-work-financials">
                    <div>
                      <span>Total</span>
                      <strong>
                        {formatMoney(item.financials.total, merchant?.default_currency_code)}
                      </strong>
                    </div>
                    <div>
                      <span>Paid</span>
                      <strong>
                        {formatMoney(item.financials.paid, merchant?.default_currency_code)}
                      </strong>
                    </div>
                    <div>
                      <span>Balance</span>
                      <strong>
                        {formatMoney(item.financials.balance, merchant?.default_currency_code)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
              <select
                value={item.status}
                disabled={
                  busy ||
                  (offline.status === "offline" && (!offline.scope || !offline.storageAvailable))
                }
                onChange={(event) => void updateWorkItemStatus(item, event.target.value)}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="configuration-section">
        <h3>Device images</h3>
        <Form onSubmit={addImages}>
          <ImageSourceField
            name="repair_image"
            label={`Add images to ${workItemLabel(activeWorkItemId)}`}
            multiple
            disabled={offline.status === "offline" || imageBusy}
          />
          <Button type="submit" disabled={offline.status === "offline" || imageBusy}>
            Add image
          </Button>
        </Form>
        <div className="image-flow">
          {images.data.map((image) => (
            <div key={image.id}>
              {image.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveMediaURL(image.image_url)}
                  alt={image.filename}
                  style={{ maxWidth: 120, maxHeight: 120, objectFit: "cover" }}
                />
              ) : image.data_base64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:${image.content_type};base64,${image.data_base64}`}
                  alt={image.filename}
                  style={{ maxWidth: 120, maxHeight: 120, objectFit: "cover" }}
                />
              ) : (
                <span>{image.filename}</span>
              )}
              <small>
                {workItemLabel(image.work_item_id)} · {image.filename}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="configuration-section">
        <h3>Diagnostics & estimate</h3>
        {diagnosticNotice && <div className="notice">{diagnosticNotice}</div>}
        {diagnostics.data.map((item) => (
          <div className="variant-list" key={item.id}>
            <div>
              <div>
                <strong>{item.diagnosis}</strong>
                <small>
                  {workItemLabel(item.work_item_id)} ·{" "}
                  {item.estimated_cost
                    ? `Estimate ${formatMoney(item.estimated_cost, merchant?.default_currency_code)}`
                    : "No estimate"}
                </small>
              </div>
            </div>
          </div>
        ))}
        <div className="repair-subform repair-diagnostic-form">
          <div className="repair-subform-heading">
            <strong>New diagnosis</strong>
            <small>This will be linked to {workItemLabel(activeWorkItemId)}.</small>
          </div>
          <div className="repair-inline-action">
            <Field label="Diagnosis">
              <input
                placeholder="Describe the diagnosis"
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
              />
            </Field>
            <Button
              disabled={
                !diagnosis.trim() ||
                busy ||
                (offline.status === "offline" && (!offline.scope || !offline.storageAvailable))
              }
              onClick={async () => {
                setBusy(true);
                try {
                  if (offline.status === "offline") {
                    if (!offline.scope || !offline.storageAvailable || !repair.shop_id)
                      throw new Error(
                        "Offline storage and a shop-scoped repair are required to save a diagnostic.",
                      );
                    await queueRepairDiagnostic(
                      offline.scope,
                      repair.shop_id,
                      repair.id,
                      diagnosis,
                      activeWorkItemId || undefined,
                    );
                    setDiagnosticNotice(
                      "Diagnostic saved locally and will synchronize when connected.",
                    );
                  } else {
                    await post(`/repairs/orders/${repair.id}/diagnostics`, {
                      repair_order_id: repair.id,
                      work_item_id: activeWorkItemId || undefined,
                      diagnosis: diagnosis.trim(),
                    });
                  }
                  setDiagnosis("");
                  if (offline.status !== "offline") await diagnostics.reload();
                } catch (reason) {
                  setDiagnosticNotice(
                    reason instanceof Error ? reason.message : "Diagnostic could not be saved.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add diagnosis
            </Button>
          </div>
        </div>
      </div>
      <div className="configuration-section repair-status-panel">
        <div className="repair-status-heading">
          <div>
            <span className="repair-status-eyebrow">Repair lifecycle</span>
            <h3>Change ticket status</h3>
          </div>
          <Badge tone={statusTone(repair.status)}>
            Current: {statusLabels[repair.status] ?? repair.status.replaceAll("_", " ")}
          </Badge>
        </div>
        <p className="repair-status-intro">
          Choose the stage that best reflects the ticket right now. This change is visible anywhere
          the repair is tracked.
        </p>
        <fieldset className="repair-status-options" disabled={repair.status === "REFUNDED" || busy}>
          <legend className="sr-only">New ticket status</legend>
          {statuses.map((value, index) => {
            const isCurrent = value === repair.status;
            const isSelected = value === status;
            return (
              <label
                className={`repair-status-option status-${statusTone(value)}${isSelected ? " selected" : ""}`}
                key={value}
              >
                <input
                  type="radio"
                  name={`repair-status-${repair.id}`}
                  value={value}
                  checked={isSelected}
                  onChange={() => setStatus(value)}
                />
                <span className="repair-status-marker" aria-hidden="true">
                  {isSelected ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <span className="repair-status-copy">
                  <strong>{statusLabels[value]}</strong>
                  <small>{statusDescriptions[value]}</small>
                </span>
                {isCurrent && <span className="repair-status-current">Current</span>}
              </label>
            );
          })}
        </fieldset>
        <div className="repair-status-summary" aria-live="polite">
          <span className={`repair-status-summary-icon status-${statusTone(status)}`}>
            <Icon name={status === "REFUNDED" ? "receipt" : "repair"} size={18} />
          </span>
          <div>
            <small>
              {status === repair.status ? "No change selected" : "Status will change to"}
            </small>
            <strong>
              {status === repair.status
                ? statusLabels[repair.status]
                : `${statusLabels[repair.status]} → ${statusLabels[status]}`}
            </strong>
          </div>
        </div>
        {status === "COMPLETED" && status !== repair.status && (
          <p className="repair-status-note">
            Final payment is optional. You can close the repair now and record the remaining payment
            when the customer collects the device.
          </p>
        )}
        {status === "REFUNDED" && status !== repair.status && (
          <p className="repair-status-note warning">
            Use this only after the repair payment has been refunded. This closes the ticket and
            cannot be changed here afterward.
          </p>
        )}
        {repair.status === "REFUNDED" && (
          <p className="repair-status-note warning">
            Refunded tickets are closed and their status can no longer be changed.
          </p>
        )}
        <div className="repair-status-actions">
          <Button
            variant="secondary"
            disabled={busy || status === repair.status}
            onClick={() => setStatus(repair.status)}
          >
            Reset selection
          </Button>
          <Button
            disabled={
              (offline.status === "offline" && !offline.storageAvailable) ||
              busy ||
              status === repair.status ||
              repair.status === "REFUNDED"
            }
            onClick={updateStatus}
            icon="check"
          >
            {busy ? "Updating…" : `Confirm ${statusLabels[status]}`}
          </Button>
        </div>
      </div>
      <div className="configuration-section">
        <h3>Parts used</h3>
        {parts.loading ? (
          <Loading />
        ) : parts.error ? (
          <div className="form-error">{parts.error}</div>
        ) : parts.data.length === 0 ? (
          <div className="configuration-empty">No stock parts have been used.</div>
        ) : (
          <div className="variant-list">
            {parts.data.map((part) => (
              <div key={part.id}>
                <span className="stat-icon mint">
                  <Icon name="package" size={16} />
                </span>
                <div>
                  <strong>
                    {variants.find((item) => item.id === part.variant_id)?.name ??
                      "Customer-supplied part"}
                  </strong>
                  <small>
                    {formatQuantity(part.quantity)} × {workItemLabel(part.work_item_id)} ·{" "}
                    {formatMoney(part.unit_price, merchant?.default_currency_code)}
                  </small>
                </div>
                <StatusBadge status={part.status} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="configuration-section">
        <h3>Approvals & warranties</h3>
        <p>
          New records use the selected work-item context above; ticket-level records remain
          supported.
        </p>
        {approvals.data.map((approval) => (
          <div className="variant-list" key={approval.id}>
            <div>
              <strong>
                Approval v{approval.approval_version} · <StatusBadge status={approval.status} />
              </strong>
              <small>
                {workItemLabel(approval.work_item_id)}
                {approval.approved_amount
                  ? ` · ${formatMoney(approval.approved_amount, merchant?.default_currency_code)}`
                  : ""}
              </small>
            </div>
          </div>
        ))}
        <Form className="repair-subform" onSubmit={addApproval}>
          <div className="repair-subform-heading">
            <strong>New approval</strong>
            <small>Record the customer&apos;s decision for the selected work item.</small>
          </div>
          <div className="form-grid">
            <Field label="Approval status">
              <select
                value={approvalStatus}
                onChange={(event) => setApprovalStatus(event.target.value)}
                disabled={offline.status === "offline"}
              >
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </Field>
            <Field label="Approved amount">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional"
                value={approvedAmount}
                onChange={(event) => setApprovedAmount(event.target.value)}
                disabled={offline.status === "offline"}
              />
            </Field>
          </div>
          <div className="repair-subform-actions">
            <Button type="submit" disabled={offline.status === "offline"}>
              Add approval
            </Button>
          </div>
        </Form>
        {warranties.data.map((warranty) => (
          <div className="variant-list" key={warranty.id}>
            <div>
              <strong>Warranty · {workItemLabel(warranty.work_item_id)}</strong>
              <small>
                {new Date(warranty.starts_at).toLocaleDateString()} –{" "}
                {new Date(warranty.ends_at).toLocaleDateString()}
                {warranty.terms ? ` · ${warranty.terms}` : ""}
              </small>
            </div>
          </div>
        ))}
        <Form className="repair-subform" onSubmit={addWarranty}>
          <div className="repair-subform-heading">
            <strong>New warranty</strong>
            <small>Set the coverage period and terms for the selected work item.</small>
          </div>
          <div className="form-grid">
            <Field label="Warranty starts">
              <input
                type="date"
                value={warrantyStartsAt}
                onChange={(event) => setWarrantyStartsAt(event.target.value)}
                disabled={offline.status === "offline"}
                required
              />
            </Field>
            <Field label="Warranty ends">
              <input
                type="date"
                value={warrantyEndsAt}
                onChange={(event) => setWarrantyEndsAt(event.target.value)}
                disabled={offline.status === "offline"}
                required
              />
            </Field>
            <div className="wide">
              <Field label="Terms">
                <input
                  value={warrantyTerms}
                  onChange={(event) => setWarrantyTerms(event.target.value)}
                  disabled={offline.status === "offline"}
                  placeholder="Optional coverage details"
                />
              </Field>
            </div>
          </div>
          <div className="repair-subform-actions">
            <Button type="submit" disabled={offline.status === "offline"}>
              Add warranty
            </Button>
          </div>
        </Form>
      </div>
      {error && <div className="form-error">{error}</div>}
      {paymentError && <div className="form-error">{paymentError}</div>}
      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Record final payment"
        description={`Balance due: ${formatMoney(String(balance), merchant?.default_currency_code)}`}
        className="repair-action-modal"
      >
        <Form className="repair-action-form" onSubmit={takePayment}>
          <Field label="Amount">
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={balance.toFixed(2)}
              max={balance.toFixed(2)}
              required
            />
          </Field>
          <Field label="Payment type">
            <select
              name="payment_type_id"
              defaultValue={usablePaymentTypes.find((item) => item.category_code === "CASH")?.id}
              required
            >
              {usablePaymentTypes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.category_code}
                </option>
              ))}
            </select>
          </Field>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save payment & complete</Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={Boolean(refundPayment)}
        onClose={() => setRefundPayment(null)}
        title="Refund payment"
        description="Record a refund for this repair payment."
        className="repair-action-modal"
      >
        <Form className="repair-action-form" onSubmit={submitRefund}>
          <Field label="Refund amount">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              required
            />
          </Field>
          <Field label="Reason">
            <textarea
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setRefundPayment(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={refundBusy || offline.status === "offline"}>
              {refundBusy ? "Saving refund…" : "Save refund"}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={invoicePreview}
        onClose={() => setInvoicePreview(false)}
        title="Repair ticket invoice"
        description="This invoice can be printed in any ticket status."
      >
        <div className="invoice-preview-body">
          <InvoiceReceipt invoice={repairInvoice} variant="repair" />
        </div>
        <div className="modal-actions no-print">
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="secondary" onClick={() => downloadInvoicePDF(repairInvoice)}>
            Download PDF
          </Button>
          <Button icon="printer" onClick={thermalPrint} disabled={thermalPrintBusy}>
            {thermalPrintBusy ? "Printing…" : "Thermal print"}
          </Button>
        </div>
        {thermalPrintMessage && <div className="notice no-print">{thermalPrintMessage}</div>}
        {thermalPrintError && <div className="form-error no-print">{thermalPrintError}</div>}
      </Modal>
    </Modal>
  );
}

export function RepairsPage() {
  const { t } = useTranslation();
  const offline = useOffline();
  const { currentShop } = useShop();
  const { merchant, isMerchant } = useAuth();
  const repairs = useResource<RepairOrder>(
    currentShop
      ? `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${encodeURIComponent(currentShop.id)}`
      : "",
  );
  const [repairQuery, setRepairQuery] = useState("");
  const [repairFilter, setRepairFilter] = useState("ALL");
  const [repairSort, setRepairSort] = useState("NEWEST");
  const visibleRepairs = useMemo(
    () =>
      repairs.data
        .filter(
          (item) =>
            `${item.order_number} ${item.customer_name ?? ""} ${item.customer_phone ?? ""} ${item.issue_description} ${item.work_items?.map((workItem) => `${workItem.device.device_type} ${workItem.device.manufacturer ?? ""} ${workItem.device.model ?? ""} ${workItem.device.serial_number ?? ""}`).join(" ") ?? ""}`
              .toLowerCase()
              .includes(repairQuery.toLowerCase()) &&
            (repairFilter === "ALL" || item.status === repairFilter),
        )
        .sort((a, b) =>
          repairSort === "OLDEST"
            ? new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
            : repairSort === "CUSTOMER"
              ? (a.customer_name ?? "").localeCompare(b.customer_name ?? "")
              : repairSort === "TICKET"
                ? a.order_number.localeCompare(b.order_number)
                : new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
        ),
    [repairFilter, repairQuery, repairSort, repairs.data],
  );
  const repairsPagination = useListPagination(
    visibleRepairs,
    10,
    `${repairQuery}|${repairFilter}|${repairSort}`,
  );
  const repairDevices = useResource<RepairDevice>("/repairs/devices?page_index=0&page_size=200");
  const issuePresets = useResource<RepairPreset>(
    currentShop
      ? `/repairs/presets?shop_id=${encodeURIComponent(currentShop.id)}&preset_type=ISSUE&page_index=0&page_size=200`
      : "",
  );
  const conditionPresets = useResource<RepairPreset>(
    currentShop
      ? `/repairs/presets?shop_id=${encodeURIComponent(currentShop.id)}&preset_type=CONDITION&page_index=0&page_size=200`
      : "",
  );
  const variants = useResource<Variant>(
    `/pos/catalog?page_index=0&page_size=200${currentShop ? `&shop_id=${encodeURIComponent(currentShop.id)}` : ""}`,
  );
  const brands = useResource<Brand>("/catalog/brands?page_index=0&page_size=200");
  const promotions = useResource<Promotion>(
    "/promotions?page_index=0&page_size=100&filter=is_active:true",
  );
  const paymentTypes = useResource<PaymentType>("/payment-types?active_only=true");
  const usablePaymentTypes = useMemo(() => {
    const active = paymentTypes.data.filter((item) => item.category_code !== "DIGITAL");
    if (active.length > 0) return active;
    return [{ id: "cash", merchant_id: "", name: "Cash", category_code: "CASH" as const, is_active: true, created_at: "", updated_at: "" }];
  }, [paymentTypes.data]);
  const services = useResource<ServiceCatalog>(
    "/services/catalog?page_index=0&page_size=100&filter=is_active:true",
  );
  const formDefinitions = useResource<CustomFieldDefinition>(
    "/services/forms/definitions?page_index=0&page_size=200&filter=is_active:true",
  );
  const workItemDefinitions = formDefinitions.data
    .filter(
      (definition) =>
        definition.field_scope === "WORK_ITEM" &&
        (definition.entity_type === "REPAIR_WORK_ITEM" ||
          definition.entity_type === "SERVICE_WORK_ITEM") &&
        definition.is_active &&
        (!definition.service_type || definition.service_type.toUpperCase() === "REPAIR"),
    )
    .sort((left, right) => left.display_order - right.display_order);
  const ticketDefinitions = formDefinitions.data
    .filter(
      (definition) =>
        definition.field_scope === "TICKET" &&
        (definition.entity_type === "REPAIR_TICKET" ||
          definition.entity_type === "SERVICE_TICKET") &&
        definition.is_active &&
        (!definition.service_type || definition.service_type.toUpperCase() === "REPAIR"),
    )
    .sort((left, right) => left.display_order - right.display_order);
  const posMode = merchant?.pos_complexity_level || "SIMPLE";
  const isMini = posMode === "MINI";
  const isSimple = posMode === "SIMPLE";
  const isComplex = posMode === "COMPLEX";

  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<RepairOrder | null>(null);
  const [selected, setSelected] = useState<RepairOrder | null>(null);
  const [partWorkItemId, setPartWorkItemId] = useState("");
  const [partOpen, setPartOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("UNPAID");
  const [depositAmount, setDepositAmount] = useState("0");
  const [partSource, setPartSource] = useState("NONE");
  const [laborFee, setLaborFee] = useState("0");
  const waitingStartDate = currentDateOnly(currentShop?.timezone);
  const [waitingDays, setWaitingDays] = useState(0);
  const [waitingEndDate, setWaitingEndDate] = useState(() => waitingStartDate);
  const [partIds, setPartIds] = useState<string[]>([]);
  const [partQuantities, setPartQuantities] = useState<Record<string, string>>({});
  const [partWorkItemIndexes, setPartWorkItemIndexes] = useState<Record<string, number>>({});
  const [serviceLines, setServiceLines] = useState<ServiceLineDraft[]>([
    { serviceId: "", quantity: "1", workItemIndex: 0 },
  ]);
  const [priority, setPriority] = useState("NORMAL");
  const [promotionId, setPromotionId] = useState("");
  const [invoicePreview, setInvoicePreview] = useState(false);
  const [thermalPreviewBusy, setThermalPreviewBusy] = useState(false);
  const [thermalPreviewMessage, setThermalPreviewMessage] = useState("");
  const [thermalPreviewError, setThermalPreviewError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [additionalIssues, setAdditionalIssues] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([""]);
  const [workItemNote, setWorkItemNote] = useState("");
  const [repairNote, setRepairNote] = useState("");
  const [ticketFields, setTicketFields] = useState<Record<string, unknown>>({});
  const [workItemFields, setWorkItemFields] = useState<Record<string, unknown>>({});
  const [showMiniAdvanced, setShowMiniAdvanced] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [activeSection, setActiveSection] = useState<
    "customer-device" | "services-parts" | "payment-total"
  >("customer-device");

  const filteredVariants = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    return variants.data.filter((item) => {
      if (!item.is_stock_tracked) return false;
      if (!q) return true;
      return (
        item.product_name?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q)
      );
    });
  }, [variants.data, partSearch]);

  function resetCreateForm() {
    setAdditionalWorkItems([]);
    setPartIds([]);
    setPartQuantities({});
    setPartWorkItemIndexes({});
    setPartSource("NONE");
    setServiceLines([{ serviceId: "", quantity: "1", workItemIndex: 0 }]);
    setPaymentStatus("UNPAID");
    setDepositAmount("0");
    setTicketFields({});
    setWorkItemFields({});
    setShowMiniAdvanced(false);
    setPartSearch("");
    setActiveSection("customer-device");
  }

  const [additionalWorkItems, setAdditionalWorkItems] = useState<
    Array<{
      id: string;
      deviceType: string;
      manufacturer: string;
      model: string;
      serialNumber: string;
      issueDescription: string;
      issues: string[];
      conditions: string[];
      note: string;
      additionalFee: string;
      waitingDays: number;
      waitingEndDate: string;
      fields: Record<string, unknown>;
    }>
  >([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      let syncQueuedRepair = false;
      if (!currentShop)
        throw new Error("Select a shop in the sidebar before creating a repair ticket.");
      const number = `REP-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
      const requestedPaymentStatus = String(form.get("payment_status") || "UNPAID");
      const requestedDeposit = paymentStatus === "DEPOSIT_PAID" ? depositAmount : "0";
      const requestedPaymentTypeId = String(form.get("deposit_payment_type_id") || "");
      const requestedPaymentType = usablePaymentTypes.find(
        (item) => item.id === requestedPaymentTypeId,
      );
      const workItemIds = [crypto.randomUUID(), ...additionalWorkItems.map((item) => item.id)];
      const imageNames = ["images-ticket", ...workItemIds.map((_, index) => `images-${index}`)];
      const imageGroups = await Promise.all(
        imageNames.map((name) =>
          prepareImageSubmissions(form, name, {
            deferUploads: offline.status === "offline" || !navigator.onLine,
          }),
        ),
      );
      const preparedImages = imageGroups.flatMap((group, index) =>
        group.map((image) => ({
          work_item_id: index === 0 ? undefined : workItemIds[index - 1],
          ...image,
        })),
      );
      const images = preparedImages.map((image) => ({
        work_item_id: image.work_item_id,
        image_url: image.offline_upload
          ? imageUploadMarker(image.offline_upload.id)
          : image.image_url,
        source_type: image.source_type,
        filename: image.filename,
        content_type: image.content_type,
      }));
      const offlineImageUploads = preparedImages.flatMap((image) =>
        image.offline_upload ? [image.offline_upload] : [],
      );
      const localImages = preparedImages.map((image) => ({
        work_item_id: image.work_item_id,
        image_url: image.offline_upload
          ? `data:${image.offline_upload.content_type};base64,${image.offline_upload.data_base64}`
          : image.image_url,
        source_type: image.source_type,
        filename: image.filename,
        content_type: image.content_type,
      }));
      const body = {
        idempotency_key: `repair-ticket:${number}`,
        order_number: number,
        shop_id: currentShop.id,
        priority: String(form.get("priority") || priority || "NORMAL"),
        device: {
          device_type: String(form.get("device_type")),
          manufacturer: String(form.get("manufacturer") || "") || undefined,
          model: String(form.get("model") || "") || undefined,
          serial_number: serialNumber.trim() || undefined,
        },
        issue_description: issueDescription,
        work_items: [
          {
            id: workItemIds[0],
            type: "DEVICE",
            device: {
              device_type: String(form.get("device_type")),
              manufacturer: String(form.get("manufacturer") || "") || undefined,
              model: String(form.get("model") || "") || undefined,
              serial_number: serialNumber.trim() || undefined,
            },
            issue_description: issueDescription,
            issues: [issueDescription, ...additionalIssues]
              .map((value) => value.trim())
              .filter(Boolean),
            conditions: conditions.map((value) => value.trim()).filter(Boolean),
            note: workItemNote.trim() || undefined,
            additional_fee: laborFee || "0",
            waiting_days: waitingDays,
            waiting_end_date: waitingEndDate,
            fields: workItemFields,
          },
          ...additionalWorkItems.map((item, index) => ({
            id: workItemIds[index + 1],
            type: "DEVICE",
            device: {
              device_type: item.deviceType,
              manufacturer: item.manufacturer || undefined,
              model: item.model || undefined,
              serial_number: item.serialNumber || undefined,
            },
            issue_description: item.issueDescription,
            issues: [item.issueDescription, ...item.issues]
              .map((value) => value.trim())
              .filter(Boolean),
            conditions: item.conditions.map((value) => value.trim()).filter(Boolean),
            note: item.note.trim() || undefined,
            additional_fee: item.additionalFee || "0",
            waiting_days: item.waitingDays,
            waiting_end_date: item.waitingEndDate,
            fields: item.fields,
          })),
        ],
        fields: ticketFields,
        customer_name: String(form.get("customer_name") || "") || undefined,
        customer_phone: String(form.get("customer_phone") || "") || undefined,
        service_id: serviceLines.find((line) => line.serviceId)?.serviceId || undefined,
        service_items: serviceLines
          .filter((line) => line.serviceId)
          .map((line) => ({
            work_item_id: workItemIds[line.workItemIndex] ?? workItemIds[0],
            service_id: line.serviceId,
            quantity: line.quantity || "1",
          })),
        additional_fee: "0",
        payment_status: requestedPaymentStatus,
        deposit_amount: requestedDeposit,
        payment_type_id: requestedPaymentType?.id,
        payment_method: requestedPaymentType?.name,
        promotion_id: String(form.get("promotion_id") || "") || undefined,
        note: String(form.get("note") || "") || undefined,
        parts: partIds.map((variantId) => ({
          work_item_id:
            partWorkItemIndexes[variantId] === -1
              ? undefined
              : (workItemIds[partWorkItemIndexes[variantId] ?? 0] ?? workItemIds[0]),
          variant_id: variantId,
          quantity: partQuantities[variantId] ?? "1",
        })),
        images,
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to save a repair ticket while disconnected.");
      }
      if (requestedPaymentStatus !== "UNPAID" && !requestedPaymentType) {
        throw new Error("Select an active payment type.");
      }
      if (
        requestedPaymentStatus !== "UNPAID" &&
        requestedPaymentType?.category_code !== "CASH" &&
        offline.status === "offline"
      ) {
        throw new Error("External repair payment authorization requires a connection.");
      }
      if (offline.scope && offline.storageAvailable) {
        const repairID = crypto.randomUUID();
        const receivedAt = new Date().toISOString();
        const service = services.data.find(
          (item) => item.id === serviceLines.find((line) => line.serviceId)?.serviceId,
        );
        const serviceLabor = serviceLines.reduce((sum, line) => {
          const catalogItem = services.data.find((item) => item.id === line.serviceId);
          return sum + Number(catalogItem?.labor_fee ?? 0) * Number(line.quantity || 1);
        }, 0);
        const projectedTotal = estimatedFinalTotal.toFixed(2);
        const queued = await queueRepairTicketCreate(
          offline.scope,
          currentShop.id,
          body,
          {
            id: repairID,
            service_order_id: `offline-service-${repairID}`,
            shop_id: currentShop.id,
            device_id: `offline-device-${repairID}`,
            order_number: number,
            status: "RECEIVED",
            issue_description: issueDescription,
            received_at: receivedAt,
            customer_name: String(form.get("customer_name") || "") || undefined,
            customer_phone: String(form.get("customer_phone") || "") || undefined,
            service_id: service?.id,
            labor_fee: serviceLabor.toFixed(2),
            additional_fee: (
              Number(laborFee || 0) +
              additionalWorkItems.reduce((sum, item) => sum + Number(item.additionalFee || 0), 0)
            ).toFixed(2),
            subtotal: estimatedNet.toFixed(2),
            discount_total: estimatedDiscount.toFixed(2),
            tax_amount: estimatedTax.toFixed(2),
            total_cost: projectedTotal,
            deposit_paid: requestedDeposit,
            payment_status: requestedPaymentStatus,
            note: String(form.get("note") || "") || undefined,
          },
          { offlineImageUploads, localImages },
        );
        repairs.updateLocal((items) => [
          queued.projectedRepair,
          ...items.filter((item) => item.id !== queued.projectedRepair.id),
        ]);
        setNotice("Repair ticket saved locally and will synchronize when connected.");
        syncQueuedRepair = navigator.onLine;
      } else {
        await post("/repairs/tickets", body);
      }
      setOpen(false);
      resetCreateForm();
      if (syncQueuedRepair) void offline.syncNow();
      else if (!offline.scope || !offline.storageAvailable) await repairs.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create repair ticket.");
    }
  }
  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body = {
        repair_order_id: selected.id,
        work_item_id: String(form.get("work_item_id") || "") || undefined,
        variant_id: String(form.get("variant_id")),
        quantity: String(form.get("quantity")),
        status: "USED",
        promotion_id: String(form.get("promotion_id") || "") || undefined,
      };
      if (offline.status === "offline" && (!offline.scope || !offline.storageAvailable)) {
        throw new Error("Offline storage is required to use a repair part while disconnected.");
      }
      if (offline.scope && offline.storageAvailable) {
        await queueRepairPart(offline.scope, selected, body);
        const unitPrice = Number(
          variants.data.find((item) => item.id === body.variant_id)?.price ?? 0,
        );
        const nextTotal = Number(selected.total_cost ?? 0) + unitPrice * Number(body.quantity);
        const projected = await updateRepairProjection(offline.scope, selected, {
          total_cost: nextTotal.toFixed(2),
        });
        await addPendingRepairChild(offline.scope, selected, "parts", {
          id: crypto.randomUUID(),
          ...body,
          unit_price: variants.data.find((item) => item.id === body.variant_id)?.price ?? "0",
        });
        if (navigator.onLine) await offline.syncNow();
        setSelected(projected);
        setDetails(projected);
        await variants.reload();
      } else await post(`/repairs/orders/${selected.id}/parts`, body);
      setPartOpen(false);
      setDetails(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to use this stock item.");
    }
  }
  const selectedServiceLines = serviceLines
    .map((line) => ({
      ...line,
      service: services.data.find((item) => item.id === line.serviceId),
    }))
    .filter((line): line is ServiceLineDraft & { service: ServiceCatalog } =>
      Boolean(line.service),
    );
  const selectedService = selectedServiceLines[0]?.service;
  const selectedPromotion = promotions.data.find((item) => item.id === promotionId);
  const estimatedPartsTotal = partIds.reduce(
    (sum, id) =>
      sum +
      Number(variants.data.find((item) => item.id === id)?.price ?? 0) *
        Number(partQuantities[id] ?? 1),
    0,
  );
  const catalogLaborFee = selectedServiceLines.reduce(
    (sum, line) => sum + Number(line.service.labor_fee) * Number(line.quantity || 1),
    0,
  );
  const allAdditionalFees =
    Number(laborFee || 0) +
    additionalWorkItems.reduce((sum, item) => sum + Number(item.additionalFee || 0), 0);
  const serviceFeeSubtotal = catalogLaborFee + allAdditionalFees;
  const estimatedDiscount = selectedPromotion
    ? selectedPromotion.promotion_type === "PERCENTAGE"
      ? (serviceFeeSubtotal * Number(selectedPromotion.value)) / 100
      : Math.min(serviceFeeSubtotal, Number(selectedPromotion.value))
    : 0;
  const estimatedNet = serviceFeeSubtotal - estimatedDiscount + estimatedPartsTotal;
  const estimatedTax = currentShop?.include_tax
    ? (estimatedNet * Number(currentShop.tax_rate || 0)) / 100
    : 0;
  const estimatedFinalTotal = estimatedNet + estimatedTax;
  function removeAdditionalWorkItem(index: number) {
    setAdditionalWorkItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPartWorkItemIndexes((current) =>
      Object.fromEntries(
        Object.entries(current).map(([variantId, itemIndex]) => [
          variantId,
          itemIndex === index + 1 ? 0 : itemIndex > index + 1 ? itemIndex - 1 : itemIndex,
        ]),
      ),
    );
    setServiceLines((current) =>
      current.map((line) => ({
        ...line,
        workItemIndex:
          line.workItemIndex === index + 1
            ? 0
            : line.workItemIndex > index + 1
              ? line.workItemIndex - 1
              : line.workItemIndex,
      })),
    );
  }
  const previewWorkItems: RepairWorkItem[] = [
    {
      id: "repair-preview-work-item-1",
      service_order_id: "repair-preview-service-order",
      sequence_number: 1,
      type: "DEVICE",
      status: "OPEN",
      form_version: 1,
      device: {
        id: "repair-preview-device-1",
        device_type: deviceType,
        manufacturer: manufacturer || undefined,
        model: deviceModel || undefined,
        serial_number: serialNumber || undefined,
      },
      issue_description: issueDescription,
      issues: [issueDescription, ...additionalIssues].map((value) => value.trim()).filter(Boolean),
      conditions: conditions.map((value) => value.trim()).filter(Boolean),
      note: workItemNote.trim() || undefined,
      additional_fee: laborFee || "0",
      waiting_start_date: waitingStartDate,
      waiting_end_date: waitingEndDate,
      waiting_days: waitingDays,
      fields: workItemFields,
      financials: {
        subtotal: "0.00",
        discount_total: "0.00",
        tax_amount: "0.00",
        total: "0.00",
        paid: "0.00",
        balance: "0.00",
      },
    },
    ...additionalWorkItems.map((item, index) => ({
      id: `repair-preview-work-item-${index + 2}`,
      service_order_id: "repair-preview-service-order",
      sequence_number: index + 2,
      type: "DEVICE",
      status: "OPEN",
      form_version: 1,
      device: {
        id: `repair-preview-device-${index + 2}`,
        device_type: item.deviceType,
        manufacturer: item.manufacturer || undefined,
        model: item.model || undefined,
        serial_number: item.serialNumber || undefined,
      },
      issue_description: item.issueDescription,
      issues: [item.issueDescription, ...item.issues].map((value) => value.trim()).filter(Boolean),
      conditions: item.conditions.map((value) => value.trim()).filter(Boolean),
      note: item.note.trim() || undefined,
      additional_fee: item.additionalFee || "0",
      waiting_start_date: waitingStartDate,
      waiting_end_date: item.waitingEndDate,
      waiting_days: item.waitingDays,
      fields: item.fields,
      financials: {
        subtotal: "0.00",
        discount_total: "0.00",
        tax_amount: "0.00",
        total: "0.00",
        paid: "0.00",
        balance: "0.00",
      },
    })),
  ];
  previewWorkItems.forEach((item, index) => {
    const servicesSubtotal = selectedServiceLines
      .filter((line) => line.workItemIndex === index)
      .reduce((sum, line) => sum + Number(line.service.labor_fee) * Number(line.quantity || 1), 0);
    const partsSubtotal = partIds
      .filter((id) => (partWorkItemIndexes[id] ?? 0) === index)
      .reduce(
        (sum, id) =>
          sum +
          Number(variants.data.find((variant) => variant.id === id)?.price ?? 0) *
            Number(partQuantities[id] ?? 1),
        0,
      );
    const subtotal = servicesSubtotal + partsSubtotal + Number(item.additional_fee || 0);
    const allocationGross = serviceFeeSubtotal + estimatedPartsTotal;
    const ratio = allocationGross > 0 ? subtotal / allocationGross : 0;
    const discount = estimatedDiscount * ratio;
    const tax = estimatedTax * ratio;
    const total = subtotal - discount + tax;
    item.financials = {
      subtotal: subtotal.toFixed(2),
      discount_total: discount.toFixed(2),
      tax_amount: tax.toFixed(2),
      total: total.toFixed(2),
      paid: "0.00",
      balance: total.toFixed(2),
    };
  });
  const ticketWaitingEndDate = [
    waitingEndDate,
    ...additionalWorkItems.map((item) => item.waitingEndDate),
  ]
    .filter(Boolean)
    .sort()
    .at(-1);
  const ticketWaitingDays = dateOnlyDaysBetween(
    waitingStartDate,
    ticketWaitingEndDate ?? waitingStartDate,
  );
  const repairInvoice: Invoice = {
    id: "repair-preview",
    number: "REPAIR-PREVIEW",
    customer: customerName || "Repair customer preview",
    customerPhone,
    currencyCode: merchant?.default_currency_code ?? "USD",
    shopName: currentShop?.name,
    shopTimezone: currentShop?.timezone,
    logoUrl: currentShop?.logo_url,
    showLogo: currentShop?.show_logo_in_printed_invoice !== false,
    showDeviceType: currentShop?.show_device_type_in_repair_invoice === true,
    showDeviceBrand: currentShop?.show_device_brand_in_repair_invoice === true,
    waitingStartDate,
    waitingEndDate: ticketWaitingEndDate,
    waitingDays: ticketWaitingDays,
    shopAddress: formatShopAddress(currentShop?.address),
    shopContact: currentShop?.contact_info,
    footerNote: currentShop?.footer_note,
    receiptNote: currentShop?.receipt_note,
    taxLabel: currentShop?.tax_label,
    createdAt: new Date().toISOString(),
    status: "Pending",
    kind: "repair",
    paymentStatus:
      paymentStatus === "PAID" ? "Paid" : paymentStatus === "DEPOSIT_PAID" ? "Deposit" : "Unpaid",
    amountPaid:
      paymentStatus === "PAID"
        ? estimatedFinalTotal
        : paymentStatus === "DEPOSIT_PAID"
          ? Math.max(0, Number(depositAmount || 0))
          : 0,
    balanceDue:
      paymentStatus === "PAID"
        ? 0
        : Math.max(
            0,
            estimatedFinalTotal -
              (paymentStatus === "DEPOSIT_PAID" ? Number(depositAmount || 0) : 0),
          ),
    modelNumber: [
      ...(currentShop?.show_device_type_in_repair_invoice === true ? [deviceType] : []),
      ...(currentShop?.show_device_brand_in_repair_invoice === true ? [manufacturer] : []),
      deviceModel,
    ]
      .filter(Boolean)
      .join(" · "),
    errorDescription: issueDescription,
    imeiNumber: serialNumber,
    subtotal: estimatedNet,
    discount: estimatedDiscount,
    tax: estimatedTax,
    total: estimatedFinalTotal,
    note: repairNote,
    work_items: previewWorkItems.map((item) => ({
      id: item.id,
      sequence_number: item.sequence_number,
      type: item.type,
      status: item.status,
      form_version: item.form_version ?? 1,
      device_type: item.device.device_type,
      manufacturer: item.device.manufacturer,
      model: item.device.model,
      serial_number: item.device.serial_number,
      issue_description: item.issue_description,
      note: item.note,
      fields: Object.fromEntries(
        Object.entries(item.fields ?? {}).filter(([key]) =>
          workItemDefinitions.some(
            (definition) => definition.printable && definition.field_code === key,
          ),
        ),
      ),
      additional_fee: Number(item.additional_fee || 0) > 0 ? item.additional_fee : undefined,
      waiting_start_date: item.waiting_start_date,
      waiting_end_date: item.waiting_end_date,
      waiting_days: item.waiting_days,
      subtotal: item.financials?.subtotal,
      discount_total: item.financials?.discount_total,
      tax_amount: item.financials?.tax_amount,
      total: item.financials?.total,
      paid: item.financials?.paid,
      balance: item.financials?.balance,
    })),
    ticket_fields: Object.fromEntries(
      Object.entries(ticketFields).filter(([key]) =>
        ticketDefinitions.some(
          (definition) => definition.printable && definition.field_code === key,
        ),
      ),
    ),
    items: [
      ...selectedServiceLines.map((line) => ({
        work_item_id: previewWorkItems[line.workItemIndex]?.id,
        name: `${line.service.code} · ${line.service.name}`,
        quantity: Number(line.quantity || 1),
        price: Number(line.service.labor_fee),
      })),
      ...partIds.map((id) => {
        const item = variants.data.find((variant) => variant.id === id);
        return {
          work_item_id: previewWorkItems[partWorkItemIndexes[id] ?? 0]?.id,
          name: [item?.product_name, item?.name].filter(Boolean).join(" · ") || "Replacement part",
          quantity: Number(partQuantities[id] ?? 1),
          price: Number(item?.price ?? 0),
        };
      }),
    ],
  };
  async function thermalPrintPreview() {
    setThermalPreviewMessage("");
    setThermalPreviewError("");
    const printer = getActivePrinter();
    if (!printer) {
      setThermalPreviewError("Connect a printer in Settings → Printer before thermal printing.");
      return;
    }
    setThermalPreviewBusy(true);
    try {
      await printInvoice(
        printer,
        repairInvoice,
        storedPrinterFontSizePx(currentShop),
        storedPrinterPaperWidthMm(currentShop),
      );
      setThermalPreviewMessage("Repair ticket invoice sent to the thermal printer.");
    } catch (reason) {
      setThermalPreviewError(reason instanceof Error ? reason.message : "Thermal printing failed.");
    } finally {
      setThermalPreviewBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={t("repairs.eyebrow")}
        title={t("repairs.repair_desk_title")}
        description={
          offline.status === "offline"
            ? t("repairs.repair_desk_desc")
            : t("repairs.description")
        }
        action={
          <div className="repair-desk-actions">
            <Button
              icon="repair"
              onClick={() => setOpen(true)}
              aria-label="Create repair ticket"
            >
              {offline.status === "offline" ? t("repairs.save_ticket") : t("repairs.new_ticket")}
            </Button>
            <Link className="button button-secondary" href="/repairs/catalog">
              {t("nav.repair_catalog", "Repair catalog")}
            </Link>
          </div>
        }
      />
      {notice && <div className="notice">{notice}</div>}
      <ListControls
        search={repairQuery}
        onSearchChange={setRepairQuery}
        searchPlaceholder={t("common.search_placeholder")}
        filter={repairFilter}
        onFilterChange={setRepairFilter}
        filterLabel={t("common.filter")}
        filterOptions={[
          { value: "ALL", label: t("common.all") },
          ...statuses.map((status) => ({ value: status, label: statusLabels[status] })),
        ]}
        sort={repairSort}
        onSortChange={setRepairSort}
        sortLabel={t("common.actions")}
        sortOptions={[
          { value: "NEWEST", label: "Newest first" },
          { value: "OLDEST", label: "Oldest first" },
          { value: "CUSTOMER", label: `${t("invoices.customer")} A–Z` },
          { value: "TICKET", label: t("repairs.ticket_id") },
        ]}
      />
      <div className="repair-summary">
        <div>
          <span className="stat-icon blue">
            <Icon name="repair" />
          </span>
          <p>{t("repairs.status_received")}</p>
          <strong>{repairs.data.filter((item) => item.status === "RECEIVED").length}</strong>
        </div>
        <div>
          <span className="stat-icon amber">
            <Icon name="history" />
          </span>
          <p>{t("repairs.status_in_progress")}</p>
          <strong>{repairs.data.filter((item) => item.status === "IN_PROGRESS").length}</strong>
        </div>
        <div>
          <span className="stat-icon amber">
            <Icon name="package" />
          </span>
          <p>{t("repairs.status_repaired")}</p>
          <strong>
            {repairs.data.filter((item) => item.status === "READY_FOR_PICKUP").length}
          </strong>
        </div>
        <div>
          <span className="stat-icon mint">
            <Icon name="check" />
          </span>
          <p>{t("repairs.status_delivered")}</p>
          <strong>{repairs.data.filter((item) => item.status === "COMPLETED").length}</strong>
        </div>
        <div>
          <span className="stat-icon red">
            <Icon name="close" />
          </span>
          <p>{t("invoices.refunded")}</p>
          <strong>{repairs.data.filter((item) => item.status === "REFUNDED").length}</strong>
        </div>
      </div>
      <div className="table-card">
        {repairs.loading ? (
          <Loading />
        ) : repairs.error ? (
          <EmptyState title="Repairs could not load" message={repairs.error} />
        ) : visibleRepairs.length === 0 ? (
          <EmptyState
            icon="repair"
            title={t("repairs.title")}
            message={t("repairs.description")}
            action={
              <Button
                icon="repair"
                onClick={() => setOpen(true)}
                aria-label="Create repair ticket"
              >
                {offline.status === "offline" ? t("repairs.save_ticket") : t("repairs.new_ticket")}
              </Button>
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("repairs.ticket_id")}</th>
                <th>{t("repairs.reported_issue")}</th>
                <th>{t("repairs.status_received")}</th>
                <th>{t("repairs.waiting_time")}</th>
                <th>{t("common.status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {repairsPagination.pageItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.order_number}</strong>
                    {offline.operations.some(
                      (operation) =>
                        operation.entityType === "REPAIR_ORDER" &&
                        operation.entityId === item.id &&
                        operation.operationType === "CREATE" &&
                        ["PENDING", "SYNCING", "FAILED", "BLOCKED"].includes(operation.status),
                    ) && (
                      <>
                        <br />
                        <Badge tone="warning">Pending sync</Badge>
                      </>
                    )}
                  </td>
                  <td>
                    <div>{item.issue_description}</div>
                    {(item.work_items?.length ?? 0) > 1 && (
                      <small>
                        {item.work_items?.length} work items ·{" "}
                        {item.work_items
                          ?.map((workItem) => workItem.device.device_type)
                          .filter(Boolean)
                          .join(", ")}
                      </small>
                    )}
                  </td>
                  <td>{formatShopDateTime(item.received_at, currentShop?.timezone)}</td>
                  <td>{formatDateOnly(item.waiting_end_date)}</td>
                  <td>
                    <Badge tone={statusTone(item.status)}>
                      {statusLabels[item.status] ?? item.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      {isMerchant && (
                        <Link className="text-link" href={`/repairs/${item.id}/edit`}>
                          Edit
                        </Link>
                      )}
                      <button
                        title="Use stock part"
                        disabled={
                          (offline.status === "offline" && !offline.storageAvailable) ||
                          ["COMPLETED", "REFUNDED"].includes(item.status)
                        }
                        onClick={() => {
                          setSelected(item);
                          setPartWorkItemId(item.work_items?.[0]?.id ?? "");
                          setPartOpen(true);
                        }}
                      >
                        <Icon name="package" size={15} />
                      </button>
                      <button title="Open ticket" onClick={() => setDetails(item)}>
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
        pageIndex={repairsPagination.pageIndex}
        pageSize={repairsPagination.pageSize}
        totalItems={repairsPagination.totalItems}
        totalPages={repairsPagination.totalPages}
        itemLabel="repair tickets"
        onPageChange={repairsPagination.setPageIndex}
      />
      {/* Sub-renderers for clean modularity */}
      {(() => null)()}
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetCreateForm();
        }}
        title="New repair ticket"
        description={
          isMini
            ? "Fast ticket intake for standard device repair."
            : isSimple
              ? "Register customer, device, and service details."
              : "Register customer, multiple devices, custom fields, and financial details."
        }
        className={`repair-ticket-modal repair-ticket-create-modal mode-${posMode.toLowerCase()}`}
      >
        <Form className="repair-ticket-form" onSubmit={create}>
          {/* Mode Header Banner */}
          <div className={`repair-mode-banner banner-${posMode.toLowerCase()}`}>
            <div className={`repair-mode-badge ${posMode.toLowerCase()}`}>
              <span className="badge-dot" />
              <strong>{isMini ? "POS-Mini" : isSimple ? "POS-Simple" : "POS-Complex"}</strong>
              <span>
                · {isMini ? "Fast Intake" : isSimple ? "Standard Intake" : "Enterprise Depot"}
                {additionalWorkItems.length > 0 ? ` (${additionalWorkItems.length + 1} devices)` : ""}
              </span>
            </div>
            <span className="repair-mode-hint">
              {isMini
                ? "Essential intake upfront. Additional details can be expanded."
                : isSimple
                  ? "Streamlined intake for customer, device, and services."
                  : "Multi-device tracking, custom fields, and parts allocation."}
            </span>
          </div>

          {/* COMPLEX Mode Section Navigator */}
          {isComplex && (
            <nav className="repair-section-nav" aria-label="Ticket sections">
              <button
                type="button"
                className={`repair-nav-tab ${activeSection === "customer-device" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("customer-device");
                  document.getElementById("ticket-section-customer")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="step-num">1</span>
                <span>Customer & Devices</span>
                {additionalWorkItems.length > 0 && (
                  <span className="step-count">{additionalWorkItems.length + 1} devices</span>
                )}
              </button>
              <button
                type="button"
                className={`repair-nav-tab ${activeSection === "services-parts" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("services-parts");
                  document.getElementById("ticket-section-services")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="step-num">2</span>
                <span>Services & Parts</span>
                {(serviceLines.some((line) => line.serviceId) || partIds.length > 0) && (
                  <span className="step-count">
                    {serviceLines.filter((line) => line.serviceId).length + partIds.length} items
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`repair-nav-tab ${activeSection === "payment-total" ? "active" : ""}`}
                onClick={() => {
                  setActiveSection("payment-total");
                  document.getElementById("ticket-section-payment")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span className="step-num">3</span>
                <span>Payment & Total</span>
                <span className="step-total">
                  {formatMoney(estimatedFinalTotal, merchant?.default_currency_code)}
                </span>
              </button>
            </nav>
          )}

          {/* ========================================================================= */}
          {/* POS-MINI MODE: Streamlined, low-friction, single-view intake             */}
          {/* ========================================================================= */}
          {isMini && (
            <>
              <section className="configuration-section repair-form-card">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="repair" />
                    <div>
                      <h3>Customer & Device Intake</h3>
                      <p className="repair-form-card-subtitle">
                        {additionalWorkItems.length > 0
                          ? `Primary contact and ${additionalWorkItems.length + 1} devices`
                          : "Primary contact and device specifications"}
                      </p>
                    </div>
                  </div>
                  {additionalWorkItems.length > 0 && (
                    <span className="badge info">{additionalWorkItems.length + 1} devices</span>
                  )}
                </div>
                <div className="form-grid">
                  <Field label="Customer name">
                    <input
                      name="customer_name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      required
                      placeholder="Customer name"
                    />
                  </Field>
                  <Field label="Customer phone">
                    <input
                      name="customer_phone"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Customer phone"
                    />
                  </Field>
                  <Field label="Device type">
                    <select
                      name="device_type"
                      value={deviceType}
                      onChange={(event) => setDeviceType(event.target.value)}
                      required
                    >
                      <option value="">Choose type</option>
                      <option>PHONE</option>
                      <option>TABLET</option>
                      <option>LAPTOP</option>
                      <option>APPLIANCE</option>
                      <option>OTHER</option>
                    </select>
                  </Field>
                  <Field label="Manufacturer">
                    <select
                      name="manufacturer"
                      value={manufacturer}
                      onChange={(event) => setManufacturer(event.target.value)}
                    >
                      <option value="">Choose brand</option>
                      {brands.data
                        .filter((brand) => brand.is_active)
                        .sort((left, right) => left.name.localeCompare(right.name))
                        .map((brand) => (
                          <option value={brand.name} key={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Model">
                    <input
                      name="model"
                      value={deviceModel}
                      onChange={(event) => setDeviceModel(event.target.value)}
                      placeholder="e.g. Galaxy S24, iPhone 15"
                    />
                  </Field>
                  <Field label="IMEI / serial number">
                    <BarcodeScanner
                      value={serialNumber}
                      onChange={setSerialNumber}
                      placeholder="Enter or scan IMEI / serial number"
                    />
                  </Field>
                  <RepeatableDeviceValues
                    label="Issue"
                    values={[issueDescription, ...additionalIssues]}
                    presets={issuePresets.data}
                    required
                    onChange={(values) => {
                      setIssueDescription(values[0] ?? "");
                      setAdditionalIssues(values.slice(1));
                    }}
                  />
                  <Field label="Price">
                    <input
                      name="additional_fee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={laborFee}
                      onChange={(event) => setLaborFee(event.target.value)}
                      required
                      placeholder="0.00"
                    />
                  </Field>
                </div>

                {/* Additional devices in POS-Mini mode */}
                {additionalWorkItems.length > 0 && (
                  <div className="repair-device-stack" style={{ marginTop: "16px" }}>
                    {additionalWorkItems.map((item, index) => (
                      <div className="configuration-card repair-device-card" key={item.id}>
                        <div className="repair-device-card-header">
                          <div>
                            <h4>Device {index + 2}</h4>
                            <small>{item.deviceType || "Additional device"}</small>
                          </div>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => removeAdditionalWorkItem(index)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-grid">
                          <Field label="Device type">
                            <select
                              value={item.deviceType}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, deviceType: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                              required
                            >
                              <option value="">Choose type</option>
                              <option>PHONE</option>
                              <option>TABLET</option>
                              <option>LAPTOP</option>
                              <option>APPLIANCE</option>
                              <option>OTHER</option>
                            </select>
                          </Field>
                          <Field label="Manufacturer">
                            <select
                              value={item.manufacturer}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, manufacturer: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                            >
                              <option value="">Choose brand</option>
                              {brands.data
                                .filter((brand) => brand.is_active)
                                .sort((left, right) => left.name.localeCompare(right.name))
                                .map((brand) => (
                                  <option value={brand.name} key={brand.id}>
                                    {brand.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <Field label="Model">
                            <input
                              value={item.model}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index ? { ...value, model: event.target.value } : value,
                                  ),
                                )
                              }
                              placeholder="e.g. Galaxy S24, iPhone 15"
                            />
                          </Field>
                          <Field label="IMEI / serial number">
                            <BarcodeScanner
                              value={item.serialNumber}
                              onChange={(serialNumber) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index ? { ...value, serialNumber } : value,
                                  ),
                                )
                              }
                              placeholder="Enter or scan IMEI / serial number"
                            />
                          </Field>
                          <RepeatableDeviceValues
                            label="Issue"
                            values={[item.issueDescription, ...item.issues]}
                            presets={issuePresets.data}
                            required
                            onChange={(values) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...value,
                                        issueDescription: values[0] ?? "",
                                        issues: values.slice(1),
                                      }
                                    : value,
                                ),
                              )
                            }
                          />
                          <Field label="Price">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.additionalFee}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, additionalFee: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                              placeholder="0.00"
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="repair-add-device"
                  style={{ marginTop: "12px" }}
                  onClick={() =>
                    setAdditionalWorkItems((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        deviceType: "",
                        manufacturer: "",
                        model: "",
                        serialNumber: "",
                        issueDescription: "",
                        issues: [],
                        conditions: [""],
                        note: "",
                        additionalFee: "0",
                        waitingDays: 0,
                        waitingEndDate: waitingStartDate,
                        fields: {},
                      },
                    ])
                  }
                >
                  + Add another device to this ticket
                </button>
              </section>

              <section className="configuration-section repair-form-card">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="tag" />
                    <div>
                      <h3>Payment</h3>
                      <p className="repair-form-card-subtitle">Initial payment status & method</p>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Payment status">
                    <select
                      name="payment_status"
                      value={paymentStatus}
                      onChange={(event) => setPaymentStatus(event.target.value)}
                    >
                      <option value="UNPAID">Unpaid</option>
                      <option value="DEPOSIT_PAID">Deposit Paid</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </Field>
                  {paymentStatus === "DEPOSIT_PAID" && (
                    <Field label="Deposit amount">
                      <input
                        name="deposit_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                        required
                      />
                    </Field>
                  )}
                  {paymentStatus !== "UNPAID" && (
                    <Field label="Payment type">
                      <select
                        name="deposit_payment_type_id"
                        defaultValue={
                          usablePaymentTypes.find((item) => item.category_code === "CASH")?.id
                        }
                        required
                      >
                        {usablePaymentTypes.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} · {item.category_code}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>

                <div className="repair-summary-card">
                  <div className="repair-summary-header">
                    <span>
                      Estimated Total
                      {additionalWorkItems.length > 0
                        ? ` (${additionalWorkItems.length + 1} devices)`
                        : ""}
                    </span>
                    <strong>{formatMoney(estimatedFinalTotal, merchant?.default_currency_code)}</strong>
                  </div>
                  <div className="repair-summary-turnaround">
                    <span>Projected Turnaround</span>
                    <strong>{formatDateOnly(ticketWaitingEndDate)} ({ticketWaitingDays} days)</strong>
                  </div>
                </div>
              </section>

              <button
                type="button"
                className="repair-mini-toggle"
                onClick={() => setShowMiniAdvanced(!showMiniAdvanced)}
              >
                {showMiniAdvanced
                  ? "▲ Hide additional options"
                  : "▼ Show additional options (services, parts, notes, waiting time, photos)"}
              </button>

              {showMiniAdvanced ? (
                <div className="repair-mini-advanced-drawer stack gap-3">
                  <section className="configuration-section repair-form-card">
                    <div className="repair-form-card-header">
                      <h4>Intake Details & Turnaround</h4>
                    </div>
                    <div className="form-grid">
                      <Field label="Priority">
                        <select
                          name="priority"
                          value={priority}
                          onChange={(event) => setPriority(event.target.value)}
                        >
                          <option>NORMAL</option>
                          <option>HIGH</option>
                          <option>URGENT</option>
                        </select>
                      </Field>
                      <Field label="Promotion">
                        <select
                          name="promotion_id"
                          value={promotionId}
                          onChange={(event) => setPromotionId(event.target.value)}
                        >
                          <option value="">No promotion</option>
                          {promotions.data.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <RepairWaitingFields
                        startDate={waitingStartDate}
                        initialDays={waitingDays}
                        initialEndDate={waitingEndDate}
                        daysName="waiting_days"
                        endDateName="waiting_end_date"
                        onChange={(days, endDate) => {
                          setWaitingDays(days);
                          setWaitingEndDate(endDate);
                        }}
                      />
                      <RepeatableDeviceValues
                        label="Condition"
                        values={conditions}
                        presets={conditionPresets.data}
                        onChange={setConditions}
                      />
                      <div className="wide">
                        <Field label="Device note">
                          <textarea
                            value={workItemNote}
                            onChange={(event) => setWorkItemNote(event.target.value)}
                            placeholder="Notes specific to this device"
                          />
                        </Field>
                      </div>
                      <div className="wide">
                        <Field label="Ticket note">
                          <textarea
                            name="note"
                            value={repairNote}
                            onChange={(event) => setRepairNote(event.target.value)}
                            placeholder="Additional customer or technician notes"
                          />
                        </Field>
                      </div>
                      <ImageSourceField
                        name="images-0"
                        label="Device photos"
                        multiple
                        disabled={offline.status === "offline"}
                      />
                      <ImageSourceField
                        name="images-ticket"
                        label="Ticket-level photos"
                        multiple
                        disabled={offline.status === "offline"}
                      />
                    </div>
                  </section>

                  <section className="configuration-section repair-form-card">
                    <div className="repair-form-card-header">
                      <h4>Catalog Services (Optional)</h4>
                    </div>
                    <div className="stack gap-3">
                      {serviceLines.map((line, index) => (
                        <div className="form-grid repair-service-line" key={`service-line-${index}`}>
                          <Field label={`Service ${index + 1} (optional)`}>
                            <select
                              name={index === 0 ? "service_id" : `service_id_${index}`}
                              value={line.serviceId}
                              onChange={(event) =>
                                setServiceLines((current) =>
                                  current.map((entry, lineIndex) =>
                                    lineIndex === index ? { ...entry, serviceId: event.target.value } : entry,
                                  ),
                                )
                              }
                            >
                              <option value="">No service selected</option>
                              {services.data
                                .filter((item) => item.is_active)
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.code ? `${item.code} · ` : ""}{item.name} · {formatMoney(item.labor_fee, merchant?.default_currency_code)}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          {line.serviceId && (
                            <Field label="Quantity">
                              <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={line.quantity}
                                onChange={(event) =>
                                  setServiceLines((current) =>
                                    current.map((entry, lineIndex) =>
                                      lineIndex === index ? { ...entry, quantity: event.target.value } : entry,
                                    ),
                                  )
                                }
                                required
                              />
                            </Field>
                          )}
                          {serviceLines.length > 1 && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() =>
                                setServiceLines((current) =>
                                  current.filter((_, lineIndex) => lineIndex !== index),
                                )
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-link"
                        onClick={() =>
                          setServiceLines((current) => [
                            ...current,
                            { serviceId: "", quantity: "1", workItemIndex: 0 },
                          ])
                        }
                      >
                        + Add service line
                      </button>
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <input type="hidden" name="priority" value={priority || "NORMAL"} />
                  <input type="hidden" name="promotion_id" value={promotionId} />
                  <input type="hidden" name="part_source" value={partSource || "NONE"} />
                  <input type="hidden" name="note" value={repairNote} />
                </>
              )}
            </>
          )}

          {/* ========================================================================= */}
          {/* POS-SIMPLE MODE: Clean 3-card balanced layout                             */}
          {/* ========================================================================= */}
          {isSimple && (
            <>
              {/* Card 1: Customer & Primary Device */}
              <section className="configuration-section repair-form-card">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="repair" />
                    <div>
                      <h3>1. Customer & Device Intake</h3>
                      <p className="repair-form-card-subtitle">Customer identity and device diagnostics</p>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Customer name">
                    <input
                      name="customer_name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      required
                      placeholder="Customer name"
                    />
                  </Field>
                  <Field label="Customer phone">
                    <input
                      name="customer_phone"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Customer phone"
                    />
                  </Field>
                  <Field label="Priority">
                    <select
                      name="priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    >
                      <option>NORMAL</option>
                      <option>HIGH</option>
                      <option>URGENT</option>
                    </select>
                  </Field>
                  <Field label="Receiving shop">
                    <input value={currentShop?.name ?? "No shop selected"} readOnly />
                  </Field>
                  <Field label="Device type">
                    <select
                      name="device_type"
                      value={deviceType}
                      onChange={(event) => setDeviceType(event.target.value)}
                      required
                    >
                      <option value="">Choose type</option>
                      <option>PHONE</option>
                      <option>TABLET</option>
                      <option>LAPTOP</option>
                      <option>APPLIANCE</option>
                      <option>OTHER</option>
                    </select>
                  </Field>
                  <Field label="Manufacturer">
                    <select
                      name="manufacturer"
                      value={manufacturer}
                      onChange={(event) => setManufacturer(event.target.value)}
                    >
                      <option value="">Choose brand</option>
                      {brands.data
                        .filter((brand) => brand.is_active)
                        .sort((left, right) => left.name.localeCompare(right.name))
                        .map((brand) => (
                          <option value={brand.name} key={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Model">
                    <input
                      name="model"
                      value={deviceModel}
                      onChange={(event) => setDeviceModel(event.target.value)}
                      placeholder="Model name / number"
                    />
                  </Field>
                  <Field label="IMEI / serial number">
                    <BarcodeScanner
                      value={serialNumber}
                      onChange={setSerialNumber}
                      placeholder="Enter or scan IMEI / serial number"
                    />
                  </Field>
                  <RepeatableDeviceValues
                    label="Issue"
                    values={[issueDescription, ...additionalIssues]}
                    presets={issuePresets.data}
                    required
                    onChange={(values) => {
                      setIssueDescription(values[0] ?? "");
                      setAdditionalIssues(values.slice(1));
                    }}
                  />
                  <RepeatableDeviceValues
                    label="Condition"
                    values={conditions}
                    presets={conditionPresets.data}
                    onChange={setConditions}
                  />
                  <div className="wide">
                    <Field label="Device note">
                      <textarea
                        value={workItemNote}
                        onChange={(event) => setWorkItemNote(event.target.value)}
                        placeholder="Notes specific to this device"
                      />
                    </Field>
                  </div>
                  <Field label="Price">
                    <input
                      name="additional_fee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={laborFee}
                      onChange={(event) => setLaborFee(event.target.value)}
                      required
                      placeholder="0.00"
                    />
                  </Field>
                  <RepairWaitingFields
                    startDate={waitingStartDate}
                    initialDays={waitingDays}
                    initialEndDate={waitingEndDate}
                    daysName="waiting_days"
                    endDateName="waiting_end_date"
                    onChange={(days, endDate) => {
                      setWaitingDays(days);
                      setWaitingEndDate(endDate);
                    }}
                  />
                  <ImageSourceField
                    name="images-0"
                    label="Device photos"
                    multiple
                    disabled={offline.status === "offline"}
                  />
                </div>

                {/* Additional devices if any */}
                {additionalWorkItems.length > 0 && (
                  <div className="repair-device-stack" style={{ marginTop: "16px" }}>
                    {additionalWorkItems.map((item, index) => (
                      <div className="configuration-card repair-device-card" key={item.id}>
                        <div className="repair-device-card-header">
                          <div>
                            <h4>Device {index + 2}</h4>
                            <small>{item.deviceType || "Additional device"}</small>
                          </div>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => removeAdditionalWorkItem(index)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="form-grid">
                          <Field label="Device type">
                            <select
                              value={item.deviceType}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, deviceType: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                              required
                            >
                              <option value="">Choose type</option>
                              <option>PHONE</option>
                              <option>TABLET</option>
                              <option>LAPTOP</option>
                              <option>APPLIANCE</option>
                              <option>OTHER</option>
                            </select>
                          </Field>
                          <Field label="Manufacturer">
                            <select
                              value={item.manufacturer}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, manufacturer: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                            >
                              <option value="">Choose brand</option>
                              {brands.data
                                .filter((brand) => brand.is_active)
                                .sort((left, right) => left.name.localeCompare(right.name))
                                .map((brand) => (
                                  <option value={brand.name} key={brand.id}>
                                    {brand.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <Field label="Model">
                            <input
                              value={item.model}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index ? { ...value, model: event.target.value } : value,
                                  ),
                                )
                              }
                              placeholder="Model name / number"
                            />
                          </Field>
                          <Field label="IMEI / serial number">
                            <BarcodeScanner
                              value={item.serialNumber}
                              onChange={(serialNumber) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index ? { ...value, serialNumber } : value,
                                  ),
                                )
                              }
                              placeholder="Enter or scan IMEI / serial number"
                            />
                          </Field>
                          <RepeatableDeviceValues
                            label="Issue"
                            values={[item.issueDescription, ...item.issues]}
                            presets={issuePresets.data}
                            required
                            onChange={(values) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...value,
                                        issueDescription: values[0] ?? "",
                                        issues: values.slice(1),
                                      }
                                    : value,
                                ),
                              )
                            }
                          />
                          <Field label="Price">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.additionalFee}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, additionalFee: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                              placeholder="0.00"
                            />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="repair-add-device"
                  style={{ marginTop: "12px" }}
                  onClick={() =>
                    setAdditionalWorkItems((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        deviceType: "",
                        manufacturer: "",
                        model: "",
                        serialNumber: "",
                        issueDescription: "",
                        issues: [],
                        conditions: [""],
                        note: "",
                        additionalFee: "0",
                        waitingDays: 0,
                        waitingEndDate: waitingStartDate,
                        fields: {},
                      },
                    ])
                  }
                >
                  + Add another device to this ticket
                </button>
              </section>

              {/* Card 2: Services & Replacement Parts */}
              <section className="configuration-section repair-form-card">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="box" />
                    <div>
                      <h3>2. Services & Replacement Parts</h3>
                      <p className="repair-form-card-subtitle">Add catalog repair services or inventory items (optional)</p>
                    </div>
                  </div>
                </div>

                <div className="stack gap-3">
                  <Field label="Service 1 (optional)">
                    <select
                      name="service_id"
                      value={serviceLines[0]?.serviceId ?? ""}
                      onChange={(event) =>
                        setServiceLines((current) => [
                          { ...current[0], serviceId: event.target.value },
                          ...current.slice(1),
                        ])
                      }
                    >
                      <option value="">No service selected</option>
                      {services.data
                        .filter((item) => item.is_active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code ? `${item.code} · ` : ""}{item.name} · {formatMoney(item.labor_fee, merchant?.default_currency_code)}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {serviceLines.slice(1).map((line, index) => (
                    <div className="form-grid repair-service-line" key={`service-line-${index + 1}`}>
                      <Field label={`Service ${index + 2}`}>
                        <select
                          name={`service_id_${index + 1}`}
                          value={line.serviceId}
                          onChange={(event) =>
                            setServiceLines((current) =>
                              current.map((entry, lineIndex) =>
                                lineIndex === index + 1 ? { ...entry, serviceId: event.target.value } : entry,
                              ),
                            )
                          }
                        >
                          <option value="">No service selected</option>
                          {services.data
                            .filter((item) => item.is_active)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.code ? `${item.code} · ` : ""}{item.name} · {formatMoney(item.labor_fee, merchant?.default_currency_code)}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() =>
                          setServiceLines((current) =>
                            current.filter((_, lineIndex) => lineIndex !== index + 1),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      setServiceLines((current) => [
                        ...current,
                        { serviceId: "", quantity: "1", workItemIndex: 0 },
                      ])
                    }
                  >
                    + Add service line
                  </button>
                </div>

                <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
                  <Field label="Replacement part source">
                    <select
                      name="part_source"
                      value={partSource}
                      onChange={(event) => setPartSource(event.target.value)}
                    >
                      <option value="NONE">None - Service only</option>
                      <option value="INVENTORY">Add item from inventory</option>
                      <option value="CUSTOMER">Customer Provided Part</option>
                    </select>
                  </Field>
                  {partSource === "INVENTORY" && (
                    <div className="form-grid">
                      <Field label="Inventory replacement parts (sold)">
                        <div className="repair-parts-search-wrap">
                          <input
                            type="search"
                            className="repair-parts-search-input"
                            placeholder="Filter parts by name or SKU..."
                            value={partSearch}
                            onChange={(e) => setPartSearch(e.target.value)}
                          />
                          {partSearch && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() => setPartSearch("")}
                              style={{ whiteSpace: "nowrap" }}
                            >
                              Clear filter
                            </button>
                          )}
                        </div>
                        <div className="repair-parts-meta">
                          <span>
                            {filteredVariants.length} product{filteredVariants.length === 1 ? "" : "s"} found
                          </span>
                          <span>
                            {partIds.length} selected
                          </span>
                        </div>
                        <div className="repair-product-picker">
                          {filteredVariants.map((item) => {
                            const isSelected = partIds.includes(item.id);
                            return (
                              <button
                                type="button"
                                key={item.id}
                                className={`repair-product-option${isSelected ? " selected" : ""}`}
                                onClick={() => {
                                  setPartIds((current) =>
                                    isSelected ? current.filter((id) => id !== item.id) : [...current, item.id],
                                  );
                                  setPartWorkItemIndexes((current) => {
                                    const next = { ...current };
                                    if (isSelected) delete next[item.id];
                                    else next[item.id] ??= 0;
                                    return next;
                                  });
                                  setPartQuantities((current) => {
                                    if (!isSelected)
                                      return { ...current, [item.id]: current[item.id] ?? "1" };
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                }}
                                aria-pressed={isSelected}
                              >
                                <span className="repair-product-check">{isSelected ? "✓" : ""}</span>
                                <span className="repair-product-copy">
                                  <strong>
                                    {[item.product_name, item.name].filter(Boolean).join(" · ")}
                                  </strong>
                                  <small>
                                    SKU {item.sku} · {formatQuantity(item.quantity_on_hand)} in stock ·{" "}
                                    {formatMoney(item.price, merchant?.default_currency_code)}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <select
                          className="repair-native-picker"
                          name="variant_id"
                          multiple
                          size={6}
                          value={partIds}
                          onChange={(event) => {
                            const next = Array.from(
                              event.target.selectedOptions,
                              (option) => option.value,
                            );
                            setPartIds(next);
                            setPartWorkItemIndexes((current) =>
                              Object.fromEntries(next.map((id) => [id, current[id] ?? 0])),
                            );
                          }}
                        >
                          {variants.data
                            .filter((item) => item.is_stock_tracked)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {[item.product_name, item.name].filter(Boolean).join(" · ")} · Stock{" "}
                                {formatQuantity(item.quantity_on_hand)}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {partIds.length > 0 && (
                        <div className="wide selected-repair-parts">
                          <strong>Selected parts & quantities</strong>
                          {partIds.map((id) => {
                            const item = variants.data.find((variant) => variant.id === id);
                            return (
                              <div className="selected-repair-part" key={id}>
                                <span>
                                  {[item?.product_name, item?.name].filter(Boolean).join(" · ")}
                                </span>
                                <span className="repair-quantity-control">
                                  <small>Qty</small>
                                  <input
                                    className="repair-quantity-input"
                                    aria-label={`${item?.name ?? "Part"} quantity`}
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={partQuantities[id] ?? "1"}
                                    onChange={(event) =>
                                      setPartQuantities((current) => ({
                                        ...current,
                                        [id]: event.target.value,
                                      }))
                                    }
                                  />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Card 3: Payment & Summary */}
              <section className="configuration-section repair-form-card">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="tag" />
                    <div>
                      <h3>3. Payment & Total</h3>
                      <p className="repair-form-card-subtitle">Payment status, customer note, and total cost breakdown</p>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Payment status">
                    <select
                      name="payment_status"
                      value={paymentStatus}
                      onChange={(event) => setPaymentStatus(event.target.value)}
                    >
                      <option value="UNPAID">Unpaid</option>
                      <option value="DEPOSIT_PAID">Deposit Paid</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </Field>
                  {paymentStatus === "DEPOSIT_PAID" && (
                    <Field label="Deposit amount">
                      <input
                        name="deposit_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                        required
                      />
                    </Field>
                  )}
                  {paymentStatus !== "UNPAID" && (
                    <Field label="Payment type">
                      <select
                        name="deposit_payment_type_id"
                        defaultValue={
                          usablePaymentTypes.find((item) => item.category_code === "CASH")?.id
                        }
                        required
                      >
                        {usablePaymentTypes.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} · {item.category_code}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="wide">
                    <Field label="Ticket note">
                      <textarea
                        name="note"
                        value={repairNote}
                        onChange={(event) => setRepairNote(event.target.value)}
                        placeholder="Additional customer or technician notes"
                      />
                    </Field>
                  </div>
                </div>

                <div className="repair-summary-card">
                  <div className="repair-summary-header">
                    <span>Estimated Total Cost</span>
                    <strong>{formatMoney(estimatedFinalTotal, merchant?.default_currency_code)}</strong>
                  </div>
                  <div className="repair-price-breakdown">
                    {catalogLaborFee > 0 && (
                      <div>
                        <span>{selectedService?.name || "Service catalog"}</span>
                        <strong>{formatMoney(catalogLaborFee, merchant?.default_currency_code)}</strong>
                      </div>
                    )}
                    {allAdditionalFees > 0 && (
                      <div>
                        <span>Device price{additionalWorkItems.length > 0 ? "s" : ""}</span>
                        <strong>{formatMoney(allAdditionalFees, merchant?.default_currency_code)}</strong>
                      </div>
                    )}
                    {estimatedDiscount > 0 && (
                      <div className="discount">
                        <span>Promotion discount</span>
                        <strong>−{formatMoney(estimatedDiscount, merchant?.default_currency_code)}</strong>
                      </div>
                    )}
                    {partIds.map((id) => {
                      const item = variants.data.find((variant) => variant.id === id);
                      const quantity = partQuantities[id] ?? "1";
                      const amount = Number(item?.price ?? 0) * Number(quantity);
                      return (
                        <div key={id}>
                          <span>
                            {[item?.product_name, item?.name].filter(Boolean).join(" · ") || "Replacement part"}{" "}
                            × {formatQuantity(quantity)}
                          </span>
                          <strong>{formatMoney(amount, merchant?.default_currency_code)}</strong>
                        </div>
                      );
                    })}
                    {estimatedTax > 0 && (
                      <div>
                        <span>{currentShop?.tax_label || "Tax"}</span>
                        <strong>{formatMoney(estimatedTax, merchant?.default_currency_code)}</strong>
                      </div>
                    )}
                  </div>
                  <div className="repair-summary-turnaround">
                    <span>Ticket waiting period</span>
                    <strong>
                      {formatDateOnly(waitingStartDate)} – {formatDateOnly(ticketWaitingEndDate)} ({ticketWaitingDays} days)
                    </strong>
                  </div>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon="receipt"
                    onClick={() => setInvoicePreview(true)}
                  >
                    Preview repair invoice
                  </Button>
                </div>
              </section>
            </>
          )}

          {/* ========================================================================= */}
          {/* POS-COMPLEX MODE: Full enterprise depot with multi-device navigation       */}
          {/* ========================================================================= */}
          {isComplex && (
            <>
              {/* 1. Customer & Ticket Details */}
              <section className="configuration-section repair-form-card" id="ticket-section-customer">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="user" />
                    <div>
                      <h3>1. Customer & Ticket Details</h3>
                      <p className="repair-form-card-subtitle">Information shared across all devices on this ticket</p>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Customer name">
                    <input
                      name="customer_name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      required
                      placeholder="Customer name"
                    />
                  </Field>
                  <Field label="Customer phone">
                    <input
                      name="customer_phone"
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Customer phone"
                    />
                  </Field>
                  <Field label="Priority">
                    <select
                      name="priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    >
                      <option>NORMAL</option>
                      <option>HIGH</option>
                      <option>URGENT</option>
                    </select>
                  </Field>
                  <Field label="Promotion">
                    <select
                      name="promotion_id"
                      value={promotionId}
                      onChange={(event) => setPromotionId(event.target.value)}
                    >
                      <option value="">No promotion</option>
                      {promotions.data.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Receiving shop">
                    <input value={currentShop?.name ?? "No shop selected"} readOnly />
                  </Field>
                  <ImageSourceField
                    name="images-ticket"
                    label="Ticket-level photos"
                    multiple
                    disabled={offline.status === "offline"}
                  />
                </div>
                {ticketDefinitions.length > 0 && (
                  <DynamicFieldGroup
                    definitions={ticketDefinitions}
                    values={ticketFields}
                    onChange={(code, value) =>
                      setTicketFields((current) => ({ ...current, [code]: value }))
                    }
                    title="Ticket details"
                  />
                )}
              </section>

              {/* 2. Devices Stack */}
              <section className="configuration-section repair-form-card" id="ticket-section-devices">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="repair" />
                    <div>
                      <h3>2. Devices</h3>
                      <p className="repair-form-card-subtitle">
                        Identity, issue diagnostics, waiting period, and photos for each device
                      </p>
                    </div>
                  </div>
                  <span className="step-count">{additionalWorkItems.length + 1} device{additionalWorkItems.length === 0 ? "" : "s"}</span>
                </div>

                <div className="repair-device-stack">
                  {/* Device 1: Primary Device */}
                  <div className="configuration-card repair-device-card">
                    <div className="repair-device-card-header">
                      <div>
                        <h4>Device 1</h4>
                        <small>Primary device · {deviceType || "Choose type"}</small>
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="Device type">
                        <select
                          name="device_type"
                          value={deviceType}
                          onChange={(event) => setDeviceType(event.target.value)}
                          required
                        >
                          <option value="">Choose type</option>
                          <option>PHONE</option>
                          <option>TABLET</option>
                          <option>LAPTOP</option>
                          <option>APPLIANCE</option>
                          <option>OTHER</option>
                        </select>
                      </Field>
                      <Field label="Manufacturer">
                        <select
                          name="manufacturer"
                          value={manufacturer}
                          onChange={(event) => setManufacturer(event.target.value)}
                        >
                          <option value="">Choose brand</option>
                          {brands.data
                            .filter((brand) => brand.is_active)
                            .sort((left, right) => left.name.localeCompare(right.name))
                            .map((brand) => (
                              <option value={brand.name} key={brand.id}>
                                {brand.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Model">
                        <input
                          name="model"
                          value={deviceModel}
                          onChange={(event) => setDeviceModel(event.target.value)}
                          placeholder="Model name / number"
                        />
                      </Field>
                      <Field label="IMEI / serial number">
                        <BarcodeScanner
                          value={serialNumber}
                          onChange={setSerialNumber}
                          placeholder="Enter or scan IMEI / serial number"
                        />
                      </Field>
                      <RepeatableDeviceValues
                        label="Issue"
                        values={[issueDescription, ...additionalIssues]}
                        presets={issuePresets.data}
                        required
                        onChange={(values) => {
                          setIssueDescription(values[0] ?? "");
                          setAdditionalIssues(values.slice(1));
                        }}
                      />
                      <RepeatableDeviceValues
                        label="Condition"
                        values={conditions}
                        presets={conditionPresets.data}
                        onChange={setConditions}
                      />
                      <div className="wide">
                        <Field label="Device note">
                          <textarea
                            value={workItemNote}
                            onChange={(event) => setWorkItemNote(event.target.value)}
                            placeholder="Notes specific to this device"
                          />
                        </Field>
                      </div>
                      <Field label="Price">
                        <input
                          name="additional_fee"
                          type="number"
                          min="0"
                          step="0.01"
                          value={laborFee}
                          onChange={(event) => setLaborFee(event.target.value)}
                          required
                          placeholder="0.00"
                        />
                      </Field>
                      <RepairWaitingFields
                        startDate={waitingStartDate}
                        initialDays={waitingDays}
                        initialEndDate={waitingEndDate}
                        daysName="waiting_days"
                        endDateName="waiting_end_date"
                        onChange={(days, endDate) => {
                          setWaitingDays(days);
                          setWaitingEndDate(endDate);
                        }}
                      />
                      <ImageSourceField
                        name="images-0"
                        label="Device photos"
                        multiple
                        disabled={offline.status === "offline"}
                      />
                    </div>
                    {workItemDefinitions.length > 0 && (
                      <DynamicFieldGroup
                        definitions={workItemDefinitions}
                        values={workItemFields}
                        onChange={(code, value) =>
                          setWorkItemFields((current) => ({ ...current, [code]: value }))
                        }
                        title="Device-specific details"
                      />
                    )}
                  </div>

                  {/* Additional Devices */}
                  {additionalWorkItems.map((item, index) => (
                    <div className="configuration-card repair-device-card" key={item.id}>
                      <div className="repair-device-card-header">
                        <div>
                          <h4>Device {index + 2}</h4>
                          <small>{item.deviceType || "Additional device"}</small>
                        </div>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => removeAdditionalWorkItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="form-grid">
                        <Field label="Device type">
                          <select
                            value={item.deviceType}
                            onChange={(event) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? { ...value, deviceType: event.target.value }
                                    : value,
                                ),
                              )
                            }
                            required
                          >
                            <option value="">Choose type</option>
                            <option>PHONE</option>
                            <option>TABLET</option>
                            <option>LAPTOP</option>
                            <option>APPLIANCE</option>
                            <option>OTHER</option>
                          </select>
                        </Field>
                        <Field label="Manufacturer">
                          <select
                            value={item.manufacturer}
                            onChange={(event) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? { ...value, manufacturer: event.target.value }
                                    : value,
                                ),
                              )
                            }
                          >
                            <option value="">Choose brand</option>
                            {brands.data
                              .filter((brand) => brand.is_active)
                              .sort((left, right) => left.name.localeCompare(right.name))
                              .map((brand) => (
                                <option value={brand.name} key={brand.id}>
                                  {brand.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Model">
                          <input
                            value={item.model}
                            onChange={(event) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index ? { ...value, model: event.target.value } : value,
                                ),
                              )
                            }
                            placeholder="Model name / number"
                          />
                        </Field>
                        <Field label="IMEI / serial number">
                          <BarcodeScanner
                            value={item.serialNumber}
                            onChange={(serialNumber) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index ? { ...value, serialNumber } : value,
                                ),
                              )
                            }
                            placeholder="Enter or scan IMEI / serial number"
                          />
                        </Field>
                        <RepeatableDeviceValues
                          label="Issue"
                          values={[item.issueDescription, ...item.issues]}
                          presets={issuePresets.data}
                          required
                          onChange={(values) =>
                            setAdditionalWorkItems((current) =>
                              current.map((value, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...value,
                                      issueDescription: values[0] ?? "",
                                      issues: values.slice(1),
                                    }
                                  : value,
                              ),
                            )
                          }
                        />
                        <RepeatableDeviceValues
                          label="Condition"
                          values={item.conditions}
                          presets={conditionPresets.data}
                          onChange={(conditions) =>
                            setAdditionalWorkItems((current) =>
                              current.map((value, itemIndex) =>
                                itemIndex === index ? { ...value, conditions } : value,
                              ),
                            )
                          }
                        />
                        <div className="wide">
                          <Field label="Device note">
                            <textarea
                              value={item.note}
                              onChange={(event) =>
                                setAdditionalWorkItems((current) =>
                                  current.map((value, itemIndex) =>
                                    itemIndex === index
                                      ? { ...value, note: event.target.value }
                                      : value,
                                  ),
                                )
                              }
                              placeholder="Notes specific to this device"
                            />
                          </Field>
                        </div>
                        <Field label="Price">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.additionalFee}
                            onChange={(event) =>
                              setAdditionalWorkItems((current) =>
                                current.map((value, itemIndex) =>
                                  itemIndex === index
                                    ? { ...value, additionalFee: event.target.value }
                                    : value,
                                ),
                              )
                            }
                            placeholder="0.00"
                          />
                        </Field>
                        <RepairWaitingFields
                          startDate={waitingStartDate}
                          initialDays={item.waitingDays}
                          initialEndDate={item.waitingEndDate}
                          daysName={`waiting_days_${index + 1}`}
                          endDateName={`waiting_end_date_${index + 1}`}
                          onChange={(days, endDate) =>
                            setAdditionalWorkItems((current) =>
                              current.map((value, itemIndex) =>
                                itemIndex === index
                                  ? { ...value, waitingDays: days, waitingEndDate: endDate }
                                  : value,
                              ),
                            )
                          }
                        />
                        <ImageSourceField
                          name={`images-${index + 1}`}
                          label="Device photos"
                          multiple
                          disabled={offline.status === "offline"}
                        />
                      </div>
                      {workItemDefinitions.length > 0 && (
                        <DynamicFieldGroup
                          definitions={workItemDefinitions}
                          values={item.fields}
                          onChange={(code, value) =>
                            setAdditionalWorkItems((current) =>
                              current.map((entry, itemIndex) =>
                                itemIndex === index
                                  ? { ...entry, fields: { ...entry.fields, [code]: value } }
                                  : entry,
                              ),
                            )
                          }
                          title="Device-specific details"
                        />
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="repair-add-device"
                    onClick={() =>
                      setAdditionalWorkItems((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          deviceType: "",
                          manufacturer: "",
                          model: "",
                          serialNumber: "",
                          issueDescription: "",
                          issues: [],
                          conditions: [""],
                          note: "",
                          additionalFee: "0",
                          waitingDays: 0,
                          waitingEndDate: waitingStartDate,
                          fields: {},
                        },
                      ])
                    }
                  >
                    + Add device to this ticket
                  </button>
                </div>
              </section>

              {/* 3. Services */}
              <section className="configuration-section repair-form-card" id="ticket-section-services">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="box" />
                    <div>
                      <h3>3. Services (Optional)</h3>
                      <p className="repair-form-card-subtitle">
                        Catalog repair services and per-device allocation
                      </p>
                    </div>
                  </div>
                </div>
                <div className="stack gap-3">
                  {serviceLines.map((line, index) => (
                    <div className="form-grid repair-service-line" key={`service-line-${index}`}>
                      <Field label={`Service ${index + 1} (optional)`}>
                        <select
                          name={index === 0 ? "service_id" : `service_id_${index}`}
                          value={line.serviceId}
                          onChange={(event) =>
                            setServiceLines((current) =>
                              current.map((entry, lineIndex) =>
                                lineIndex === index
                                  ? { ...entry, serviceId: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <option value="">No service selected</option>
                          {services.data
                            .filter((item) => item.is_active)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.code ? `${item.code} · ` : ""}{item.name} · {formatMoney(item.labor_fee, merchant?.default_currency_code)}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {line.serviceId && (
                        <>
                          <Field label="Quantity">
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              onChange={(event) =>
                                setServiceLines((current) =>
                                  current.map((entry, lineIndex) =>
                                    lineIndex === index
                                      ? { ...entry, quantity: event.target.value }
                                      : entry,
                                  ),
                                )
                              }
                              required
                            />
                          </Field>
                          <Field label="Work item">
                            <select
                              value={line.workItemIndex}
                              onChange={(event) =>
                                setServiceLines((current) =>
                                  current.map((entry, lineIndex) =>
                                    lineIndex === index
                                      ? { ...entry, workItemIndex: Number(event.target.value) }
                                      : entry,
                                  ),
                                )
                              }
                            >
                              <option value={0}>1. {deviceType || "Primary device"}</option>
                              {additionalWorkItems.map((item, itemIndex) => (
                                <option key={item.id} value={itemIndex + 1}>
                                  {itemIndex + 2}. {item.deviceType || "Device"}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </>
                      )}
                      {serviceLines.length > 1 && (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() =>
                            setServiceLines((current) =>
                              current.filter((_, lineIndex) => lineIndex !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() =>
                      setServiceLines((current) => [
                        ...current,
                        { serviceId: "", quantity: "1", workItemIndex: 0 },
                      ])
                    }
                  >
                    + Add service line
                  </button>
                </div>
              </section>

              {/* 4. Replacement parts charged to the customer */}
              <section className="configuration-section repair-form-card" id="ticket-section-parts">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="package" />
                    <div>
                      <h3>4. Replacement parts charged to the customer</h3>
                      <p className="repair-form-card-subtitle">
                        Select parts consumed during repair; price adds to total and quantity is deducted from inventory
                      </p>
                    </div>
                  </div>
                </div>

                <Field label="Replacement part source">
                  <select
                    name="part_source"
                    value={partSource}
                    onChange={(event) => setPartSource(event.target.value)}
                  >
                    <option value="NONE">None - Service only</option>
                    <option value="INVENTORY">Add item from inventory</option>
                    <option value="CUSTOMER">Customer Provided Part</option>
                  </select>
                </Field>

                {partSource === "INVENTORY" && (
                  <div className="form-grid">
                    <Field label="Inventory replacement parts (sold)">
                      <div className="repair-parts-search-wrap">
                        <input
                          type="search"
                          className="repair-parts-search-input"
                          placeholder="Filter parts by name, SKU..."
                          value={partSearch}
                          onChange={(e) => setPartSearch(e.target.value)}
                        />
                        {partSearch && (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => setPartSearch("")}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            Clear filter
                          </button>
                        )}
                      </div>
                      <div className="repair-parts-meta">
                        <span>
                          {filteredVariants.length} product{filteredVariants.length === 1 ? "" : "s"} found
                        </span>
                        <span>
                          {partIds.length} selected
                        </span>
                      </div>
                      <div className="repair-product-picker">
                        {filteredVariants.map((item) => {
                          const isSelected = partIds.includes(item.id);
                          return (
                            <button
                              type="button"
                              key={item.id}
                              className={`repair-product-option${isSelected ? " selected" : ""}`}
                              onClick={() => {
                                setPartIds((current) =>
                                  isSelected
                                    ? current.filter((id) => id !== item.id)
                                    : [...current, item.id],
                                );
                                setPartWorkItemIndexes((current) => {
                                  const next = { ...current };
                                  if (isSelected) delete next[item.id];
                                  else next[item.id] ??= 0;
                                  return next;
                                });
                                setPartQuantities((current) => {
                                  if (!isSelected)
                                    return { ...current, [item.id]: current[item.id] ?? "1" };
                                  const next = { ...current };
                                  delete next[item.id];
                                  return next;
                                });
                              }}
                              aria-pressed={isSelected}
                            >
                              <span className="repair-product-check">{isSelected ? "✓" : ""}</span>
                              <span className="repair-product-copy">
                                <strong>
                                  {[item.product_name, item.name].filter(Boolean).join(" · ")}
                                </strong>
                                <small>
                                  SKU {item.sku} · {formatQuantity(item.quantity_on_hand)} in stock ·{" "}
                                  {formatMoney(item.price, merchant?.default_currency_code)}
                                </small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <small>
                        {partIds.length
                          ? `${partIds.length} product${partIds.length === 1 ? "" : "s"} selected`
                          : "Select one or more products"}
                      </small>
                      <select
                        className="repair-native-picker"
                        name="variant_id"
                        multiple
                        size={6}
                        value={partIds}
                        onChange={(event) => {
                          const next = Array.from(
                            event.target.selectedOptions,
                            (option) => option.value,
                          );
                          setPartIds(next);
                          setPartWorkItemIndexes((current) =>
                            Object.fromEntries(next.map((id) => [id, current[id] ?? 0])),
                          );
                        }}
                      >
                        {variants.data
                          .filter((item) => item.is_stock_tracked)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {[item.product_name, item.name].filter(Boolean).join(" · ")} · Stock{" "}
                              {formatQuantity(item.quantity_on_hand)}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {partIds.length > 0 && (
                      <div className="wide selected-repair-parts">
                        <strong>Selected quantities</strong>
                        {partIds.map((id) => {
                          const item = variants.data.find((variant) => variant.id === id);
                          return (
                            <div className="selected-repair-part" key={id}>
                              <span>
                                {[item?.product_name, item?.name].filter(Boolean).join(" · ")}
                              </span>
                              <select
                                aria-label={`Work item for ${item?.name ?? "part"}`}
                                value={String(partWorkItemIndexes[id] ?? 0)}
                                onChange={(event) =>
                                  setPartWorkItemIndexes((current) => ({
                                    ...current,
                                    [id]: Number(event.target.value),
                                  }))
                                }
                              >
                                <option value="-1">Ticket-level</option>
                                <option value="0">Device 1</option>
                                {additionalWorkItems.map((entry, index) => (
                                  <option key={`${id}-work-item-${index + 1}`} value={index + 1}>
                                    Device {index + 2}
                                    {entry.deviceType ? ` · ${entry.deviceType}` : ""}
                                  </option>
                                ))}
                              </select>
                              <span className="repair-quantity-control">
                                <small>Qty</small>
                                <input
                                  className="repair-quantity-input"
                                  aria-label={`${item?.name ?? "Part"} quantity`}
                                  type="number"
                                  min="0.001"
                                  step="0.001"
                                  value={partQuantities[id] ?? "1"}
                                  onChange={(event) =>
                                    setPartQuantities((current) => ({
                                      ...current,
                                      [id]: event.target.value,
                                    }))
                                  }
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* 5. Payment, Notes & Total */}
              <section className="configuration-section repair-form-card" id="ticket-section-payment">
                <div className="repair-form-card-header">
                  <div className="repair-form-card-title">
                    <Icon name="tag" />
                    <div>
                      <h3>5. Payment & Total Review</h3>
                      <p className="repair-form-card-subtitle">
                        Payment status, customer notes, and itemized billing breakdown
                      </p>
                    </div>
                  </div>
                </div>
                <div className="form-grid">
                  <Field label="Payment status">
                    <select
                      name="payment_status"
                      value={paymentStatus}
                      onChange={(event) => setPaymentStatus(event.target.value)}
                    >
                      <option value="UNPAID">Unpaid</option>
                      <option value="DEPOSIT_PAID">Deposit Paid</option>
                      <option value="PAID">Paid</option>
                    </select>
                  </Field>
                  {paymentStatus === "DEPOSIT_PAID" && (
                    <Field label="Deposit amount">
                      <input
                        name="deposit_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                        required
                      />
                    </Field>
                  )}
                  {paymentStatus !== "UNPAID" && (
                    <Field label="Payment type">
                      <select
                        name="deposit_payment_type_id"
                        defaultValue={
                          usablePaymentTypes.find((item) => item.category_code === "CASH")?.id
                        }
                        required
                      >
                        {usablePaymentTypes.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} · {item.category_code}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="wide">
                    <Field label="Ticket note">
                      <textarea
                        name="note"
                        value={repairNote}
                        onChange={(event) => setRepairNote(event.target.value)}
                        placeholder="Additional customer or technician notes"
                      />
                    </Field>
                  </div>
                </div>

                <div className="repair-summary-card">
                  <div className="repair-summary-header">
                    <span>Estimated Total Cost</span>
                    <strong>{formatMoney(estimatedFinalTotal, merchant?.default_currency_code)}</strong>
                  </div>
                  <div className="repair-price-breakdown">
                    <div>
                      <span>{selectedService?.name || "Service catalog"}</span>
                      <strong>{formatMoney(catalogLaborFee, merchant?.default_currency_code)}</strong>
                    </div>
                    {allAdditionalFees > 0 && (
                      <div>
                        <span>Device prices</span>
                        <strong>
                          {formatMoney(allAdditionalFees, merchant?.default_currency_code)}
                        </strong>
                      </div>
                    )}
                    {estimatedDiscount > 0 && (
                      <div className="discount">
                        <span>Promotion discount</span>
                        <strong>
                          −{formatMoney(estimatedDiscount, merchant?.default_currency_code)}
                        </strong>
                      </div>
                    )}
                    {partIds.map((id) => {
                      const item = variants.data.find((variant) => variant.id === id);
                      const quantity = partQuantities[id] ?? "1";
                      const amount = Number(item?.price ?? 0) * Number(quantity);
                      return (
                        <div key={id}>
                          <span>
                            {[item?.product_name, item?.name].filter(Boolean).join(" · ") ||
                              "Replacement part"}{" "}
                            × {formatQuantity(quantity)}
                          </span>
                          <strong>{formatMoney(amount, merchant?.default_currency_code)}</strong>
                        </div>
                      );
                    })}
                    {estimatedTax > 0 && (
                      <div>
                        <span>{currentShop?.tax_label || "Tax"}</span>
                        <strong>{formatMoney(estimatedTax, merchant?.default_currency_code)}</strong>
                      </div>
                    )}
                  </div>
                  <div className="repair-summary-turnaround">
                    <span>Ticket waiting period</span>
                    <strong>
                      {formatDateOnly(waitingStartDate)} – {formatDateOnly(ticketWaitingEndDate)} (
                      {ticketWaitingDays} days)
                    </strong>
                  </div>
                  <small style={{ display: "block", marginTop: "8px", color: "var(--muted)", fontSize: "10px" }}>
                    Final tax, promotions, and stock pricing are confirmed by the backend when the ticket is saved.
                  </small>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    icon="receipt"
                    onClick={() => setInvoicePreview(true)}
                  >
                    Preview repair invoice
                  </Button>
                </div>
              </section>
            </>
          )}

          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                resetCreateForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" aria-label="Create ticket">
              {offline.status === "offline" ? t("repairs.save_ticket") : "Create ticket"}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        open={invoicePreview}
        onClose={() => setInvoicePreview(false)}
        title="Repair ticket invoice preview"
        description="Preview the repair-specific invoice layout."
      >
        <div className="invoice-preview-body">
          <InvoiceReceipt invoice={repairInvoice} variant="repair" />
        </div>
        <div className="modal-actions no-print">
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>
            {t("common.print")}
          </Button>
          <Button variant="secondary" onClick={() => downloadInvoicePDF(repairInvoice)}>
            {t("repairs.download_pdf")}
          </Button>
          <Button icon="printer" onClick={thermalPrintPreview} disabled={thermalPreviewBusy}>
            {thermalPreviewBusy ? t("common.loading") : t("repairs.thermal_print")}
          </Button>
        </div>
        {thermalPreviewMessage && <div className="notice no-print">{thermalPreviewMessage}</div>}
        {thermalPreviewError && <div className="form-error no-print">{thermalPreviewError}</div>}
      </Modal>
      <Modal
        open={partOpen}
        onClose={() => setPartOpen(false)}
        title="Use a stock item"
        description={`Consume inventory for ${selected?.order_number ?? "this repair"}.`}
        className="repair-action-modal"
      >
        <Form className="repair-action-form" onSubmit={addPart}>
          <Field label="Work item">
            <select
              name="work_item_id"
              value={partWorkItemId}
              onChange={(event) => setPartWorkItemId(event.target.value)}
              required
            >
              {(selected?.work_items ?? []).map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index + 1}. {item.summary || item.device.device_type || "Work item"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product / part">
            <select name="variant_id" required>
              <option value="">Select part</option>
              {variants.data
                .filter(
                  (item) =>
                    item.is_stock_tracked &&
                    Number(
                      (item as Variant & { quantity_on_hand?: string }).quantity_on_hand ?? 0,
                    ) > 0,
                )
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · {item.sku} ·{" "}
                    {(item as Variant & { quantity_on_hand?: string }).quantity_on_hand} available
                  </option>
                ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Quantity">
              <input
                type="number"
                name="quantity"
                min="0.001"
                step="0.001"
                defaultValue="1"
                required
              />
            </Field>
            <Field label="Promotion">
              <select name="promotion_id">
                <option value="">No promotion</option>
                {promotions.data.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="notice">
            Price and promotion eligibility are verified by the backend. Saving consumes stock
            immediately and cannot be edited.
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setPartOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              icon="package"
              disabled={offline.status === "offline" && !offline.storageAvailable}
            >
              Use stock item
            </Button>
          </div>
        </Form>
      </Modal>
      {details && (
        <TicketDetails
          repair={details}
          device={repairDevices.data.find((item) => item.id === details.device_id)}
          services={services.data}
          variants={variants.data}
          ticketDefinitions={ticketDefinitions}
          workItemDefinitions={workItemDefinitions}
          onClose={() => setDetails(null)}
          onChanged={repairs.reload}
        />
      )}
    </>
  );
}
