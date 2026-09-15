import type { RepairPreset } from "./types";

export type PresetType = "ISSUE" | "CONDITION";

export type PresetSortOption = "NEWEST" | "OLDEST" | "ALPHA_ASC" | "ALPHA_DESC" | "LENGTH_DESC";

export const PRESET_SORT_OPTIONS: { value: PresetSortOption; label: string }[] = [
  { value: "NEWEST", label: "Newest first" },
  { value: "OLDEST", label: "Oldest first" },
  { value: "ALPHA_ASC", label: "Value (A–Z)" },
  { value: "ALPHA_DESC", label: "Value (Z–A)" },
  { value: "LENGTH_DESC", label: "Longest description" },
];

export const STARTER_PRESET_TEMPLATES: Record<PresetType, { label: string; value: string }[]> = {
  ISSUE: [
    {
      label: "Cracked Screen",
      value: "Cracked or shattered screen / Touch unresponsive",
    },
    {
      label: "Battery Drain",
      value: "Battery drains rapidly / Does not hold charge",
    },
    {
      label: "No Power",
      value: "Device will not power on / Unresponsive",
    },
    {
      label: "Charging Port",
      value: "Charging port damaged / Intermittent connection",
    },
    {
      label: "Water Damage",
      value: "Liquid damage / Exposure to moisture",
    },
    {
      label: "Camera Issue",
      value: "Camera malfunction / Blurry lens or black screen",
    },
    {
      label: "Audio / Speaker",
      value: "Speaker or earpiece audio muffled / Distorted",
    },
    {
      label: "Microphone",
      value: "Microphone not picking up sound during calls",
    },
    {
      label: "Overheating",
      value: "Device overheating during standard usage",
    },
    {
      label: "Software / Bootloop",
      value: "Software freezing / Bootloop error",
    },
    {
      label: "Wi-Fi / Network",
      value: "Wi-Fi or cellular connectivity failing / Dropping",
    },
    {
      label: "Stuck Buttons",
      value: "Physical power or volume button stuck / Jammed",
    },
  ],
  CONDITION: [
    {
      label: "Pristine",
      value: "Pristine / Mint condition (no visible marks or scratches)",
    },
    {
      label: "Light Scratches",
      value: "Light micro-scratches on display glass",
    },
    {
      label: "Deep Scratches",
      value: "Noticeable deep scratches on screen or casing",
    },
    {
      label: "Corner Scuffs",
      value: "Corner scuffs and housing denting from drop",
    },
    {
      label: "Cracked Back Glass",
      value: "Cracked or fractured rear glass backplate",
    },
    {
      label: "Bent Chassis",
      value: "Chassis or aluminum frame bent / warped",
    },
    {
      label: "Missing SIM Tray",
      value: "Missing SIM card tray or ejector pin damage",
    },
    {
      label: "Third-party Part",
      value: "Third-party replacement screen or battery installed",
    },
    {
      label: "Liquid Indicator",
      value: "Liquid contact indicator (LCI) pink / triggered",
    },
    {
      label: "Camera Lens Scratched",
      value: "Camera lens glass scratched or cracked",
    },
    {
      label: "Missing Screws",
      value: "Missing housing screws or signs of prior disassembly",
    },
    {
      label: "Screen Protector",
      value: "Screen protector applied with edge peeling or cracks",
    },
  ],
};

export function validatePresetValue(
  raw: string,
  existingPresets: RepairPreset[] = [],
  excludeId?: string,
): { valid: boolean; error?: string; cleanValue: string } {
  const cleanValue = raw.trim();

  if (!cleanValue) {
    return {
      valid: false,
      error: "Preset text cannot be empty.",
      cleanValue: "",
    };
  }

  if (cleanValue.length > 500) {
    return {
      valid: false,
      error: `Preset exceeds maximum length of 500 characters (${cleanValue.length}/500).`,
      cleanValue,
    };
  }

  const isDuplicate = existingPresets.some(
    (item) => item.id !== excludeId && item.value.toLowerCase() === cleanValue.toLowerCase(),
  );

  if (isDuplicate) {
    return {
      valid: false,
      error: "A preset with this exact description already exists.",
      cleanValue,
    };
  }

  return { valid: true, cleanValue };
}

export function filterAndSortPresets(
  presets: RepairPreset[],
  query: string,
  sort: PresetSortOption,
): RepairPreset[] {
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = trimmedQuery
    ? presets.filter((preset) => preset.value.toLowerCase().includes(trimmedQuery))
    : [...presets];

  return filtered.sort((a, b) => {
    switch (sort) {
      case "NEWEST": {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      }
      case "OLDEST": {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      }
      case "ALPHA_ASC":
        return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
      case "ALPHA_DESC":
        return b.value.localeCompare(a.value, undefined, { sensitivity: "base" });
      case "LENGTH_DESC":
        return b.value.length - a.value.length;
      default:
        return 0;
    }
  });
}
