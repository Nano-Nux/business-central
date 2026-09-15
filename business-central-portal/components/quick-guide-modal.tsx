"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { Button } from "./ui";
import { useTranslation } from "@/lib/i18n";

export function QuickGuideModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="modal-scrim"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: "680px",
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "1.75rem",
          borderRadius: "14px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 0.35rem 0", fontSize: "1.4rem" }}>
              {t("guidelines.quick_guide_title", "Business Central Quick Guide")}
            </h2>
            <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.8 }}>
              {t(
                "guidelines.quick_guide_subtitle",
                "Learn the core workflows for counter, inventory, and management.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.25rem", margin: "1.5rem 0" }}
        >
          {/* POS Guide */}
          <div
            style={{
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                className="stat-icon mint"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <Icon name="cart" size={16} />
              </span>
              <strong style={{ fontSize: "1rem" }}>
                {t("guidelines.pos_guide_title", "Point of Sale (POS) Workflow")}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.85 }}>
              {t("guidelines.pos_guide_desc")}
            </p>
          </div>

          {/* Inventory Guide */}
          <div
            style={{
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                className="stat-icon blue"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <Icon name="package" size={16} />
              </span>
              <strong style={{ fontSize: "1rem" }}>
                {t("guidelines.inventory_guide_title", "Inventory & Stock Operations")}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.85 }}>
              {t("guidelines.inventory_guide_desc")}
            </p>
          </div>

          {/* Repairs Guide */}
          <div
            style={{
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                className="stat-icon amber"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <Icon name="repair" size={16} />
              </span>
              <strong style={{ fontSize: "1rem" }}>
                {t("guidelines.repairs_guide_title", "Device Repair Management")}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.85 }}>
              {t("guidelines.repairs_guide_desc")}
            </p>
          </div>

          {/* Offline Guide */}
          <div
            style={{
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                className="stat-icon purple"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <Icon name="history" size={16} />
              </span>
              <strong style={{ fontSize: "1rem" }}>
                {t("guidelines.offline_guide_title", "Offline Mode & Data Sync")}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.85 }}>
              {t("guidelines.offline_guide_desc")}
            </p>
          </div>

          {/* Language Guide */}
          <div
            style={{
              border: "1px solid var(--line, #e2e8f0)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <span
                className="stat-icon blue"
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "6px",
                }}
              >
                <Icon name="globe" size={16} />
              </span>
              <strong style={{ fontSize: "1rem" }}>
                {t("guidelines.language_guide_title", "Language & Regional Settings")}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.85 }}>
              {t("guidelines.language_guide_desc")}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "0.5rem",
            borderTop: "1px solid var(--line, #e2e8f0)",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              href="/guide"
              onClick={onClose}
              className="button"
              style={{
                display: "inline-flex",
                gap: "0.4rem",
                alignItems: "center",
                fontSize: "0.875rem",
              }}
            >
              <Icon name="book" size={16} />
              {t("guidelines.open_full_guide", "Open full visual guide")}
            </Link>
            <Link
              href="/settings/language"
              onClick={onClose}
              className="button secondary"
              style={{
                display: "inline-flex",
                gap: "0.4rem",
                alignItems: "center",
                fontSize: "0.875rem",
              }}
            >
              <Icon name="globe" size={16} />
              {t("settings.language.title", "Language setting")}
            </Link>
          </div>
          <Button onClick={onClose}>{t("common.close", "Close")}</Button>
        </div>
      </div>
    </div>
  );
}
