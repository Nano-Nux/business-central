"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import { listMerchants, Merchant, updateMerchant } from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";

export default function MerchantsPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [editingAiMerchant, setEditingAiMerchant] = useState<Merchant | null>(null);
  const [editAiLimitValue, setEditAiLimitValue] = useState<number>(50);
  const [resetUsageCount, setResetUsageCount] = useState<boolean>(false);
  const [editAiSaving, setEditAiSaving] = useState<boolean>(false);
  const [editAiError, setEditAiError] = useState<string>("");

  useEffect(() => {
    if (!session) return;
    void withAuth((token) => listMerchants(token))
      .then((r) => setMerchants(r.data))
      .catch((e: Error) => setError(e.message));
  }, [session, withAuth]);

  async function toggleStatus(merchant: Merchant) {
    const nextActive = !merchant.is_active;
    const action = nextActive ? "activate" : "suspend";
    if (
      !window.confirm(
        `Are you sure you want to ${action} merchant "${merchant.name}"? ${
          nextActive
            ? "They will regain access to backend APIs."
            : "Offline mobile devices will be remotely locked on next connection!"
        }`,
      )
    ) {
      return;
    }

    setBusyId(merchant.id);
    setError("");
    try {
      const result = await withAuth((token) =>
        updateMerchant(token, merchant.id, { is_active: nextActive }),
      );
      setMerchants((prev) =>
        prev.map((m) => (m.id === merchant.id ? result.data : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} merchant.`);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAiAssistant(merchant: Merchant) {
    const nextAi = !merchant.ai_assistant_enabled;
    setBusyId(merchant.id);
    setError("");
    try {
      const result = await withAuth((token) =>
        updateMerchant(token, merchant.id, { ai_assistant_enabled: nextAi }),
      );
      setMerchants((prev) =>
        prev.map((m) => (m.id === merchant.id ? result.data : m)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update AI Assistant status.");
    } finally {
      setBusyId(null);
    }
  }

  function openEditAiLimit(merchant: Merchant) {
    setEditingAiMerchant(merchant);
    setEditAiLimitValue(merchant.ai_usage_limit ?? 50);
    setResetUsageCount(false);
    setEditAiError("");
  }

  async function handleSaveAiLimit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAiMerchant) return;
    setEditAiSaving(true);
    setEditAiError("");
    try {
      const payload: { ai_usage_limit: number; ai_usage_count?: number } = {
        ai_usage_limit: Number(editAiLimitValue),
      };
      if (resetUsageCount) {
        payload.ai_usage_count = 0;
      }
      const result = await withAuth((token) =>
        updateMerchant(token, editingAiMerchant.id, payload),
      );
      setMerchants((prev) =>
        prev.map((m) => (m.id === editingAiMerchant.id ? result.data : m)),
      );
      setEditingAiMerchant(null);
    } catch (err) {
      setEditAiError(err instanceof Error ? err.message : "Failed to update AI usage limit.");
    } finally {
      setEditAiSaving(false);
    }
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  const filtered = merchants.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.slug.toLowerCase().includes(search.toLowerCase()) ||
      (m.legal_name && m.legal_name.toLowerCase().includes(search.toLowerCase())),
  );

  const activeCount = merchants.filter((m) => m.is_active).length;
  const suspendedCount = merchants.length - activeCount;

  return (
    <AdminShell session={session} active="merchants">
      <header className="topbar">
        <div>
          <p className="eyebrow">PLATFORM MERCHANTS</p>
          <h1>Merchants</h1>
          <p className="muted">
            Manage merchant tenant status, remote locking, and cloud disaster recovery backups.
          </p>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      <section className="stats">
        <article>
          <span className="stat-label">Total merchants</span>
          <strong>{merchants.length}</strong>
        </article>
        <article>
          <span className="stat-label">Active</span>
          <strong style={{ color: "#10b981" }}>{activeCount}</strong>
          <small>Operational</small>
        </article>
        <article>
          <span className="stat-label">Suspended</span>
          <strong style={{ color: suspendedCount > 0 ? "#ef4444" : "inherit" }}>
            {suspendedCount}
          </strong>
          <small>Remotely locked</small>
        </article>
      </section>

      <section className="panel route-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DIRECTORY</p>
            <h2>{filtered.length} Merchants</h2>
          </div>
          <input
            type="search"
            placeholder="Search merchant name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "0.4rem 0.8rem", borderRadius: "6px", border: "1px solid var(--border, #cbd5e1)" }}
          />
        </div>

        <div className="data-list">
          {filtered.map((merchant) => (
            <div className="data-row" key={merchant.id}>
              <span className="shop-icon">{merchant.name[0]?.toUpperCase()}</span>
              <span className="data-info">
                <strong>{merchant.name}</strong>
                <small>
                  Slug: {merchant.slug} · Currency: {merchant.default_currency_code} · Mode:{" "}
                  {merchant.pos_complexity_level} · Plan:{" "}
                  {merchant.business_central_pricing_model
                    ? merchant.business_central_pricing_model.charAt(0).toUpperCase() +
                      merchant.business_central_pricing_model.slice(1)
                    : "Starter"}
                </small>
              </span>
              <span className={`pill ${merchant.is_active ? "success" : "danger"}`}>
                {merchant.is_active ? "Active" : "Suspended"}
              </span>

              <span className={`pill ${merchant.ai_assistant_enabled ? "success" : ""}`} style={{ opacity: merchant.ai_assistant_enabled ? 1 : 0.65 }}>
                {merchant.ai_assistant_enabled ? "AI: Enabled" : "AI: Off"}
              </span>

              <span
                className="pill"
                style={{
                  background:
                    (merchant.ai_usage_count ?? 0) >= (merchant.ai_usage_limit ?? 50)
                      ? "#fbe9e9"
                      : "#eef4ff",
                  color:
                    (merchant.ai_usage_count ?? 0) >= (merchant.ai_usage_limit ?? 50)
                      ? "#a13f3f"
                      : "#1e40af",
                  fontWeight: 700,
                  opacity: merchant.ai_assistant_enabled ? 1 : 0.65,
                }}
                title={`AI Usage: ${merchant.ai_usage_count ?? 0} of ${merchant.ai_usage_limit ?? 50} queries used`}
              >
                AI Usage: {merchant.ai_usage_count ?? 0}/{merchant.ai_usage_limit ?? 50}
              </span>

              <button
                className="row-action"
                disabled={busyId === merchant.id}
                onClick={() => openEditAiLimit(merchant)}
                title="Edit AI query limit for this merchant"
              >
                Edit Limit
              </button>

              <button
                className="row-action"
                disabled={busyId === merchant.id}
                onClick={() => void toggleAiAssistant(merchant)}
                title="Toggle Nanonux AI Assistant permission for this merchant"
              >
                {busyId === merchant.id
                  ? "…"
                  : merchant.ai_assistant_enabled
                  ? "Disable AI"
                  : "Enable AI"}
              </button>

              <button
                className={`row-action ${merchant.is_active ? "danger-text" : ""}`}
                disabled={busyId === merchant.id}
                onClick={() => void toggleStatus(merchant)}
              >
                {busyId === merchant.id
                  ? "Updating…"
                  : merchant.is_active
                  ? "Suspend"
                  : "Activate"}
              </button>

              <Link
                className="row-action"
                href={`/merchants/${merchant.id}/backups`}
                style={{ textDecoration: "none" }}
              >
                Cloud Backups →
              </Link>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="muted" style={{ padding: "1.5rem", textAlign: "center" }}>
              No merchants found.
            </p>
          )}
        </div>
      </section>

      {editingAiMerchant && (
        <div
          className="modal-backdrop"
          onClick={() => !editAiSaving && setEditingAiMerchant(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">AI USAGE QUOTA</p>
                <h2>Edit AI Limit: {editingAiMerchant.name}</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setEditingAiMerchant(null)}
                disabled={editAiSaving}
              >
                &times;
              </button>
            </div>

            {editAiError && <p className="error banner">{editAiError}</p>}

            <form onSubmit={handleSaveAiLimit}>
              <div>
                <label>
                  AI Query Limit Amount (Default: 50)
                  <input
                    type="number"
                    min="0"
                    required
                    value={editAiLimitValue}
                    onChange={(e) =>
                      setEditAiLimitValue(Math.max(0, parseInt(e.target.value) || 0))
                    }
                  />
                </label>
                <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                  The maximum total number of AI assistant messages/queries this merchant is allowed to run.
                </small>
              </div>

              <div
                style={{
                  padding: "14px",
                  background: "var(--paper, #f7faf8)",
                  borderRadius: "9px",
                  border: "1px solid var(--line, #e5ebe7)",
                }}
              >
                <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 700 }}>
                  Current Usage:{" "}
                  <strong>{editingAiMerchant.ai_usage_count ?? 0}</strong> /{" "}
                  {editingAiMerchant.ai_usage_limit ?? 50} queries used
                </p>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    margin: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={resetUsageCount}
                    onChange={(e) => setResetUsageCount(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  Reset current usage count to 0
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setEditingAiMerchant(null)}
                  disabled={editAiSaving}
                >
                  Cancel
                </button>
                <button type="submit" disabled={editAiSaving}>
                  {editAiSaving ? "Saving…" : "Save AI Limit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
