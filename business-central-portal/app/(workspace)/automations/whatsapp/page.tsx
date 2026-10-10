"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

export default function WhatsAppAutomationPage() {
  const { t } = useTranslation();
  return (
    <div className="page-stack">
      <PageHeader
        title={t("automations.whatsapp.title")}
        description={t("automations.whatsapp.coming_description")}
      />
      <section className="empty-card">
        <h2>{t("automations.coming_soon")}</h2>
        <p>{t("automations.whatsapp.disabled_description")}</p>
        <Link className="button secondary" href="/automations">
          {t("automations.back")}
        </Link>
      </section>
    </div>
  );
}
