"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

export default function FacebookAutomationPage() {
  const { t } = useTranslation();
  return (
    <div className="page-stack">
      <PageHeader
        title={t("automations.facebook.title")}
        description={t("automations.facebook.coming_description")}
      />
      <section className="empty-card">
        <h2>{t("automations.coming_soon")}</h2>
        <p>{t("automations.facebook.disabled_description")}</p>
        <Link className="button secondary" href="/automations">
          {t("automations.back")}
        </Link>
      </section>
    </div>
  );
}
