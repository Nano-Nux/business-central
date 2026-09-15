import { en } from "./en";
import { my } from "./my";
import { th } from "./th";

export type SupportedLanguage = "en" | "my" | "th";

export const translations = {
  en,
  my,
  th,
} as const;

export type TranslationSchema = typeof en;

// Helper type for nested dot paths
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationSchema> | (string & {});

/**
 * Resolves a nested key in an object using dot notation, e.g. "settings.language.title"
 */
export function resolveTranslation(
  lang: SupportedLanguage,
  key: string,
  params?: Record<string, string | number>,
  fallback?: string,
): string {
  const dictionary = translations[lang] || translations.en;
  const englishDictionary = translations.en;

  let value: unknown = resolvePath(dictionary, key);

  // Fallback to English if key is missing in target language
  if (value === undefined || value === null) {
    value = resolvePath(englishDictionary, key);
  }

  // Fallback to provided fallback string or key
  if (value === undefined || value === null) {
    return fallback !== undefined ? fallback : key;
  }

  let text = String(value);

  // Parameter replacement: {{param}}
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, "g"), String(paramValue));
    }
  }

  return text;
}

function resolvePath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const keys = path.split(".");
  let current: any = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}
