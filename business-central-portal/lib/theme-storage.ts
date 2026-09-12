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

export const AVAILABLE_THEMES: ThemeInfo[] = [
  {
    id: "default-theme",
    name: "Monochrome Precision",
    description:
      "High-contrast architectural monochrome palette with deep grays and sharp precision.",
    previewColors: ["#000000", "#2f2f2f", "#7a7a7a", "#ffffff"],
  },
  {
    id: "visual-clean-theme",
    name: "Visual Clean",
    badge: "Vibrant",
    description:
      "Modern workspace with royal sapphire actions, emerald revenue highlights, warm amber alerts, and crisp card surfaces.",
    previewColors: ["#2563eb", "#059669", "#d97706", "#7c3aed", "#f4f6fb"],
  },
];

export const AVAILABLE_LAYOUTS: LayoutInfo[] = [
  {
    id: "default-layout",
    name: "Default Workspace",
    badge: "Classic",
    description:
      "Standard spacious layout with full-width sidebar navigation and comfortable density.",
    icon: "layout",
  },
  {
    id: "compact-layout",
    name: "Compact Rail",
    badge: "Streamlined",
    description:
      "Space-saving 72px icon-rail navigation and dense scan-first catalog grid maximizing screen canvas.",
    icon: "sidebar",
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
      win.BusinessCentralPrinterChannel ||
      win.BusinessCentralScannerChannel ||
      win.BusinessCentralRefreshChannel ||
      (typeof navigator !== "undefined" &&
        /business-central-mobile|wv|WebView/i.test(navigator.userAgent)),
  );
}

export function isValidThemeId(themeId: unknown): boolean {
  return typeof themeId === "string" && AVAILABLE_THEMES.some((t) => t.id === themeId);
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

  if (isValidThemeId(trimmed)) return trimmed;

  // Normalized legacy nicknames
  if (trimmed === "default" || trimmed === "monochrome" || trimmed === "classic") {
    return "default-theme";
  }
  if (trimmed === "visual-clean" || trimmed === "clean" || trimmed === "vibrant") {
    return "visual-clean-theme";
  }

  // Check if string is a JSON object (e.g. legacy combined appearance or { theme: "..." })
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate =
        parsed.theme ??
        parsed.themeId ??
        parsed.selectedTheme ??
        parsed.id ??
        parsed.current;
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

  // Check if string is a JSON object (e.g. legacy combined appearance or { layout: "..." })
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate =
        parsed.layout ??
        parsed.layoutId ??
        parsed.selectedLayout ??
        parsed.id ??
        parsed.current;
      return normalizeLayoutId(candidate);
    } catch {
      // Ignore JSON parse errors
    }
  }

  return null;
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

  const finalTheme = candidateTheme && isValidThemeId(candidateTheme) ? candidateTheme : DEFAULT_THEME;
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
