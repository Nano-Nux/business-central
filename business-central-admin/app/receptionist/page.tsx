"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AdminLoading,
  AdminSignInRequired,
} from "../../components/admin-auth-state";
import { AdminShell } from "../../components/admin-shell";
import { useAdminSession } from "../../lib/use-admin-session";
import {
  connectReceptionistGoogle,
  disconnectReceptionistGoogle,
  getReceptionistBooking,
  getReceptionistConversation,
  getReceptionistSettings,
  listReceptionistBookings,
  listReceptionistConversations,
  ReceptionistBooking,
  ReceptionistConversation,
  ReceptionistSettings,
  saveReceptionistSettings,
} from "../../lib/api";
import styles from "./receptionist.module.css";

function time(value: string, zone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(zone ? { timeZone: zone } : {}),
  }).format(new Date(value));
}
type Tab = "conversations" | "bookings" | "settings";
export default function ReceptionistPage() {
  const { session, ready, withAuth } = useAdminSession();
  const [tab, setTab] = useState<Tab>("conversations");
  const [settings, setSettings] = useState<ReceptionistSettings | null>(null);
  const [conversations, setConversations] = useState<
    ReceptionistConversation[]
  >([]);
  const [bookings, setBookings] = useState<ReceptionistBooking[]>([]);
  const [selected, setSelected] = useState<ReceptionistConversation | null>(
    null,
  );
  const [booking, setBooking] = useState<ReceptionistBooking | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const detailVersion = useRef(0);
  const authenticated = !!session;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!authenticated) return;
      const version = ++requestVersion.current;
      if (signal?.aborted) return;
      setLoading(true);
      try {
        if (tab === "settings") {
          const data = await withAuth(getReceptionistSettings);
          if (version === requestVersion.current && !signal?.aborted)
            setSettings(data);
        } else if (tab === "conversations") {
          const data = await withAuth((token) =>
            listReceptionistConversations(token, offset),
          );
          if (version === requestVersion.current && !signal?.aborted) {
            setConversations(data.data);
            setTotal(data.meta.total);
          }
        } else {
          const data = await withAuth((token) =>
            listReceptionistBookings(token, offset, status),
          );
          if (version === requestVersion.current && !signal?.aborted) {
            setBookings(data.data);
            setTotal(data.meta.total);
          }
        }
      } catch (e) {
        if (version === requestVersion.current && !signal?.aborted)
          setError(
            e instanceof Error ? e.message : "Could not load reception data.",
          );
      } finally {
        if (version === requestVersion.current && !signal?.aborted)
          setLoading(false);
      }
    },
    [authenticated, tab, offset, status, withAuth],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!booking && !selected) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        detailVersion.current++;
        setBooking(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [booking, selected]);

  async function showConversation(id: string) {
    const version = ++detailVersion.current;
    setBusy(true);
    setError("");
    try {
      const value = await withAuth((token) =>
        getReceptionistConversation(token, id),
      );
      if (version === detailVersion.current) {
        setSelected(value);
        setBooking(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation.");
    } finally {
      setBusy(false);
    }
  }
  async function showBooking(id: string) {
    const version = ++detailVersion.current;
    setBusy(true);
    setError("");
    try {
      const value = await withAuth((token) =>
        getReceptionistBooking(token, id),
      );
      if (version === detailVersion.current) {
        setBooking(value);
        setSelected(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load booking.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSettings(
        await withAuth((token) => saveReceptionistSettings(token, settings)),
      );
      setNotice("Receptionist settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const value = await withAuth(connectReceptionistGoogle);
      window.location.assign(value.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect Google.");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await withAuth(disconnectReceptionistGoogle);
      await load();
      setNotice(
        "Calendar disconnected. Existing bookings remain in Google Calendar.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect Google.");
    } finally {
      setBusy(false);
    }
  }
  function changeTab(next: Tab) {
    detailVersion.current++;
    setTab(next);
    setOffset(0);
    setSelected(null);
    setBooking(null);
    setError("");
    setNotice("");
  }

  if (!ready) return <AdminLoading />;
  if (!session) return <AdminSignInRequired />;
  return (
    <AdminShell session={session} active="receptionist">
      <header className="topbar">
        <div>
          <p className="eyebrow">NANONUX WEBSITE</p>
          <h1>Public receptionist</h1>
          <p className="muted">
            Review visitor conversations, demo and support appointments, and
            your receptionist settings.
          </p>
        </div>
        <button
          disabled={loading || busy}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Refresh
        </button>
      </header>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Receptionist sections"
      >
        {(["conversations", "bookings", "settings"] as Tab[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => changeTab(name)}
          >
            {name === "conversations"
              ? "Chat history"
              : name === "bookings"
                ? "All bookings"
                : "Settings & integrations"}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="banner">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading…</p>
      ) : tab === "settings" ? (
        settings && (
          <form onSubmit={save} className={`panel ${styles.settings}`}>
            <h2>Support content & availability</h2>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
              />
              Enable public receptionist
            </label>
            <label>
              Welcome message
              <textarea
                required
                maxLength={500}
                rows={3}
                value={settings.greeting}
                onChange={(e) =>
                  setSettings({ ...settings, greeting: e.target.value })
                }
              />
            </label>
            <label>
              Approved support knowledge
              <textarea
                maxLength={24000}
                rows={12}
                value={settings.knowledge}
                onChange={(e) =>
                  setSettings({ ...settings, knowledge: e.target.value })
                }
              />
            </label>
            <p className="muted">
              Provide verified features, pricing, policies and contact details.
              The AI uses this content for public answers. Keep internal
              information and credentials out of this field.
            </p>
            <div className={styles.grid}>
              <label>
                Business time zone
                <input
                  required
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                  placeholder="Asia/Bangkok"
                />
              </label>
              <label>
                Daily chat turn limit (UTC)
                <input
                  required
                  type="number"
                  min={1}
                  max={10000}
                  value={settings.daily_limit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      daily_limit: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Appointment duration (minutes)
                <input
                  required
                  type="number"
                  min={15}
                  max={120}
                  value={settings.duration_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      duration_minutes: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Start hour (0–23)
                <input
                  required
                  type="number"
                  min={0}
                  max={23}
                  value={settings.start_hour}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      start_hour: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                End hour (1–24)
                <input
                  required
                  type="number"
                  min={1}
                  max={24}
                  value={settings.end_hour}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      end_hour: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>Booking days</legend>
              <div className={styles.days}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (label, day) => (
                    <label key={day} className={styles.check}>
                      <input
                        type="checkbox"
                        checked={settings.weekdays.includes(day)}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            weekdays: e.target.checked
                              ? [...settings.weekdays, day].sort()
                              : settings.weekdays.filter((d) => d !== day),
                          })
                        }
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <h2>Google Calendar</h2>
            <p>
              {settings.calendar_connected ? "Connected" : "Not connected"} ·{" "}
              {settings.oauth_configured
                ? "OAuth configured"
                : "OAuth backend configuration required"}
            </p>
            <label>
              Booking calendar ID
              <input
                required
                maxLength={254}
                value={settings.calendar_id}
                onChange={(e) =>
                  setSettings({ ...settings, calendar_id: e.target.value })
                }
                placeholder="primary or calendar ID"
              />
            </label>
            <p className="muted">
              Use a dedicated support calendar. Appointments require visitor
              confirmation and are offered from one hour ahead through the next
              60 days. Save settings before connecting Google.
            </p>
            <div className={styles.actions}>
              <button disabled={busy}>Save settings</button>
              <button
                type="button"
                disabled={busy || !settings.oauth_configured}
                onClick={() => void connect()}
              >
                {settings.calendar_connected
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}
              </button>
              {settings.calendar_connected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>
        )
      ) : (
        <section className="panel">
          <div className={styles.actions}>
            <h2>
              {tab === "conversations"
                ? "Visitor conversations"
                : "Appointments"}
            </h2>
            {tab === "bookings" && (
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">All statuses</option>
                  <option>CONFIRMED</option>
                  <option>PENDING</option>
                  <option>FAILED</option>
                </select>
              </label>
            )}
            <span className="muted">{total} records</span>
          </div>
          <div className={styles.table}>
            <table>
              <thead>
                <tr>
                  {(tab === "conversations"
                    ? ["Visitor", "Business", "Last activity", ""]
                    : ["Visitor", "Appointment", "Status", ""]
                  ).map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tab === "conversations"
                  ? conversations.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name || "Anonymous visitor"}</strong>
                          <small>{c.email || c.id}</small>
                        </td>
                        <td>{c.company || "—"}</td>
                        <td>{time(c.updated_at)}</td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() => void showConversation(c.id)}
                          >
                            View chat
                          </button>
                        </td>
                      </tr>
                    ))
                  : bookings.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.name}</strong>
                          <small>{b.email}</small>
                        </td>
                        <td>
                          {time(b.start, b.timezone)}
                          <small>{b.timezone}</small>
                        </td>
                        <td>
                          <span className="status">{b.status}</span>
                        </td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() => void showBooking(b.id)}
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {(tab === "conversations"
            ? conversations.length
            : bookings.length) === 0 && (
            <p className="muted">No records found.</p>
          )}
          <div className={styles.actions}>
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous
            </button>
            <span>
              {total
                ? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`
                : "0 records"}
            </span>
            <button
              disabled={offset + 25 >= total || loading}
              onClick={() => setOffset(offset + 25)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {(selected || booking) && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receptionist-detail-title"
            className={`modal ${styles.detail}`}
          >
            <div className={styles.actions}>
              <h2 id="receptionist-detail-title">
                {selected ? "Conversation history" : "Booking details"}
              </h2>
              <button
                autoFocus
                onClick={() => {
                  detailVersion.current++;
                  setSelected(null);
                  setBooking(null);
                }}
              >
                Close
              </button>
            </div>
            {selected && (
              <>
                <p>
                  {selected.name || "Anonymous visitor"} ·{" "}
                  {selected.email || "No email collected"}
                </p>
                <p className="muted">
                  {selected.company} · Started {time(selected.created_at)}
                </p>
                <p className={styles.reference}>{selected.id}</p>
                <div className={styles.transcript}>
                  {selected.messages?.map((m) => (
                    <article key={m.id} data-role={m.role}>
                      <small>
                        {m.role === "user"
                          ? "Visitor"
                          : m.role === "system"
                            ? "Booking update"
                            : "Nanonux AI"}{" "}
                        · {time(m.created_at)}
                      </small>
                      <p>{m.content}</p>
                      {!!m.slots?.length && (
                        <small>
                          {m.slots.length} appointment slots offered
                        </small>
                      )}
                    </article>
                  ))}
                </div>
                {selected.bookings?.map((b) => (
                  <button
                    key={b.id}
                    disabled={busy}
                    onClick={() => void showBooking(b.id)}
                  >
                    Booking: {b.status} · {time(b.start, b.timezone)}
                  </button>
                ))}
              </>
            )}
            {booking && (
              <>
                <dl className={styles.facts}>
                  {[
                    ["Status", booking.status],
                    ["Name", booking.name],
                    ["Email", booking.email],
                    ["Business", booking.company || "—"],
                    [
                      "Starts",
                      `${time(booking.start, booking.timezone)} (${booking.timezone})`,
                    ],
                    [
                      "Ends",
                      `${time(booking.end, booking.timezone)} (${booking.timezone})`,
                    ],
                    ["UTC start", new Date(booking.start).toISOString()],
                    ["Request / notes", booking.notes || "—"],
                    ["Booking reference", booking.id],
                    ["Calendar ID", booking.calendar_id],
                    ["Google event ID", booking.event_id],
                    ["Created", time(booking.created_at)],
                    ["Last provider issue", booking.last_error || "None"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {booking.event_url && (
                  <a
                    href={booking.event_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open event in Google Calendar
                  </a>
                )}
                <button
                  disabled={busy}
                  onClick={() => void showConversation(booking.conversation_id)}
                >
                  View linked conversation
                </button>
                <p className="muted">
                  Status records this integration’s booking outcome. Changes
                  made directly in Google Calendar are not synchronized here.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
