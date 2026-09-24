"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { PageHeader } from "./ui";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

export function RepairHubPage() {
  const { isMerchant } = useAuth();
  const { t } = useTranslation();

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Repairs"
        description="Select a repair module to manage tickets, services, or intake presets."
      />
      <div className="settings-grid repair-hub-grid">
        <Link href="/repairs/desk" className="settings-card repair-desk-hero-card">
          <span className="stat-icon mint repair-hero-icon">
            <Icon name="repair" />
          </span>
          <div className="repair-hero-content">
            <div className="repair-hero-header">
              <h2>{t("repairs.repair_desk_title", "Repair desk")}</h2>
              <span className="repair-hero-badge">{t("repairs.primary_desk", "Primary desk")}</span>
            </div>
            <p>Active repair tickets, intake diagnostics, status updates, and invoicing.</p>
          </div>
          <div className="repair-hero-action">
            <span>{t("repairs.open_desk", "Open desk")}</span>
            <Icon name="arrow" />
          </div>
        </Link>
        <Link href="/repairs/catalog" className="settings-card">
          <span className="stat-icon blue">
            <Icon name="catalog" />
          </span>
          <div>
            <h2>Repair catalog</h2>
            <p>Manage repair services and standard labor fees.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        {isMerchant && (
          <Link href="/repairs/issue-presets" className="settings-card">
            <span className="stat-icon purple">
              <Icon name="tag" />
            </span>
            <div>
              <h2>Issue presets</h2>
              <p>Predefined device issue descriptions to speed up intake.</p>
            </div>
            <Icon name="arrow" />
          </Link>
        )}
        {isMerchant && (
          <Link href="/repairs/condition-presets" className="settings-card">
            <span className="stat-icon amber">
              <Icon name="tag" />
            </span>
            <div>
              <h2>Condition presets</h2>
              <p>Standardized physical condition checklists and notes.</p>
            </div>
            <Icon name="arrow" />
          </Link>
        )}
      </div>
    </>
  );
}
