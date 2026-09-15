import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABLE_LAYOUTS,
  AVAILABLE_THEMES,
  DEFAULT_LAYOUT,
  DEFAULT_THEME,
  LAYOUT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyLayout,
  applyTheme,
  getCookieLayout,
  getCookieTheme,
  getStoredLayout,
  getStoredTheme,
  normalizeLayoutId,
  isMobileWebView,
  resolveInitialAppearance,
  setCookieLayout,
  setCookieTheme,
  setupDelayedBridgeListener,
  usingNativeStorageBridge,
  _resetAppearanceCacheForTesting,
  CUSTOM_COLOR_THEME_ID,
  applyCustomTheme,
  getCustomThemeConfig,
  setCustomThemeConfig,
  generateCustomThemePalette,
  isValidHexColor,
  hexToRgb,
  rgbToHsl,
  hslToHex,
  generateHarmonious5ColorSetup,
  applyMerchantCustomTheme,
  getActiveMerchantCustomTheme,
  getCachedMerchantCustomThemes,
  setCachedMerchantCustomThemes,
  type MerchantCustomTheme,
} from "./theme-storage";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

describe("theme-storage backward compatibility and multi-tier persistence", () => {
  let mockStorage: Record<string, string>;
  let domAttributes: Record<string, string>;
  let domStyles: Record<string, string>;
  let mockCookie: string;

  beforeEach(() => {
    _resetAppearanceCacheForTesting();
    mockStorage = {};
    domAttributes = {};
    domStyles = {};
    mockCookie = "";

    const mockDocument = {
      get cookie() {
        return mockCookie;
      },
      set cookie(val: string) {
        // Extract key=value from cookie string
        const parts = val.split(";")[0].split("=");
        const key = parts[0]?.trim();
        const value = parts.slice(1).join("=").trim();
        const existing = mockCookie
          ? mockCookie.split("; ").filter((c) => !c.startsWith(`${key}=`))
          : [];
        existing.push(`${key}=${value}`);
        mockCookie = existing.join("; ");
      },
      documentElement: {
        style: {
          setProperty: vi.fn((k: string, v: string) => {
            domStyles[k] = v;
          }),
          getPropertyValue: vi.fn((k: string) => domStyles[k] ?? ""),
          removeProperty: vi.fn((k: string) => {
            delete domStyles[k];
          }),
        },
        setAttribute: vi.fn((attr: string, val: string) => {
          domAttributes[attr] = val;
        }),
        getAttribute: vi.fn((attr: string) => domAttributes[attr] ?? null),
        removeAttribute: vi.fn((attr: string) => {
          delete domAttributes[attr];
        }),
      },
    };

    const mockWindow = {
      localStorage: {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      },
      document: mockDocument,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      navigator: {
        userAgent: "Mozilla/5.0 (Linux; Android 10; Mobile)",
      },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: mockDocument,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: mockWindow.localStorage,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("returns default-theme and default-layout when nothing is stored", () => {
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
    expect(getStoredLayout()).toBe(DEFAULT_LAYOUT);
  });

  it("stores and applies visual-clean-theme across localStorage and cookie", () => {
    applyTheme("visual-clean-theme");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("visual-clean-theme");
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("visual-clean-theme");
    expect(getStoredTheme()).toBe("visual-clean-theme");
    expect(getCookieTheme()).toBe("visual-clean-theme");
  });

  it("stores and applies compact-layout across localStorage and cookie", () => {
    applyLayout("compact-layout");
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("compact-layout");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe("compact-layout");
    expect(getStoredLayout()).toBe("compact-layout");
    expect(getCookieLayout()).toBe("compact-layout");
  });

  it("guarantees theme and layout are completely independent", () => {
    // 1. Initial defaults
    expect(getStoredTheme()).toBe("default-theme");
    expect(getStoredLayout()).toBe("default-layout");

    // 2. Change Theme -> Layout must NOT change
    applyTheme("visual-clean-theme");
    expect(getStoredTheme()).toBe("visual-clean-theme");
    expect(getStoredLayout()).toBe("default-layout");
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("visual-clean-theme");
    expect(window.document.documentElement.getAttribute("data-layout")).toBeNull();

    // 3. Change Layout -> Theme must NOT change
    applyLayout("compact-layout");
    expect(getStoredTheme()).toBe("visual-clean-theme");
    expect(getStoredLayout()).toBe("compact-layout");
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("visual-clean-theme");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe("compact-layout");

    // 4. Revert Theme -> Layout remains compact-layout
    applyTheme("default-theme");
    expect(getStoredTheme()).toBe("default-theme");
    expect(getStoredLayout()).toBe("compact-layout");
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("default-theme");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe("compact-layout");
  });

  it("falls back to default-theme and default-layout for unknown IDs", () => {
    applyTheme("invalid-theme-xyz");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(DEFAULT_THEME);
    expect(window.document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_THEME);

    applyLayout("invalid-layout-abc");
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe(DEFAULT_LAYOUT);
    expect(window.document.documentElement.getAttribute("data-layout")).toBe(DEFAULT_LAYOUT);
  });

  it("detects and interacts with the mobile native storage bridge for theme and layout", async () => {
    const mockBridge = {
      get: vi.fn((key: string) => {
        if (key === THEME_STORAGE_KEY) return Promise.resolve("visual-clean-theme");
        if (key === LAYOUT_STORAGE_KEY) return Promise.resolve("compact-layout");
        return Promise.resolve(null);
      }),
      set: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(true),
    };

    Object.defineProperty(window, "BusinessCentralNativeStorage", {
      value: mockBridge,
      configurable: true,
      writable: true,
    });

    expect(usingNativeStorageBridge()).toBe(true);

    // Initial resolution reads from native bridge
    const resolved = await resolveInitialAppearance();
    expect(mockBridge.get).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(mockBridge.get).toHaveBeenCalledWith(LAYOUT_STORAGE_KEY);
    expect(resolved.theme).toBe("visual-clean-theme");
    expect(resolved.layout).toBe("compact-layout");
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("visual-clean-theme");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe("compact-layout");

    // Applying updates native storage bridge independently
    applyTheme("default-theme");
    expect(mockBridge.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, "default-theme");

    applyLayout("default-layout");
    expect(mockBridge.set).toHaveBeenCalledWith(LAYOUT_STORAGE_KEY, "default-layout");
  });

  describe("Backward Compatibility for Older Mobile WebViews", () => {
    it("works completely when native storage bridge is missing (older mobile builds)", async () => {
      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "BusinessCentralPrinterChannel", {
        value: { postMessage: vi.fn() },
        configurable: true,
        writable: true,
      });

      expect(usingNativeStorageBridge()).toBe(false);
      expect(isMobileWebView()).toBe(true);

      // Save theme and layout in older webview
      applyTheme("visual-clean-theme");
      applyLayout("compact-layout");

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("visual-clean-theme");
      expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("compact-layout");
      expect(getCookieTheme()).toBe("visual-clean-theme");
      expect(getCookieLayout()).toBe("compact-layout");

      // Initial resolution succeeds without bridge
      const resolved = await resolveInitialAppearance();
      expect(resolved.theme).toBe("visual-clean-theme");
      expect(resolved.layout).toBe("compact-layout");
      expect(window.document.documentElement.getAttribute("data-theme")).toBe("visual-clean-theme");
      expect(window.document.documentElement.getAttribute("data-layout")).toBe("compact-layout");
    });

    it("recovers layout from persistent cookie if localStorage was wiped upon app restart", () => {
      setCookieLayout("compact-layout");
      expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();

      const recovered = getStoredLayout();
      expect(recovered).toBe("compact-layout");
      expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("compact-layout");
    });

    it("gracefully recovers if localStorage throws SecurityError in sandboxed WebViews", () => {
      setCookieTheme("visual-clean-theme");
      setCookieLayout("compact-layout");

      vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: Access denied");
      });

      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");
    });

    it("recognizes legacy theme and layout keys from earlier client versions", () => {
      mockStorage["theme"] = "visual-clean-theme";
      mockStorage["layout"] = "compact-layout";

      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");
    });

    it("recognizes legacy theme and layout cookies", () => {
      document.cookie = "theme=visual-clean-theme; path=/";
      document.cookie = "layout=compact-layout; path=/";

      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");
    });

    it("falls back gracefully when native bridge promise hangs (timeout safeguard)", async () => {
      const hangingBridge = {
        get: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        set: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };

      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: hangingBridge,
        configurable: true,
        writable: true,
      });

      mockStorage[THEME_STORAGE_KEY] = "visual-clean-theme";
      mockStorage[LAYOUT_STORAGE_KEY] = "compact-layout";

      const resolved = await resolveInitialAppearance();
      expect(resolved.theme).toBe("visual-clean-theme");
      expect(resolved.layout).toBe("compact-layout");
    });

    it("automatically migrates saved theme and layout to SQLite when user updates mobile app", async () => {
      mockStorage[THEME_STORAGE_KEY] = "visual-clean-theme";
      mockStorage[LAYOUT_STORAGE_KEY] = "compact-layout";
      setCookieTheme("visual-clean-theme");
      setCookieLayout("compact-layout");

      const mockBridge = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };

      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: mockBridge,
        configurable: true,
        writable: true,
      });

      const resolved = await resolveInitialAppearance();
      expect(resolved.theme).toBe("visual-clean-theme");
      expect(resolved.layout).toBe("compact-layout");

      expect(mockBridge.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, "visual-clean-theme");
      expect(mockBridge.set).toHaveBeenCalledWith(LAYOUT_STORAGE_KEY, "compact-layout");
    });

    it("listens for delayed bridge injection and migrates active theme and layout", async () => {
      let registeredHandler: (() => Promise<void>) | undefined;
      window.addEventListener = vi.fn((event: string, handler: unknown) => {
        if (event === "business-central-native-storage-ready") {
          registeredHandler = handler as () => Promise<void>;
        }
      });

      const cleanup = setupDelayedBridgeListener();
      expect(window.addEventListener).toHaveBeenCalledWith(
        "business-central-native-storage-ready",
        expect.any(Function),
      );

      mockStorage[THEME_STORAGE_KEY] = "visual-clean-theme";
      mockStorage[LAYOUT_STORAGE_KEY] = "compact-layout";

      const mockBridge = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };
      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: mockBridge,
        configurable: true,
        writable: true,
      });

      const trigger = registeredHandler as (() => Promise<void>) | undefined;
      if (trigger) {
        await trigger();
      }

      expect(mockBridge.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, "visual-clean-theme");
      expect(mockBridge.set).toHaveBeenCalledWith(LAYOUT_STORAGE_KEY, "compact-layout");

      cleanup();
    });
    it("writes to both canonical and legacy companion keys across all storage tiers when saving", () => {
      const mockBridge = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };
      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: mockBridge,
        configurable: true,
        writable: true,
      });

      applyTheme("visual-clean-theme");
      // Verify localStorage has canonical and legacy keys
      expect(mockStorage[THEME_STORAGE_KEY]).toBe("visual-clean-theme");
      expect(mockStorage["theme"]).toBe("visual-clean-theme");
      expect(mockStorage["bc_theme"]).toBe("visual-clean-theme");
      // Verify cookies have canonical and legacy keys
      expect(mockCookie).toContain("bc.theme=visual-clean-theme");
      expect(mockCookie).toContain("theme=visual-clean-theme");
      // Verify bridge received both keys
      expect(mockBridge.set).toHaveBeenCalledWith(THEME_STORAGE_KEY, "visual-clean-theme");
      expect(mockBridge.set).toHaveBeenCalledWith("theme", "visual-clean-theme");

      applyLayout("compact-layout");
      // Verify localStorage has canonical and legacy keys
      expect(mockStorage[LAYOUT_STORAGE_KEY]).toBe("compact-layout");
      expect(mockStorage["layout"]).toBe("compact-layout");
      expect(mockStorage["bc_layout"]).toBe("compact-layout");
      // Verify cookies have canonical and legacy keys
      expect(mockCookie).toContain("bc.layout=compact-layout");
      expect(mockCookie).toContain("layout=compact-layout");
      // Verify bridge received both keys
      expect(mockBridge.set).toHaveBeenCalledWith(LAYOUT_STORAGE_KEY, "compact-layout");
      expect(mockBridge.set).toHaveBeenCalledWith("layout", "compact-layout");
    });

    it("normalizes legacy aliases and abbreviations", () => {
      mockStorage["theme"] = "visual-clean";
      mockStorage["layout"] = "compact";

      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");

      _resetAppearanceCacheForTesting();
      mockStorage = {
        theme: "clean",
        layout: "rail",
      };
      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");

      // Verify nicknames for new distinct themes
      const newAliases: [string, string][] = [
        ["copper", "copper-patina-theme"],
        ["patina", "copper-patina-theme"],
        ["verdigris", "copper-patina-theme"],
        ["lavender", "lavender-dusk-theme"],
        ["dusk", "lavender-dusk-theme"],
        ["terracotta", "clay-terracotta-theme"],
        ["clay", "clay-terracotta-theme"],
        ["matcha", "matcha-pistachio-theme"],
        ["pistachio", "matcha-pistachio-theme"],
        ["sandstone", "sandstone-dune-theme"],
        ["dune", "sandstone-dune-theme"],
        ["plum", "plum-wine-theme"],
        ["wine", "plum-wine-theme"],
        ["steel", "slate-steel-theme"],
        ["slate", "slate-steel-theme"],
        ["aurora", "aurora-borealis-theme"],
        ["polar", "aurora-borealis-theme"],
        ["charcoal", "charcoal-gold-theme"],
        ["black-tie", "charcoal-gold-theme"],
        ["mint", "neo-mint-theme"],
        ["eucalyptus", "neo-mint-theme"],
      ];

      for (const [alias, expected] of newAliases) {
        _resetAppearanceCacheForTesting();
        mockStorage = { theme: alias };
        expect(getStoredTheme()).toBe(expected);
      }
    });

    it("parses JSON-encoded legacy appearance objects and auto-heals storage", () => {
      mockStorage["appearance"] = JSON.stringify({
        theme: "visual-clean-theme",
        layout: "compact-layout",
      });

      expect(getStoredTheme()).toBe("visual-clean-theme");
      expect(getStoredLayout()).toBe("compact-layout");

      // Verify canonical keys were healed
      expect(mockStorage[THEME_STORAGE_KEY]).toBe("visual-clean-theme");
      expect(mockStorage[LAYOUT_STORAGE_KEY]).toBe("compact-layout");
    });

    it("resolves from legacy bridge keys if canonical keys are absent on older bridges", async () => {
      const olderBridge = {
        get: vi.fn((key: string) => {
          if (key === "theme") return Promise.resolve("visual-clean-theme");
          if (key === "layout") return Promise.resolve("compact-layout");
          return Promise.resolve(null);
        }),
        set: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      };

      Object.defineProperty(window, "BusinessCentralNativeStorage", {
        value: olderBridge,
        configurable: true,
        writable: true,
      });

      const resolved = await resolveInitialAppearance();
      expect(resolved.theme).toBe("visual-clean-theme");
      expect(resolved.layout).toBe("compact-layout");
      expect(olderBridge.get).toHaveBeenCalledWith("theme");
      expect(olderBridge.get).toHaveBeenCalledWith("layout");
    });
  });

  it("contains all 29 expected available themes (28 spectrum presets + 1 custom) and 2 layouts", () => {
    const expectedThemeIds = [
      "default-theme",
      "visual-clean-theme",
      "ruby-crimson-theme",
      "sunset-coral-theme",
      "amber-honey-theme",
      "citrus-gold-theme",
      "lime-zest-theme",
      "nordic-calm-theme",
      "emerald-luxe-theme",
      "ocean-teal-theme",
      "glacier-cyan-theme",
      "royal-indigo-theme",
      "amethyst-purple-theme",
      "fuchsia-rose-theme",
      "copper-patina-theme",
      "lavender-dusk-theme",
      "clay-terracotta-theme",
      "matcha-pistachio-theme",
      "sandstone-dune-theme",
      "plum-wine-theme",
      "slate-steel-theme",
      "aurora-borealis-theme",
      "charcoal-gold-theme",
      "neo-mint-theme",
      "midnight-dark-theme",
      "synthwave-neon-theme",
      "espresso-dark-theme",
      "high-contrast-theme",
      "custom-color-theme",
    ];
    expect(AVAILABLE_THEMES.map((t) => t.id)).toEqual(expectedThemeIds);
    expect(AVAILABLE_THEMES).toHaveLength(29);
    expect(AVAILABLE_LAYOUTS.map((l) => l.id)).toEqual([
      "default-layout",
      "compact-layout",
      "modern-executive-layout",
    ]);
  });

  it("ensures every theme color palette has exactly a 5-color setup of valid hex codes", () => {
    for (const theme of AVAILABLE_THEMES) {
      expect(theme.previewColors).toHaveLength(5);
      for (const color of theme.previewColors) {
        expect(isValidHexColor(color)).toBe(true);
      }
    }
  });

  it("applies and persists modern-executive-layout and normalizes its aliases", () => {
    applyLayout("modern-executive-layout");
    expect(getStoredLayout()).toBe("modern-executive-layout");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe(
      "modern-executive-layout",
    );

    // Test alias normalization
    expect(normalizeLayoutId("executive")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("million")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("deluxe")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("modern")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("modern-executive")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("executive-deluxe")).toBe("modern-executive-layout");
    expect(normalizeLayoutId("island")).toBe("modern-executive-layout");

    applyLayout("executive");
    expect(getStoredLayout()).toBe("modern-executive-layout");
    expect(window.document.documentElement.getAttribute("data-layout")).toBe(
      "modern-executive-layout",
    );
  });

  it("applies and persists each of the 29 themes independently from layouts", () => {
    applyLayout("modern-executive-layout");

    for (const theme of AVAILABLE_THEMES) {
      applyTheme(theme.id);
      expect(getStoredTheme()).toBe(theme.id);
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(theme.id);
      expect(getStoredLayout()).toBe("modern-executive-layout");
      expect(window.document.documentElement.getAttribute("data-layout")).toBe(
        "modern-executive-layout",
      );
    }
  });

  describe("Color Math & Custom Brand Theme Engine", () => {
    it("validates hex color strings accurately", () => {
      expect(isValidHexColor("#2563eb")).toBe(true);
      expect(isValidHexColor("#fff")).toBe(true);
      expect(isValidHexColor("#000000")).toBe(true);
      expect(isValidHexColor("invalid-color")).toBe(false);
      expect(isValidHexColor(null)).toBe(false);
      expect(isValidHexColor("")).toBe(false);
    });

    it("converts between hex, rgb, and hsl accurately", () => {
      const rgb = hexToRgb("#2563eb");
      expect(rgb).toEqual({ r: 37, g: 99, b: 235 });

      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      expect(hsl.h).toBeGreaterThanOrEqual(215);
      expect(hsl.h).toBeLessThanOrEqual(225);

      // Verify clean round-trip on pure primary colors
      const pureRed = hexToRgb("#ff0000");
      const redHsl = rgbToHsl(pureRed.r, pureRed.g, pureRed.b);
      expect(redHsl).toEqual({ h: 0, s: 100, l: 50 });
      expect(hslToHex(redHsl.h, redHsl.s, redHsl.l)).toBe("#ff0000");

      const pureBlue = hexToRgb("#0000ff");
      const blueHsl = rgbToHsl(pureBlue.r, pureBlue.g, pureBlue.b);
      expect(blueHsl).toEqual({ h: 240, s: 100, l: 50 });
      expect(hslToHex(blueHsl.h, blueHsl.s, blueHsl.l)).toBe("#0000ff");
    });

    it("generates harmonious custom palettes for both light and dark canvas modes", () => {
      const light = generateCustomThemePalette("#e11d48", false);
      expect(light.brand).toBe("#e11d48");
      expect(light.card).toBe("#ffffff");
      expect(light.ink).toBe("#0f172a");
      expect(light.isDark).toBe(false);

      const dark = generateCustomThemePalette("#e11d48", true);
      expect(dark.brand).toBe("#e11d48");
      expect(dark.card).not.toBe("#ffffff");
      expect(dark.ink).toBe("#f8fafc");
      expect(dark.isDark).toBe(true);
    });

    it("stores, applies, and hydrates custom color wheel settings across tiers", () => {
      applyCustomTheme("#7c3aed", "dark");
      expect(getStoredTheme()).toBe(CUSTOM_COLOR_THEME_ID);
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        CUSTOM_COLOR_THEME_ID,
      );

      const config = getCustomThemeConfig();
      expect(config.color).toBe("#7c3aed");
      expect(config.mode).toBe("dark");

      // Verify custom variables were set on root DOM
      expect(window.document.documentElement.style.getPropertyValue("--custom-brand")).toBe(
        "#7c3aed",
      );

      setCustomThemeConfig("#059669", "light");
      const updated = getCustomThemeConfig();
      expect(updated.color).toBe("#059669");
      expect(updated.mode).toBe("light");
    });

    it("generates strict 5-color palettes with harmonious tones for light and dark canvases", () => {
      const fiveColorsLight = generateHarmonious5ColorSetup("#dc2626", false);
      expect(fiveColorsLight).toHaveLength(5);
      fiveColorsLight.forEach((color) => {
        expect(isValidHexColor(color)).toBe(true);
      });
      // Primary matches base input
      expect(fiveColorsLight[0]).toBe("#dc2626");

      const fiveColorsDark = generateHarmonious5ColorSetup("#2563eb", true);
      expect(fiveColorsDark).toHaveLength(5);
      fiveColorsDark.forEach((color) => {
        expect(isValidHexColor(color)).toBe(true);
      });
      expect(fiveColorsDark[0]).toBe("#2563eb");
      // Dark canvas color should be distinct and dark
      expect(fiveColorsDark[4]).not.toBe(fiveColorsLight[4]);
    });

    it("applies merchant custom themes with full 5-color CSS variable mapping and multi-tier persistence", () => {
      const mockCustomTheme: MerchantCustomTheme = {
        id: "theme-corp-001",
        merchant_id: "merchant-123",
        name: "Acme Corp Brand",
        description: "Official team brand theme",
        badge: "Flagship",
        primary_color: "#2563EB",
        secondary_color: "#1D4ED8",
        accent_color: "#F59E0B",
        border_color: "#CBD5E1",
        canvas_color: "#F8FAFC",
        colors: ["#2563EB", "#1D4ED8", "#F59E0B", "#CBD5E1", "#F8FAFC"],
        mode: "light",
        is_active: true,
      };

      applyMerchantCustomTheme(mockCustomTheme);

      // Verify active theme stored and applied to DOM
      const stored = getStoredTheme();
      expect(stored).toBe("custom-theme-theme-corp-001");
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "custom-theme-theme-corp-001",
      );

      // Verify active theme cached
      const activeCached = getActiveMerchantCustomTheme();
      expect(activeCached).not.toBeNull();
      expect(activeCached?.id).toBe("theme-corp-001");
      expect(activeCached?.name).toBe("Acme Corp Brand");

      // Verify CSS variables set
      expect(window.document.documentElement.style.getPropertyValue("--color-brand")).toBe(
        "#2563EB",
      );
      expect(window.document.documentElement.style.getPropertyValue("--color-brand-hover")).toBe(
        "#1D4ED8",
      );
      expect(window.document.documentElement.style.getPropertyValue("--accent")).toBe("#F59E0B");
      expect(window.document.documentElement.style.getPropertyValue("--line")).toBe("#CBD5E1");
      expect(window.document.documentElement.style.getPropertyValue("--canvas")).toBe("#F8FAFC");
    });

    it("caches and retrieves merchant custom themes in localStorage", () => {
      const themes: MerchantCustomTheme[] = [
        {
          id: "theme-1",
          merchant_id: "m-1",
          name: "Theme One",
          primary_color: "#10B981",
          secondary_color: "#059669",
          accent_color: "#6366F1",
          border_color: "#E2E8F0",
          canvas_color: "#FFFFFF",
          mode: "light",
          is_active: true,
        },
        {
          id: "theme-2",
          merchant_id: "m-1",
          name: "Theme Two",
          primary_color: "#8B5CF6",
          secondary_color: "#7C3AED",
          accent_color: "#EC4899",
          border_color: "#334155",
          canvas_color: "#0F172A",
          mode: "dark",
          is_active: true,
        },
      ];

      setCachedMerchantCustomThemes(themes);
      const retrieved = getCachedMerchantCustomThemes();
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].name).toBe("Theme One");
      expect(retrieved[1].name).toBe("Theme Two");
    });

    it("hydrates custom-theme-* in applyTheme from cached merchant custom themes if active theme cache is missing", () => {
      const theme: MerchantCustomTheme = {
        id: "cached-theme-999",
        merchant_id: "m-1",
        name: "Hydrated Theme",
        primary_color: "#06B6D4",
        secondary_color: "#0891B2",
        accent_color: "#F97316",
        border_color: "#E0F2FE",
        canvas_color: "#F0F9FF",
        mode: "light",
        is_active: true,
      };

      setCachedMerchantCustomThemes([theme]);
      // Remove active theme key to test fallback to cached themes
      window.localStorage.removeItem("bc.active_merchant_theme");

      applyTheme("custom-theme-cached-theme-999");
      expect(window.document.documentElement.getAttribute("data-theme")).toBe(
        "custom-theme-cached-theme-999",
      );
      expect(window.document.documentElement.style.getPropertyValue("--color-brand")).toBe(
        "#06B6D4",
      );
    });
  });
});
