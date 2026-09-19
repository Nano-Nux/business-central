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
    </AdminShell>
  );
}
