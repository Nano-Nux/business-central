"use client";

import { type FormEvent, useRef, useState } from "react";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOffline } from "@/lib/offline";
import { listOperations } from "@/lib/offline-db";
import { queueStockReceipt, queueStockReduction } from "@/lib/offline-stock";
import { randomUuid } from "@/lib/random-uuid";
import { useResource } from "@/lib/use-resource";
import { shopStockLocation } from "@/lib/shop-stock-location";
import { useShop } from "@/lib/shop";
import { formatQuantity } from "@/lib/currency";
import type { Location, StorageItem } from "@/lib/types";
import { Button, Field, Form, Modal } from "./ui";

export function StorageStockDialog({
  item,
  action: initialAction,
  onClose,
  onSaved,
}: {
  item: StorageItem;
  action?: "increase" | "reduce";
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { isMerchant } = useAuth();
  const offline = useOffline();
  const { currentShop } = useShop();
  const locations = useResource<Location>(
    isMerchant ? "/inventory/locations?page_index=0&page_size=100" : "",
    undefined,
    true,
  );
  const location = shopStockLocation(locations.data, currentShop?.id);
  const pendingRequest = useRef<{ body: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"increase" | "reduce">(initialAction ?? "increase");
  const adjusting = initialAction === undefined;
  const increasing = action === "increase";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isMerchant || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      if (locations.loading || locations.error || !location?.shop_id)
        throw new Error("Stock is not available for the selected shop.");
      const quantity = String(form.get("quantity") ?? "").trim();
      const content = {
        variant_id: item.id,
        quantity,
        ...(increasing
          ? {
              destination_location_id: location.id,
              unit_id: item.base_unit_id ?? "",
              ...(String(form.get("unit_cost") ?? "").trim()
                ? { unit_cost: String(form.get("unit_cost")).trim() }
                : {}),
            }
          : { source_location_id: location.id, reason: String(form.get("reason") ?? "").trim() }),
      };
      const body = JSON.stringify(content);
      if (pendingRequest.current?.body !== body)
        pendingRequest.current = { body, id: randomUuid() };
      const id = pendingRequest.current.id;
      const payload = { ...content, event_key: `storage-${action}:${id}` };
      let message = increasing
        ? "Stock increased. Receipt recorded in stock history."
        : "Stock reduced. Adjustment recorded in stock history.";
      if (offline.scope && offline.storageAvailable) {
        if (increasing) {
          await queueStockReceipt(
            offline.scope,
            location.shop_id,
            {
              variant_id: item.id,
              destination_location_id: location.id,
              unit_id: item.base_unit_id ?? "",
              quantity,
              event_key: payload.event_key,
              ...(form.get("unit_cost") ? { unit_cost: String(form.get("unit_cost")).trim() } : {}),
            },
            id,
          );
        } else {
          await queueStockReduction(
            offline.scope,
            location.shop_id,
            {
              variant_id: item.id,
              source_location_id: location.id,
              quantity,
              reason: String(form.get("reason") ?? "").trim(),
              event_key: payload.event_key,
            },
            id,
          );
        }
        if (navigator.onLine) await offline.syncNow();
        const operation = (await listOperations(offline.scope)).find((row) => row.entityId === id);
        if (operation && operation.status !== "SYNCED") {
          message = ["REJECTED", "CONFLICT", "BLOCKED"].includes(operation.status)
            ? `Stock change needs review: ${operation.lastError || operation.status}. Open synchronization details.`
            : "Stock change saved locally and pending backend validation. It will synchronize when connected.";
        }
        await offline.refresh();
      } else {
        await post(increasing ? "/inventory/stock-in" : "/inventory/stock-reductions", payload);
      }
      await onSaved(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stock could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!isMerchant) return null;
  return (
    <Modal
      open
      title={adjusting ? "Adjust stock" : increasing ? "Increase stock" : "Reduce stock"}
      description={`${item.product_name} · ${item.variant_name}. Total stock: ${formatQuantity(item.stock_count)} ${item.unit}.`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <Form onSubmit={save}>
        <div className="form-grid">
          {adjusting && (
            <div className="wide">
              <Field label="Stock adjustment">
                <select
                  value={action}
                  disabled={busy}
                  onChange={(event) => {
                    setAction(event.target.value as "increase" | "reduce");
                    setError("");
                  }}
                >
                  <option value="increase">Add stock</option>
                  <option value="reduce">Remove stock</option>
                </select>
              </Field>
            </div>
          )}
          <p className="muted-text wide">Stock in {currentShop?.name || "the selected shop"}</p>
          <Field label={`${increasing ? "Quantity to add" : "Quantity to remove"} (${item.unit})`}>
            <input
              name="quantity"
              type="number"
              required
              min={item.allows_decimal === false ? 1 : 0.000001}
              step={item.allows_decimal === false ? 1 : 0.000001}
              autoFocus
            />
          </Field>
          {increasing ? (
            <Field
              label="Original price per unit"
              hint="Leave blank to reuse the latest receipt cost or product original price. Enter a cost for the first receipt when none is configured."
            >
              <input
                name="unit_cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="Use latest cost"
              />
            </Field>
          ) : (
            <Field label="Reason for reduction">
              <textarea
                name="reason"
                required
                maxLength={1000}
                placeholder="Damage, loss or physical count correction"
              />
            </Field>
          )}
        </div>
        {!increasing && (
          <p className="muted-text">
            Available stock is checked in the selected shop. Reserved stock cannot be removed. This
            creates a permanent stock movement.
          </p>
        )}
        {locations.error && (
          <p role="alert" className="form-error">
            {locations.error}
          </p>
        )}
        {!locations.loading && !locations.error && !location && (
          <p role="alert" className="form-error">
            Stock is not configured for the selected shop.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={increasing ? "primary" : "danger"}
            disabled={
              busy ||
              locations.loading ||
              !!locations.error ||
              !location ||
              (typeof navigator !== "undefined" && !navigator.onLine && !offline.storageAvailable)
            }
          >
            {busy ? "Saving…" : increasing ? "Add to stock" : "Confirm reduction"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
