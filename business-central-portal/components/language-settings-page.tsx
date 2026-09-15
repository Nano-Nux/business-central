"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { Badge, Button, PageHeader } from "./ui";
import { useTranslation, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";

export function LanguageSettingsPage() {
  const { language, setLanguage, t } = useTranslation();
  const [justSwitched, setJustSwitched] = useState<string | null>(null);

  function handleSelect(code: SupportedLanguage) {
    setLanguage(code);
    setJustSwitched(code);
    setTimeout(() => {
      setJustSwitched(null);
    }, 2500);
  }

  return (
    <>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/settings" className="button secondary" style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
          <span style={{ transform: "rotate(180deg)", display: "inline-block" }}>
            <Icon name="arrow" size={16} />
          </span>
          {t("common.back", "Back to Settings")}
        </Link>
      </div>

      <PageHeader
        eyebrow={t("settings.language.eyebrow", "Settings")}
        title={t("settings.language.title", "Language setting")}
        description={t(
          "settings.language.guideline",
          "Choose the language used for buttons, navigation, guidelines, and invoices across this workstation.",
        )}
      />

      {justSwitched && (
        <div className="notice success" style={{ marginBottom: "1.25rem" }}>
          <Icon name="check" size={18} />
          <span>{t("settings.language.save_note", "Language preference is saved locally and applies instantly.")}</span>
        </div>
      )}

      <div className="card settings-stack" style={{ marginBottom: "1.5rem" }}>
        <div className="card-head">
          <div>
            <h2>{t("settings.language.select_prompt", "Select preferred language")}</h2>
            <p>{t("settings.language.guideline", "Select your workstation language. All changes apply immediately without reloading.")}</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <div
                key={lang.code}
                className="card language-option-card"
                onClick={() => handleSelect(lang.code)}
                style={{
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: isSelected
                    ? "var(--surface-muted, var(--theme-gray-50))"
                    : "var(--theme-white)",
                  color: "var(--text)",
                  borderRadius: "13px",
                  padding: "1.25rem",
                  cursor: "pointer",
                  transition: "all 0.18s ease-in-out",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.85rem",
                  boxShadow: isSelected
                    ? "0 0 0 1px var(--accent), 0 4px 16px -2px rgb(var(--theme-black-rgb, 0 0 0) / 0.15)"
                    : "0 2px 6px rgb(var(--theme-black-rgb, 0 0 0) / 0.04)",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "2.4rem",
                          height: "2.4rem",
                          borderRadius: "10px",
                          background: isSelected
                            ? "var(--theme-gray-100, rgba(128, 128, 128, 0.12))"
                            : "var(--surface-muted, var(--theme-gray-50))",
                          border: "1px solid var(--line)",
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          lineHeight: 1,
                          flexShrink: 0,
                          color: "var(--text)",
                        }}
                      >
                        {lang.flag}
                      </span>
                      <div>
                        <strong style={{ fontSize: "1.1rem", display: "block", color: "var(--text)" }}>{lang.nativeName}</strong>
                        <small style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{lang.name}</small>
                      </div>
                    </div>
                    {isSelected && (
                      <Badge tone="success">
                        <Icon name="check" size={14} />
                        {t("settings.language.current_badge", "Selected")}
                      </Badge>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.5 }}>
                    {lang.code === "en"
                      ? t("settings.language.english_desc", lang.description)
                      : lang.code === "my"
                        ? t("settings.language.myanmar_desc", lang.description)
                        : t("settings.language.thai_desc", lang.description)}
                  </p>
                </div>

                <div style={{ paddingTop: "0.5rem" }}>
                  <Button
                    variant={isSelected ? "primary" : "secondary"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(lang.code);
                    }}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {isSelected
                      ? t("settings.language.current_badge", "Active language")
                      : t("settings.language.switch_button", { name: lang.nativeName }, `Switch to ${lang.name}`)}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card settings-stack">
        <div className="card-head">
          <div>
            <h2>{t("settings.language.preview_heading", "Live Interface Preview")}</h2>
            <p>{t("settings.language.preview_guideline", "Guidelines, button text, and system notices will display in this language.")}</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "1rem", background: "var(--surface-muted, var(--theme-gray-50))" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--text)" }}>{t("nav.overview", "Navigation labels")}</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <span className="badge">{t("nav.today", "Today")}</span>
              <span className="badge">{t("nav.pos", "Point of sale")}</span>
              <span className="badge">{t("nav.catalog", "Catalog")}</span>
              <span className="badge">{t("nav.repairs", "Repair")}</span>
              <span className="badge">{t("nav.invoices", "Invoices")}</span>
              <span className="badge">{t("nav.settings", "Settings")}</span>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "1rem", background: "var(--surface-muted, var(--theme-gray-50))" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--text)" }}>{t("common.actions", "Button actions")}</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              <button type="button" className="button" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}>
                {t("common.save", "Save")}
              </button>
              <button type="button" className="button secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}>
                {t("common.cancel", "Cancel")}
              </button>
              <button type="button" className="button secondary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}>
                {t("common.print", "Print")}
              </button>
              <button type="button" className="button primary" style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}>
                {t("pos.checkout_button", { amount: "$25.00" }, "Check out $25.00")}
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "1rem", background: "var(--surface-muted, var(--theme-gray-50))", gridColumn: "1 / -1" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "var(--text)" }}>{t("guidelines.pos_guide_title", "POS Guideline")}</h4>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, color: "var(--muted)" }}>
              {t("guidelines.pos_guide_desc")}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
