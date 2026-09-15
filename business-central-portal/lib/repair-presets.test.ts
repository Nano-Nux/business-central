import { describe, expect, it } from "vitest";
import {
  filterAndSortPresets,
  STARTER_PRESET_TEMPLATES,
  validatePresetValue,
} from "./repair-presets";
import type { RepairPreset } from "./types";

const mockPresets: RepairPreset[] = [
  {
    id: "p-1",
    merchant_id: "m-1",
    shop_id: "s-1",
    preset_type: "ISSUE",
    value: "Cracked Screen / Unresponsive touch",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  },
  {
    id: "p-2",
    merchant_id: "m-1",
    shop_id: "s-1",
    preset_type: "ISSUE",
    value: "Battery draining quickly",
    created_at: "2026-09-05T12:00:00Z",
    updated_at: "2026-09-05T12:00:00Z",
  },
  {
    id: "p-3",
    merchant_id: "m-1",
    shop_id: "s-1",
    preset_type: "ISSUE",
    value: "Water damage with corrosion on motherboard",
    created_at: "2026-09-10T08:00:00Z",
    updated_at: "2026-09-10T08:00:00Z",
  },
];

describe("validatePresetValue", () => {
  it("rejects empty string or whitespace only", () => {
    const res1 = validatePresetValue("");
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("empty");

    const res2 = validatePresetValue("   \n\t  ");
    expect(res2.valid).toBe(false);
  });

  it("rejects string over 500 characters", () => {
    const longString = "a".repeat(501);
    const res = validatePresetValue(longString);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("500 characters");
  });

  it("rejects duplicate values case-insensitively", () => {
    const res = validatePresetValue("cracked screen / unresponsive touch", mockPresets);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("already exists");
  });

  it("allows duplicate when excluding the preset's own id during editing", () => {
    const res = validatePresetValue("Cracked Screen / Unresponsive touch", mockPresets, "p-1");
    expect(res.valid).toBe(true);
    expect(res.cleanValue).toBe("Cracked Screen / Unresponsive touch");
  });

  it("accepts valid and trimmed values", () => {
    const res = validatePresetValue("  Camera blurry after drop   ");
    expect(res.valid).toBe(true);
    expect(res.cleanValue).toBe("Camera blurry after drop");
  });
});

describe("filterAndSortPresets", () => {
  it("filters presets by query matching text case-insensitively", () => {
    const result = filterAndSortPresets(mockPresets, "battery", "NEWEST");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p-2");
  });

  it("sorts by newest first", () => {
    const result = filterAndSortPresets(mockPresets, "", "NEWEST");
    expect(result.map((p) => p.id)).toEqual(["p-3", "p-2", "p-1"]);
  });

  it("sorts by oldest first", () => {
    const result = filterAndSortPresets(mockPresets, "", "OLDEST");
    expect(result.map((p) => p.id)).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("sorts alphabetically A–Z", () => {
    const result = filterAndSortPresets(mockPresets, "", "ALPHA_ASC");
    expect(result[0].id).toBe("p-2"); // "Battery..."
    expect(result[1].id).toBe("p-1"); // "Cracked..."
    expect(result[2].id).toBe("p-3"); // "Water..."
  });

  it("sorts alphabetically Z–A", () => {
    const result = filterAndSortPresets(mockPresets, "", "ALPHA_DESC");
    expect(result[0].id).toBe("p-3"); // "Water..."
    expect(result[1].id).toBe("p-1"); // "Cracked..."
    expect(result[2].id).toBe("p-2"); // "Battery..."
  });

  it("sorts by longest description", () => {
    const result = filterAndSortPresets(mockPresets, "", "LENGTH_DESC");
    expect(result[0].id).toBe("p-3"); // 43 chars
    expect(result[1].id).toBe("p-1"); // 35 chars
    expect(result[2].id).toBe("p-2"); // 24 chars
  });
});

describe("STARTER_PRESET_TEMPLATES", () => {
  it("has predefined starter templates for both ISSUE and CONDITION", () => {
    expect(STARTER_PRESET_TEMPLATES.ISSUE.length).toBeGreaterThanOrEqual(10);
    expect(STARTER_PRESET_TEMPLATES.CONDITION.length).toBeGreaterThanOrEqual(10);

    for (const item of STARTER_PRESET_TEMPLATES.ISSUE) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.value.length).toBeGreaterThan(0);
    }

    for (const item of STARTER_PRESET_TEMPLATES.CONDITION) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.value.length).toBeGreaterThan(0);
    }
  });
});
