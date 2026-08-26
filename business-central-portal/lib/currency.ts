import type { Currency } from "./types";

const CURRENCY_STORAGE_KEY = "bc.currencies";
let definitions = new Map<string, Currency>();
let restored = false;

function normalizedCode(currencyCode?: string) {
  return currencyCode?.trim().toUpperCase() ?? "";
}

function restoreCurrencyDefinitions() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const cached = JSON.parse(localStorage.getItem(CURRENCY_STORAGE_KEY) ?? "[]") as Currency[];
    setCurrencyDefinitions(cached, false);
  } catch {
    definitions = new Map();
  }
}

export function setCurrencyDefinitions(currencies: Currency[], persist = true) {
  definitions = new Map(currencies.map((currency) => [normalizedCode(currency.code), currency]));
  restored = true;
  if (persist && typeof window !== "undefined") {
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(currencies));
    } catch {
      // Formatting still uses the in-memory directory when storage is denied.
    }
  }
}

export function currencyLabel(currencyCode?: string) {
  restoreCurrencyDefinitions();
  const code = normalizedCode(currencyCode);
  const symbol = definitions.get(code)?.symbol?.trim();
  return symbol || code;
}

export function formatMoney(
  value: number | string | undefined,
  currencyCode?: string,
  maximumFractionDigits?: number,
) {
  const amount = Number(value ?? 0);
  restoreCurrencyDefinitions();
  const normalized = normalizedCode(currencyCode);
  const definition = definitions.get(normalized);
  const digits = maximumFractionDigits ?? definition?.decimal_places ?? 2;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(definition?.decimal_places ?? 2, digits),
    maximumFractionDigits: digits,
  });
  if (!normalized) return formatted;
  const symbol = definition?.symbol?.trim();
  return symbol ? `${symbol}${formatted}` : `${normalized} ${formatted}`;
}

export function formatQuantity(value: number | string | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
