"use client";

import { useEffect, useMemo, useState } from "react";
import { api, patch, post, remove } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useResource } from "@/lib/use-resource";
import type { Shop } from "@/lib/types";
import { Icon } from "./icons";
import { Badge, EmptyState, StatusBadge } from "./ui";
import styles from "./telegram-automation-manager.module.css";

type Group = {
  id: string;
  shop_id: string;
  telegram_chat_id: number;
  group_title: string;
  group_type: string;
  group_username?: string;
  creator_display_name_snapshot?: string;
  creator_username_snapshot?: string;
  connected_by?: string;
  connection_status: string;
  bot_membership_status: string;
  bot_admin_status: boolean;
  bot_permission_snapshot: Record<string, boolean>;
  member_count?: number;
  first_seen_at: string;
  connected_at?: string;
  last_seen_at: string;
  last_refreshed_at?: string;
  last_error?: string;
};
type Pairing = { id: string; shop_id: string; code: string; status: string; expires_at: string };
type TelegramOrder = {
  id: string;
  telegram_group_connection_id: string;
  group_title: string;
  order_number: string;
  status: string;
  currency_code: string;
  grand_total: string;
  description: string;
  quantity: string;
  unit_price: string;
  created_at: string;
  expires_at: string;
  last_error?: string;
};
type GroupUser = {
  telegram_user_id: number;
  display_name_snapshot?: string;
  username_snapshot?: string;
  telegram_role: string;
  can_create_orders: boolean;
  last_seen_at: string;
};
type Action = (key: string, run: () => Promise<unknown>) => Promise<void>;
type View = "groups" | "orders" | "guide";
const TELEGRAM_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Unavailable";
const readable = (value: string) => value.toLowerCase().replaceAll("_", " ");

function CopyButton({ value, label }: { value: string; label: string }) {
  const [result, setResult] = useState("");
  return (
    <button
      className="button button-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setResult("Copied");
        } catch {
          setResult("Select the code to copy");
        }
      }}
      aria-label={label}
    >
      <Icon name={result === "Copied" ? "check" : "receipt"} size={15} />
      <span aria-live="polite">{result || "Copy"}</span>
    </button>
  );
}

function GroupUsers({ groupID, busy, action }: { groupID: string; busy: string; action: Action }) {
  const users = useResource<GroupUser>(`/telegram/groups/${groupID}/users`);
  const reloadUsers = users.reload;
  useEffect(() => {
    const timer = window.setInterval(() => void reloadUsers(), TELEGRAM_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reloadUsers]);
  return (
    <section className={styles.users} aria-labelledby="telegram-users-title">
      <div className={styles.sectionHead}>
        <div>
          <h3 id="telegram-users-title">People & seller access</h3>
          <p>Manage who can create orders in this group.</p>
        </div>
        <Badge>{users.data.length} known users</Badge>
      </div>
      <p className={styles.note}>
        Telegram shares administrators and people who interact with the bot, rather than a complete
        member list.
      </p>
      {users.error ? (
        <div className="alert error" role="alert">
          {users.error}
        </div>
      ) : users.loading && !users.data.length ? (
        <p role="status">Loading users…</p>
      ) : !users.data.length ? (
        <div className={styles.smallEmpty}>
          <Icon name="users" size={24} />
          <p>No users observed yet. Interact with the bot in Telegram to appear here.</p>
        </div>
      ) : (
        <div className={styles.userList}>
          {users.data.map((u) => (
            <div className={styles.userRow} key={u.telegram_user_id}>
              <span className={styles.avatar}>
                <Icon name="user" size={18} />
              </span>
              <div className={styles.userIdentity}>
                <strong>{u.display_name_snapshot || "Unknown user"}</strong>
                <small>
                  {u.username_snapshot ? `@${u.username_snapshot} · ` : ""}
                  {readable(u.telegram_role)} · ID {u.telegram_user_id}
                </small>
                <small>Last seen {date(u.last_seen_at)}</small>
              </div>
              <div className={styles.userAccess}>
                <Badge tone={u.can_create_orders ? "success" : "neutral"}>
                  {u.can_create_orders ? "Authorized" : "Revoked"}
                </Badge>
                {u.can_create_orders && (
                  <button
                    className={styles.dangerLink}
                    disabled={!!busy}
                    onClick={() =>
                      action(`user-${u.telegram_user_id}`, async () => {
                        await post(
                          `/telegram/groups/${groupID}/users/${u.telegram_user_id}/revoke`,
                          {},
                        );
                        await users.reload();
                      })
                    }
                  >
                    {busy === `user-${u.telegram_user_id}` ? "Revoking…" : "Revoke access"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function TelegramAutomationManager() {
  const shops = useResource<Shop>("/shops?page_index=0&page_size=100");
  const [botName, setBotName] = useState("");
  const [botError, setBotError] = useState("");
  useEffect(() => {
    let current = true;
    api<{ username: string }>("/telegram/bot")
      .then((bot) => {
        if (!current) return;
        setBotName(bot.username || "");
        if (!bot.username)
          setBotError(
            "Telegram bot username is not configured. Ask your administrator to configure the shared bot.",
          );
      })
      .catch((reason) => {
        if (current)
          setBotError(
            reason instanceof Error ? reason.message : "Could not load the Telegram bot username.",
          );
      });
    return () => {
      current = false;
    };
  }, []);
  const [shopID, setShopID] = useState("");
  const effectiveShopID = shopID || shops.data[0]?.id || "";
  return (
    <TelegramWorkspace
      key={effectiveShopID}
      shops={shops.data}
      shopID={effectiveShopID}
      onShopChange={setShopID}
      shopError={shops.error}
      shopsLoading={shops.loading}
      botName={botName}
      botError={botError}
    />
  );
}

function TelegramWorkspace({
  shops,
  shopID,
  onShopChange,
  shopError,
  shopsLoading,
  botName,
  botError,
}: {
  shops: Shop[];
  shopID: string;
  onShopChange: (id: string) => void;
  shopError: string;
  shopsLoading: boolean;
  botName: string;
  botError: string;
}) {
  const { t } = useTranslation();
  const groups = useResource<Group>(shopID ? `/telegram/shops/${shopID}/groups` : "");
  const orders = useResource<TelegramOrder>(shopID ? "/telegram/orders" : "");
  const [selectedGroup, setSelectedGroup] = useState("");
  const selected = groups.data.find((g) => g.id === selectedGroup) || groups.data[0];
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionRevision, setActionRevision] = useState(0);
  const [view, setView] = useState<View>("groups");
  const [orderStatus, setOrderStatus] = useState("DRAFT");
  const reloadGroups = groups.reload,
    reloadOrders = orders.reload;
  useEffect(() => {
    if (!shopID) return;
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
      void reloadGroups();
      void reloadOrders();
    }, TELEGRAM_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [shopID, reloadGroups, reloadOrders]);
  const scopedOrders = useMemo(
    () =>
      orders.data.filter((o) => groups.data.some((g) => g.id === o.telegram_group_connection_id)),
    [orders.data, groups.data],
  );
  const pending = scopedOrders.filter((o) => o.status === "DRAFT");
  const active = groups.data.filter((g) => g.connection_status === "ACTIVE");
  const needsAttention = groups.data.filter((g) => !g.bot_admin_status || !!g.last_error);
  const visibleOrders = scopedOrders.filter((o) =>
    orderStatus === "CANCELLED"
      ? ["CANCELLED", "EXPIRED"].includes(o.status)
      : o.status === orderStatus,
  );
  const pairingExpired = pairing ? new Date(pairing.expires_at).getTime() <= currentTime : false;
  async function action(key: string, run: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await run();
      await Promise.all([groups.reload(), orders.reload()]);
      setActionRevision((revision) => revision + 1);
      setNotice("Changes saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setBusy("");
    }
  }
  async function createPairing() {
    if (!shopID || !botName) return;
    await action("pair", async () =>
      setPairing(await post<Pairing>(`/telegram/shops/${shopID}/pairing-codes`, {})),
    );
  }
  const connectButton = (
    <button
      className="button button-primary"
      onClick={createPairing}
      disabled={!shopID || !botName || !!busy}
    >
      <Icon name="plus" size={17} />
      {busy === "pair" ? "Creating code…" : "Connect Telegram group"}
    </button>
  );
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.telegramMark}>
            <Icon name="send" size={27} />
          </span>
          <div>
            <span className={styles.eyebrow}>AI / Automations</span>
            <h1>Telegram</h1>
            <p>Your group conversations, connected to your shop.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.shopSelect}>
            <span>Shop</span>
            <select
              aria-label="Telegram shop"
              value={shopID}
              onChange={(e) => onShopChange(e.target.value)}
              disabled={shopsLoading && !shops.length}
            >
              {!shops.length && (
                <option value="">{shopsLoading ? "Loading shops…" : "No shops available"}</option>
              )}
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {connectButton}
        </div>
      </header>
      {(error || shopError || botError || groups.error || orders.error) && (
        <div className="alert error" role="alert">
          {error || shopError || botError || groups.error || orders.error}
        </div>
      )}
      {notice && (
        <p className={styles.feedback} role="status">
          <Icon name="check" size={15} />
          {notice}
        </p>
      )}
      <div className={styles.metrics}>
        <article>
          <span className={styles.metricIcon}>
            <Icon name="users" size={20} />
          </span>
          <div>
            <p>Connected groups</p>
            <strong>{groups.loading && !groups.data.length ? "—" : groups.data.length}</strong>
            <small>{active.length} active connections</small>
          </div>
        </article>
        <article>
          <span className={styles.metricIcon}>
            <Icon name="receipt" size={20} />
          </span>
          <div>
            <p>Pending orders</p>
            <strong>{orders.loading && !scopedOrders.length ? "—" : pending.length}</strong>
            <small>Awaiting your confirmation</small>
          </div>
        </article>
        <article>
          <span className={styles.metricIcon}>
            <Icon name={needsAttention.length ? "alert-triangle" : "check"} size={20} />
          </span>
          <div>
            <p>Needs attention</p>
            <strong>{groups.loading && !groups.data.length ? "—" : needsAttention.length}</strong>
            <small>
              {needsAttention.length
                ? "Check bot access or connection errors"
                : "No bot access issues reported"}
            </small>
          </div>
        </article>
      </div>
      {pairing && (
        <section className={styles.pairing} aria-labelledby="pairing-title">
          <div>
            <Badge tone={pairingExpired ? "warning" : "info"}>
              {pairingExpired ? "Code expired" : "One-time pairing code"}
            </Badge>
            <h2 id="pairing-title">
              {pairingExpired ? "Create a new code to connect" : "Finish connecting in Telegram"}
            </h2>
            <p>
              Add @{botName} as a group administrator, then send the command below in that group.
            </p>
            <small>
              {pairingExpired ? "Expired" : "Expires"} {date(pairing.expires_at)}. This code is
              shown only now.
            </small>
          </div>
          <div className={styles.pairingCommand}>
            <div>
              <code>
                /connect@{botName} {pairing.code}
              </code>
              {!pairingExpired && (
                <CopyButton
                  key={pairing.code}
                  value={`/connect@${botName} ${pairing.code}`}
                  label="Copy pairing command"
                />
              )}
            </div>
            <button className={styles.textButton} onClick={() => setView("guide")}>
              View setup instructions <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>
      )}
      <div className={styles.viewBar}>
        <nav aria-label="Telegram workspace views" className={styles.views}>
          {(
            [
              ["groups", "Groups", groups.data.length],
              ["orders", "Orders", pending.length],
              ["guide", "Setup guide", null],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={view === id ? styles.activeView : ""}
            >
              {label}
              {count !== null && <span>{count}</span>}
            </button>
          ))}
        </nav>
        <span className={styles.liveNote}>
          <i />
          Updates every 3 minutes
        </span>
      </div>
      {view === "groups" && (
        <section aria-label="Telegram groups">
          {!shopID && !shopsLoading ? (
            <div className={styles.panel}>
              <EmptyState
                icon="store"
                title="Choose a shop to get started"
                message="Create or select a shop before connecting a Telegram group."
              />
            </div>
          ) : groups.loading && !groups.data.length ? (
            <div className={styles.panel} role="status">
              Loading Telegram groups…
            </div>
          ) : !groups.data.length ? (
            <div className={`${styles.panel} ${styles.onboarding}`}>
              <span className={styles.emptyMark}>
                <Icon name="send" size={34} />
              </span>
              <span className={styles.eyebrow}>Start your first connection</span>
              <h2>Bring your Telegram orders into one place</h2>
              <p>
                Connect a group to this shop, let authorized sellers create drafts, and review every
                order before it becomes a sale.
              </p>
              <div className={styles.onboardingSteps}>
                <span>
                  <Icon name="store" size={17} />
                  Choose your shop
                </span>
                <Icon name="arrow" size={16} />
                <span>
                  <Icon name="bot" size={17} />
                  Add your bot
                </span>
                <Icon name="arrow" size={16} />
                <span>
                  <Icon name="check" size={17} />
                  Pair your group
                </span>
              </div>
              <div className={styles.emptyActions}>
                {connectButton}
                <button className="button button-secondary" onClick={() => setView("guide")}>
                  <Icon name="book" size={16} />
                  Read setup guide
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.groupLayout}>
              <aside className={styles.groupRail} aria-label="Connected groups">
                <div className={styles.railHead}>
                  <h2>Your groups</h2>
                  <span>{groups.data.length}</span>
                </div>
                {groups.data.map((g) => (
                  <button
                    key={g.id}
                    aria-pressed={selected?.id === g.id}
                    className={`${styles.groupCard} ${selected?.id === g.id ? styles.selectedGroup : ""}`}
                    onClick={() => setSelectedGroup(g.id)}
                  >
                    <div className={styles.groupCardHead}>
                      <span className={styles.avatar}>
                        <Icon name="users" size={18} />
                      </span>
                      <StatusBadge
                        status={g.connection_status}
                        label={readable(g.connection_status)}
                      />
                    </div>
                    <strong>{g.group_title}</strong>
                    <small>
                      {g.group_username ? `@${g.group_username}` : readable(g.group_type)}
                    </small>
                    <div className={styles.groupCardFoot}>
                      <span>{g.member_count ?? "Unknown"} members</span>
                      {!g.bot_admin_status || g.last_error ? (
                        <span className={styles.warningText}>Check bot access</span>
                      ) : (
                        <span>
                          Bot admin <Icon name="check" size={13} />
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </aside>
              {selected && (
                <article className={styles.panel}>
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={styles.eyebrow}>Group workspace</span>
                      <h2>{selected.group_title}</h2>
                      <p>
                        {selected.group_username ? `@${selected.group_username} · ` : ""}
                        {readable(selected.group_type)} · Chat ID {selected.telegram_chat_id}
                      </p>
                    </div>
                    <StatusBadge
                      status={selected.connection_status}
                      label={readable(selected.connection_status)}
                    />
                  </div>
                  <div className={styles.health}>
                    <span className={styles.healthIcon}>
                      <Icon
                        name={
                          selected.bot_admin_status && !selected.last_error
                            ? "check"
                            : "alert-triangle"
                        }
                        size={19}
                      />
                    </span>
                    <div>
                      <strong>
                        {selected.bot_admin_status
                          ? "Bot has administrator access"
                          : "Bot needs administrator access"}
                      </strong>
                      <p>
                        Membership: {readable(selected.bot_membership_status)} · Last activity{" "}
                        {date(selected.last_seen_at)}
                      </p>
                    </div>
                  </div>
                  {selected.last_error && (
                    <div className="alert error" role="alert">
                      {selected.last_error}
                    </div>
                  )}
                  <div className={styles.groupActions}>
                    <button
                      className="button button-secondary"
                      disabled={!!busy}
                      onClick={() =>
                        action(`refresh-${selected.id}`, () =>
                          post(`/telegram/groups/${selected.id}/refresh`, {}),
                        )
                      }
                    >
                      <Icon name="history" size={15} />
                      {busy === `refresh-${selected.id}` ? "Refreshing…" : "Refresh health"}
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!!busy}
                      onClick={() =>
                        action(`status-${selected.id}`, () =>
                          patch(`/telegram/groups/${selected.id}/status`, {
                            status: selected.connection_status === "PAUSED" ? "ACTIVE" : "PAUSED",
                          }),
                        )
                      }
                    >
                      {selected.connection_status === "PAUSED" ? "Resume" : "Pause"}
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!!busy || !botName}
                      onClick={() =>
                        action(`rotate-${selected.id}`, async () =>
                          setPairing(
                            await post<Pairing>(
                              `/telegram/groups/${selected.id}/rotate-pairing-code`,
                              {},
                            ),
                          ),
                        )
                      }
                    >
                      Rotate code
                    </button>
                    <button
                      className={styles.dangerLink}
                      disabled={!!busy}
                      onClick={() =>
                        action(`delete-${selected.id}`, () =>
                          remove(`/telegram/groups/${selected.id}`),
                        )
                      }
                    >
                      <Icon name="trash" size={15} />
                      Disconnect
                    </button>
                  </div>
                  <GroupUsers
                    key={`${selected.id}:${actionRevision}`}
                    groupID={selected.id}
                    busy={busy}
                    action={action}
                  />
                  <details className={styles.connectionDetails}>
                    <summary>
                      Connection details <Icon name="chevron" size={16} />
                    </summary>
                    <dl className={styles.detailGrid}>
                      <div>
                        <dt>Connected</dt>
                        <dd>{date(selected.connected_at)}</dd>
                      </div>
                      <div>
                        <dt>Connected by</dt>
                        <dd>{selected.connected_by || "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>First seen</dt>
                        <dd>{date(selected.first_seen_at)}</dd>
                      </div>
                      <div>
                        <dt>Last refreshed</dt>
                        <dd>{date(selected.last_refreshed_at)}</dd>
                      </div>
                      <div>
                        <dt>Creator snapshot</dt>
                        <dd>
                          {selected.creator_display_name_snapshot || "Unavailable"}
                          {selected.creator_username_snapshot
                            ? ` (@${selected.creator_username_snapshot})`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Required permissions</dt>
                        <dd>Manage chat; send and edit messages</dd>
                      </div>
                      <div>
                        <dt>Observed bot permissions</dt>
                        <dd>
                          {Object.entries(selected.bot_permission_snapshot || {})
                            .filter(([, enabled]) => enabled)
                            .map(([name]) => readable(name))
                            .join(", ") || "None reported"}
                        </dd>
                      </div>
                      <div>
                        <dt>Last error</dt>
                        <dd>{selected.last_error || "None"}</dd>
                      </div>
                    </dl>
                    <p className={styles.note}>
                      Telegram does not provide a group creation date. Connected and first-seen
                      dates are shown instead.
                    </p>
                  </details>
                </article>
              )}
            </div>
          )}
          <div className={styles.helper}>
            <Icon name="help" size={18} />
            <p>Each Telegram group belongs to one shop. Need a hand connecting?</p>
            <button className={styles.textButton} onClick={() => setView("guide")}>
              Open setup guide <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>
      )}
      {view === "orders" && (
        <section className={styles.panel} aria-labelledby="telegram-orders-title">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="telegram-orders-title">Telegram orders</h2>
              <p>Review drafts before confirming them into your shop’s sales history.</p>
            </div>
            <Badge tone="info">Shop orders</Badge>
          </div>
          <div className={styles.orderFilters} aria-label="Order status filters">
            {[
              ["DRAFT", "Pending"],
              ["CONFIRMED", "Confirmed"],
              ["CANCELLED", "Cancelled & expired"],
            ].map(([status, label]) => (
              <button
                key={status}
                aria-pressed={orderStatus === status}
                onClick={() => setOrderStatus(status)}
              >
                {label}
                <span>
                  {
                    scopedOrders.filter((o) =>
                      status === "CANCELLED"
                        ? ["CANCELLED", "EXPIRED"].includes(o.status)
                        : o.status === status,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          {orders.loading && !scopedOrders.length ? (
            <p role="status">Loading Telegram orders…</p>
          ) : !visibleOrders.length ? (
            <EmptyState
              icon="receipt"
              title={orderStatus === "DRAFT" ? "You’re all caught up" : "No orders here yet"}
              message={
                orderStatus === "DRAFT"
                  ? "New drafts from your Telegram groups will appear here for review."
                  : "Orders with this status will appear here."
              }
            />
          ) : (
            <div className={styles.orderList}>
              {visibleOrders.map((o) => (
                <article className={styles.orderCard} key={o.id}>
                  <div className={styles.orderHeading}>
                    <div>
                      <strong>{o.order_number}</strong>
                      <small>
                        {o.group_title} · {date(o.created_at)}
                      </small>
                    </div>
                    <Badge
                      tone={
                        o.status === "DRAFT"
                          ? "warning"
                          : o.status === "CONFIRMED"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {o.status === "DRAFT" ? "Pending" : readable(o.status)}
                    </Badge>
                  </div>
                  <div className={styles.orderBody}>
                    <div>
                      <h3>{o.description}</h3>
                      <p>
                        Quantity {o.quantity} · Unit price {o.unit_price} {o.currency_code}
                      </p>
                      {o.status === "DRAFT" && (
                        <small>Reservation expires {date(o.expires_at)}</small>
                      )}
                    </div>
                    <strong className={styles.orderTotal}>
                      {o.grand_total}
                      <small>{o.currency_code}</small>
                    </strong>
                  </div>
                  {o.last_error && <p className={styles.warningText}>{o.last_error}</p>}
                  {o.status === "DRAFT" && (
                    <div className={styles.orderActions}>
                      <span>Reserved stock · Awaiting review</span>
                      <div>
                        <button
                          className="button button-secondary"
                          disabled={!!busy}
                          onClick={() =>
                            action(`cancel-${o.id}`, () =>
                              post(`/telegram/orders/${o.id}/cancel`, {}),
                            )
                          }
                        >
                          {busy === `cancel-${o.id}` ? "Cancelling…" : "Cancel"}
                        </button>
                        <button
                          className="button button-primary"
                          disabled={!!busy}
                          onClick={() =>
                            action(`confirm-${o.id}`, () =>
                              post(`/telegram/orders/${o.id}/confirm`, {}),
                            )
                          }
                        >
                          <Icon name="check" size={16} />
                          {busy === `confirm-${o.id}` ? "Confirming…" : "Confirm order"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          <p className={styles.note}>
            Drafts reserve stock. Confirmed orders appear in your normal history and reporting.
          </p>
        </section>
      )}
      {view === "guide" && (
        <div className={styles.guideLayout}>
          <section className={styles.panel} aria-labelledby="telegram-setup-guide-title">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>Getting started</span>
                <h2 id="telegram-setup-guide-title">{t("telegram_setup.title")}</h2>
                <p>{t("telegram_setup.intro")}</p>
              </div>
              <Icon name="book" size={23} />
            </div>
            <div className={styles.prerequisite}>
              <Icon name="help" size={20} />
              <div>
                <strong>{t("telegram_setup.before_start_title")}</strong>
                <p>{t("telegram_setup.before_start")}</p>
                {botName && (
                  <p>
                    Official bot: <strong>@{botName}</strong>
                  </p>
                )}
              </div>
            </div>
            <ol className={styles.steps}>
              {["choose_shop", "create_code", "add_bot", "connect_group", "verify"].map(
                (step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <div>
                      <h3>{t(`telegram_setup.${step}_title`)}</h3>
                      <p>{t(`telegram_setup.${step}_body`)}</p>
                      {step === "connect_group" && botName && (
                        <code className={styles.command}>/connect@{botName} CODE</code>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ol>
            <details className={styles.connectionDetails}>
              <summary>
                {t("telegram_setup.troubleshooting_title")}
                <Icon name="chevron" size={16} />
              </summary>
              <p className={styles.note}>{t("telegram_setup.troubleshooting_body")}</p>
            </details>
          </section>
          <aside className={styles.panel}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>Quick reference</span>
                <h2>{t("telegram_setup.seller_commands")}</h2>
              </div>
              <Icon name="send" size={21} />
            </div>
            <p className={styles.note}>{t("telegram_setup.after_connect_body")}</p>
            <div className={styles.commandList}>
              {[
                ["By product name", "/takeorder electric wheelchair quantity=2"],
                ["By SKU", "/takeorder quantity=2 WC-002"],
                ["By name and SKU", "/takeorder electric wheelchair quantity=2 WC-002"],
                ["Cancel a draft", "/cancelorder TG-20260927-0001"],
              ].map(([label, command]) => (
                <div key={command}>
                  <strong>{label}</strong>
                  <code>{command}</code>
                  <CopyButton value={command} label={`Copy ${label.toLowerCase()} command`} />
                </div>
              ))}
            </div>
            <p className={styles.note}>{t("telegram_setup.order_rules")}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
