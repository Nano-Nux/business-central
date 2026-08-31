"use client";

import { FormEvent, useMemo, useState } from "react";
import { patch, post, remove } from "@/lib/api";
import { useOffline } from "@/lib/offline";
import { useResource } from "@/lib/use-resource";
import type { PaymentType, PaymentTypeCategory } from "@/lib/types";
import { Icon } from "./icons";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Form,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  StatCard,
  useListPagination,
} from "./ui";

const CATEGORY_INFO: Record<
  string,
  { label: string; note: string; icon: "receipt" | "swap" | "tag" }
> = {
  CASH: {
    label: "Cash",
    note: "Physical cash register & drawer settlement",
    icon: "receipt",
  },
  ONLINE: {
    label: "Online / Card",
    note: "Card readers, QR codes, and digital transfers",
    icon: "swap",
  },
  DIGITAL: {
    label: "Digital Wallet",
    note: "Automated wallet integrations (future improvement)",
    icon: "tag",
  },
};

export function PaymentTypesPage() {
  const offline = useOffline();
  const paymentTypes = useResource<PaymentType>("/payment-types");
  const categories = useResource<PaymentTypeCategory>("/payment-type-categories");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("DEFAULT");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentType | null>(null);
  const [deleting, setDeleting] = useState<PaymentType | null>(null);

  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [bannerMessage, setBannerMessage] = useState("");

  const filteredTypes = useMemo(() => {
    const list = [...paymentTypes.data];
    const q = query.trim().toLowerCase();

    return list
      .filter((item) => {
        if (
          q &&
          !item.name.toLowerCase().includes(q) &&
          !item.category_code.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (categoryFilter !== "ALL" && item.category_code !== categoryFilter) {
          return false;
        }
        if (statusFilter === "ACTIVE" && !item.is_active) {
          return false;
        }
        if (statusFilter === "INACTIVE" && item.is_active) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "NAME_ASC") return a.name.localeCompare(b.name);
        if (sortBy === "NAME_DESC") return b.name.localeCompare(a.name);
        if (sortBy === "NEWEST")
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        const catRank: Record<string, number> = { CASH: 1, ONLINE: 2, DIGITAL: 3 };
        const rankDiff = (catRank[a.category_code] ?? 9) - (catRank[b.category_code] ?? 9);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      });
  }, [paymentTypes.data, query, categoryFilter, statusFilter, sortBy]);

  const pagination = useListPagination(
    filteredTypes,
    10,
    `${query}|${categoryFilter}|${statusFilter}|${sortBy}`,
  );

  const activeCount = paymentTypes.data.filter((pt) => pt.is_active).length;
  const cashCount = paymentTypes.data.filter((pt) => pt.category_code === "CASH").length;
  const onlineCount = paymentTypes.data.filter((pt) => pt.category_code === "ONLINE").length;

  function openCreateModal() {
    setEditing(null);
    setModalError("");
    setModalOpen(true);
  }

  function openEditModal(item: PaymentType) {
    setEditing(item);
    setModalError("");
    setModalOpen(true);
  }

  async function toggleStatus(item: PaymentType) {
    if (offline.status === "offline") {
      setBannerMessage("Connect to update payment types.");
      return;
    }
    const nextState = !item.is_active;
    try {
      await patch(`/payment-types/${item.id}`, {
        name: item.name,
        category_code: item.category_code,
        is_active: nextState,
      });
      setBannerMessage(`Payment type "${item.name}" is now ${nextState ? "active" : "inactive"}.`);
      await paymentTypes.reload();
    } catch (reason) {
      setBannerMessage(reason instanceof Error ? reason.message : "Status could not be updated.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (offline.status === "offline") {
      setModalError("Connect to manage payment types.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const category_code = String(form.get("category_code") || "CASH");
    const is_active = form.get("is_active") === "on";

    if (!name) {
      setModalError("Payment type name is required.");
      return;
    }

    const body = { name, category_code, is_active };

    setBusy(true);
    setModalError("");

    try {
      if (editing) {
        await patch(`/payment-types/${editing.id}`, body);
        setBannerMessage(`Payment type "${name}" was updated.`);
      } else {
        await post("/payment-types", body);
        setBannerMessage(`Payment type "${name}" was created successfully.`);
      }
      setModalOpen(false);
      setEditing(null);
      await paymentTypes.reload();
    } catch (reason) {
      setModalError(
        reason instanceof Error ? reason.message : "Payment type could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    if (offline.status === "offline") {
      setDeleteError("Connect to delete payment types.");
      return;
    }

    setDeleteBusy(true);
    setDeleteError("");

    try {
      await remove(`/payment-types/${deleting.id}`);
      setBannerMessage(`Payment type "${deleting.name}" was deleted.`);
      setDeleting(null);
      await paymentTypes.reload();
    } catch (reason) {
      setDeleteError(
        reason instanceof Error ? reason.message : "Payment type could not be deleted.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Payment types"
        description="Configure merchant-wide payment methods used across POS checkout, invoices, and repair ticket settlement."
        action={
          <Button icon="plus" onClick={openCreateModal} disabled={offline.status === "offline"}>
            New payment type
          </Button>
        }
      />

      {bannerMessage && (
        <div
          className="notice"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <span>{bannerMessage}</span>
          <button
            type="button"
            className="icon-button"
            style={{ width: "24px", height: "24px", minHeight: "24px" }}
            onClick={() => setBannerMessage("")}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {offline.status === "offline" && (
        <div className="form-error" style={{ marginBottom: "16px" }}>
          You are currently offline. Payment type management requires an active connection.
        </div>
      )}

      <section className="stats-grid" style={{ marginBottom: "20px" }}>
        <StatCard
          icon="receipt"
          label="Total payment methods"
          value={String(paymentTypes.data.length)}
          note="Merchant-wide configured methods"
          tone="mint"
        />
        <StatCard
          icon="check"
          label="Active for checkout"
          value={String(activeCount)}
          note="Available at POS & repairs"
          tone="blue"
        />
        <StatCard
          icon="swap"
          label="Channel coverage"
          value={`${cashCount} Cash · ${onlineCount} Online`}
          note="Settlement channels enabled"
          tone="purple"
        />
      </section>

      <div className="toolbar list-toolbar">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payment types…"
            aria-label="Search payment types"
          />
        </div>
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="ALL">All categories</option>
          <option value="CASH">Cash only</option>
          <option value="ONLINE">Online / Card only</option>
          <option value="DIGITAL">Digital wallet only</option>
        </select>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active only</option>
          <option value="INACTIVE">Inactive only</option>
        </select>
        <select
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort payment types"
        >
          <option value="DEFAULT">Category & Name</option>
          <option value="NAME_ASC">Name A–Z</option>
          <option value="NAME_DESC">Name Z–A</option>
          <option value="NEWEST">Newest first</option>
        </select>
      </div>

      <div className="table-card">
        {paymentTypes.loading ? (
          <Loading />
        ) : paymentTypes.error ? (
          <EmptyState title="Payment types could not load" message={paymentTypes.error} />
        ) : filteredTypes.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No payment types found"
            message={
              query || categoryFilter !== "ALL" || statusFilter !== "ALL"
                ? "No payment method matches the selected filters."
                : "Create your first merchant payment type to enable customer checkout."
            }
            action={
              query || categoryFilter !== "ALL" || statusFilter !== "ALL" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setCategoryFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  icon="plus"
                  onClick={openCreateModal}
                  disabled={offline.status === "offline"}
                >
                  Add payment type
                </Button>
              )
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment Method</th>
                <th>Category</th>
                <th>Status</th>
                <th>Scope</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((item) => {
                const info = CATEGORY_INFO[item.category_code] ?? {
                  label: item.category_code,
                  note: "",
                  icon: "receipt" as const,
                };
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "var(--surface-muted)",
                            border: "1px solid var(--line)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--ink)",
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={info.icon} size={18} />
                        </div>
                        <div className="cell-main">
                          <strong>{item.name}</strong>
                          <small>{info.note}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          item.category_code === "CASH"
                            ? "success"
                            : item.category_code === "ONLINE"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {info.label}
                      </Badge>
                      {item.category_code === "DIGITAL" && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--muted)",
                            marginLeft: "6px",
                          }}
                        >
                          Future rollout
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void toggleStatus(item)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        title={item.is_active ? "Click to deactivate" : "Click to activate"}
                      >
                        <Badge tone={item.is_active ? "success" : "neutral"}>
                          {item.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </button>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                        All shops & registers
                      </span>
                    </td>
                    <td>
                      <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => openEditModal(item)}
                          disabled={offline.status === "offline"}
                        >
                          Edit
                        </Button>
                        <button
                          type="button"
                          className="danger"
                          title="Delete payment type"
                          onClick={() => {
                            setDeleting(item);
                            setDeleteError("");
                          }}
                          disabled={offline.status === "offline"}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        pageIndex={pagination.pageIndex}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        itemLabel="payment types"
        onPageChange={pagination.setPageIndex}
      />

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (!busy) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
        title={editing ? "Edit payment type" : "New payment type"}
        description={
          editing
            ? "Update payment type information and availability."
            : "Define a new payment method accepted across your stores and registers."
        }
      >
        <Form onSubmit={save} key={editing?.id ?? "create-new"}>
          <div className="settings-stack" style={{ gap: "16px" }}>
            <Field
              label="Payment method name"
              hint="Displayed to cashiers and printed on customer receipts."
            >
              <input
                name="name"
                maxLength={255}
                defaultValue={editing?.name ?? ""}
                placeholder="e.g. Cash USD, Card Terminal, KBZPay QR"
                required
                autoFocus
              />
            </Field>

            <Field
              label="Category"
              hint="Controls how payments are classified in transaction history and reports."
            >
              <select
                name="category_code"
                defaultValue={editing?.category_code ?? "CASH"}
                required
              >
                {categories.data.length > 0 ? (
                  categories.data.map((cat) => (
                    <option key={cat.code} value={cat.code}>
                      {cat.name}
                      {cat.code === "DIGITAL" ? " (Stored · Future rollout)" : ""}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="DIGITAL">Digital (Future rollout)</option>
                  </>
                )}
              </select>
            </Field>

            <label
              className="check-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "var(--surface-muted)",
                borderRadius: "8px",
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} />
              <span style={{ fontSize: "13px", fontWeight: 500 }}>
                Available for checkout & settlement
              </span>
            </label>

            <div className="notice" style={{ fontSize: "12px", lineHeight: "1.5" }}>
              💡 <strong>Cash</strong> and <strong>Online</strong> payment types are active for
              immediate checkout at POS and repair tickets.
            </div>

            {modalError && <div className="form-error">{modalError}</div>}

            <div className="modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setModalOpen(false);
                  setEditing(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || offline.status === "offline"}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create payment type"}
              </Button>
            </div>
          </div>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          if (!deleteBusy) {
            setDeleting(null);
            setDeleteError("");
          }
        }}
        title="Delete payment type"
        description="Are you sure you want to remove this payment method?"
      >
        <div className="settings-stack" style={{ gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6" }}>
            You are about to delete <strong>{deleting?.name}</strong> ({deleting?.category_code}).
          </p>

          <div
            className="notice"
            style={{
              background: "var(--status-warning-soft)",
              borderColor: "var(--status-warning-border)",
              color: "var(--status-warning)",
              fontSize: "12px",
            }}
          >
            ⚠️ If this payment type is linked to historical transactions or orders, the backend will
            prevent deletion to preserve accounting records. In that case, please mark it{" "}
            <strong>inactive</strong> instead.
          </div>

          {deleteError && <div className="form-error">{deleteError}</div>}

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeleting(null);
                setDeleteError("");
              }}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void confirmDelete()}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

