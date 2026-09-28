"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  getTelegramWebhookStatus,
  registerTelegramWebhook,
  TelegramWebhookStatus,
} from "../lib/api";
import styles from "./telegram-webhook-settings.module.css";

type Props = {
  withAuth: <T>(operation: (token: string) => Promise<T>) => Promise<T>;
};

export function TelegramWebhookSettings({ withAuth }: Props) {
  const [status, setStatus] = useState<TelegramWebhookStatus | null>(null);
  const [url, setURL] = useState("");
  const [busy, setBusy] = useState<"loading" | "registering" | "">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setBusy("loading");
    setError("");
    setNotice("");
    try {
      const value = await withAuth(getTelegramWebhookStatus);
      setStatus(value);
      setURL((current) => current || value.url || value.suggested_url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load webhook status.",
      );
    } finally {
      setBusy("");
    }
  }, [withAuth]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("registering");
    setError("");
    setNotice("");
    try {
      const value = await withAuth((token) =>
        registerTelegramWebhook(token, url.trim()),
      );
      setStatus(value);
      if (value.url === url.trim())
        setNotice(
          "Webhook registered. Send a new command in your Telegram group to check delivery.",
        );
      else
        setError(
          "Telegram returned a different webhook address. Refresh status before trying again.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not register the webhook.",
      );
    } finally {
      setBusy("");
    }
  }

  const canRegister = status?.token_configured && status?.secret_configured;
  return (
    <section
      className={styles.card}
      aria-labelledby="telegram-webhook-heading"
      aria-busy={!!busy}
    >
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">BOT SETUP</p>
          <h2 id="telegram-webhook-heading">Telegram webhook</h2>
          <p className={styles.description}>
            Connect the shared bot to your deployed backend. This setting
            applies to every merchant.
          </p>
        </div>
        <span
          className={`${styles.badge} ${status?.url ? styles.registered : styles.unregistered}`}
        >
          {busy === "loading"
            ? "Checking status…"
            : !status
              ? "Status unavailable"
              : status.url
                ? "Registered"
                : "Not registered"}
        </span>
      </div>
      {status && (
        <div className={styles.facts}>
          <div>
            <span>Bot</span>
            <strong>
              {status.bot_username
                ? `@${status.bot_username}`
                : "Name not configured"}
            </strong>
          </div>
          <div>
            <span>Backend configuration</span>
            <strong>{canRegister ? "Ready" : "Setup required"}</strong>
          </div>
          <div>
            <span>Pending updates</span>
            <strong>{status.pending_update_count}</strong>
          </div>
        </div>
      )}
      {status?.url && (
        <p className={styles.address}>
          Registered address: <code>{status.url}</code>
        </p>
      )}
      {status && !canRegister && (
        <p className={styles.warning}>
          Configure {!status.token_configured ? "TELEGRAM_BOT_TOKEN" : ""}
          {!status.token_configured && !status.secret_configured ? " and " : ""}
          {!status.secret_configured
            ? "TELEGRAM_WEBHOOK_SECRET (32–256 letters, numbers, underscores, or hyphens)"
            : ""}{" "}
          on the backend, then restart it and refresh status.
        </p>
      )}
      {status?.last_error_message && (
        <p className={styles.warning}>
          Last delivery error
          {status.last_error_date
            ? ` (${new Date(status.last_error_date * 1000).toLocaleString()})`
            : ""}
          : {status.last_error_message}
        </p>
      )}
      <form className={styles.form} onSubmit={register}>
        <label htmlFor="telegram-webhook-url">
          Public backend webhook URL
          <input
            id="telegram-webhook-url"
            type="url"
            required
            value={url}
            onChange={(event) => setURL(event.target.value)}
            placeholder="https://your-backend.example.com/api/v1/webhooks/telegram"
            aria-describedby="telegram-webhook-help"
            disabled={!!busy}
          />
        </label>
        <div className={styles.actions}>
          <button
            type="submit"
            disabled={!!busy || !canRegister || !url.trim()}
          >
            {busy === "registering" ? "Registering…" : "Register webhook"}
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={!!busy}
            onClick={() => {
              void load();
            }}
          >
            Refresh status
          </button>
        </div>
      </form>
      <p id="telegram-webhook-help" className={styles.help}>
        Use the public HTTPS address ending in /api/v1/webhooks/telegram.
        Register once after deployment, or again when the address or webhook
        secret changes. Registering replaces the bot’s current webhook.
      </p>
      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
    </section>
  );
}
