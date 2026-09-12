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
  isMobileWebView,
  resolveInitialAppearance,
  setCookieLayout,
  setCookieTheme,
  setupDelayedBridgeListener,
  usingNativeStorageBridge,
  _resetAppearanceCacheForTesting,
} from "./theme-storage";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

describe("theme-storage backward compatibility and multi-tier persistence", () => {
  let mockStorage: Record<string, string>;
  let domAttributes: Record<string, string>;
  let mockCookie: string;

  beforeEach(() => {
    _resetAppearanceCacheForTesting();
    mockStorage = {};
    domAttributes = {};
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

  it("contains all expected available themes and layouts", () => {
    expect(AVAILABLE_THEMES.map((t) => t.id)).toEqual(["default-theme", "visual-clean-theme"]);
    expect(AVAILABLE_LAYOUTS.map((l) => l.id)).toEqual(["default-layout", "compact-layout"]);
  });
});
