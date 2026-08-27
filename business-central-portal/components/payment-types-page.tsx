"use client";

import { FormEvent, useState } from "react";
import { patch, post, remove } from "@/lib/api";
import { useOffline } from "@/lib/offline";
import { useResource } from "@/lib/use-resource";
import type { PaymentType, PaymentTypeCategory } from "@/lib/types";
import { Badge, Button, EmptyState, Field, Form, Loading, PageHeader } from "./ui";

export function PaymentTypesPage() {
  const offline = useOffline();
  const paymentTypes = useResource<PaymentType>("/payment-types");
  const categories = useResource<PaymentTypeCategory>("/payment-type-categories");
  const [editing, setEditing] = useState<PaymentType | null>(null);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offline.status === "offline") return setMessage("Connect to manage payment types.");
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") || "").trim(),
      category_code: String(form.get("category_code") || ""),
      is_active: form.get("is_active") === "on",
    };
    try {
      if (editing) await patch(`/payment-types/${editing.id}`, body);
      else await post("/payment-types", body);
      setEditing(null);
      event.currentTarget.reset();
      setMessage("Payment type saved for this merchant.");
      await paymentTypes.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Payment type could not be saved.");
    }
  }

  async function deleteType(id: string) {
    if (offline.status === "offline") return setMessage("Connect to manage payment types.");
    try {
      await remove(`/payment-types/${id}`);
      setMessage("Payment type deleted.");
      if (editing?.id === id) setEditing(null);
      await paymentTypes.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Payment type could not be deleted.");
    }
  }

  return <>
    <PageHeader eyebrow="Settings" title="Payment types" description="Create merchant-wide payment choices used by every shop, POS checkout, and repair ticket." />
    <Form className="card settings-stack" onSubmit={save} key={editing?.id ?? "new"}>
      <Field label="Payment type name"><input name="name" maxLength={255} defaultValue={editing?.name ?? ""} required /></Field>
      <Field label="Category">
        <select name="category_code" defaultValue={editing?.category_code ?? "CASH"} required>
          {categories.data.map((category) => <option key={category.code} value={category.code}>{category.name}{category.is_available ? "" : " — Future improvement"}</option>)}
        </select>
      </Field>
      <label className="check-row"><input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} /><span>Available for new payments</span></label>
      <div className="notice">Cash and Online types need only a name. Digital is stored now but cannot be selected for a payment until a future improvement.</div>
      <div className="modal-actions">
        {editing && <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel edit</Button>}
        <Button type="submit" disabled={offline.status === "offline"}>{editing ? "Update payment type" : "Add payment type"}</Button>
      </div>
      {message && <div className="notice">{message}</div>}
    </Form>
    <section className="card settings-stack">
      {paymentTypes.loading ? <Loading /> : paymentTypes.data.length === 0 ? <EmptyState icon="receipt" title="No payment types" message="Add the first merchant payment type." /> :
        <div className="variant-list">{paymentTypes.data.map((item) => <div key={item.id}><div><strong>{item.name}</strong><small>{item.category_code === "DIGITAL" ? "Digital · Future improvement" : item.category_code}</small></div><div className="row-actions"><Badge tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Active" : "Inactive"}</Badge><Button type="button" variant="secondary" onClick={() => setEditing(item)}>Edit</Button><Button type="button" variant="secondary" onClick={() => void deleteType(item.id)}>Delete</Button></div></div>)}</div>}
    </section>
  </>;
}
