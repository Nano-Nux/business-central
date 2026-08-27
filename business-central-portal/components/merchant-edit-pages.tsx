"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { useShop } from "@/lib/shop";
import { useResource } from "@/lib/use-resource";
import { queueDeliveryUpdate } from "@/lib/offline-deliveries";
import { formatMoney } from "@/lib/currency";
import { formatDateOnly, formatShopDateTime } from "@/lib/date-time";
import type { Customer, Delivery, PaymentType, Promotion, RepairOrder, RepairPayment } from "@/lib/types";
import { Button, EmptyState, Field, Form, Loading, PageHeader, StatusBadge } from "./ui";
import { RepairWaitingFields } from "./repair-waiting-fields";

type RepairServiceCatalog = {
  id: string;
  name: string;
  code: string;
  labor_fee: string;
  is_active: boolean;
};

type RepairServiceOrderItem = {
  id: string;
  service_id?: string;
  variant_id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  status: string;
  work_item_id?: string;
};

type RepairServiceLineDraft = {
  serviceId: string;
  quantity: string;
  workItemId: string;
};

function MerchantGate({ children }: { children: React.ReactNode }) {
  const { ready, isMerchant } = useAuth();
  if (!ready) return <Loading />;
  if (!isMerchant)
    return (
      <EmptyState
        icon="users"
        title="Merchant access required"
        message="Staff can view operational records, but only the merchant owner can edit them."
        action={
          <Link className="button button-secondary" href="/dashboard">
            Return to dashboard
          </Link>
        }
      />
    );
  return children;
}

function useRecord<T>(path: string, enabled: boolean) {
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api<T>(path)
      .then((item) => {
        if (active) setRecord(item);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "This record could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, path]);
  return { record, loading, error };
}

export function CustomerEditPage({ id }: { id: string }) {
  const { isMerchant } = useAuth();
  const resource = useRecord<Customer>(`/customers/${encodeURIComponent(id)}`, isMerchant);
  return (
    <MerchantGate>
      {resource.loading ? (
        <Loading />
      ) : resource.error || !resource.record ? (
        <EmptyState
          icon="users"
          title="Customer could not load"
          message={resource.error || "The customer does not exist."}
        />
      ) : (
        <CustomerForm customer={resource.record} />
      )}
    </MerchantGate>
  );
}

function CustomerForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) {
      setError("Customer editing requires an online connection.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await patch(`/customers/${encodeURIComponent(customer.id)}`, {
        display_name: String(form.get("display_name")).trim(),
        customer_type: String(form.get("customer_type")),
        email: String(form.get("email") || "").trim() || undefined,
        phone: String(form.get("phone") || "").trim() || undefined,
        loyalty_identifier: String(form.get("loyalty_identifier") || "").trim() || undefined,
      });
      router.push("/customers");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Customer could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title={`Edit ${customer.display_name}`}
        description={`Update customer ${customer.customer_number}. Only merchant owners can save changes.`}
      />
      <Form className="card form-grid" onSubmit={save}>
        <Field label="Customer name">
          <input name="display_name" defaultValue={customer.display_name} required />
        </Field>
        <Field label="Customer type">
          <select name="customer_type" defaultValue={customer.customer_type}>
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="GUEST">Guest</option>
          </select>
        </Field>
        <Field label="Phone">
          <input name="phone" defaultValue={customer.phone ?? ""} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" defaultValue={customer.email ?? ""} />
        </Field>
        <Field label="Loyalty identifier">
          <input name="loyalty_identifier" defaultValue={customer.loyalty_identifier ?? ""} />
        </Field>
        {error && <div className="form-error wide">{error}</div>}
        <div className="modal-actions wide">
          <Link className="button button-secondary" href="/customers">
            Cancel
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save customer"}
          </Button>
        </div>
      </Form>
    </>
  );
}

export function DeliveryEditPage({ id }: { id: string }) {
  const { isMerchant } = useAuth();
  const { currentShop, loading: shopsLoading, error: shopsError } = useShop();
  const resource = useResource<Delivery>(
    isMerchant && currentShop
      ? `/shops/${currentShop.id}/deliveries?page_index=0&page_size=100`
      : "",
  );
  const delivery = resource.data.find((item) => item.id === id);
  return (
    <MerchantGate>
      {shopsLoading ? (
        <Loading />
      ) : shopsError ? (
        <EmptyState icon="store" title="Shop could not load" message={shopsError} />
      ) : resource.loading ? (
        <Loading />
      ) : resource.error || !delivery ? (
        <EmptyState
          icon="package"
          title="Delivery could not load"
          message={resource.error || "The delivery option does not exist in the active shop."}
        />
      ) : (
        <DeliveryForm delivery={delivery} />
      )}
    </MerchantGate>
  );
}

function DeliveryForm({ delivery }: { delivery: Delivery }) {
  const router = useRouter();
  const offline = useOffline();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!offline.scope || !offline.storageAvailable)
        throw new Error("Offline storage is required to safely update delivery options.");
      await queueDeliveryUpdate(
        offline.scope,
        delivery,
        String(form.get("name")).trim(),
        String(form.get("contact_info")).trim(),
      );
      if (navigator.onLine) await offline.syncNow();
      router.push("/deliveries");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delivery could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Deliveries"
        title={`Edit ${delivery.name}`}
        description="Update this shop's delivery option. Only merchant owners can save changes."
      />
      <Form className="card form-grid" onSubmit={save}>
        <Field label="Delivery name">
          <input name="name" defaultValue={delivery.name} required />
        </Field>
        <Field label="Contact info">
          <input name="contact_info" defaultValue={delivery.contact_info} required />
        </Field>
        {error && <div className="form-error wide">{error}</div>}
        <div className="modal-actions wide">
          <Link className="button button-secondary" href="/deliveries">
            Cancel
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save delivery"}
          </Button>
        </div>
      </Form>
    </>
  );
}

export function RepairEditPage({ id }: { id: string }) {
  const { isMerchant } = useAuth();
  const { currentShop, loading: shopsLoading, error: shopsError } = useShop();
  const resource = useResource<RepairOrder>(
    isMerchant && currentShop
      ? `/repairs/orders?page_index=0&page_size=100&filter=shop_id:${encodeURIComponent(currentShop.id)}`
      : "",
  );
  const repair = resource.data.find((item) => item.id === id);
  return (
    <MerchantGate>
      {shopsLoading ? (
        <Loading />
      ) : shopsError ? (
        <EmptyState icon="store" title="Shop could not load" message={shopsError} />
      ) : resource.loading ? (
        <Loading />
      ) : resource.error || !repair ? (
        <EmptyState
          icon="repair"
          title="Repair ticket could not load"
          message={resource.error || "The repair ticket does not exist in the active shop."}
        />
      ) : (
        <RepairForm repair={repair} />
      )}
    </MerchantGate>
  );
}

function RepairForm({ repair }: { repair: RepairOrder }) {
  const router = useRouter();
  const { merchant } = useAuth();
  const { currentShop } = useShop();
  const offline = useOffline();
  const services = useResource<RepairServiceCatalog>(
    "/services/catalog?page_index=0&page_size=100",
  );
  const promotions = useResource<Promotion>("/promotions?page_index=0&page_size=100");
  const serviceItems = useResource<RepairServiceOrderItem>(
    `/services/orders/${encodeURIComponent(repair.service_order_id)}/items?page_index=0&page_size=100`,
  );
  const payments = useResource<RepairPayment>(
    `/repairs/orders/${encodeURIComponent(repair.id)}/payments?page_index=0&page_size=100`,
  );
  const paymentTypes = useResource<PaymentType>("/payment-types?active_only=true");
  const usablePaymentTypes = paymentTypes.data.filter((item) => item.category_code !== "DIGITAL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [promotionId, setPromotionId] = useState(repair.promotion_id ?? "");
  const [serviceLineOverride, setServiceLineOverride] = useState<RepairServiceLineDraft[] | null>(
    null,
  );
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const workItems = useMemo(() => repair.work_items ?? [], [repair.work_items]);
  const catalogServiceLines = useMemo(() => {
    const existingLines = serviceItems.data
      .filter((item) => Boolean(item.service_id))
      .map((item) => ({
        serviceId: item.service_id ?? "",
        quantity: item.quantity || "1",
        workItemId: item.work_item_id ?? workItems[0]?.id ?? "",
      }));
    if (existingLines.length) return existingLines;
    if (repair.service_id) {
      return [
        {
          serviceId: repair.service_id,
          quantity: "1",
          workItemId: workItems[0]?.id ?? "",
        },
      ];
    }
    return [];
  }, [repair.service_id, serviceItems.data, workItems]);
  const serviceLines = serviceLineOverride ?? catalogServiceLines;

  async function submitRefund(payment: RepairPayment) {
    if (!refundAmount || Number(refundAmount) <= 0) {
      setError("Enter a refund amount greater than zero.");
      return;
    }
    if (offline.status === "offline") {
      setError("Refunds require an online connection.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post(`/repairs/orders/${encodeURIComponent(repair.id)}/refunds`, {
        payment_id: payment.id,
        amount: refundAmount,
        reason: refundReason.trim() || undefined,
        idempotency_key: `repair-refund:${repair.id}:${payment.id}:${crypto.randomUUID()}`,
      });
      setRefundPaymentId("");
      setRefundAmount("");
      setRefundReason("");
      await payments.reload();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Refund could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updatedWorkItems = workItems.map((workItem) => ({
      id: workItem.id,
      issue_description: String(form.get(`work_item_issue_${workItem.id}`) || "").trim(),
      note: String(form.get(`work_item_note_${workItem.id}`) || "").trim() || undefined,
      waiting_days: Number(form.get(`work_item_waiting_days_${workItem.id}`) || 0),
      waiting_end_date: String(form.get(`work_item_waiting_end_date_${workItem.id}`) || ""),
      device: {
        device_type: String(form.get(`work_item_device_type_${workItem.id}`) || "").trim(),
        manufacturer:
          String(form.get(`work_item_manufacturer_${workItem.id}`) || "").trim() || undefined,
        model: String(form.get(`work_item_model_${workItem.id}`) || "").trim() || undefined,
        serial_number:
          String(form.get(`work_item_serial_number_${workItem.id}`) || "").trim() || undefined,
      },
    }));
    const body = {
      customer_name: String(form.get("customer_name") || "").trim() || undefined,
      customer_phone: String(form.get("customer_phone") || "").trim() || undefined,
      issue_description:
        updatedWorkItems[0]?.issue_description ||
        String(form.get("issue_description") || "").trim(),
      note: String(form.get("note") || "").trim() || undefined,
      ...(updatedWorkItems.length ? { work_items: updatedWorkItems } : {}),
    };
    setBusy(true);
    setError("");
    try {
      if (offline.status === "offline" || !navigator.onLine) {
        throw new Error("Billing and payment changes require an online connection.");
      }
      if (serviceItems.loading) {
        throw new Error("The ticket service lines are still loading. Try again in a moment.");
      }

      const targetStatus = String(form.get("ticket_status") || repair.status);
      if (targetStatus !== repair.status) {
        await patch(`/repairs/orders/${encodeURIComponent(repair.id)}`, {
          service_order_id: repair.service_order_id,
          device_id: repair.device_id,
          order_number: repair.order_number,
          status: targetStatus,
          issue_description: body.issue_description,
          received_at: repair.received_at,
          completed_at: targetStatus === "COMPLETED" ? new Date().toISOString() : null,
        });
      }

      const billing = await patch<RepairOrder>(
        `/repairs/orders/${encodeURIComponent(repair.id)}/billing`,
        {
          service_items: serviceLines
            .filter((line) => line.serviceId)
            .map((line) => ({
              service_id: line.serviceId,
              quantity: line.quantity || "1",
              work_item_id: line.workItemId || undefined,
            })),
          work_items: workItems.map((workItem) => ({
            id: workItem.id,
            additional_fee: String(form.get(`work_item_fee_${workItem.id}`) || "0"),
          })),
          labor_fee: String(form.get("labor_fee") || "0"),
          promotion_id: promotionId || null,
        },
      );

      await patch(`/repairs/orders/${encodeURIComponent(repair.id)}/details`, body);

      const currentPaid = Number(billing.deposit_paid || 0);
      const requestedPaymentStatus = String(form.get("payment_status") || repair.payment_status);
      const requestedDeposit = Number(form.get("payment_amount") || 0);
      const paymentTypeId = String(form.get("payment_type_id") || "");
      const paymentType = usablePaymentTypes.find((item) => item.id === paymentTypeId);
      if (requestedPaymentStatus === "UNPAID") {
        if (currentPaid > 0.005) {
          throw new Error(
            "Refund the captured payments below before moving this ticket back to Unpaid.",
          );
        }
      } else if (requestedPaymentStatus === "DEPOSIT_PAID") {
        if (requestedDeposit <= 0) {
          throw new Error("Enter the deposit amount when selecting Deposit Paid.");
        }
        if (requestedDeposit < currentPaid - 0.005) {
          throw new Error(
            "The requested deposit is below the captured balance. Refund the difference below first.",
          );
        }
        if (requestedDeposit > currentPaid + 0.005) {
          if (!paymentType) throw new Error("Select an active payment type.");
          await post(`/repairs/orders/${encodeURIComponent(repair.id)}/payments`, {
            kind: "DEPOSIT",
            payment_type_id: paymentType.id,
            method: paymentType.name,
            amount: (requestedDeposit - currentPaid).toFixed(2),
            idempotency_key: `repair-edit-deposit:${repair.id}:${crypto.randomUUID()}`,
          });
        }
      } else if (requestedPaymentStatus === "PAID") {
        const total = Number(billing.total_cost || 0);
        if (total <= 0) {
          throw new Error("A zero-value ticket cannot receive a Paid payment.");
        }
        const remaining = total - currentPaid;
        if (remaining > 0.005) {
          if (!paymentType) throw new Error("Select an active payment type.");
          await post(`/repairs/orders/${encodeURIComponent(repair.id)}/payments`, {
            kind: "FINAL",
            payment_type_id: paymentType.id,
            method: paymentType.name,
            amount: remaining.toFixed(2),
            idempotency_key: `repair-edit-final:${repair.id}:${crypto.randomUUID()}`,
          });
        }
      }
      router.push("/repairs");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Repair ticket could not be updated.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Repairs"
        title={`Edit ${repair.order_number}`}
        description="Update intake details, service pricing, work-item fees, promotions, payment targets, and the ticket lifecycle. Parts remain managed from the ticket workflow."
      />
      <Form className="card repair-edit-form" onSubmit={save}>
        <section className="configuration-section">
          <h3>Ticket summary</h3>
          <div className="stats-grid">
            <div>
              <span>Status</span>
              <StatusBadge status={repair.status} />
            </div>
            <div>
              <span>Payment</span>
              <StatusBadge status={repair.payment_status} />
            </div>
            <div>
              <span>Received</span>
              <strong>{formatShopDateTime(repair.received_at, currentShop?.timezone)}</strong>
            </div>
            {repair.waiting_start_date && repair.waiting_end_date && (
              <div>
                <span>Ticket waiting period</span>
                <strong>
                  {formatDateOnly(repair.waiting_start_date)} –{" "}
                  {formatDateOnly(repair.waiting_end_date)} ({repair.waiting_days ?? 0} days)
                </strong>
              </div>
            )}
            <div>
              <span>Deposit paid</span>
              <strong>{formatMoney(repair.deposit_paid, merchant?.default_currency_code)}</strong>
            </div>
            <div>
              <span>Subtotal</span>
              <strong>
                {formatMoney(repair.subtotal ?? "0", merchant?.default_currency_code)}
              </strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>
                {formatMoney(repair.discount_total ?? "0", merchant?.default_currency_code)}
              </strong>
            </div>
            <div>
              <span>Labor</span>
              <strong>{formatMoney(repair.labor_fee, merchant?.default_currency_code)}</strong>
            </div>
            <div>
              <span>Device prices</span>
              <strong>{formatMoney(repair.additional_fee, merchant?.default_currency_code)}</strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>{formatMoney(repair.tax_amount, merchant?.default_currency_code)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatMoney(repair.total_cost, merchant?.default_currency_code)}</strong>
            </div>
          </div>
          <div className="repair-edit-status-control">
            <Field
              label="Change ticket status"
              hint="Choose the lifecycle stage that will be applied when this form is saved."
            >
              <select name="ticket_status" defaultValue={repair.status}>
                <option value="RECEIVED">Received</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="READY_FOR_PICKUP">Ready for pickup</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </Field>
          </div>
        </section>
        <section className="configuration-section">
          <h3>Customer</h3>
          <p>Contact information shared by all devices on this ticket.</p>
          <div className="form-grid">
            <Field label="Customer name">
              <input name="customer_name" defaultValue={repair.customer_name ?? ""} />
            </Field>
            <Field label="Customer phone">
              <input name="customer_phone" defaultValue={repair.customer_phone ?? ""} />
            </Field>
          </div>
        </section>
        <section className="configuration-section">
          <h3>Devices</h3>
          {workItems.length ? (
            <div className="repair-device-stack">
              <p className="muted">
                This ticket contains {workItems.length} work items. Update each device&apos;s
                identifiers, issue, note, price, and waiting time in its own card.
              </p>
              {workItems.map((workItem) => {
                const deviceLabel = [
                  workItem.device.device_type,
                  workItem.device.manufacturer,
                  workItem.device.model,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div className="configuration-card repair-device-card" key={workItem.id}>
                    <div className="repair-device-card-header">
                      <div>
                        <h4>Device {workItem.sequence_number}</h4>
                        <small>{deviceLabel || "Device details"}</small>
                      </div>
                      <StatusBadge status={workItem.status} />
                    </div>
                    <div className="form-grid">
                      <Field label="Device type">
                        <input
                          name={`work_item_device_type_${workItem.id}`}
                          defaultValue={workItem.device.device_type}
                          required
                        />
                      </Field>
                      <Field label="Manufacturer">
                        <input
                          name={`work_item_manufacturer_${workItem.id}`}
                          defaultValue={workItem.device.manufacturer ?? ""}
                        />
                      </Field>
                      <Field label="Model">
                        <input
                          name={`work_item_model_${workItem.id}`}
                          defaultValue={workItem.device.model ?? ""}
                        />
                      </Field>
                      <Field label="Serial number">
                        <input
                          name={`work_item_serial_number_${workItem.id}`}
                          defaultValue={workItem.device.serial_number ?? ""}
                        />
                      </Field>
                      <div className="wide">
                        <Field label="Reported issue">
                          <textarea
                            name={`work_item_issue_${workItem.id}`}
                            defaultValue={workItem.issue_description}
                            required
                          />
                        </Field>
                      </div>
                      <div className="wide">
                        <Field label="Device note">
                          <textarea
                            name={`work_item_note_${workItem.id}`}
                            defaultValue={workItem.note ?? ""}
                          />
                        </Field>
                      </div>
                      <Field label="Price">
                        <input
                          name={`work_item_fee_${workItem.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={workItem.additional_fee ?? "0"}
                        />
                      </Field>
                      <RepairWaitingFields
                        startDate={workItem.waiting_start_date || repair.received_at.slice(0, 10)}
                        initialDays={workItem.waiting_days ?? 0}
                        initialEndDate={workItem.waiting_end_date}
                        daysName={`work_item_waiting_days_${workItem.id}`}
                        endDateName={`work_item_waiting_end_date_${workItem.id}`}
                      />
                    </div>
                    {workItem.financials && (
                      <div className="repair-edit-device-financials">
                        <div>
                          <span>Work item total</span>
                          <strong>
                            {formatMoney(
                              workItem.financials.total,
                              merchant?.default_currency_code,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Paid</span>
                          <strong>
                            {formatMoney(workItem.financials.paid, merchant?.default_currency_code)}
                          </strong>
                        </div>
                        <div>
                          <span>Balance</span>
                          <strong>
                            {formatMoney(
                              workItem.financials.balance,
                              merchant?.default_currency_code,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Price</span>
                          <strong>
                            {formatMoney(
                              workItem.additional_fee ?? "0",
                              merchant?.default_currency_code,
                            )}
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Field label="Reported issue">
              <textarea name="issue_description" defaultValue={repair.issue_description} required />
            </Field>
          )}
        </section>
        <section className="configuration-section">
          <h3>Service pricing & promotion</h3>
          <p className="muted">
            Labor is editable. The backend recalculates subtotal, discount, tax, total, and
            work-item balances while preserving stock part lines.
          </p>
          <div className="stack gap-3">
            {serviceLines.map((line, index) => (
              <div className="form-grid repair-service-line" key={`edit-service-line-${index}`}>
                <Field label={`Service ${index + 1}`}>
                  <select
                    value={line.serviceId}
                    onChange={(event) =>
                      setServiceLineOverride((current) =>
                        (current ?? serviceLines).map((entry, lineIndex) =>
                          lineIndex === index ? { ...entry, serviceId: event.target.value } : entry,
                        ),
                      )
                    }
                  >
                    <option value="">No service line</option>
                    {services.data.map((service) => (
                      <option value={service.id} key={service.id}>
                        {service.code} / {service.name} / {service.labor_fee}
                        {!service.is_active ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) =>
                      setServiceLineOverride((current) =>
                        (current ?? serviceLines).map((entry, lineIndex) =>
                          lineIndex === index ? { ...entry, quantity: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Work item">
                  <select
                    value={line.workItemId}
                    onChange={(event) =>
                      setServiceLineOverride((current) =>
                        (current ?? serviceLines).map((entry, lineIndex) =>
                          lineIndex === index
                            ? { ...entry, workItemId: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  >
                    {workItems.map((workItem, workItemIndex) => (
                      <option value={workItem.id} key={workItem.id}>
                        {workItemIndex + 1}. {workItem.device.device_type}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setServiceLineOverride((current) =>
                      (current ?? serviceLines).filter((_, lineIndex) => lineIndex !== index),
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
                setServiceLineOverride((current) => [
                  ...(current ?? serviceLines),
                  {
                    serviceId: "",
                    quantity: "1",
                    workItemId: workItems[0]?.id ?? "",
                  },
                ])
              }
            >
              + Add service line
            </button>
          </div>
          <div className="form-grid">
            <Field label="Labor fee">
              <input
                name="labor_fee"
                type="number"
                min="0"
                step="0.01"
                defaultValue={repair.labor_fee}
                required
              />
            </Field>
            <Field label="Promotion">
              <select
                name="promotion_id"
                value={promotionId}
                onChange={(event) => setPromotionId(event.target.value)}
              >
                <option value="">No promotion</option>
                {promotions.data.map((promotion) => (
                  <option value={promotion.id} key={promotion.id}>
                    {promotion.name} /{" "}
                    {promotion.promotion_type === "PERCENTAGE"
                      ? `${promotion.value}%`
                      : promotion.value}
                    {!promotion.is_active ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="configuration-section">
          <h3>Payment</h3>
          <p className="muted">
            Payment status is derived from captured payments and refunds. This target records a
            payment or asks you to refund the ledger first.
          </p>
          <div className="form-grid">
            <Field label="Payment status target">
              <select name="payment_status" defaultValue={repair.payment_status}>
                <option value="UNPAID">Unpaid</option>
                <option value="DEPOSIT_PAID">Deposit paid</option>
                <option value="PAID">Paid</option>
              </select>
            </Field>
            <Field label="Deposit amount">
              <input
                name="payment_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={repair.deposit_paid}
              />
            </Field>
            <Field label="Payment type">
              <select name="payment_type_id" defaultValue={usablePaymentTypes.find((item) => item.category_code === "CASH")?.id} required>
                {usablePaymentTypes.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.category_code}</option>)}
              </select>
            </Field>
          </div>
          <div className="stack gap-2">
            <strong>Captured payments</strong>
            {payments.loading ? (
              <small>Loading payments...</small>
            ) : payments.data.length === 0 ? (
              <small className="muted">No captured payments.</small>
            ) : (
              payments.data.map((payment) => (
                <div className="variant-list" key={payment.id}>
                  <div>
                    <strong>
                      {payment.kind} /{" "}
                      {formatMoney(payment.amount, merchant?.default_currency_code)}
                    </strong>
                    <small>
                      {payment.method} / <StatusBadge status={payment.status} />
                    </small>
                  </div>
                  {payment.status !== "REFUNDED" && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setRefundPaymentId((current) => (current === payment.id ? "" : payment.id));
                        setRefundAmount(payment.amount);
                      }}
                    >
                      Refund
                    </button>
                  )}
                  {refundPaymentId === payment.id && (
                    <div className="inline-form wide">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value)}
                        aria-label="Refund amount"
                      />
                      <input
                        value={refundReason}
                        onChange={(event) => setRefundReason(event.target.value)}
                        placeholder="Reason"
                        aria-label="Refund reason"
                      />
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() => void submitRefund(payment)}
                      >
                        Record refund
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="configuration-section">
          <h3>Ticket note</h3>
          <p>General information that applies to the whole repair ticket.</p>
          <Field label="Note">
            <textarea name="note" defaultValue={repair.note ?? ""} />
          </Field>
        </section>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions repair-edit-actions">
          <Link className="button button-secondary" href="/repairs">
            Cancel
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save ticket"}
          </Button>
        </div>
      </Form>
    </>
  );
}
