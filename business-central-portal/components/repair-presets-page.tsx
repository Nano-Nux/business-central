"use client";

import { FormEvent, useState } from "react";
import { patch, post, remove } from "@/lib/api";
import { useOffline } from "@/lib/offline";
import { useResource } from "@/lib/use-resource";
import { useShop } from "@/lib/shop";
import type { RepairPreset } from "@/lib/types";
import { Button, EmptyState, Field, Form, Loading, PageHeader } from "./ui";

export function RepairPresetsPage({ type }: { type: "ISSUE" | "CONDITION" }) {
  const { currentShop } = useShop();
  const offline = useOffline();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<RepairPreset | null>(null);
  const label = type === "ISSUE" ? "Issue" : "Condition";
  const path = currentShop
    ? `/repairs/presets?shop_id=${encodeURIComponent(currentShop.id)}&preset_type=${type}&page_index=0&page_size=200`
    : "";
  const presets = useResource<RepairPreset>(path);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentShop) return;
    if (offline.status === "offline") {
      setMessage("Connect to manage repair presets.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const body = {
      shop_id: currentShop.id,
      preset_type: type,
      value: String(form.get("value") || "").trim(),
    };
    try {
      if (editing) await patch(`/repairs/presets/${editing.id}`, body);
      else await post("/repairs/presets", body);
      setEditing(null);
      event.currentTarget.reset();
      setMessage(`${label} preset saved.`);
      await presets.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : `${label} preset could not be saved.`);
    }
  }

  async function deletePreset(id: string) {
    if (offline.status === "offline") {
      setMessage("Connect to manage repair presets.");
      return;
    }
    try {
      await remove(`/repairs/presets/${id}`);
      setMessage(`${label} preset deleted.`);
      await presets.reload();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : `${label} preset could not be deleted.`,
      );
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Repairs"
        title={`${label} presets`}
        description={`Manage shop-level ${label.toLowerCase()} values that can autofill repair device intake.`}
      />
      <Form className="card settings-stack" onSubmit={save} key={editing?.id ?? "new"}>
        <Field label={`${label} preset`}>
          <textarea name="value" defaultValue={editing?.value ?? ""} required maxLength={500} />
        </Field>
        <div className="modal-actions">
          {editing && (
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel edit
            </Button>
          )}
          <Button type="submit" disabled={offline.status === "offline"}>
            {editing ? "Update preset" : "Add preset"}
          </Button>
        </div>
        {message && <div className="notice">{message}</div>}
      </Form>
      <section className="card settings-stack">
        {presets.loading ? (
          <Loading />
        ) : presets.data.length === 0 ? (
          <EmptyState
            icon="repair"
            title={`No ${label.toLowerCase()} presets`}
            message={`Add the first preset for ${currentShop?.name ?? "this shop"}.`}
          />
        ) : (
          <div className="variant-list">
            {presets.data.map((preset) => (
              <div key={preset.id}>
                <div>
                  <strong>{preset.value}</strong>
                  <small>{currentShop?.name}</small>
                </div>
                <div className="row-actions">
                  <Button type="button" variant="secondary" onClick={() => setEditing(preset)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void deletePreset(preset.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
