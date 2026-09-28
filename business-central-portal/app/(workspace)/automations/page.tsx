import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "./page.module.css";

export default function AutomationsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>AI / Automations</span>
        <h1>Automations</h1>
        <p>Connect your sales channels. Keep your orders in one place.</p>
      </header>
      <section aria-labelledby="available-title">
        <div className={styles.sectionHeading}>
          <h2 id="available-title">Available now</h2>
          <span>1 integration</span>
        </div>
        <article className={styles.available} aria-labelledby="telegram-title">
          <div className={styles.integration}>
            <div className={styles.cardTop}>
              <span className={styles.telegramIcon}>
                <Icon name="send" size={28} />
              </span>
              <span className={styles.availableBadge}>
                <Icon name="check" size={13} />
                Available
              </span>
            </div>
            <h3 id="telegram-title">Telegram</h3>
            <p>
              Turn group conversations into shop orders. Connect your groups, give sellers access,
              and review drafts before confirming a sale.
            </p>
            <ul className={styles.features}>
              <li>
                <Icon name="users" size={15} />
                Multiple shop groups
              </li>
              <li>
                <Icon name="lock" size={15} />
                Seller permissions
              </li>
              <li>
                <Icon name="receipt" size={15} />
                Draft order review
              </li>
            </ul>
            <div className={styles.cardAction}>
              <Link
                href="/automations/telegram"
                className={`button button-primary ${styles.openLink}`}
              >
                Manage Telegram
                <Icon name="arrow" size={17} />
              </Link>
              <span>Requires Telegram automation enabled for your merchant.</span>
            </div>
          </div>
          <div className={styles.workflow}>
            <span className={styles.eyebrow}>From conversation to sale</span>
            <ol>
              <li>
                <span>
                  <Icon name="send" size={18} />
                </span>
                <div>
                  <strong>Connect your group</strong>
                  <p>Pair a Telegram group with your shop.</p>
                </div>
              </li>
              <li>
                <span>
                  <Icon name="receipt" size={18} />
                </span>
                <div>
                  <strong>Receive draft orders</strong>
                  <p>Authorized sellers create orders in chat.</p>
                </div>
              </li>
              <li>
                <span>
                  <Icon name="check" size={18} />
                </span>
                <div>
                  <strong>Review & confirm</strong>
                  <p>Confirmed sales appear in your order history.</p>
                </div>
              </li>
            </ol>
          </div>
        </article>
      </section>
      <section aria-labelledby="upcoming-title">
        <div className={styles.sectionHeading}>
          <h2 id="upcoming-title">Coming soon</h2>
          <span>More channels on the way</span>
        </div>
        <div className={styles.upcomingGrid}>
          {[
            {
              name: "Facebook",
              mark: "f",
              description: "Bring your Facebook social selling workflows into Business Central.",
            },
            {
              name: "WhatsApp",
              mark: "W",
              description: "Manage WhatsApp commerce conversations alongside your shop orders.",
            },
          ].map((item) => (
            <article
              key={item.name}
              className={styles.upcoming}
              aria-label={`${item.name} coming soon`}
            >
              <div className={styles.cardTop}>
                <span className={styles.plannedIcon} aria-hidden="true">
                  {item.mark}
                </span>
                <span className={styles.comingBadge}>Coming soon</span>
              </div>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className={styles.plannedFooter}>
                <Icon name="lock" size={14} />
                <span>Not available yet</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
