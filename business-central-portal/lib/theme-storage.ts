export const THEME_STORAGE_KEY = "bc.theme";
export const DEFAULT_THEME = "default-theme";

export const LAYOUT_STORAGE_KEY = "bc.layout";
export const DEFAULT_LAYOUT = "default-layout";

export const LEGACY_THEME_KEYS = [
  "theme",
  "bc_theme",
  "bc-theme",
  "business_central_theme",
  "business-central-theme",
  "appearance",
  "theme_settings",
] as const;

export const LEGACY_LAYOUT_KEYS = [
  "layout",
  "bc_layout",
  "bc-layout",
  "business_central_layout",
  "business-central-layout",
  "appearance",
  "theme_settings",
] as const;

export type ThemeInfo = {
  id: string;
  name: string;
  badge?: string;
  description: string;
  previewColors: string[];
};

export type LayoutInfo = {
  id: string;
  name: string;
  badge?: string;
  description: string;
  icon?: string;
};

export const CUSTOM_COLOR_THEME_ID = "custom-color-theme";
export const CUSTOM_THEME_COLOR_KEY = "bc.custom_theme_color";
export const CUSTOM_THEME_MODE_KEY = "bc.custom_theme_mode";
export const DEFAULT_CUSTOM_COLOR = "#2563eb";
export const DEFAULT_CUSTOM_MODE = "light";

export const MERCHANT_CUSTOM_THEMES_CACHE_KEY = "bc.merchant_custom_themes";
export const ACTIVE_MERCHANT_CUSTOM_THEME_KEY = "bc.active_merchant_theme";

export type MerchantCustomTheme = {
  id: string;
  merchant_id: string;
  name: string;
  description?: string;
  badge?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  border_color: string;
  canvas_color: string;
  colors?: string[];
  mode: "light" | "dark";
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export const AVAILABLE_THEMES: ThemeInfo[] = [
  {
    id: "default-theme",
    name: "Monochrome Precision",
    badge: "Minimal",
    description:
      "High-contrast architectural monochrome palette with deep grays and sharp precision.",
    previewColors: ["#000000", "#2f2f2f", "#525252", "#a3a3a3", "#ffffff"],
  },
  {
    id: "visual-clean-theme",
    name: "Visual Clean",
    badge: "220° Blue",
    description:
      "Modern workspace with royal sapphire actions, emerald revenue highlights, warm amber alerts, and crisp card surfaces.",
    previewColors: ["#2563eb", "#059669", "#d97706", "#7c3aed", "#f4f6fb"],
  },
  {
    id: "ruby-crimson-theme",
    name: "Ruby Crimson",
    badge: "0° Red",
    description:
      "Bold scarlet red brand actions, velvet rose tint, and crisp surfaces for high-urgency or luxury retail.",
    previewColors: ["#dc2626", "#b91c1c", "#991b1b", "#fecaca", "#fef2f2"],
  },
  {
    id: "sunset-coral-theme",
    name: "Sunset Coral",
    badge: "20° Coral",
    description:
      "High-energy retail palette with warm sunset coral actions, radiant golden honey metrics, and warm peach canvas.",
    previewColors: ["#ea580c", "#f59e0b", "#e11d48", "#fed7aa", "#fff9f5"],
  },
  {
    id: "amber-honey-theme",
    name: "Amber Honey",
    badge: "40° Amber",
    description:
      "Warm golden amber honey actions on toasted biscuit canvas for bakeries, food & artisanal craft.",
    previewColors: ["#d97706", "#b45309", "#78350f", "#fde68a", "#fffdf7"],
  },
  {
    id: "citrus-gold-theme",
    name: "Citrus Gold",
    badge: "55° Gold",
    description:
      "Radiant Tuscan gold highlights and champagne warmth for cheerful, energetic boutiques.",
    previewColors: ["#ca8a04", "#a16207", "#713f12", "#fef08a", "#fffef5"],
  },
  {
    id: "lime-zest-theme",
    name: "Lime Zest",
    badge: "80° Lime",
    description:
      "Invigorating electric lime and matcha green actions with an airy organic canvas for wellness and sports.",
    previewColors: ["#65a30d", "#4d7c0f", "#365314", "#d9f99d", "#fbfef5"],
  },
  {
    id: "nordic-calm-theme",
    name: "Nordic Calm",
    badge: "130° Sage",
    description:
      "Hygge-inspired warm linen canvas, soothing Scandinavian sage green actions, terracotta accents, and soft tactile readability.",
    previewColors: ["#2d6a4f", "#c2410c", "#d97706", "#b7c9b8", "#fbf9f5"],
  },
  {
    id: "emerald-luxe-theme",
    name: "Emerald Luxe",
    badge: "150° Pine",
    description:
      "Prestigious botanical pine and deep emerald greens, warm champagne gold accents, and subtle mint-tinted luxury ivory.",
    previewColors: ["#064e3b", "#059669", "#d97706", "#a7f3d0", "#f4faf6"],
  },
  {
    id: "ocean-teal-theme",
    name: "Ocean Teal",
    badge: "175° Teal",
    description:
      "Crisp marine and coastal teal actions, refreshing seafoam revenue highlights, azure accents, and cool glacier canvas.",
    previewColors: ["#0d9488", "#0284c7", "#d97706", "#99f6e4", "#f0fdfa"],
  },
  {
    id: "glacier-cyan-theme",
    name: "Glacier Cyan",
    badge: "195° Cyan",
    description:
      "Crisp arctic electric cyan brand actions on an icy glacier canvas for clinics, hardware, and modern tech.",
    previewColors: ["#0284c7", "#0369a1", "#075985", "#bae6fd", "#f0f9ff"],
  },
  {
    id: "royal-indigo-theme",
    name: "Royal Indigo",
    badge: "245° Indigo",
    description:
      "Deep galactic indigo and ultramarine actions for enterprise SaaS, corporate, and legal establishments.",
    previewColors: ["#4f46e5", "#4338ca", "#312e81", "#c7d2fe", "#f8fafc"],
  },
  {
    id: "amethyst-purple-theme",
    name: "Amethyst Purple",
    badge: "275° Violet",
    description:
      "Luxurious regal amethyst and velvet violet actions for beauty, cosmetics, and high fashion.",
    previewColors: ["#7c3aed", "#6d28d9", "#4c1d95", "#ddd6fe", "#faf5ff"],
  },
  {
    id: "fuchsia-rose-theme",
    name: "Fuchsia Rose",
    badge: "330° Magenta",
    description:
      "Vibrant fuchsia rose and magenta blossom actions for florists, salons, lifestyle, and boutiques.",
    previewColors: ["#db2777", "#be185d", "#831843", "#fbcfe8", "#fff5f9"],
  },
  {
    id: "copper-patina-theme",
    name: "Copper Patina",
    badge: "Artisanal",
    description:
      "Burnished copper metallic actions with oxidized verdigris seafoam accents and weathered stone canvas.",
    previewColors: ["#c2410c", "#14b8a6", "#451a03", "#ccfbf1", "#f8faf7"],
  },
  {
    id: "lavender-dusk-theme",
    name: "Lavender Dusk",
    badge: "Pastel",
    description:
      "Gentle Provençal lilac brand actions with misty violet shadows, soft heather borders, and evening twilight canvas.",
    previewColors: ["#8b5cf6", "#a78bfa", "#5b21b6", "#ede9fe", "#faf8ff"],
  },
  {
    id: "clay-terracotta-theme",
    name: "Clay Terracotta",
    badge: "Earthy",
    description:
      "Tuscan baked earthenware terracotta actions with adobe clay tones, roasted umber, and warm travertine canvas.",
    previewColors: ["#9a3412", "#c2410c", "#431407", "#fed7aa", "#faf6f0"],
  },
  {
    id: "matcha-pistachio-theme",
    name: "Matcha Pistachio",
    badge: "Botanical",
    description:
      "Calming ceremonial matcha green actions paired with pistachio milk highlights, herbal undertones, and silk paper canvas.",
    previewColors: ["#3f6212", "#65a30d", "#1a2e05", "#d9f99d", "#f7faf2"],
  },
  {
    id: "sandstone-dune-theme",
    name: "Sandstone Dune",
    badge: "Desert",
    description:
      "Warm desert sandstone and camel dune brass accents with sun-bleached adobe canvas and wind-swept golden metrics.",
    previewColors: ["#854d0e", "#ca8a04", "#422006", "#fef08a", "#faf7f2"],
  },
  {
    id: "plum-wine-theme",
    name: "Plum Wine",
    badge: "Burgundy",
    description:
      "Rich Bordeaux wine, velvety cassis, and deep mulberry actions on a soft rose quartz parchment canvas.",
    previewColors: ["#831843", "#9d174d", "#500724", "#fbcfe8", "#fdf4f7"],
  },
  {
    id: "slate-steel-theme",
    name: "Slate Steel",
    badge: "Industrial",
    description:
      "Cool battleship slate, brushed nickel, and high-durability cold steel accents for rugged industrial precision.",
    previewColors: ["#1e293b", "#475569", "#0f172a", "#cbd5e1", "#f8fafc"],
  },
  {
    id: "aurora-borealis-theme",
    name: "Aurora Borealis",
    badge: "Celestial Dark",
    description:
      "Ethereal dark polar night canvas with glowing aurora emerald ribbons, radiant celestial cyan, and polar frost telemetry.",
    previewColors: ["#10b981", "#06b6d4", "#031417", "#0e373f", "#a7f3d0"],
  },
  {
    id: "charcoal-gold-theme",
    name: "Charcoal Gold",
    badge: "Black Tie",
    description:
      "Ultra-luxurious dark executive tuxedo charcoal canvas with 24K bullion gold accents and champagne gilded highlights.",
    previewColors: ["#eab308", "#18181b", "#ca8a04", "#fef08a", "#09090b"],
  },
  {
    id: "neo-mint-theme",
    name: "Neo Mint",
    badge: "Bio-Tech",
    description:
      "Crisp bio-tech neo-mint actions with clinical eucalyptus accents, deep pine typography, and pastel mint wash canvas.",
    previewColors: ["#10b981", "#059669", "#064e3b", "#a7f3d0", "#f0fdf4"],
  },
  {
    id: "midnight-dark-theme",
    name: "Midnight Obsidian",
    badge: "Dark Mode",
    description:
      "Sleek obsidian tech night mode with elevated dark slate cards, electric cyan primary brand, and luminous mint telemetry.",
    previewColors: ["#090d16", "#131926", "#38bdf8", "#34d399", "#f8fafc"],
  },
  {
    id: "synthwave-neon-theme",
    name: "Synthwave Neon",
    badge: "Cyberpunk",
    description:
      "Retro-futuristic cyberpunk palette with deep cosmic violet, glowing amethyst and magenta gradients, and fluorescent cyan accents.",
    previewColors: ["#0c0a17", "#1a1330", "#a855f7", "#ec4899", "#06b6d4"],
  },
  {
    id: "espresso-dark-theme",
    name: "Espresso Roast",
    badge: "Warm Dark",
    description:
      "Soothing zero-blue-light dark coffee lounge aesthetic with roasted espresso canvas, walnut cards, and warm honey amber.",
    previewColors: ["#14100e", "#1e1814", "#f59e0b", "#84cc16", "#fef3c7"],
  },
  {
    id: "high-contrast-theme",
    name: "High Contrast (AAA)",
    badge: "WCAG AAA",
    description:
      "Maximum-contrast accessibility theme with stark jet-black borders, deep 100% black ink, and high-visibility gold focus rings.",
    previewColors: ["#000000", "#ffffff", "#facc15", "#006622", "#990000"],
  },
  {
    id: "custom-color-theme",
    name: "Custom Brand Color",
    badge: "360° Custom",
    description:
      "Your custom brand color dynamically generated from the full 360° color wheel with light or dark canvas.",
    previewColors: ["#2563eb", "#1d4ed8", "#60a5fa", "#93c5fd", "#ffffff"],
  },
];

export const AVAILABLE_LAYOUTS: LayoutInfo[] = [
  {
    id: "default-layout",
    name: "Default Workspace",
    badge: "Spacious",
    description:
      "Spacious, comfortable density with full sidebar on desktop, adaptive drawer on tablet, and fluid touch stack on mobile.",
    icon: "layout",
  },
  {
    id: "compact-layout",
    name: "Compact Density",
    badge: "High Density",
    description:
      "Space-saving density with 72px icon rail on desktop, condensed tablet register, and high-density mobile scan grid.",
    icon: "sidebar",
  },
  {
    id: "modern-executive-layout",
    name: "Modern Executive",
    badge: "Million Dollar UI",
    description:
      "Ultra-premium floating island architecture with glassmorphic command deck, elevated capsule navigation, spatial card depth, and ergonomic high-yield registers.",
    icon: "palette",
  },
];

export type NativeStorageBridge = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
};

// In-memory fallback if all persistent storage APIs throw or fail
let memoryThemeCache: string | null = null;
let memoryLayoutCache: string | null = null;

export function _resetAppearanceCacheForTesting(): void {
  memoryThemeCache = null;
  memoryLayoutCache = null;
}

// IndexedDB configuration for WebView persistent fallback
const IDB_DB_NAME = "bc_theme_fallback";
const IDB_STORE_NAME = "settings";
const IDB_THEME_KEY = "theme";
const IDB_CANONICAL_THEME_KEY = "bc.theme";
const IDB_LAYOUT_KEY = "layout";
const IDB_CANONICAL_LAYOUT_KEY = "bc.layout";

export function nativeStorageBridge(): NativeStorageBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as Window & {
      BusinessCentralNativeStorage?: NativeStorageBridge;
    }
  ).BusinessCentralNativeStorage;
}

export function usingNativeStorageBridge(): boolean {
  return typeof window !== "undefined" && Boolean(nativeStorageBridge());
}

/**
 * Detects whether the current environment is running inside the Business Central mobile WebView,
 * including older mobile app releases that lack the native SQLite storage bridge.
 */
export function isMobileWebView(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as Record<string, unknown>;
  return Boolean(
    win.BusinessCentralNativeStorage ||
    win.BusinessCentralStorageChannel ||
    win.BusinessCentralNativeDatabase ||
    win.BusinessCentralDatabaseChannel ||
    win.BusinessCentralPrinterChannel ||
    win.BusinessCentralScannerChannel ||
    win.BusinessCentralRefreshChannel ||
    (typeof navigator !== "undefined" &&
      /business-central-mobile|wv|WebView/i.test(navigator.userAgent)),
  );
}

export function isValidThemeId(themeId: unknown): boolean {
  return (
    typeof themeId === "string" &&
    (AVAILABLE_THEMES.some((t) => t.id === themeId) || themeId.startsWith("custom-theme-"))
  );
}

export function isValidLayoutId(layoutId: unknown): boolean {
  return typeof layoutId === "string" && AVAILABLE_LAYOUTS.some((l) => l.id === layoutId);
}

/**
 * Normalizes raw or legacy theme identifiers, accommodating older mobile builds,
 * legacy aliases, and JSON-encoded setting structures.
 */
export function normalizeThemeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("custom-theme-")) return trimmed;
  if (isValidThemeId(trimmed)) return trimmed;

  // Normalized legacy nicknames
  if (trimmed === "default" || trimmed === "monochrome" || trimmed === "classic") {
    return "default-theme";
  }
  if (trimmed === "visual-clean" || trimmed === "clean" || trimmed === "vibrant") {
    return "visual-clean-theme";
  }
  if (trimmed === "nordic-calm" || trimmed === "nordic" || trimmed === "sage") {
    return "nordic-calm-theme";
  }
  if (trimmed === "emerald-luxe" || trimmed === "emerald" || trimmed === "luxe") {
    return "emerald-luxe-theme";
  }
  if (trimmed === "sunset-coral" || trimmed === "sunset" || trimmed === "coral") {
    return "sunset-coral-theme";
  }
  if (trimmed === "ocean-teal" || trimmed === "ocean" || trimmed === "teal") {
    return "ocean-teal-theme";
  }
  if (
    trimmed === "midnight-dark" ||
    trimmed === "midnight" ||
    trimmed === "dark" ||
    trimmed === "obsidian"
  ) {
    return "midnight-dark-theme";
  }
  if (
    trimmed === "synthwave-neon" ||
    trimmed === "synthwave" ||
    trimmed === "neon" ||
    trimmed === "cyberpunk"
  ) {
    return "synthwave-neon-theme";
  }
  if (trimmed === "espresso-dark" || trimmed === "espresso" || trimmed === "coffee") {
    return "espresso-dark-theme";
  }
  if (
    trimmed === "high-contrast" ||
    trimmed === "contrast" ||
    trimmed === "accessible" ||
    trimmed === "aaa"
  ) {
    return "high-contrast-theme";
  }
  if (
    trimmed === "ruby-crimson" ||
    trimmed === "ruby" ||
    trimmed === "crimson" ||
    trimmed === "red"
  ) {
    return "ruby-crimson-theme";
  }
  if (trimmed === "amber-honey" || trimmed === "honey") {
    return "amber-honey-theme";
  }
  if (
    trimmed === "citrus-gold" ||
    trimmed === "citrus" ||
    trimmed === "gold" ||
    trimmed === "yellow"
  ) {
    return "citrus-gold-theme";
  }
  if (trimmed === "lime-zest" || trimmed === "lime" || trimmed === "zest") {
    return "lime-zest-theme";
  }
  if (
    trimmed === "glacier-cyan" ||
    trimmed === "glacier" ||
    trimmed === "cyan" ||
    trimmed === "arctic"
  ) {
    return "glacier-cyan-theme";
  }
  if (trimmed === "royal-indigo" || trimmed === "indigo" || trimmed === "ultramarine") {
    return "royal-indigo-theme";
  }
  if (
    trimmed === "amethyst-purple" ||
    trimmed === "amethyst" ||
    trimmed === "purple" ||
    trimmed === "violet"
  ) {
    return "amethyst-purple-theme";
  }
  if (
    trimmed === "fuchsia-rose" ||
    trimmed === "fuchsia" ||
    trimmed === "rose" ||
    trimmed === "magenta" ||
    trimmed === "pink"
  ) {
    return "fuchsia-rose-theme";
  }
  if (
    trimmed === "copper-patina" ||
    trimmed === "copper" ||
    trimmed === "patina" ||
    trimmed === "verdigris"
  ) {
    return "copper-patina-theme";
  }
  if (
    trimmed === "lavender-dusk" ||
    trimmed === "lavender" ||
    trimmed === "dusk" ||
    trimmed === "lilac"
  ) {
    return "lavender-dusk-theme";
  }
  if (
    trimmed === "clay-terracotta" ||
    trimmed === "terracotta" ||
    trimmed === "clay" ||
    trimmed === "adobe"
  ) {
    return "clay-terracotta-theme";
  }
  if (trimmed === "matcha-pistachio" || trimmed === "matcha" || trimmed === "pistachio") {
    return "matcha-pistachio-theme";
  }
  if (
    trimmed === "sandstone-dune" ||
    trimmed === "sandstone" ||
    trimmed === "dune" ||
    trimmed === "camel"
  ) {
    return "sandstone-dune-theme";
  }
  if (
    trimmed === "plum-wine" ||
    trimmed === "plum" ||
    trimmed === "wine" ||
    trimmed === "bordeaux" ||
    trimmed === "cassis"
  ) {
    return "plum-wine-theme";
  }
  if (trimmed === "slate-steel" || trimmed === "steel" || trimmed === "slate") {
    return "slate-steel-theme";
  }
  if (
    trimmed === "aurora-borealis" ||
    trimmed === "aurora" ||
    trimmed === "borealis" ||
    trimmed === "polar"
  ) {
    return "aurora-borealis-theme";
  }
  if (trimmed === "charcoal-gold" || trimmed === "charcoal" || trimmed === "black-tie") {
    return "charcoal-gold-theme";
  }
  if (trimmed === "neo-mint" || trimmed === "mint" || trimmed === "eucalyptus") {
    return "neo-mint-theme";
  }
  if (
    trimmed === "custom-color" ||
    trimmed === "custom" ||
    trimmed === "custom-brand" ||
    trimmed === "color-wheel"
  ) {
    return "custom-color-theme";
  }

  // Check if string is a JSON object (e.g. legacy combined appearance or { theme: "..." })
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate =
        parsed.theme ?? parsed.themeId ?? parsed.selectedTheme ?? parsed.id ?? parsed.current;
      return normalizeThemeId(candidate);
    } catch {
      // Ignore JSON parse errors
    }
  }

  return null;
}

/**
 * Normalizes raw or legacy layout identifiers, accommodating older mobile builds,
 * legacy aliases, and JSON-encoded setting structures.
 */
export function normalizeLayoutId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isValidLayoutId(trimmed)) return trimmed;

  // Normalized legacy nicknames
  if (trimmed === "default" || trimmed === "workspace" || trimmed === "classic") {
    return "default-layout";
  }
  if (trimmed === "compact" || trimmed === "rail" || trimmed === "streamlined") {
    return "compact-layout";
  }
  if (
    trimmed === "modern" ||
    trimmed === "executive" ||
    trimmed === "million" ||
    trimmed === "deluxe" ||
    trimmed === "modern-executive" ||
    trimmed === "executive-deluxe" ||
    trimmed === "island"
  ) {
    return "modern-executive-layout";
  }

  // Check if string is a JSON object (e.g. legacy combined appearance or { layout: "..." })
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate =
        parsed.layout ?? parsed.layoutId ?? parsed.selectedLayout ?? parsed.id ?? parsed.current;
      return normalizeLayoutId(candidate);
    } catch {
      // Ignore JSON parse errors
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                        Color Math & Custom Brand Engine                    */
/* -------------------------------------------------------------------------- */

export type CustomThemeConfig = {
  color: string;
  mode: "light" | "dark";
};

export function isValidHexColor(hex: unknown): boolean {
  return typeof hex === "string" && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex.trim());
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 37, g: 99, b: 235 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function generateCustomThemePalette(hexInput: string, isDark: boolean) {
  const hex = isValidHexColor(hexInput) ? hexInput.trim() : DEFAULT_CUSTOM_COLOR;
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const hoverColor = isDark
    ? hslToHex(hsl.h, hsl.s, Math.min(85, hsl.l + 12))
    : hslToHex(hsl.h, hsl.s, Math.max(15, hsl.l - 10));

  const softColor = isDark
    ? hslToHex(hsl.h, Math.max(20, hsl.s - 25), 18)
    : hslToHex(hsl.h, Math.max(30, hsl.s - 20), 96);

  const borderColor = isDark
    ? hslToHex(hsl.h, Math.max(25, hsl.s - 20), 28)
    : hslToHex(hsl.h, Math.max(40, hsl.s - 15), 88);

  const canvas = isDark
    ? hslToHex(hsl.h, Math.min(30, Math.round(hsl.s * 0.3)), 7)
    : hslToHex(hsl.h, Math.min(40, Math.round(hsl.s * 0.4)), 98);

  const card = isDark ? hslToHex(hsl.h, Math.min(25, Math.round(hsl.s * 0.25)), 12) : "#ffffff";

  const surfaceMuted = isDark
    ? hslToHex(hsl.h, Math.min(25, Math.round(hsl.s * 0.25)), 9)
    : hslToHex(hsl.h, Math.min(35, Math.round(hsl.s * 0.35)), 96);

  const ink = isDark ? "#f8fafc" : "#0f172a";
  const muted = isDark ? hslToHex(hsl.h, 20, 65) : hslToHex(hsl.h, 30, 40);

  const line = isDark ? hslToHex(hsl.h, 25, 22) : hslToHex(hsl.h, 35, 88);

  // Button text contrast
  const buttonFg = hsl.l > 65 ? "#0f172a" : "#ffffff";

  return {
    brand: hex,
    brandHover: hoverColor,
    brandSoft: softColor,
    brandBorder: borderColor,
    canvas,
    card,
    surfaceMuted,
    ink,
    muted,
    line,
    buttonFg,
    isDark,
  };
}

export function applyCustomThemeVariables(hex: string, isDark: boolean): void {
  if (typeof window === "undefined" || !window.document?.documentElement?.style?.setProperty)
    return;
  const p = generateCustomThemePalette(hex, isDark);
  const rgb = hexToRgb(p.brand);
  const cardRgb = hexToRgb(p.card);
  const doc = window.document.documentElement;
  doc.setAttribute("data-theme-mode", isDark ? "dark" : "light");

  // Custom prefixed tokens
  doc.style.setProperty("--custom-brand", p.brand);
  doc.style.setProperty("--custom-brand-hover", p.brandHover);
  doc.style.setProperty("--custom-brand-soft", p.brandSoft);
  doc.style.setProperty("--custom-brand-border", p.brandBorder);
  doc.style.setProperty("--custom-canvas", p.canvas);
  doc.style.setProperty("--custom-paper", p.card);
  doc.style.setProperty("--custom-card", p.card);
  doc.style.setProperty("--custom-surface", p.card);
  doc.style.setProperty("--custom-surface-muted", p.surfaceMuted);
  doc.style.setProperty("--custom-ink", p.ink);
  doc.style.setProperty("--custom-muted", p.muted);
  doc.style.setProperty("--custom-line", p.line);
  doc.style.setProperty("--custom-border", p.line);
  doc.style.setProperty("--custom-button-primary-bg", p.brand);
  doc.style.setProperty("--custom-button-primary-fg", p.buttonFg);
  doc.style.setProperty("--custom-topbar-bg", `${p.canvas}eb`);

  // Standard semantic system tokens for universal compatibility
  doc.style.setProperty("--color-brand", p.brand);
  doc.style.setProperty("--color-brand-hover", p.brandHover);
  doc.style.setProperty("--color-brand-soft", p.brandSoft);
  doc.style.setProperty("--color-brand-border", p.brandBorder);
  doc.style.setProperty("--color-brand-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);
  doc.style.setProperty("--ink", p.ink);
  doc.style.setProperty("--text", p.ink);
  doc.style.setProperty("--muted", p.muted);
  doc.style.setProperty("--canvas", p.canvas);
  doc.style.setProperty("--paper", p.card);
  doc.style.setProperty("--card", p.card);
  doc.style.setProperty("--surface", p.card);
  doc.style.setProperty("--surface-muted", p.surfaceMuted);
  doc.style.setProperty("--line", p.line);
  doc.style.setProperty("--border", p.line);
  doc.style.setProperty("--accent", p.brand);
  doc.style.setProperty("--green", p.brand);
  doc.style.setProperty("--green-dark", p.brandHover);
  doc.style.setProperty("--green-soft", p.brandSoft);

  // RGB helper tokens
  if (isDark) {
    doc.style.setProperty("--theme-black-rgb", "248 250 252");
    doc.style.setProperty("--theme-white-rgb", `${cardRgb.r} ${cardRgb.g} ${cardRgb.b}`);
  } else {
    doc.style.setProperty("--theme-black-rgb", "15 23 42");
    doc.style.setProperty("--theme-white-rgb", "255 255 255");
  }
}

export function getCustomThemeConfig(): CustomThemeConfig {
  if (typeof window === "undefined") {
    return { color: DEFAULT_CUSTOM_COLOR, mode: DEFAULT_CUSTOM_MODE };
  }
  let color = DEFAULT_CUSTOM_COLOR;
  let mode: "light" | "dark" = DEFAULT_CUSTOM_MODE;

  try {
    const storedColor = localStorage.getItem(CUSTOM_THEME_COLOR_KEY);
    if (storedColor && isValidHexColor(storedColor)) {
      color = storedColor.trim();
    }
    const storedMode = localStorage.getItem(CUSTOM_THEME_MODE_KEY);
    if (storedMode === "light" || storedMode === "dark") {
      mode = storedMode;
    }
  } catch {}

  return { color, mode };
}

export function setCustomThemeConfig(color: string, mode: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  const validColor = isValidHexColor(color) ? color.trim() : DEFAULT_CUSTOM_COLOR;
  const validMode = mode === "dark" ? "dark" : "light";

  try {
    localStorage.setItem(CUSTOM_THEME_COLOR_KEY, validColor);
    localStorage.setItem(CUSTOM_THEME_MODE_KEY, validMode);
  } catch {}

  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${CUSTOM_THEME_COLOR_KEY}=${encodeURIComponent(validColor)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `${CUSTOM_THEME_MODE_KEY}=${encodeURIComponent(validMode)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {}

  const bridge = nativeStorageBridge();
  if (bridge) {
    try {
      void bridge.set(CUSTOM_THEME_COLOR_KEY, validColor);
      void bridge.set(CUSTOM_THEME_MODE_KEY, validMode);
    } catch {}
  }
}

export function applyCustomTheme(color: string, mode: "light" | "dark"): void {
  setCustomThemeConfig(color, mode);
  applyCustomThemeVariables(color, mode === "dark");
  applyTheme(CUSTOM_COLOR_THEME_ID);
}

export function generateHarmonious5ColorSetup(
  hexInput: string,
  isDark: boolean,
): [string, string, string, string, string] {
  const hex = isValidHexColor(hexInput) ? hexInput.trim() : DEFAULT_CUSTOM_COLOR;
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const primary = hex;
  const secondary = isDark
    ? hslToHex(hsl.h, hsl.s, Math.min(85, hsl.l + 12))
    : hslToHex(hsl.h, hsl.s, Math.max(15, hsl.l - 12));

  // Accent: vibrant complementary or adjacent harmonic tone (+30 deg)
  const accent = hslToHex((hsl.h + 30) % 360, Math.min(95, hsl.s + 10), isDark ? 65 : 45);

  const border = isDark
    ? hslToHex(hsl.h, Math.max(20, hsl.s - 20), 26)
    : hslToHex(hsl.h, Math.max(30, hsl.s - 15), 86);

  const canvas = isDark
    ? hslToHex(hsl.h, Math.min(25, Math.round(hsl.s * 0.25)), 8)
    : hslToHex(hsl.h, Math.min(35, Math.round(hsl.s * 0.35)), 98);

  return [primary, secondary, accent, border, canvas];
}

export function getCachedMerchantCustomThemes(): MerchantCustomTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(MERCHANT_CUSTOM_THEMES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setCachedMerchantCustomThemes(themes: MerchantCustomTheme[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MERCHANT_CUSTOM_THEMES_CACHE_KEY, JSON.stringify(themes));
  } catch {}
}

export function getActiveMerchantCustomTheme(): MerchantCustomTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_MERCHANT_CUSTOM_THEME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MerchantCustomTheme;
  } catch {
    return null;
  }
}

export function applyMerchantCustomThemeVariables(theme: MerchantCustomTheme): void {
  if (typeof window === "undefined" || !window.document?.documentElement?.style?.setProperty)
    return;
  const colors =
    theme.colors && theme.colors.length === 5
      ? theme.colors
      : [
          theme.primary_color,
          theme.secondary_color,
          theme.accent_color,
          theme.border_color,
          theme.canvas_color,
        ];
  const primary = isValidHexColor(colors[0]) ? colors[0] : DEFAULT_CUSTOM_COLOR;
  const secondary = isValidHexColor(colors[1]) ? colors[1] : primary;
  const accent = isValidHexColor(colors[2]) ? colors[2] : primary;
  const border = isValidHexColor(colors[3]) ? colors[3] : "#cbd5e1";
  const canvas = isValidHexColor(colors[4]) ? colors[4] : "#ffffff";
  const isDark = theme.mode === "dark";

  const rgb = hexToRgb(primary);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const buttonFg = hsl.l > 65 ? "#0f172a" : "#ffffff";
  const ink = isDark ? "#f8fafc" : "#0f172a";
  const card = isDark ? (isValidHexColor(canvas) ? canvas : "#18181b") : "#ffffff";

  const doc = window.document.documentElement;
  doc.setAttribute("data-theme-mode", isDark ? "dark" : "light");
  doc.style.setProperty("--color-brand", primary);
  doc.style.setProperty("--color-brand-hover", secondary);
  doc.style.setProperty("--color-brand-soft", isDark ? `${secondary}33` : `${secondary}18`);
  doc.style.setProperty("--color-brand-border", border);
  doc.style.setProperty("--color-brand-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);

  if (isDark) {
    const cardRgb = hexToRgb(card);
    doc.style.setProperty("--theme-black-rgb", "248 250 252");
    doc.style.setProperty("--theme-white-rgb", `${cardRgb.r} ${cardRgb.g} ${cardRgb.b}`);
  } else {
    doc.style.setProperty("--theme-black-rgb", "15 23 42");
    doc.style.setProperty("--theme-white-rgb", "255 255 255");
  }

  doc.style.setProperty("--ink", ink);
  doc.style.setProperty("--text", ink);
  doc.style.setProperty("--canvas", canvas);
  doc.style.setProperty("--paper", card);
  doc.style.setProperty("--card", card);
  doc.style.setProperty("--surface", card);
  doc.style.setProperty("--line", border);
  doc.style.setProperty("--border", border);
  doc.style.setProperty("--accent", accent);
  doc.style.setProperty("--green", primary);
  doc.style.setProperty("--green-dark", secondary);
  doc.style.setProperty("--green-soft", isDark ? `${secondary}33` : `${secondary}18`);

  doc.style.setProperty("--custom-brand", primary);
  doc.style.setProperty("--custom-brand-hover", secondary);
  doc.style.setProperty("--custom-brand-soft", isDark ? `${secondary}33` : `${secondary}18`);
  doc.style.setProperty("--custom-brand-border", border);
  doc.style.setProperty("--custom-canvas", canvas);
  doc.style.setProperty("--custom-paper", card);
  doc.style.setProperty("--custom-card", card);
  doc.style.setProperty("--custom-surface", card);
  doc.style.setProperty("--custom-ink", ink);
  doc.style.setProperty("--custom-line", border);
  doc.style.setProperty("--custom-border", border);
  doc.style.setProperty("--custom-button-primary-bg", primary);
  doc.style.setProperty("--custom-button-primary-fg", buttonFg);
  doc.style.setProperty("--custom-topbar-bg", `${canvas}eb`);
}

export function applyMerchantCustomTheme(theme: MerchantCustomTheme): void {
  if (typeof window === "undefined") return;
  const themeId = theme.id.startsWith("custom-theme-") ? theme.id : `custom-theme-${theme.id}`;
  try {
    localStorage.setItem(ACTIVE_MERCHANT_CUSTOM_THEME_KEY, JSON.stringify(theme));
  } catch {}
  applyMerchantCustomThemeVariables(theme);
  applyTheme(themeId);
}

/* -------------------------------------------------------------------------- */
/*                                Cookie Helpers                              */
/* -------------------------------------------------------------------------- */

export function getCookieTheme(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    for (const cookie of cookies) {
      const parts = cookie.split("=");
      const key = decodeURIComponent(parts[0]);
      if ((key === THEME_STORAGE_KEY || key === "theme" || key === "bc_theme") && parts[1]) {
        const val = decodeURIComponent(parts.slice(1).join("="));
        const normalized = normalizeThemeId(val);
        if (normalized) return normalized;
      }
    }
  } catch {
    // Ignore cookie read errors
  }
  return null;
}

export function setCookieTheme(themeId: string): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 31536000; // 1 year
    // Set canonical cookie
    document.cookie = `${encodeURIComponent(THEME_STORAGE_KEY)}=${encodeURIComponent(themeId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    // Set legacy cookie for older client apps and webviews
    document.cookie = `theme=${encodeURIComponent(themeId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}

export function getCookieLayout(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    for (const cookie of cookies) {
      const parts = cookie.split("=");
      const key = decodeURIComponent(parts[0]);
      if ((key === LAYOUT_STORAGE_KEY || key === "layout" || key === "bc_layout") && parts[1]) {
        const val = decodeURIComponent(parts.slice(1).join("="));
        const normalized = normalizeLayoutId(val);
        if (normalized) return normalized;
      }
    }
  } catch {
    // Ignore cookie read errors
  }
  return null;
}

export function setCookieLayout(layoutId: string): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = 31536000; // 1 year
    // Set canonical cookie
    document.cookie = `${encodeURIComponent(LAYOUT_STORAGE_KEY)}=${encodeURIComponent(layoutId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    // Set legacy cookie for older client apps and webviews
    document.cookie = `layout=${encodeURIComponent(layoutId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // Ignore cookie write errors
  }
}

/* -------------------------------------------------------------------------- */
/*                               IndexedDB Helpers                            */
/* -------------------------------------------------------------------------- */

export async function getIdbTheme(): Promise<string | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  return new Promise<string | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE_NAME, "readonly");
          const store = tx.objectStore(IDB_STORE_NAME);
          const getReq = store.get(IDB_CANONICAL_THEME_KEY);
          getReq.onsuccess = () => {
            const result = getReq.result;
            const normalized = normalizeThemeId(result);
            if (normalized) {
              db.close();
              resolve(normalized);
              return;
            }
            // Fall back to legacy key
            const legacyReq = store.get(IDB_THEME_KEY);
            legacyReq.onsuccess = () => {
              const legacyResult = legacyReq.result;
              db.close();
              resolve(normalizeThemeId(legacyResult));
            };
            legacyReq.onerror = () => {
              db.close();
              resolve(null);
            };
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setIdbTheme(themeId: string): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE_NAME, "readwrite");
          const store = tx.objectStore(IDB_STORE_NAME);
          store.put(themeId, IDB_CANONICAL_THEME_KEY);
          store.put(themeId, IDB_THEME_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getIdbLayout(): Promise<string | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  return new Promise<string | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE_NAME, "readonly");
          const store = tx.objectStore(IDB_STORE_NAME);
          const getReq = store.get(IDB_CANONICAL_LAYOUT_KEY);
          getReq.onsuccess = () => {
            const result = getReq.result;
            const normalized = normalizeLayoutId(result);
            if (normalized) {
              db.close();
              resolve(normalized);
              return;
            }
            // Fall back to legacy key
            const legacyReq = store.get(IDB_LAYOUT_KEY);
            legacyReq.onsuccess = () => {
              const legacyResult = legacyReq.result;
              db.close();
              resolve(normalizeLayoutId(legacyResult));
            };
            legacyReq.onerror = () => {
              db.close();
              resolve(null);
            };
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function setIdbLayout(layoutId: string): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  return new Promise<void>((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(IDB_STORE_NAME, "readwrite");
          const store = tx.objectStore(IDB_STORE_NAME);
          store.put(layoutId, IDB_CANONICAL_LAYOUT_KEY);
          store.put(layoutId, IDB_LAYOUT_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      const timer = setTimeout(() => resolve(fallback), ms);
      if (typeof timer === "object" && timer && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }
    }),
  ]);
}

/* -------------------------------------------------------------------------- */
/*                               Theme Management                             */
/* -------------------------------------------------------------------------- */

export function getStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;

  // 1. Check canonical key in localStorage
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    const normalized = normalizeThemeId(raw);
    if (normalized) {
      memoryThemeCache = normalized;
      return normalized;
    }
  } catch {
    // LocalStorage may throw in restricted sandboxes
  }

  // 2. Check legacy keys in localStorage for backward compatibility with older client builds
  try {
    for (const legacyKey of LEGACY_THEME_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      const normalized = normalizeThemeId(raw);
      if (normalized) {
        memoryThemeCache = normalized;
        // Auto-heal canonical key so future lookups are instant
        try {
          localStorage.setItem(THEME_STORAGE_KEY, normalized);
          localStorage.setItem("theme", normalized);
        } catch {}
        return normalized;
      }
    }
  } catch {
    // Ignore
  }

  // 3. Check persistent cookies (which survive WebView cache resets)
  const cookieVal = getCookieTheme();
  if (cookieVal) {
    const normalized = normalizeThemeId(cookieVal);
    if (normalized) {
      memoryThemeCache = normalized;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
        localStorage.setItem("theme", normalized);
      } catch {}
      return normalized;
    }
  }

  // 4. Memory cache fallback
  if (memoryThemeCache && isValidThemeId(memoryThemeCache)) {
    return memoryThemeCache;
  }

  return DEFAULT_THEME;
}

export async function resolveInitialTheme(): Promise<string> {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const bridge = nativeStorageBridge();
  let candidateTheme: string | null = null;

  if (bridge) {
    try {
      // Try canonical key first, then fallback to legacy key on older bridge
      const nativeValue = await withTimeout(bridge.get(THEME_STORAGE_KEY), 400, null);
      candidateTheme = normalizeThemeId(nativeValue);
      if (!candidateTheme) {
        const legacyNative = await withTimeout(bridge.get("theme"), 400, null);
        candidateTheme = normalizeThemeId(legacyNative);
      }
    } catch {
      // Bridge error
    }
  }

  if (!candidateTheme) {
    const local = getStoredTheme();
    if (local !== DEFAULT_THEME) {
      candidateTheme = local;
    } else {
      const idbVal = await getIdbTheme();
      const normalizedIdb = normalizeThemeId(idbVal);
      if (normalizedIdb) {
        candidateTheme = normalizedIdb;
      }
    }
  }

  const finalTheme =
    candidateTheme && isValidThemeId(candidateTheme) ? candidateTheme : DEFAULT_THEME;
  applyTheme(finalTheme);

  if (bridge && !candidateTheme) {
    try {
      void bridge.set(THEME_STORAGE_KEY, finalTheme);
      void bridge.set("theme", finalTheme);
    } catch {
      // Ignore native bridge errors
    }
  }

  return finalTheme;
}

/**
 * Applies a theme (color palette).
 * NOTE: Theme and layout are completely independent. Changing theme does NOT alter layout.
 * Writes to all tiers (localStorage, cookies, IndexedDB, native bridge) across canonical
 * and legacy keys to guarantee backward compatibility for clients running older mobile apps.
 */
export function applyTheme(themeId: string): void {
  if (typeof window === "undefined") return;

  const valid = normalizeThemeId(themeId) ?? DEFAULT_THEME;
  memoryThemeCache = valid;

  // 1. Write to localStorage with backward compatibility
  try {
    localStorage.setItem(THEME_STORAGE_KEY, valid);
    localStorage.setItem("theme", valid);
    localStorage.setItem("bc_theme", valid);
  } catch {
    // Ignore
  }

  // 2. Write to persistent cookies (1-year lifetime survives WebView process termination)
  setCookieTheme(valid);

  // 3. Write to persistent IndexedDB
  void setIdbTheme(valid);

  // 4. Update DOM attribute
  try {
    document.documentElement.setAttribute("data-theme", valid);
    const isDark =
      valid.includes("dark") || valid === "synthwave-neon-theme" || valid === "high-contrast-theme";
    if (isDark) {
      document.documentElement.setAttribute("data-theme-mode", "dark");
    } else if (valid !== CUSTOM_COLOR_THEME_ID && !valid.startsWith("custom-theme-")) {
      document.documentElement.setAttribute("data-theme-mode", "light");
    }
    if (valid === CUSTOM_COLOR_THEME_ID) {
      const cfg = getCustomThemeConfig();
      applyCustomThemeVariables(cfg.color, cfg.mode === "dark");
    } else if (valid.startsWith("custom-theme-")) {
      let active = getActiveMerchantCustomTheme();
      const cleanId = valid.replace(/^custom-theme-/, "");
      if (!active || (active.id !== valid && active.id !== cleanId)) {
        const cached = getCachedMerchantCustomThemes();
        const found = cached.find((t) => t.id === valid || t.id === cleanId);
        if (found) {
          active = found;
          try {
            localStorage.setItem(ACTIVE_MERCHANT_CUSTOM_THEME_KEY, JSON.stringify(found));
          } catch {}
        }
      }
      if (active) {
        applyMerchantCustomThemeVariables(active);
      }
    }
  } catch {
    // Ignore
  }

  // 5. Update native SQLite storage bridge if available
  const bridge = nativeStorageBridge();
  if (bridge) {
    try {
      void bridge.set(THEME_STORAGE_KEY, valid);
      void bridge.set("theme", valid);
    } catch {
      // Ignore
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent("bc-theme-change", {
        detail: { theme: valid },
      }),
    );
  } catch {
    // Ignore
  }
}

/* -------------------------------------------------------------------------- */
/*                              Layout Management                             */
/* -------------------------------------------------------------------------- */

export function getStoredLayout(): string {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;

  // 1. Check canonical key in localStorage
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    const normalized = normalizeLayoutId(raw);
    if (normalized) {
      memoryLayoutCache = normalized;
      return normalized;
    }
  } catch {
    // LocalStorage may throw in restricted sandboxes
  }

  // 2. Check legacy keys in localStorage for backward compatibility with older client builds
  try {
    for (const legacyKey of LEGACY_LAYOUT_KEYS) {
      const raw = localStorage.getItem(legacyKey);
      const normalized = normalizeLayoutId(raw);
      if (normalized) {
        memoryLayoutCache = normalized;
        // Auto-heal canonical key so future lookups are instant
        try {
          localStorage.setItem(LAYOUT_STORAGE_KEY, normalized);
          localStorage.setItem("layout", normalized);
        } catch {}
        return normalized;
      }
    }
  } catch {
    // Ignore
  }

  // 3. Check persistent cookies (which survive WebView cache resets)
  const cookieVal = getCookieLayout();
  if (cookieVal) {
    const normalized = normalizeLayoutId(cookieVal);
    if (normalized) {
      memoryLayoutCache = normalized;
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, normalized);
        localStorage.setItem("layout", normalized);
      } catch {}
      return normalized;
    }
  }

  // 4. Memory cache fallback
  if (memoryLayoutCache && isValidLayoutId(memoryLayoutCache)) {
    return memoryLayoutCache;
  }

  return DEFAULT_LAYOUT;
}

export async function resolveInitialLayout(): Promise<string> {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;

  const bridge = nativeStorageBridge();
  let candidateLayout: string | null = null;

  if (bridge) {
    try {
      // Try canonical key first, then fallback to legacy key on older bridge
      const nativeValue = await withTimeout(bridge.get(LAYOUT_STORAGE_KEY), 400, null);
      candidateLayout = normalizeLayoutId(nativeValue);
      if (!candidateLayout) {
        const legacyNative = await withTimeout(bridge.get("layout"), 400, null);
        candidateLayout = normalizeLayoutId(legacyNative);
      }
    } catch {
      // Bridge error
    }
  }

  if (!candidateLayout) {
    const local = getStoredLayout();
    if (local !== DEFAULT_LAYOUT) {
      candidateLayout = local;
    } else {
      const idbVal = await getIdbLayout();
      const normalizedIdb = normalizeLayoutId(idbVal);
      if (normalizedIdb) {
        candidateLayout = normalizedIdb;
      }
    }
  }

  const finalLayout =
    candidateLayout && isValidLayoutId(candidateLayout) ? candidateLayout : DEFAULT_LAYOUT;
  applyLayout(finalLayout);

  if (bridge && !candidateLayout) {
    try {
      void bridge.set(LAYOUT_STORAGE_KEY, finalLayout);
      void bridge.set("layout", finalLayout);
    } catch {
      // Ignore native bridge errors
    }
  }

  return finalLayout;
}

/**
 * Applies a workspace layout.
 * NOTE: Theme and layout are completely independent. Changing layout does NOT alter theme.
 * Writes to all tiers (localStorage, cookies, IndexedDB, native bridge) across canonical
 * and legacy keys to guarantee backward compatibility for clients running older mobile apps.
 */
export function applyLayout(layoutId: string): void {
  if (typeof window === "undefined") return;

  const valid = normalizeLayoutId(layoutId) ?? DEFAULT_LAYOUT;
  memoryLayoutCache = valid;

  // 1. Write to localStorage with backward compatibility
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, valid);
    localStorage.setItem("layout", valid);
    localStorage.setItem("bc_layout", valid);
  } catch {
    // Ignore
  }

  // 2. Write to persistent cookies (1-year lifetime survives WebView process termination)
  setCookieLayout(valid);

  // 3. Write to persistent IndexedDB
  void setIdbLayout(valid);

  // 4. Update DOM attribute
  try {
    document.documentElement.setAttribute("data-layout", valid);
  } catch {
    // Ignore
  }

  // 5. Update native SQLite storage bridge if available
  const bridge = nativeStorageBridge();
  if (bridge) {
    try {
      void bridge.set(LAYOUT_STORAGE_KEY, valid);
      void bridge.set("layout", valid);
    } catch {
      // Ignore
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent("bc-layout-change", {
        detail: { layout: valid },
      }),
    );
  } catch {
    // Ignore
  }
}

/**
 * Resolves both theme and layout on application mount independently.
 */
export async function resolveInitialAppearance(): Promise<{ theme: string; layout: string }> {
  const [theme, layout] = await Promise.all([resolveInitialTheme(), resolveInitialLayout()]);
  return { theme, layout };
}

/**
 * Setup listener for delayed injection of the native storage bridge in mobile WebViews.
 * Reconciles or migrates both theme and layout independently to native SQLite.
 */
export function setupDelayedBridgeListener(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = async () => {
    const bridge = nativeStorageBridge();
    if (!bridge) return;

    try {
      // 1. Reconcile Theme
      let nativeTheme = await withTimeout(bridge.get(THEME_STORAGE_KEY), 400, null);
      if (!normalizeThemeId(nativeTheme)) {
        nativeTheme = await withTimeout(bridge.get("theme"), 400, null);
      }
      const validNativeTheme = normalizeThemeId(nativeTheme);
      if (validNativeTheme) {
        applyTheme(validNativeTheme);
      } else {
        const currentTheme = getStoredTheme();
        if (isValidThemeId(currentTheme)) {
          void bridge.set(THEME_STORAGE_KEY, currentTheme);
          void bridge.set("theme", currentTheme);
        }
      }

      // 2. Reconcile Layout independently
      let nativeLayout = await withTimeout(bridge.get(LAYOUT_STORAGE_KEY), 400, null);
      if (!normalizeLayoutId(nativeLayout)) {
        nativeLayout = await withTimeout(bridge.get("layout"), 400, null);
      }
      const validNativeLayout = normalizeLayoutId(nativeLayout);
      if (validNativeLayout) {
        applyLayout(validNativeLayout);
      } else {
        const currentLayout = getStoredLayout();
        if (isValidLayoutId(currentLayout)) {
          void bridge.set(LAYOUT_STORAGE_KEY, currentLayout);
          void bridge.set("layout", currentLayout);
        }
      }
    } catch {
      // Ignore
    }
  };

  window.addEventListener("business-central-native-storage-ready", handler);
  return () => {
    window.removeEventListener("business-central-native-storage-ready", handler);
  };
}
