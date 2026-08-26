"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useOffline } from "@/lib/offline";
import { editQueuedRepairTicket } from "@/lib/offline-repairs";
import { deferredRequestFromPayload } from "@/lib/offline-deferred";
import { Button, EmptyState, Field, Form, PageHeader } from "./ui";

export function RepairSyncReviewPage({ operationId }: { operationId: string }) {
  const router = useRouter();
  const offline = useOffline();
  const operation = offline.operations.find((item) => item.operationId === operationId);
  const request = operation ? deferredRequestFromPayload(operation.payload) : null;
  const body = request?.body ?? {};
  const [deposit, setDeposit] = useState(String(body.deposit_amount ?? "0"));
  const [status, setStatus] = useState(String(body.payment_status ?? "UNPAID"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const summary = {
    orderNumber: String(body.order_number ?? operation?.entityId ?? ""),
    issue: String(body.issue_description ?? ""),
    workItems: Array.isArray(body.work_items) ? body.work_items.length : 0,
    parts: Array.isArray(body.parts) ? body.parts.length : 0,
    services: Array.isArray(body.service_items) ? body.service_items.length : 0,
  };
  if (!operation)
    return (
      <EmptyState
        title="Sync operation not found"
        message="It may already have synchronized or been removed from this browser."
      />
    );
  if (operation.entityType !== "REPAIR_ORDER" || operation.operationType !== "CREATE" || !request)
    return (
      <EmptyState
        title="Unsupported repair operation"
        message="Only queued repair-ticket creation requests can be edited here."
      />
    );
  const queuedOperation = operation;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amount = Number(deposit);
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Deposit amount must be zero or greater.");
      if (status === "UNPAID" && amount > 0)
        throw new Error("Set payment status to a paid state or enter zero.");
      if (status !== "UNPAID" && amount <= 0)
        throw new Error("Enter a positive deposit or choose Unpaid.");
      await editQueuedRepairTicket(queuedOperation, {
        deposit_amount: amount.toFixed(2),
        payment_status: status,
        payment_method: "CASH",
      });
      await offline.syncNow();
      router.push("/repairs");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The repair sync data could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Synchronization"
        title={`Review repair ${summary.orderNumber}`}
        description="Inspect the saved request, correct its payment data, and retry synchronization. The server has not created this ticket yet."
      />
      <Form className="card form-grid" onSubmit={save}>
        <div className="configuration-section wide">
          <h3>Saved request</h3>
          <p>{summary.issue || "No issue description"}</p>
          <small>
            {summary.workItems} work item(s) · {summary.services} service line(s) · {summary.parts}{" "}
            part(s)
          </small>
        </div>
        <Field label="Payment status">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="UNPAID">Unpaid</option>
            <option value="DEPOSIT_PAID">Deposit paid</option>
            <option value="PAID">Paid</option>
          </select>
        </Field>
        <Field label="Deposit amount">
          <input
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
            inputMode="decimal"
            min="0"
            step="0.01"
          />
        </Field>
        <Field label="Payment method">
          <input value="Cash" readOnly />
        </Field>
        <div className="wide">
          <p className="muted-text">
            The server will recalculate the authoritative repair total. Offline repair
            synchronization can capture cash only; external payments require a separate online
            authorization flow.
          </p>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions wide">
          <Button type="button" variant="secondary" onClick={() => router.push("/repairs")}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || offline.status === "offline"}>
            {busy ? "Saving…" : "Save and retry"}
          </Button>
        </div>
      </Form>
    </>
  );
}
