"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminLoading,
  AdminSignInRequired,
} from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import { TelegramWebhookSettings } from "../../components/telegram-webhook-settings";
import {
  disconnectTelegramGroup,
  listTelegramAudit,
  listTelegramGroups,
  listTelegramGroupUsers,
  listTelegramOrders,
  refreshTelegramGroup,
  retryTelegramSynchronization,
  revokeTelegramSeller,
  rotateTelegramPairingCode,
  setTelegramGroupStatus,
  TelegramAuditEvent,
  TelegramGroup,
  TelegramGroupUser,
  TelegramOrder,
} from "../../lib/api";
import { useAdminSession } from "../../lib/use-admin-session";
const when = (v?: string) =>
  v
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
export default function TelegramGroupsPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [orders, setOrders] = useState<TelegramOrder[]>([]);
  const [users, setUsers] = useState<TelegramGroupUser[]>([]);
  const [audit, setAudit] = useState<TelegramAuditEvent[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [health, setHealth] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [pairing, setPairing] = useState<{
    code: string;
    expires_at: string;
  } | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [g, o] = await Promise.all([
        withAuth(listTelegramGroups),
        withAuth((t) => listTelegramOrders(t)),
      ]);
      setGroups(g);
      setOrders(o);
      if (!selected && g[0]) setSelected(g[0].id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load Telegram groups.",
      );
    }
  }, [session, withAuth, selected]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    if (selected && session) {
      void Promise.all([
        withAuth((t) => listTelegramGroupUsers(t, selected)),
        withAuth((t) => listTelegramAudit(t, selected)),
      ])
        .then(([userRows, auditRows]) => {
          if (active) {
            setUsers(userRows);
            setAudit(auditRows);
          }
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error ? e.message : "Could not load group details.",
            );
        });
    }
    return () => {
      active = false;
    };
  }, [selected, session, withAuth]);
  const filtered = useMemo(
    () =>
      groups.filter((g) => {
        const text = [
          g.merchant_name,
          g.shop_name,
          g.group_title,
          String(g.telegram_chat_id),
          g.creator_display_name_snapshot,
          g.creator_username_snapshot,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (!status || g.connection_status === status) &&
          (!health ||
            (health === "healthy"
              ? g.bot_admin_status && !g.last_error
              : !g.bot_admin_status || !!g.last_error))
        );
      }),
    [groups, query, status, health],
  );
  const group = groups.find((g) => g.id === selected);
  const groupOrders = orders.filter(
    (o) => o.telegram_group_connection_id === selected,
  );
  async function act(key: string, fn: (token: string) => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await withAuth(fn);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }
  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;
  return (
    <AdminShell session={session} active="telegram-groups">
      <header className="topbar">
        <div>
          <p className="eyebrow">PLATFORM AUTOMATIONS</p>
          <h1>Telegram groups</h1>
          <p className="muted">
            Global health, tenant ownership, seller permissions, orders, and
            synchronization state for the shared Telegram bot.
          </p>
        </div>
      </header>
      <TelegramWebhookSettings withAuth={withAuth} />
      {error && <p className="error banner">{error}</p>}
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-heading">
          <input
            placeholder="Merchant, shop, group, chat ID, or creator"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 300 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>ACTIVE</option>
            <option>PAUSED</option>
            <option>ERROR</option>
            <option>REVOKED</option>
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value)}>
            <option value="">All bot health</option>
            <option value="healthy">Healthy</option>
            <option value="error">Needs attention</option>
          </select>
        </div>
      </section>
      <div className="workspace">
        <section className="panel">
          <div className="panel-heading">
            <h2>Connections</h2>
            <span className="count">{filtered.length} groups</span>
          </div>
          <div className="merchant-list">
            {filtered.map((g) => (
              <button
                key={g.id}
                className={`merchant-row ${selected === g.id ? "selected" : ""}`}
                onClick={() => setSelected(g.id)}
              >
                <span className="merchant-icon">TG</span>
                <span className="merchant-info">
                  <strong>{g.group_title}</strong>
                  <small>
                    {g.merchant_name} · {g.shop_name} · {g.telegram_chat_id}
                  </small>
                </span>
                <span
                  className={`pill ${g.bot_admin_status && !g.last_error ? "success" : "danger"}`}
                >
                  {g.connection_status}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel route-panel">
          {!group ? (
            <p>Select a Telegram group.</p>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <h2>{group.group_title}</h2>
                  <p className="muted">
                    {group.merchant_name} · {group.shop_name}
                  </p>
                </div>
                <div>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      act("refresh", (t) => refreshTelegramGroup(t, group.id))
                    }
                  >
                    Refresh metadata
                  </button>{" "}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      act("retry", (t) =>
                        retryTelegramSynchronization(t, group.id),
                      )
                    }
                  >
                    Retry sync
                  </button>{" "}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      act("status", (t) =>
                        setTelegramGroupStatus(
                          t,
                          group.id,
                          group.connection_status === "PAUSED"
                            ? "ACTIVE"
                            : "PAUSED",
                        ),
                      )
                    }
                  >
                    {group.connection_status === "PAUSED" ? "Resume" : "Pause"}
                  </button>{" "}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      act("rotate", async (t) =>
                        setPairing(
                          await rotateTelegramPairingCode(t, group.id),
                        ),
                      )
                    }
                  >
                    Rotate code
                  </button>{" "}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      act("disconnect", (t) =>
                        disconnectTelegramGroup(t, group.id),
                      )
                    }
                  >
                    Disconnect
                  </button>
                </div>
              </div>
              {pairing && (
                <div className="banner">
                  <strong>New pairing code: {pairing.code}</strong> · expires{" "}
                  {when(pairing.expires_at)}
                </div>
              )}
              <div
                className="stats"
                style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 18 }}
              >
                <article>
                  <span className="stat-label">Bot status</span>
                  <strong style={{ fontSize: 16 }}>
                    {group.bot_membership_status}
                  </strong>
                  <small>
                    {group.bot_admin_status
                      ? "Administrator"
                      : "Permissions missing"}
                  </small>
                </article>
                <article>
                  <span className="stat-label">Member count</span>
                  <strong>{group.member_count ?? "—"}</strong>
                  <small>Telegram count when available</small>
                </article>
                <article>
                  <span className="stat-label">Last activity</span>
                  <strong style={{ fontSize: 14 }}>
                    {when(group.last_seen_at)}
                  </strong>
                  <small>
                    {group.last_error ?? "No synchronization error"}
                  </small>
                </article>
              </div>
              <h3>Group identity</h3>
              <p>
                <strong>Chat ID:</strong> {group.telegram_chat_id}
                <br />
                <strong>Type:</strong> {group.group_type}
                <br />
                <strong>Creator snapshot:</strong>{" "}
                {group.creator_display_name_snapshot ?? "Unavailable"}{" "}
                {group.creator_username_snapshot
                  ? `(@${group.creator_username_snapshot})`
                  : ""}
                <br />
                <strong>Connected:</strong> {when(group.connected_at)}
                <br />
                <strong>First seen:</strong> {when(group.first_seen_at)}
                <br />
                <strong>Creation date:</strong> Telegram creation date
                unavailable
              </p>
              <h3>Known users / authorized sellers</h3>
              <p className="muted">
                Observed users only; Telegram does not provide a complete member
                list.
              </p>
              {users.map((u) => (
                <div className="merchant-row" key={u.telegram_user_id}>
                  <span className="merchant-info">
                    <strong>
                      {u.display_name_snapshot ?? u.telegram_user_id}
                      {u.username_snapshot ? ` (@${u.username_snapshot})` : ""}
                    </strong>
                    <small>
                      {u.telegram_role} · last seen {when(u.last_seen_at)}
                    </small>
                  </span>
                  <span
                    className={`pill ${u.can_create_orders ? "success" : "danger"}`}
                  >
                    {u.can_create_orders ? "Authorized" : "Revoked"}
                  </span>
                  {u.can_create_orders && (
                    <button
                      onClick={() =>
                        act(`revoke-${u.telegram_user_id}`, (t) =>
                          revokeTelegramSeller(t, group.id, u.telegram_user_id),
                        )
                      }
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
              <h3>Order activity</h3>
              {groupOrders.map((o) => (
                <div className="merchant-row" key={o.id}>
                  <span className="merchant-info">
                    <strong>
                      {o.order_number} · {o.status}
                    </strong>
                    <small>
                      {o.description} × {o.quantity} · {o.grand_total}{" "}
                      {o.currency_code} · {when(o.created_at)}
                    </small>
                  </span>
                </div>
              ))}
              {groupOrders.length === 0 && (
                <p className="muted">No orders from this group.</p>
              )}
              <h3>Audit history</h3>
              {audit.map((a) => (
                <div className="merchant-row" key={a.id}>
                  <span className="merchant-info">
                    <strong>{a.action}</strong>
                    <small>
                      {a.entity_type} · {when(a.occurred_at)}
                    </small>
                  </span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
