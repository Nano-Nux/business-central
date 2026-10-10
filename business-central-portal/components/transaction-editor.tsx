"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { randomUuid } from "@/lib/random-uuid";
import { useResource } from "@/lib/use-resource";
import type { TransactionHistoryDetail } from "@/lib/types";
import { Button, Field, Modal } from "./ui";
import styles from "./transaction-detail-page.module.css";

type CatalogOption = {
  id: string;
  product_name: string;
  name: string;
  sku: string;
  price: string;
};

export function TransactionEditor({
  detail,
  onClose,
  onSaved,
}: {
  detail: TransactionHistoryDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const order = detail.order!;
  const [form, setForm] = useState({
    customer_name: order.customer_name ?? "",
    customer_phone: order.customer_phone ?? "",
    note: order.note ?? "",
    payment_method: order.payment_type || detail.entry.payment_method || "Cash",
    delivery_name: order.delivery_name ?? "",
    delivery_contact: order.delivery_contact ?? "",
    delivery_fee: order.shipping_total,
    delivery_payment_status: order.delivery_payment_status ?? "UN_PAID",
  });
  const [lines, setLines] = useState(
    detail.lines.map((line) => ({
      key: randomUuid(),
      variant_id: line.variant_id ?? "",
      asset_id: line.asset_id ?? "",
      name: line.product_name || line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_amount: line.discount_amount,
      tax_amount: line.tax_amount,
    })),
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const key = useRef(randomUuid());
  const catalog = useResource<CatalogOption>(
    `/pos/catalog?page_index=0&page_size=100&shop_id=${encodeURIComponent(order.shop_id ?? "")}`,
    undefined,
    true,
  );
  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    key.current = randomUuid();
  };
  const setLine = (index: number, field: string, value: string) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
    key.current = randomUuid();
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api(`/pos/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          lines: lines.map(
            ({ variant_id, asset_id, quantity, unit_price, discount_amount, tax_amount }) => ({
              variant_id,
              asset_id,
              quantity,
              unit_price,
              discount_amount,
              tax_amount,
            }),
          ),
          shop_id: order.shop_id,
          expected_updated_at: order.updated_at,
          idempotency_key: key.current,
        }),
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save transaction.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="Edit transaction"
      description="Saving replaces this sale’s items, totals and payment records. Stock is adjusted automatically."
      onClose={() => {
        if (!lock.current) onClose();
      }}
      className={styles.editor}
    >
      <form onSubmit={save}>
        <fieldset disabled={busy} className={styles.editorFields}>
          <div className={styles.facts}>
            {(
              [
                ["customer_name", "Customer name"],
                ["customer_phone", "Customer phone"],
                ["payment_method", "Payment type"],
                ["delivery_name", "Delivery service"],
                ["delivery_contact", "Delivery contact"],
              ] as const
            ).map(([field, label]) => (
              <Field key={field} label={label}>
                <input
                  value={form[field]}
                  onChange={(e) => setField(field, e.target.value)}
                  required={field === "payment_method"}
                />
              </Field>
            ))}
            <Field label="Delivery fee">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.delivery_fee}
                onChange={(e) => setField("delivery_fee", e.target.value)}
              />
            </Field>
            <Field label="Delivery payment status">
              <select
                value={form.delivery_payment_status}
                onChange={(e) => setField("delivery_payment_status", e.target.value)}
              >
                <option value="UN_PAID">Un-paid</option>
                <option value="COMPLETE">Complete</option>
              </select>
            </Field>
          </div>
          <Field label="Order note">
            <textarea value={form.note} onChange={(e) => setField("note", e.target.value)} />
          </Field>
          <h3>Order items</h3>
          {lines.map((line, index) => (
            <div key={line.key} className={styles.editorItem}>
              <Field label={`Item ${index + 1}`}>
                <select
                  required
                  value={line.variant_id}
                  onChange={(e) => {
                    const option = catalog.data.find((item) => item.id === e.target.value);
                    setLine(index, "variant_id", e.target.value);
                    setLine(index, "asset_id", "");
                    if (option) {
                      setLine(index, "name", option.product_name);
                      setLine(index, "unit_price", option.price);
                    }
                  }}
                >
                  <option value={line.variant_id}>{line.name || "Select product"}</option>
                  {catalog.data
                    .filter((item) => item.id !== line.variant_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.product_name} · {item.name} · {item.sku}
                      </option>
                    ))}
                </select>
              </Field>
              <div className={styles.facts}>
                {(
                  [
                    ["quantity", "Quantity", "0.000001", "0.000001"],
                    ["unit_price", "Unit price", "0", "0.01"],
                    ["discount_amount", "Discount", "0", "0.01"],
                    ["tax_amount", "Tax", "0", "0.01"],
                  ] as const
                ).map(([field, label, min, step]) => (
                  <Field key={field} label={`${label} for item ${index + 1}`}>
                    <input
                      type="number"
                      min={min}
                      step={step}
                      required
                      value={line[field]}
                      onChange={(e) => setLine(index, field, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={lines.length === 1}
                onClick={() => {
                  setLines((current) => current.filter((_, i) => i !== index));
                  key.current = randomUuid();
                }}
              >
                Remove item {index + 1}
              </Button>
            </div>
          ))}
          {catalog.error && (
            <p className="notice">
              Existing items can be edited. Additional products could not load: {catalog.error}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setLines((current) => [
                ...current,
                {
                  key: randomUuid(),
                  variant_id: "",
                  asset_id: "",
                  name: "",
                  quantity: "1",
                  unit_price: "0",
                  discount_amount: "0",
                  tax_amount: "0",
                },
              ]);
              key.current = randomUuid();
            }}
          >
            Add item
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || lines.some((line) => !line.variant_id)}>
            {busy ? "Saving transaction…" : "Save transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
