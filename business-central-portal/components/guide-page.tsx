"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { Icon } from "@/components/icons";
import { GUIDE_CATEGORIES, GUIDE_SECTIONS } from "@/lib/guide-data";

export function GuidePage() {
  const { merchant } = useAuth();
  const { language, setLanguage, t } = useTranslation();

  // Active POS complexity level of current shop
  const merchantMode = (merchant?.pos_complexity_level || "SIMPLE") as
    "MINI" | "SIMPLE" | "COMPLEX";
  const [overriddenMode, setOverriddenMode] = useState<"MINI" | "SIMPLE" | "COMPLEX" | null>(null);
  const selectedMode = overriddenMode ?? merchantMode;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  // Handle ESC key for lightbox
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLightboxImage(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter sections by the currently active/selected POS mode
  const filteredSections = useMemo(() => {
    return GUIDE_SECTIONS.filter((sec) => {
      // POS mode filtering: strictly show only the workflow matching the mode
      if (sec.posComplexityLevel !== "ALL" && sec.posComplexityLevel !== selectedMode) {
        return false;
      }

      // Checkout modal is for Simple and Complex POS modes
      if (sec.id === "pos-checkout-modal" && selectedMode === "MINI") {
        return false;
      }

      // Mini mode exclusions
      if (sec.id === "stock-assets" && selectedMode === "MINI") return false;

      // Category filter
      if (activeCategory !== "all" && sec.category !== activeCategory) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch =
          sec.title[language]?.toLowerCase().includes(q) || sec.title.en.toLowerCase().includes(q);
        const descMatch =
          sec.description[language]?.toLowerCase().includes(q) ||
          sec.description.en.toLowerCase().includes(q);
        const stepMatch = sec.steps.some(
          (s) =>
            s.label[language]?.toLowerCase().includes(q) ||
            s.desc[language]?.toLowerCase().includes(q) ||
            s.label.en.toLowerCase().includes(q) ||
            s.desc.en.toLowerCase().includes(q),
        );
        return titleMatch || descMatch || stepMatch;
      }

      return true;
    });
  }, [selectedMode, activeCategory, searchQuery, language]);

  const modeConfig = {
    MINI: {
      label: "POS Mini",
      color: "var(--status-success)",
      bg: "var(--status-success-soft)",
      border: "var(--status-success-border)",
    },
    SIMPLE: {
      label: "POS Simple",
      color: "var(--status-info)",
      bg: "var(--status-info-soft)",
      border: "var(--status-info-border)",
    },
    COMPLEX: {
      label: "POS Complex",
      color: "var(--status-conflict)",
      bg: "var(--status-conflict-soft)",
      border: "var(--status-conflict-border)",
    },
  };

  return (
    <div className="guide-page-container">
      <style>{`
        .guide-page-container {
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .guide-card-content {
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 1.75rem;
          align-items: start;
        }
        .guide-hero-card {
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 1.75rem;
          box-shadow: var(--shadow);
        }
        .guide-lang-group {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          background: var(--surface-muted);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid var(--line);
        }
        .guide-lang-btn {
          padding: 5px 12px;
          font-size: 0.8rem;
          border-radius: 6px;
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .guide-lang-btn:hover {
          color: var(--ink);
        }
        .guide-lang-btn.active {
          background: var(--paper);
          border-color: var(--line);
          color: var(--ink);
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .guide-mode-pill {
          padding: 5px 11px;
          font-size: 0.75rem;
          border-radius: 7px;
          cursor: pointer;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s ease;
        }
        .guide-toolbar {
          position: sticky;
          top: 12px;
          z-index: 30;
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 0.75rem 1rem;
          margin-bottom: 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
          box-shadow: var(--shadow);
        }
        .guide-cat-pill {
          padding: 6px 13px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--line);
          background: var(--surface-muted);
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .guide-cat-pill:hover {
          color: var(--ink);
          border-color: var(--muted);
        }
        .guide-cat-pill.active {
          background: var(--accent);
          color: var(--theme-white);
          border-color: var(--accent);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }
        .guide-step-item {
          display: flex;
          gap: 0.85rem;
          background: var(--surface-muted);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 0.85rem 1rem;
          transition: border-color 0.15s ease;
        }
        .guide-step-item:hover {
          border-color: var(--muted);
        }
        @media (max-width: 900px) {
          .guide-hero-card {
            padding: 1.25rem !important;
          }
          .guide-card-content {
            grid-template-columns: 1fr !important;
          }
          .guide-card {
            padding: 1.25rem !important;
          }
          .guide-toolbar .search-box {
            max-width: 100% !important;
            flex: 1 1 100% !important;
          }
        }
      `}</style>

      {/* Top Hero Banner */}
      <div className="guide-hero-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "1.25rem",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  background: "var(--surface-muted)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon name="book" size={14} />
                {language === "my"
                  ? "တရားဝင် လမ်းညွှန်ချက်"
                  : language === "th"
                    ? "คู่มือทางการ"
                    : "Visual Manual"}
              </span>

              {/* Active merchant mode badge */}
              <span
                style={{
                  background: modeConfig[merchantMode].bg,
                  color: modeConfig[merchantMode].color,
                  border: `1px solid ${modeConfig[merchantMode].border}`,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: modeConfig[merchantMode].color,
                  }}
                />
                {language === "my"
                  ? `ဆိုင်၏ မူလမုဒ်: ${modeConfig[merchantMode].label}`
                  : language === "th"
                    ? `โหมดใช้งานปัจจุบัน: ${modeConfig[merchantMode].label}`
                    : `Active Mode: ${modeConfig[merchantMode].label}`}
              </span>
            </div>

            <h1
              style={{
                margin: "0 0 0.5rem 0",
                fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)",
                fontWeight: 750,
                color: "var(--ink)",
                letterSpacing: "-0.02em",
              }}
            >
              {language === "my"
                ? "Business Central လုပ်ငန်းသုံး စုံလင်သော ရုပ်ပုံလမ်းညွှန်"
                : language === "th"
                  ? "คู่มือภาพประกอบและขั้นตอนการใช้งาน Business Central"
                  : "Business Central Guide & Visual Walkthrough"}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "0.95rem",
                color: "var(--muted)",
                maxWidth: "800px",
                lineHeight: 1.6,
              }}
            >
              {language === "my"
                ? "မျက်နှာပြင်တစ်ခုချင်းစီ၏ အသုံးပြုပုံ၊ ဘားကုဒ်ဖတ်ခြင်း၊ အရောင်းကောင်တာ ငွေရှင်းနည်းနှင့် အဆင့်ဆင့် လုပ်ဆောင်ချက်များကို ရုပ်ပုံ၊ မျှားနှင့် အဝိုင်းများဖြင့် အသေးစိတ် ရှင်းလင်းထားပါသည်။"
                : language === "th"
                  ? "คู่มือการใช้งานระบบพร้อมภาพประกอบ ลูกศร วงกลมเน้นจุดสำคัญ และขั้นตอนแบบทีละขั้นสำหรับทุกหน้าและฟังก์ชันการทำงาน."
                  : "Step-by-step visual documentation featuring annotated screenshots with directional arrows, glowing highlights, and numbered callouts for all shop operations."}
            </p>
          </div>

          {/* Controls: Language Selector & Mode Filter */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.85rem",
              alignItems: "flex-end",
            }}
          >
            {/* Language Selector */}
            <div className="guide-lang-group">
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`guide-lang-btn ${language === "en" ? "active" : ""}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage("my")}
                className={`guide-lang-btn ${language === "my" ? "active" : ""}`}
              >
                မြန်မာ
              </button>
              <button
                type="button"
                onClick={() => setLanguage("th")}
                className={`guide-lang-btn ${language === "th" ? "active" : ""}`}
              >
                ไทย
              </button>
            </div>

            {/* POS Mode Switcher / Preview filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <small style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500 }}>
                {language === "my"
                  ? "မုဒ် ရွေးချယ်ပြသမှု:"
                  : language === "th"
                    ? "แสดงตามโหมด:"
                    : "Filter by Mode:"}
              </small>
              <div style={{ display: "flex", gap: "5px" }}>
                {(["MINI", "SIMPLE", "COMPLEX"] as const).map((m) => {
                  const isSelected = selectedMode === m;
                  const isMerchantDefault = merchantMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOverriddenMode(m)}
                      className="guide-mode-pill"
                      style={{
                        border: isSelected
                          ? `1px solid ${modeConfig[m].border}`
                          : "1px solid var(--line)",
                        background: isSelected ? modeConfig[m].bg : "var(--paper)",
                        color: isSelected ? modeConfig[m].color : "var(--muted)",
                        fontWeight: isSelected ? 700 : 500,
                      }}
                    >
                      {modeConfig[m].label}
                      {isMerchantDefault && (
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: modeConfig[m].color,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Mode Information Callout */}
        <div
          style={{
            marginTop: "1.25rem",
            padding: "0.85rem 1.15rem",
            borderRadius: "10px",
            background: "var(--surface-muted)",
            border: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                color: modeConfig[selectedMode].color,
                fontSize: "1.1rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ℹ
            </span>
            <span style={{ color: "var(--ink)", lineHeight: 1.5 }}>
              {selectedMode === "MINI"
                ? language === "my"
                  ? "POS Mini မုဒ်အတွက် လမ်းညွှန်ချက်များကို ပြသနေပါသည်။ ရှုပ်ထွေးသော စာရင်းများမပါဘဲ လျင်မြန်စွာ ငွေရှင်းနိုင်သော အဆင့်များကိုသာ စစ်ထုတ်ပြသထားပါသည်။"
                  : language === "th"
                    ? "กำลังแสดงคู่มือสำหรับโหมด POS Mini: มุ่งเน้นการคิดเงินด่วน ตัดขั้นตอนที่ไม่จำเป็น เพื่อความคล่องตัวสูงสุด."
                    : "Showing streamlined workflows for POS Mini: Quick items, instant barcode scans, and fast cash settlements."
                : selectedMode === "SIMPLE"
                  ? language === "my"
                    ? "POS Simple မုဒ်အတွက် လမ်းညွှန်ချက်များကို ပြသနေပါသည်။ စံထားလက်လီအရောင်း၊ ဖောက်သည်ချိတ်ဆက်မှုနှင့် ပရိုမိုးရှင်းများကို ပြသထားပါသည်။"
                    : language === "th"
                      ? "กำลังแสดงคู่มือสำหรับโหมด POS Simple: การขายหน้าร้านมาตรฐาน เชื่อมโยงลูกค้า และโปรโมชันส่วนลด."
                      : "Showing standard workflows for POS Simple: Standard retail counter, customer linking, promos, and multiple tender types."
                  : language === "my"
                    ? "POS Complex မုဒ်အတွက် လမ်းညွှန်ချက်များကို ပြသနေပါသည်။ အမျိုးအစားခွဲ (Matrix Variants)၊ ပစ္စည်းအမှတ်စဉ်နှင့် အဆင့်မြင့်လုပ်ငန်းစဉ်များ ပါဝင်ပါသည်။"
                    : language === "th"
                      ? "กำลังแสดงคู่มือสำหรับโหมด POS Complex: เมทริกซ์ตัวเลือกสินค้าหลายมิติ หมายเลขซีเรียล และการจัดส่งครบวงจร."
                      : "Showing advanced workflows for POS Complex: Multi-dimensional variant matrices, serial barcodes, and courier dispatch."}
            </span>
          </div>

          {selectedMode !== merchantMode && (
            <button
              type="button"
              onClick={() => setOverriddenMode(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: 600,
                textDecoration: "underline",
                padding: "2px 4px",
              }}
            >
              {language === "my"
                ? `ဆိုင်၏ မူလမုဒ် (${modeConfig[merchantMode].label}) သို့ ပြန်ပြောင်းမည်`
                : language === "th"
                  ? `กลับสู่โหมดเริ่มต้นของร้าน (${modeConfig[merchantMode].label})`
                  : `Reset to Shop Default (${modeConfig[merchantMode].label})`}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Toolbar: Search & Category Tabs */}
      <div className="guide-toolbar">
        {/* Category Filter Pills */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`guide-cat-pill ${activeCategory === "all" ? "active" : ""}`}
          >
            {language === "my"
              ? "အားလုံး ကြည့်မည်"
              : language === "th"
                ? "ทั้งหมด"
                : "All Sections"}{" "}
            ({filteredSections.length})
          </button>
          {GUIDE_CATEGORIES.map((cat) => {
            const isCatActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`guide-cat-pill ${isCatActive ? "active" : ""}`}
              >
                <Icon name={cat.icon} size={14} />
                <span>{cat.label[language] || cat.label.en}</span>
              </button>
            );
          })}
        </div>

        {/* Live Search Input using portal standard search-box */}
        <div className="search-box" style={{ maxWidth: "300px" }}>
          <Icon name="search" size={16} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === "my"
                ? "လမ်းညွှန်ချက်များတွင် ရှာဖွေပါ..."
                : language === "th"
                  ? "ค้นหาคู่มือหรือขั้นตอน..."
                  : "Search guide & steps..."
            }
          />
        </div>
      </div>

      {/* Guide Section List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {filteredSections.map((sec, idx) => {
          return (
            <div
              id={sec.id}
              key={sec.id}
              className="card guide-card"
              style={{
                borderRadius: "14px",
                padding: "1.75rem",
                background: "var(--paper)",
                border: "1px solid var(--line)",
                boxShadow: "var(--shadow)",
              }}
            >
              {/* Section Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "10px",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--line)",
                      color: "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={sec.icon} size={22} />
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        {idx + 1}. {sec.route}
                      </span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "2px 8px",
                          borderRadius: "5px",
                          fontWeight: 700,
                          background:
                            sec.posComplexityLevel === "MINI"
                              ? "var(--status-success-soft)"
                              : sec.posComplexityLevel === "COMPLEX"
                                ? "var(--status-conflict-soft)"
                                : sec.posComplexityLevel === "SIMPLE"
                                  ? "var(--status-info-soft)"
                                  : "var(--surface-muted)",
                          color:
                            sec.posComplexityLevel === "MINI"
                              ? "var(--status-success)"
                              : sec.posComplexityLevel === "COMPLEX"
                                ? "var(--status-conflict)"
                                : sec.posComplexityLevel === "SIMPLE"
                                  ? "var(--status-info)"
                                  : "var(--muted)",
                          border: `1px solid ${
                            sec.posComplexityLevel === "MINI"
                              ? "var(--status-success-border)"
                              : sec.posComplexityLevel === "COMPLEX"
                                ? "var(--status-conflict-border)"
                                : sec.posComplexityLevel === "SIMPLE"
                                  ? "var(--status-info-border)"
                                  : "var(--line)"
                          }`,
                        }}
                      >
                        {sec.badge[language] || sec.badge.en}
                      </span>
                    </div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: "1.35rem",
                        fontWeight: 700,
                        color: "var(--ink)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {sec.title[language] || sec.title.en}
                    </h2>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <Link
                    href={sec.route}
                    className="button button-secondary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontSize: "0.85rem",
                      padding: "8px 14px",
                      height: "38px",
                    }}
                  >
                    <span>
                      {language === "my"
                        ? "စာမျက်နှာသို့ သွားမည်"
                        : language === "th"
                          ? "ไปยังหน้านี้"
                          : "Go to Page"}
                    </span>
                    <Icon name="arrow" size={14} />
                  </Link>
                </div>
              </div>

              {/* Description */}
              <p
                style={{
                  margin: "0 0 1.5rem 0",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                  color: "var(--muted)",
                }}
              >
                {sec.description[language] || sec.description.en}
              </p>

              {/* Main Content: Screenshot on Left, Step breakdown on Right */}
              <div className="guide-card-content">
                {/* Screenshot Frame with Zoom overlay */}
                <div
                  style={{
                    position: "relative",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                    background: "var(--surface-muted)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
                    cursor: "zoom-in",
                  }}
                  onClick={() =>
                    setLightboxImage({
                      url: sec.screenshot,
                      title: sec.title[language] || sec.title.en,
                    })
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setLightboxImage({
                        url: sec.screenshot,
                        title: sec.title[language] || sec.title.en,
                      });
                    }
                  }}
                  title={
                    language === "my"
                      ? "ပုံကြီးချဲ့ ကြည့်ရှုရန် နှိပ်ပါ"
                      : language === "th"
                        ? "คลิกเพื่อขยายดูภาพขนาดเต็ม"
                        : "Click to expand image in full resolution"
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sec.screenshot}
                    alt={sec.title[language] || sec.title.en}
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                      transition: "transform 0.2s ease",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10px",
                      right: "10px",
                      background: "rgba(0, 0, 0, 0.75)",
                      backdropFilter: "blur(6px)",
                      borderRadius: "6px",
                      padding: "4px 9px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#ffffff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    }}
                  >
                    <span>🔍</span>
                    <span>
                      {language === "my"
                        ? "ပုံကြီးချဲ့ရန်"
                        : language === "th"
                          ? "ขยายภาพ"
                          : "Click to zoom"}
                    </span>
                  </div>
                </div>

                {/* Steps & Pro Tip Column */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--muted)",
                    }}
                  >
                    {language === "my"
                      ? "အဆင့်ဆင့် လုပ်ဆောင်ချက်များ"
                      : language === "th"
                        ? "ขั้นตอนการทำงานตามลำดับ"
                        : "Step-by-Step Actions"}
                  </div>

                  {/* Step list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    {sec.steps.map((st) => (
                      <div key={st.number} className="guide-step-item">
                        <div
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            background: "var(--accent)",
                            color: "var(--theme-white)",
                            fontSize: "0.8rem",
                            fontWeight: 750,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {st.number}
                        </div>
                        <div>
                          <strong
                            style={{
                              fontSize: "0.9rem",
                              color: "var(--ink)",
                              display: "block",
                              marginBottom: "2px",
                              fontWeight: 600,
                            }}
                          >
                            {st.label[language] || st.label.en}
                          </strong>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.825rem",
                              lineHeight: 1.5,
                              color: "var(--muted)",
                            }}
                          >
                            {st.desc[language] || st.desc.en}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pro Tip Box */}
                  <div
                    style={{
                      background: "var(--status-success-soft)",
                      border: "1px solid var(--status-success-border)",
                      borderRadius: "10px",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.65rem",
                    }}
                  >
                    <span style={{ fontSize: "1.15rem", lineHeight: 1 }}>💡</span>
                    <div>
                      <strong
                        style={{
                          color: "var(--status-success)",
                          fontSize: "0.825rem",
                          display: "block",
                          marginBottom: "3px",
                          fontWeight: 700,
                        }}
                      >
                        {language === "my"
                          ? "အကြံပြုချက်"
                          : language === "th"
                            ? "คำแนะนำพิเศษ"
                            : "Pro Tip & Best Practice"}
                      </strong>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.825rem",
                          lineHeight: 1.5,
                          color: "var(--ink)",
                        }}
                      >
                        {sec.proTip[language] || sec.proTip.en}
                      </p>
                    </div>
                  </div>

                  {/* Shortcut Hint if present */}
                  {sec.shortcutHint && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span>⌨️</span>
                      <span>{sec.shortcutHint}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredSections.length === 0 && (
          <div className="empty-state" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--ink)" }}>
              {language === "my"
                ? "ကိုက်ညီသော လမ်းညွှန်ချက် မတွေ့ပါ"
                : language === "th"
                  ? "ไม่พบข้อมูลคู่มือที่ค้นหา"
                  : "No guide sections matched"}
            </h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {language === "my"
                ? "ရှာဖွေမှု စကားလုံးကို ပြင်ဆင်ပါ သို့မဟုတ် စစ်ထုတ်မှုများကို ပယ်ဖျက်ပါ။"
                : language === "th"
                  ? "ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูข้อมูลทั้งหมด."
                  : "Try adjusting your search query or reset category filters."}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              className="button button-secondary"
              style={{ marginTop: "1rem" }}
            >
              {language === "my"
                ? "အားလုံး ပြန်လည်ပြသမည်"
                : language === "th"
                  ? "แสดงทั้งหมด"
                  : "Reset Filters"}
            </button>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            cursor: "zoom-out",
          }}
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              maxWidth: "1400px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                color: "#ffffff",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#ffffff" }}>
                {lightboxImage.title}
              </h3>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.2)",
                  border: "none",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  color: "#ffffff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                  transition: "background 0.15s ease",
                }}
                aria-label={t("common.close", "Close")}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
                background: "#000000",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
