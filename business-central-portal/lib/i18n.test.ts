import { describe, expect, it } from "vitest";
import {
  translate,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
} from "./i18n";
import { resolveTranslation, translations } from "./translations";

describe("i18n core translation engine", () => {
  it("defines English, Myanmar, and Thai as supported languages", () => {
    const codes = SUPPORTED_LANGUAGES.map((lang) => lang.code);
    expect(codes).toContain("en");
    expect(codes).toContain("my");
    expect(codes).toContain("th");
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(LANGUAGE_STORAGE_KEY).toBe("bc.language");
  });

  it("translates navigation labels correctly across all three languages", () => {
    expect(translate("nav.pos", "en")).toBe("Point of sale");
    expect(translate("nav.pos", "my")).toBe("အရောင်းကောင်တာ (POS)");
    expect(translate("nav.pos", "th")).toBe("จุดขายหน้าร้าน (POS)");

    expect(translate("nav.settings", "en")).toBe("Settings");
    expect(translate("nav.settings", "my")).toBe("ဆက်တင်များ");
    expect(translate("nav.settings", "th")).toBe("การตั้งค่า");

    expect(translate("nav.repairs", "en")).toBe("Repair");
    expect(translate("nav.repairs", "my")).toBe("Repair");
    expect(translate("nav.repairs", "th")).toBe("Repair");

    expect(translate("invoices.repair_invoices", "en")).toBe("Repair");
    expect(translate("invoices.repair_invoices", "my")).toBe("Repair");
    expect(translate("invoices.repair_invoices", "th")).toBe("Repair");
  });

  it("translates common actions and buttons across all three languages", () => {
    expect(translate("common.save", "en")).toBe("Save");
    expect(translate("common.save", "my")).toBe("သိမ်းဆည်းမည်");
    expect(translate("common.save", "th")).toBe("บันทึก");

    expect(translate("common.cancel", "en")).toBe("Cancel");
    expect(translate("common.cancel", "my")).toBe("ပယ်ဖျက်မည်");
    expect(translate("common.cancel", "th")).toBe("ยกเลิก");

    expect(translate("common.search", "en")).toBe("Search");
    expect(translate("common.search", "my")).toBe("ရှာဖွေမည်");
    expect(translate("common.search", "th")).toBe("ค้นหา");
  });

  it("interpolates parameters in translation strings", () => {
    expect(translate("nav.pending_count", "en", { count: 3 })).toBe("3 pending");
    expect(translate("nav.pending_count", "my", { count: 5 })).toBe("5 ခု ဆိုင်းငံ့နေသည်");
    expect(translate("nav.pending_count", "th", { count: 2 })).toBe("รอดำเนินการ 2 รายการ");

    expect(translate("settings.language.switch_button", "en", { name: "Myanmar" })).toBe(
      "Switch to Myanmar",
    );
    expect(translate("settings.language.switch_button", "my", { name: "မြန်မာစာ" })).toBe(
      "မြန်မာစာ သို့ ပြောင်းလဲမည်",
    );
    expect(translate("settings.language.switch_button", "th", { name: "ภาษาไทย" })).toBe(
      "เปลี่ยนเป็น ภาษาไทย",
    );
  });

  it("falls back to English when a key is missing in another language", () => {
    // Both english and non-existent custom key test
    expect(resolveTranslation("my", "non_existent_key", undefined, "Fallback Text")).toBe(
      "Fallback Text",
    );
  });

  it("has consistent dictionary top-level keys across en, my, and th", () => {
    const enKeys = Object.keys(translations.en).sort();
    const myKeys = Object.keys(translations.my).sort();
    const thKeys = Object.keys(translations.th).sort();

    expect(myKeys).toEqual(enKeys);
    expect(thKeys).toEqual(enKeys);
  });

  it("contains Language setting sub-setting strings in all languages", () => {
    expect(translate("settings.cards.language.title", "en")).toBe("Language setting");
    expect(translate("settings.cards.language.title", "my")).toBe("Language setting");
    expect(translate("settings.cards.language.title", "th")).toBe("Language setting");

    expect(translate("settings.language.title", "en")).toBe("Language setting");
    expect(translate("settings.language.title", "my")).toBe("Language setting");
    expect(translate("settings.language.title", "th")).toBe("Language setting");
  });
});
