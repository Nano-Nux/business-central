"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLoading, AdminSignInRequired } from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import {
  AIAdminStats,
  AIDeletionLog,
  getAIAdminStats,
  listAIDeletionLogs,
  purgeAIChatMessages,
} from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";

function formatAdminDateTime(utcStr?: string | null): { local: string; utc: string } {
  if (!utcStr) return { local: "Never purged", utc: "" };
  try {
    const d = new Date(utcStr);
    if (isNaN(d.getTime())) return { local: utcStr, utc: utcStr };

    const local = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(d);

    const utc = d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    return { local, utc };
  } catch {
    return { local: utcStr, utc: utcStr };
  }
}

export default function AIMaintenancePage() {
  const { session, ready, withAuth } = useAdminSession();
  const [stats, setStats] = useState<AIAdminStats | null>(null);
  const [logs, setLogs] = useState<AIDeletionLog[]>([]);
  const [, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    try {
      const [statsRes, logsRes] = await Promise.all([
        withAuth((token) => getAIAdminStats(token)),
        withAuth((token) => listAIDeletionLogs(token, 50)),
      ]);
      setStats(statsRes);
      setLogs(logsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI maintenance data.");
    } finally {
      setLoading(false);
    }
  }, [session, withAuth]);

  useEffect(() => {
    let active = true;
    if (!session) return;

    const fetchData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          withAuth((token) => getAIAdminStats(token)),
          withAuth((token) => listAIDeletionLogs(token, 50)),
        ]);
        if (!active) return;
        setStats(statsRes);
        setLogs(logsRes);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load AI maintenance data.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchData();

    return () => {
      active = false;
    };
  }, [session, withAuth]);

  async function handlePurge() {
    setError("");
    setSuccessMessage("");
    setPurging(true);
    try {
      const result = await withAuth((token) => purgeAIChatMessages(token));
      setConfirmOpen(false);
      setSuccessMessage(
        `Successfully purged ${result.deleted_messages} AI messages and ${result.deleted_conversations} conversations from the server database.`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to purge AI chat messages.");
    } finally {
      setPurging(false);
    }
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;

  const lastPurgeFormatted = formatAdminDateTime(stats?.last_deletion?.deleted_at);

  return (
    <AdminShell session={session} active="ai-maintenance">
      <header className="topbar">
        <div>
          <p className="eyebrow">SERVER & STORAGE MAINTENANCE</p>
          <h1>AI Chat Data Cleanup</h1>
          <p className="muted">
            Manage and reclaim database storage by manually purging historical AI chat messages.
            Audit logs record each deletion in UTC time format and display converted to your local time.
          </p>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}
      {successMessage && (
        <div className="banner" style={{ borderColor: "#b6d8c2", background: "#f1f9f4", color: "#176b45" }}>
          <strong>Success:</strong> {successMessage}
        </div>
      )}

      {/* Storage Statistics Cards */}
      <section className="stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <article>
          <span className="stat-label">Stored AI Messages</span>
          <strong>{stats ? stats.total_messages.toLocaleString() : "—"}</strong>
          <small>Total messages across all merchants</small>
        </article>
        <article>
          <span className="stat-label">Stored Conversations</span>
          <strong>{stats ? stats.total_conversations.toLocaleString() : "—"}</strong>
          <small>Total conversation threads</small>
        </article>
        <article>
          <span className="stat-label">AI Enabled Merchants</span>
          <strong>{stats ? stats.total_merchants_with_ai.toLocaleString() : "—"}</strong>
          <small>Tenants with Nanonux AI active</small>
        </article>
        <article>
          <span className="stat-label">Last Purged</span>
          <strong style={{ fontSize: "16px", letterSpacing: "normal", margin: "14px 0 6px" }}>
            {lastPurgeFormatted.local}
          </strong>
          <small>{lastPurgeFormatted.utc ? `${lastPurgeFormatted.utc}` : "No previous purges recorded"}</small>
        </article>
      </section>

      {/* Action Card: Storage Purge */}
      <section className="panel" style={{ marginBottom: "27px", borderLeft: "4px solid var(--red)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ maxWidth: "680px" }}>
            <h2 style={{ color: "var(--red)", fontSize: "17px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>⚠️</span> Purge All AI Chat Data
            </h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Manually delete all AI messages and conversations from the server database to free up storage space.
              This will reset chat history for all merchants. Deletion timestamps are permanently recorded in UTC format.
            </p>
          </div>
          <button
            className="danger-button"
            style={{ padding: "12px 20px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
            onClick={() => setConfirmOpen(true)}
            disabled={purging || (stats !== null && stats.total_messages === 0 && stats.total_conversations === 0)}
          >
            <span>🗑️</span> Purge AI Chat Messages Now
          </button>
        </div>
      </section>

      {/* Audit Log Table */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Deletion Audit History</h2>
            <p className="muted" style={{ fontSize: "12px", marginTop: "2px" }}>
              Permanent record of past AI chat deletions. Recorded in UTC time on the server and converted to your administrator local time.
            </p>
          </div>
          <span className="count">{logs.length} purge events</span>
        </div>

        {logs.length === 0 ? (
          <p className="empty">No past AI chat deletion logs recorded yet.</p>
        ) : (
          <div className="data-list">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2.2fr 1.8fr 1fr 1fr 2fr",
                padding: "8px 12px",
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--muted)",
                borderBottom: "1px solid #edf1ee",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <div>Admin Local Date & Time</div>
              <div>Server Time (UTC)</div>
              <div>Messages</div>
              <div>Conversations</div>
              <div>Purged By</div>
            </div>

            {logs.map((log) => {
              const dt = formatAdminDateTime(log.deleted_at);
              return (
                <div
                  key={log.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2.2fr 1.8fr 1fr 1fr 2fr",
                    alignItems: "center",
                    padding: "14px 12px",
                    borderTop: "1px solid #edf1ee",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <strong>{dt.local}</strong>
                    <small style={{ display: "block", color: "var(--muted)", fontSize: "10px" }}>Local timezone</small>
                  </div>
                  <div>
                    <span className="pill neutral" style={{ fontFamily: "monospace", fontSize: "11px" }}>
                      {dt.utc}
                    </span>
                  </div>
                  <div>
                    <span className="pill danger">{log.messages_count.toLocaleString()} msgs</span>
                  </div>
                  <div>
                    <span className="pill neutral">{log.conversations_count.toLocaleString()} convs</span>
                  </div>
                  <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ fontWeight: 600 }}>{log.deleted_by_name}</span>
                    <small style={{ display: "block", color: "var(--muted)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {log.deleted_by_email}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: "480px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ color: "var(--red)" }}>Confirm AI Data Purge</h2>
              <button className="close" onClick={() => setConfirmOpen(false)} disabled={purging}>
                ×
              </button>
            </div>
            <p style={{ marginTop: "16px", fontSize: "13px", lineHeight: "1.6" }}>
              Are you sure you want to permanently delete all AI chat messages and conversations?
            </p>
            <div
              style={{
                background: "#fdf2f2",
                border: "1px solid #f8b4b4",
                borderRadius: "8px",
                padding: "12px 14px",
                margin: "14px 0",
                fontSize: "12px",
                color: "#9b1c1c",
              }}
            >
              <strong>Warning:</strong> This action cannot be reversed. All merchant chat histories will be purged immediately to reclaim server storage.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button
                type="button"
                className="outline-button"
                style={{ padding: "10px 16px" }}
                onClick={() => setConfirmOpen(false)}
                disabled={purging}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "6px" }}
                onClick={handlePurge}
                disabled={purging}
              >
                {purging ? "Purging data..." : "Yes, Purge All AI Messages"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
