"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import {
  type SupportedLanguage,
  type TranslationKey,
  resolveTranslation,
} from "./translations";

export type { SupportedLanguage, TranslationKey };

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  description: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    flag: "🇬🇧",
    description: "English (International)",
  },
  {
    code: "my",
    name: "Myanmar",
    nativeName: "မြန်မာစာ",
    flag: "🇲🇲",
    description: "မြန်မာဘာသာ (Unicode)",
  },
  {
    code: "th",
    name: "Thai",
    nativeName: "ภาษาไทย",
    flag: "🇹🇭",
    description: "ภาษาไทย (มาตรฐาน)",
  },
];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANGUAGE_STORAGE_KEY = "bc.language";

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (
    key: TranslationKey,
    paramsOrFallback?: Record<string, string | number> | string,
    fallback?: string,
  ) => string;
  languages: LanguageMeta[];
  isReady: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "my" || stored === "th") {
      return stored;
    }
    // Auto-detect browser language if available
    const browserLang = navigator.language?.toLowerCase() || "";
    if (browserLang.startsWith("my")) return "my";
    if (browserLang.startsWith("th")) return "th";
  } catch {
    // LocalStorage might be restricted
  }
  return DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initial = getInitialLanguage();
    setLanguageState(initial);
    setIsReady(true);
    if (typeof document !== "undefined") {
      document.documentElement.lang = initial;
      document.documentElement.setAttribute("data-lang", initial);
    }
  }, []);

  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {
      // Ignore localStorage error
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLang;
      document.documentElement.setAttribute("data-lang", newLang);
    }
  }, []);

  // Listen for storage changes across tabs
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === LANGUAGE_STORAGE_KEY && event.newValue) {
        const val = event.newValue as SupportedLanguage;
        if (val === "en" || val === "my" || val === "th") {
          setLanguageState(val);
          if (typeof document !== "undefined") {
            document.documentElement.lang = val;
            document.documentElement.setAttribute("data-lang", val);
          }
        }
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const t = useCallback(
    (
      key: TranslationKey,
      paramsOrFallback?: Record<string, string | number> | string,
      fallback?: string,
    ): string => {
      let params: Record<string, string | number> | undefined;
      let finalFallback: string | undefined;

      if (typeof paramsOrFallback === "string") {
        finalFallback = paramsOrFallback;
      } else if (paramsOrFallback && typeof paramsOrFallback === "object") {
        params = paramsOrFallback;
        finalFallback = fallback;
      } else {
        finalFallback = fallback;
      }

      return resolveTranslation(language, key, params, finalFallback);
    },
    [language],
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
      isReady,
    }),
    [language, setLanguage, t, isReady],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    // Return fallback context if used outside provider
    return {
      language: DEFAULT_LANGUAGE,
      setLanguage: () => {},
      t: (
        key: TranslationKey,
        paramsOrFallback?: Record<string, string | number> | string,
        fallback?: string,
      ) => {
        let params: Record<string, string | number> | undefined;
        let finalFallback: string | undefined;
        if (typeof paramsOrFallback === "string") {
          finalFallback = paramsOrFallback;
        } else if (paramsOrFallback && typeof paramsOrFallback === "object") {
          params = paramsOrFallback;
          finalFallback = fallback;
        } else {
          finalFallback = fallback;
        }
        return resolveTranslation(DEFAULT_LANGUAGE, key, params, finalFallback);
      },
      languages: SUPPORTED_LANGUAGES,
      isReady: true,
    };
  }
  return context;
}

/**
 * Standalone translation function for use outside React components or in unit tests
 */
export function translate(
  key: string,
  lang: SupportedLanguage = DEFAULT_LANGUAGE,
  params?: Record<string, string | number>,
  fallback?: string,
): string {
  return resolveTranslation(lang, key, params, fallback);
}
