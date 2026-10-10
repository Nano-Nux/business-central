"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { useTranslation } from "@/lib/i18n";
import styles from "./page.module.css";

export default function AutomationsPage() {
  const { t } = useTranslation();
  const upcoming = [
    {
      name: "Facebook",
      mark: "f",
      description: t("automations.facebook.description"),
    },
    {
      name: "WhatsApp",
      mark: "W",
      description: t("automations.whatsapp.description"),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>{t("automations.eyebrow")}</span>
        <h1>{t("automations.title")}</h1>
        <p>{t("automations.description")}</p>
      </header>
      <section aria-labelledby="available-title">
        <div className={styles.sectionHeading}>
          <h2 id="available-title">{t("automations.available_now")}</h2>
          <span>{t("automations.integration_count", { count: 1 })}</span>
        </div>
        <article className={styles.available} aria-labelledby="telegram-title">
          <div className={styles.integration}>
            <div className={styles.cardTop}>
              <span className={styles.telegramIcon}>
                <Icon name="send" size={28} />
              </span>
              <span className={styles.availableBadge}>
                <Icon name="check" size={13} />
                {t("automations.available")}
              </span>
            </div>
            <h3 id="telegram-title">Telegram</h3>
            <p>{t("automations.telegram.description")}</p>
            <ul className={styles.features}>
              <li>
                <Icon name="users" size={15} />
                {t("automations.telegram.multiple_groups")}
              </li>
              <li>
                <Icon name="lock" size={15} />
                {t("automations.telegram.seller_permissions")}
              </li>
              <li>
                <Icon name="receipt" size={15} />
                {t("automations.telegram.draft_review")}
              </li>
            </ul>
            <div className={styles.cardAction}>
              <Link
                href="/automations/telegram"
                className={`button button-primary ${styles.openLink}`}
              >
                {t("automations.telegram.manage")}
                <Icon name="arrow" size={17} />
              </Link>
              <span>{t("automations.telegram.requirement")}</span>
            </div>
          </div>
          <div className={styles.workflow}>
            <span className={styles.eyebrow}>{t("automations.telegram.workflow")}</span>
            <ol>
              <li>
                <span>
                  <Icon name="send" size={18} />
                </span>
                <div>
                  <strong>{t("automations.telegram.step_connect_title")}</strong>
                  <p>{t("automations.telegram.step_connect_body")}</p>
                </div>
              </li>
              <li>
                <span>
                  <Icon name="receipt" size={18} />
                </span>
                <div>
                  <strong>{t("automations.telegram.step_orders_title")}</strong>
                  <p>{t("automations.telegram.step_orders_body")}</p>
                </div>
              </li>
              <li>
                <span>
                  <Icon name="check" size={18} />
                </span>
                <div>
                  <strong>{t("automations.telegram.step_review_title")}</strong>
                  <p>{t("automations.telegram.step_review_body")}</p>
                </div>
              </li>
            </ol>
          </div>
        </article>
      </section>
      <section aria-labelledby="upcoming-title">
        <div className={styles.sectionHeading}>
          <h2 id="upcoming-title">{t("automations.coming_soon")}</h2>
          <span>{t("automations.more_channels")}</span>
        </div>
        <div className={styles.upcomingGrid}>
          {upcoming.map((item) => (
            <article
              key={item.name}
              className={styles.upcoming}
              aria-label={t("automations.channel_coming_soon", { channel: item.name })}
            >
              <div className={styles.cardTop}>
                <span className={styles.plannedIcon} aria-hidden="true">
                  {item.mark}
                </span>
                <span className={styles.comingBadge}>{t("automations.coming_soon")}</span>
              </div>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className={styles.plannedFooter}>
                <Icon name="lock" size={14} />
                <span>{t("automations.not_available_yet")}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
