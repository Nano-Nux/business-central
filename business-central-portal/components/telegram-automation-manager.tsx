"use client";

import { useEffect, useMemo, useState } from "react";
import { api, patch, post, remove } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useResource } from "@/lib/use-resource";
import type { Shop } from "@/lib/types";
import { Icon } from "./icons";
import { Badge, EmptyState, StatusBadge } from "./ui";
import styles from "./telegram-automation-manager.module.css";

type Group = {
  auto_confirm_orders?: boolean;
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
  auto_confirmed?: boolean;
  id: string;
  telegram_group_connection_id: string;
  group_title: string;
  order_number: string;
  status: string;
  currency_code: string;
  grand_total: string;
  customer_name?: string | null;
  payment_status?: string;
  items?: {
    line_number: number;
    variant_id: string;
    sku: string;
    description: string;
    quantity: string;
    unit_price: string;
    line_total: string;
  }[];
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
const date = (value: string | undefined, language: "en" | "my" | "th", fallback: string) =>
  value
    ? new Intl.DateTimeFormat(language === "my" ? "my-MM" : language === "th" ? "th-TH" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : fallback;
const readable = (value: string) => value.toLowerCase().replaceAll("_", " ");
const translatedValue = (value: string, t: ReturnType<typeof useTranslation>["t"]) =>
  t(`telegram.values.${value.toLowerCase()}`, readable(value));

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState("");
  return (
    <button
      className="button button-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setResult(t("telegram.copied"));
        } catch {
          setResult(t("telegram.select_code_to_copy"));
        }
      }}
      aria-label={label}
    >
      <Icon name={result === t("telegram.copied") ? "check" : "receipt"} size={15} />
      <span aria-live="polite">{result || t("telegram.copy")}</span>
    </button>
  );
}

function GroupUsers({ groupID, busy, action }: { groupID: string; busy: string; action: Action }) {
  const { t, language } = useTranslation();
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
          <h3 id="telegram-users-title">{t("telegram.people_seller_access")}</h3>
          <p>{t("telegram.manage_seller_access")}</p>
        </div>
        <Badge>{t("telegram.known_users", { count: users.data.length })}</Badge>
      </div>
      <p className={styles.note}>{t("telegram.users_list_note")}</p>
      {users.error ? (
        <div className="alert error" role="alert">
          {users.error}
        </div>
      ) : users.loading && !users.data.length ? (
        <p role="status">{t("telegram.loading_users")}</p>
      ) : !users.data.length ? (
        <div className={styles.smallEmpty}>
          <Icon name="users" size={24} />
          <p>{t("telegram.no_users")}</p>
        </div>
      ) : (
        <div className={styles.userList}>
          {users.data.map((u) => (
            <div className={styles.userRow} key={u.telegram_user_id}>
              <span className={styles.avatar}>
                <Icon name="user" size={18} />
              </span>
              <div className={styles.userIdentity}>
                <strong>{u.display_name_snapshot || t("telegram.unknown_user")}</strong>
                <small>
                  {u.username_snapshot ? `@${u.username_snapshot} · ` : ""}
                  {translatedValue(u.telegram_role, t)} ·{" "}
                  {t("telegram.user_id", { id: u.telegram_user_id })}
                </small>
                <small>
                  {t("telegram.last_seen", {
                    date: date(u.last_seen_at, language, t("telegram.unavailable")),
                  })}
                </small>
              </div>
              <div className={styles.userAccess}>
                <Badge tone={u.can_create_orders ? "success" : "neutral"}>
                  {u.can_create_orders ? t("telegram.authorized") : t("telegram.revoked")}
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
                    {busy === `user-${u.telegram_user_id}`
                      ? t("telegram.revoking")
                      : t("telegram.revoke_access")}
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
  const { t } = useTranslation();
  const shops = useResource<Shop>("/shops?page_index=0&page_size=100");
  const [botName, setBotName] = useState("");
  const [botError, setBotError] = useState("");
  useEffect(() => {
    let current = true;
    api<{ username: string }>("/telegram/bot")
      .then((bot) => {
        if (!current) return;
        setBotName(bot.username || "");
        if (!bot.username) setBotError("telegram.bot_not_configured");
      })
      .catch((reason) => {
        if (current)
          setBotError(
            reason instanceof Error ? reason.message : "telegram.bot_username_load_failed",
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
      botError={botError.startsWith("telegram.") ? t(botError) : botError}
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
  const { t, language } = useTranslation();
  const { can, isMerchant } = useAuth();
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
      setNotice(t("telegram.changes_saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("telegram.action_failed"));
    } finally {
      setBusy("");
    }
  }
  async function createPairing() {
    if (!isMerchant || !shopID || !botName) return;
    await action("pair", async () =>
      setPairing(await post<Pairing>(`/telegram/shops/${shopID}/pairing-codes`, {})),
    );
  }
  const connectButton = isMerchant ? (
    <button
      className="button button-primary"
      onClick={createPairing}
      disabled={!shopID || !botName || !!busy}
    >
      <Icon name="plus" size={17} />
      {busy === "pair" ? t("telegram.creating_code") : t("telegram.connect_group")}
    </button>
  ) : null;
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.telegramMark}>
            <Icon name="send" size={27} />
          </span>
          <div>
            <span className={styles.eyebrow}>{t("automations.eyebrow")}</span>
            <h1>Telegram</h1>
            <p>{t("telegram.description")}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.shopSelect}>
            <span>{t("telegram.shop")}</span>
            <select
              aria-label={t("telegram.shop")}
              value={shopID}
              onChange={(e) => onShopChange(e.target.value)}
              disabled={shopsLoading && !shops.length}
            >
              {!shops.length && (
                <option value="">
                  {shopsLoading ? t("telegram.loading_shops") : t("telegram.no_shops")}
                </option>
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
            <p>{t("telegram.connected_groups")}</p>
            <strong>{groups.loading && !groups.data.length ? "—" : groups.data.length}</strong>
            <small>{t("telegram.active_connections", { count: active.length })}</small>
          </div>
        </article>
        <article>
          <span className={styles.metricIcon}>
            <Icon name="receipt" size={20} />
          </span>
          <div>
            <p>{t("telegram.pending_orders")}</p>
            <strong>{orders.loading && !scopedOrders.length ? "—" : pending.length}</strong>
            <small>{t("telegram.awaiting_confirmation")}</small>
          </div>
        </article>
        <article>
          <span className={styles.metricIcon}>
            <Icon name={needsAttention.length ? "alert-triangle" : "check"} size={20} />
          </span>
          <div>
            <p>{t("telegram.needs_attention")}</p>
            <strong>{groups.loading && !groups.data.length ? "—" : needsAttention.length}</strong>
            <small>
              {needsAttention.length ? t("telegram.check_bot_access") : t("telegram.no_bot_issues")}
            </small>
          </div>
        </article>
      </div>
      {isMerchant && pairing && (
        <section className={styles.pairing} aria-labelledby="pairing-title">
          <div>
            <Badge tone={pairingExpired ? "warning" : "info"}>
              {pairingExpired ? t("telegram.code_expired") : t("telegram.one_time_code")}
            </Badge>
            <h2 id="pairing-title">
              {pairingExpired ? t("telegram.create_new_code") : t("telegram.finish_connecting")}
            </h2>
            <p>{t("telegram.add_bot_admin_and_send", { bot: `@${botName}` })}</p>
            <small>
              {t(pairingExpired ? "telegram.expired" : "telegram.expires")}{" "}
              {date(pairing.expires_at, language, t("telegram.unavailable"))}.{" "}
              {t("telegram.code_shown_only_now")}
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
                  label={t("telegram.copy_pairing_command")}
                />
              )}
            </div>
            <button className={styles.textButton} onClick={() => setView("guide")}>
              {t("telegram.view_setup_instructions")} <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>
      )}
      <div className={styles.viewBar}>
        <nav aria-label={t("telegram.workspace_views")} className={styles.views}>
          {(
            [
              ["groups", t("telegram.groups"), groups.data.length],
              ["orders", t("telegram.orders"), pending.length],
              ["guide", t("telegram.setup_guide"), null],
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
          {t("telegram.updates_every_3_minutes")}
        </span>
      </div>
      {view === "groups" && (
        <section aria-label={t("telegram.groups")}>
          {!shopID && !shopsLoading ? (
            <div className={styles.panel}>
              <EmptyState
                icon="store"
                title={t("telegram.choose_shop_to_start")}
                message={t("telegram.choose_shop_before_connecting")}
              />
            </div>
          ) : groups.loading && !groups.data.length ? (
            <div className={styles.panel} role="status">
              {t("telegram.loading_groups")}
            </div>
          ) : !groups.data.length ? (
            <div className={`${styles.panel} ${styles.onboarding}`}>
              <span className={styles.emptyMark}>
                <Icon name="send" size={34} />
              </span>
              <span className={styles.eyebrow}>{t("telegram.start_first_connection")}</span>
              <h2>{t("telegram.bring_orders_together")}</h2>
              <p>{t("telegram.onboarding_description")}</p>
              <div className={styles.onboardingSteps}>
                <span>
                  <Icon name="store" size={17} />
                  {t("telegram.choose_your_shop")}
                </span>
                <Icon name="arrow" size={16} />
                <span>
                  <Icon name="bot" size={17} />
                  {t("telegram.add_your_bot")}
                </span>
                <Icon name="arrow" size={16} />
                <span>
                  <Icon name="check" size={17} />
                  {t("telegram.pair_your_group")}
                </span>
              </div>
              <div className={styles.emptyActions}>
                {connectButton}
                <button className="button button-secondary" onClick={() => setView("guide")}>
                  <Icon name="book" size={16} />
                  {t("telegram.read_setup_guide")}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.groupLayout}>
              <aside className={styles.groupRail} aria-label={t("telegram.connected_groups")}>
                <div className={styles.railHead}>
                  <h2>{t("telegram.your_groups")}</h2>
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
                        label={translatedValue(g.connection_status, t)}
                      />
                    </div>
                    <strong>{g.group_title}</strong>
                    <small>
                      {g.group_username ? `@${g.group_username}` : translatedValue(g.group_type, t)}
                    </small>
                    <div className={styles.groupCardFoot}>
                      <span>
                        {g.member_count ?? t("telegram.unknown")} {t("telegram.members")}
                      </span>
                      {!g.bot_admin_status || g.last_error ? (
                        <span className={styles.warningText}>{t("telegram.check_bot_access")}</span>
                      ) : (
                        <span>
                          {t("telegram.bot_admin")} <Icon name="check" size={13} />
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
                      <span className={styles.eyebrow}>{t("telegram.group_workspace")}</span>
                      <h2>{selected.group_title}</h2>
                      <p>
                        {selected.group_username ? `@${selected.group_username} · ` : ""}
                        {translatedValue(selected.group_type, t)} ·{" "}
                        {t("telegram.chat_id", { id: selected.telegram_chat_id })}
                      </p>
                    </div>
                    <StatusBadge
                      status={selected.connection_status}
                      label={translatedValue(selected.connection_status, t)}
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
                          ? t("telegram.bot_admin_access")
                          : t("telegram.bot_needs_admin")}
                      </strong>
                      <p>
                        {t("telegram.membership_status", {
                          status: translatedValue(selected.bot_membership_status, t),
                        })}{" "}
                        ·{" "}
                        {t("telegram.last_activity", {
                          date: date(selected.last_seen_at, language, t("telegram.unavailable")),
                        })}
                      </p>
                    </div>
                  </div>
                  {selected.last_error && (
                    <div className="alert error" role="alert">
                      {selected.last_error}
                    </div>
                  )}
                  <div className={styles.autoConfirm}>
                    <div>
                      <strong id={`auto-confirm-label-${selected.id}`}>
                        {t("telegram.auto_confirm_order")}
                      </strong>
                      <p id={`auto-confirm-help-${selected.id}`}>
                        {t("telegram.auto_confirm_help")}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selected.auto_confirm_orders === true}
                      aria-labelledby={`auto-confirm-label-${selected.id}`}
                      aria-describedby={`auto-confirm-help-${selected.id}`}
                      className={styles.autoConfirmSwitch}
                      disabled={
                        !!busy ||
                        !isMerchant ||
                        !can("tenant.write") ||
                        selected.connection_status === "REVOKED"
                      }
                      onClick={() =>
                        action(`auto-confirm-${selected.id}`, () =>
                          patch(`/telegram/groups/${selected.id}/auto-confirm`, {
                            auto_confirm_orders: !selected.auto_confirm_orders,
                          }),
                        )
                      }
                    >
                      <span className={styles.switchTrack} aria-hidden="true">
                        <span />
                      </span>
                      <span>
                        {selected.auto_confirm_orders ? t("telegram.on") : t("telegram.off")}
                      </span>
                    </button>
                  </div>
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
                      {busy === `refresh-${selected.id}`
                        ? t("telegram.refreshing")
                        : t("telegram.refresh_health")}
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
                      {selected.connection_status === "PAUSED"
                        ? t("telegram.resume")
                        : t("telegram.pause")}
                    </button>
                    {isMerchant && (
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
                        {t("telegram.rotate_code")}
                      </button>
                    )}
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
                      {t("telegram.disconnect")}
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
                      {t("telegram.connection_details")} <Icon name="chevron" size={16} />
                    </summary>
                    <dl className={styles.detailGrid}>
                      <div>
                        <dt>{t("telegram.connected")}</dt>
                        <dd>{date(selected.connected_at, language, t("telegram.unavailable"))}</dd>
                      </div>
                      <div>
                        <dt>{t("telegram.connected_by")}</dt>
                        <dd>{selected.connected_by || t("telegram.unavailable")}</dd>
                      </div>
                      <div>
                        <dt>{t("telegram.first_seen")}</dt>
                        <dd>{date(selected.first_seen_at, language, t("telegram.unavailable"))}</dd>
                      </div>
                      <div>
                        <dt>{t("telegram.last_refreshed")}</dt>
                        <dd>
                          {date(selected.last_refreshed_at, language, t("telegram.unavailable"))}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("telegram.creator_snapshot")}</dt>
                        <dd>
                          {selected.creator_display_name_snapshot || t("telegram.unavailable")}
                          {selected.creator_username_snapshot
                            ? ` (@${selected.creator_username_snapshot})`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("telegram.required_permissions")}</dt>
                        <dd>{t("telegram.required_permissions_detail")}</dd>
                      </div>
                      <div>
                        <dt>{t("telegram.observed_bot_permissions")}</dt>
                        <dd>
                          {Object.entries(selected.bot_permission_snapshot || {})
                            .filter(([, enabled]) => enabled)
                            .map(([name]) => translatedValue(name, t))
                            .join(", ") || t("telegram.none_reported")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("telegram.last_error")}</dt>
                        <dd>{selected.last_error || t("telegram.none")}</dd>
                      </div>
                    </dl>
                    <p className={styles.note}>{t("telegram.group_creation_date_note")}</p>
                  </details>
                </article>
              )}
            </div>
          )}
          <div className={styles.helper}>
            <Icon name="help" size={18} />
            <p>{t("telegram.groups_belong_to_shop")}</p>
            <button className={styles.textButton} onClick={() => setView("guide")}>
              {t("telegram.open_setup_guide")} <Icon name="arrow" size={14} />
            </button>
          </div>
        </section>
      )}
      {view === "orders" && (
        <section className={styles.panel} aria-labelledby="telegram-orders-title">
          <div className={styles.sectionHead}>
            <div>
              <h2 id="telegram-orders-title">{t("telegram.telegram_orders")}</h2>
              <p>{t("telegram.review_drafts_description")}</p>
            </div>
            <Badge tone="info">{t("telegram.shop_orders")}</Badge>
          </div>
          <div className={styles.orderFilters} aria-label={t("telegram.order_status_filters")}>
            {[
              ["DRAFT", t("telegram.pending")],
              ["CONFIRMED", t("telegram.confirmed")],
              ["CANCELLED", t("telegram.cancelled_expired")],
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
            <p role="status">{t("telegram.loading_orders")}</p>
          ) : !visibleOrders.length ? (
            <EmptyState
              icon="receipt"
              title={
                orderStatus === "DRAFT" ? t("telegram.all_caught_up") : t("telegram.no_orders_yet")
              }
              message={
                orderStatus === "DRAFT"
                  ? t("telegram.new_drafts_note")
                  : t("telegram.status_orders_note")
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
                        {o.group_title} · {date(o.created_at, language, t("telegram.unavailable"))}
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
                      {translatedValue(o.status, t)}
                    </Badge>
                  </div>
                  <div className={styles.orderBody}>
                    <div>
                      <h3>
                        {o.customer_name
                          ? t("telegram.customer_name", { name: o.customer_name })
                          : ""}
                      </h3>
                      {o.payment_status && (
                        <p>
                          {t("telegram.payment_status", {
                            status: translatedValue(o.payment_status, t),
                          })}
                        </p>
                      )}
                      {o.auto_confirmed && <p>{t("telegram.automatically_confirmed")}</p>}
                      {(o.items?.length
                        ? o.items
                        : [
                            {
                              line_number: 1,
                              variant_id: "",
                              sku: "",
                              description: o.description,
                              quantity: o.quantity,
                              unit_price: o.unit_price,
                              line_total: o.grand_total,
                            },
                          ]
                      ).map((item) => (
                        <div className={styles.orderItem} key={item.line_number}>
                          <strong>{item.description}</strong>
                          <p>
                            {item.sku && `${item.sku} · `}
                            {t("telegram.quantity", { quantity: item.quantity })} ·{" "}
                            {t("telegram.unit_price", {
                              price: item.unit_price,
                              currency: o.currency_code,
                            })}
                          </p>
                          <small>
                            {t("telegram.line_total", {
                              total: item.line_total,
                              currency: o.currency_code,
                            })}
                          </small>
                        </div>
                      ))}
                      {o.status === "DRAFT" && (
                        <small>
                          {t("telegram.reservation_expires", {
                            date: date(o.expires_at, language, t("telegram.unavailable")),
                          })}
                        </small>
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
                      <span>{t("telegram.reserved_stock_awaiting_review")}</span>
                      {isMerchant && (
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
                            {busy === `cancel-${o.id}`
                              ? t("telegram.cancelling")
                              : t("common.cancel")}
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
                            {busy === `confirm-${o.id}`
                              ? t("telegram.confirming")
                              : t("telegram.confirm_order")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          <p className={styles.note}>{t("telegram.draft_stock_note")}</p>
        </section>
      )}
      {view === "guide" && (
        <div className={styles.guideLayout}>
          <section className={styles.panel} aria-labelledby="telegram-setup-guide-title">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>{t("telegram.getting_started")}</span>
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
                    {t("telegram.official_bot")} <strong>@{botName}</strong>
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
                <span className={styles.eyebrow}>{t("telegram.quick_reference")}</span>
                <h2>{t("telegram_setup.seller_commands")}</h2>
              </div>
              <Icon name="send" size={21} />
            </div>
            <p className={styles.note}>{t("telegram_setup.after_connect_body")}</p>
            <p className={styles.note}>{t("telegram_setup.customer_name_rule")}</p>
            <div className={styles.commandList}>
              {[
                [t("telegram.example_product_name"), "/takeorder electric wheelchair qty=2"],
                [t("telegram.example_sku"), "/takeorder qty=2 WC-002"],
                [t("telegram.example_name_sku"), "/takeorder electric wheelchair qty=2 WC-002"],
                [
                  t("telegram.example_customer_multiple"),
                  "/takeorder\ncustomer=KyawKyaw\nwo phone qty=2\ntravel-mate-p214 qty=1",
                ],
                [t("telegram.example_cancel_draft"), "/cancelorder TG-20260927-0001"],
              ].map(([label, command]) => (
                <div key={command}>
                  <strong>{label}</strong>
                  <code>{command}</code>
                  <CopyButton
                    value={command}
                    label={t("telegram.copy_example_command", { label })}
                  />
                </div>
              ))}
            </div>
            <p className={styles.note}>
              {t("telegram_setup.quantity_keyword_rule")} {t("telegram_setup.order_rules")}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
