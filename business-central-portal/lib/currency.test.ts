import { beforeEach, describe, expect, it } from "vitest";
import { currencyLabel, formatMoney, formatQuantity, setCurrencyDefinitions } from "./currency";

describe("currency formatting", () => {
  beforeEach(() => setCurrencyDefinitions([], false));

  it("uses the configured symbol instead of the currency code", () => {
    setCurrencyDefinitions(
      [{ code: "USD", name: "US Dollar", symbol: "US$", decimal_places: 2 }],
      false,
    );

    expect(currencyLabel("usd")).toBe("US$");
    expect(formatMoney(12.5, "USD")).toBe("US$12.50");
  });

  it("uses the code only when no symbol is configured", () => {
    setCurrencyDefinitions([{ code: "KHR", name: "Cambodian Riel", decimal_places: 0 }], false);

    expect(currencyLabel("KHR")).toBe("KHR");
    expect(formatMoney(1250, "KHR")).toBe("KHR 1,250");
  });
});

describe("stock quantity formatting", () => {
  it("removes database decimal padding without discarding fractional stock", () => {
    expect(formatQuantity("5.000000")).toBe("5");
    expect(formatQuantity("4.000000")).toBe("4");
    expect(formatQuantity("0.000000")).toBe("0");
    expect(formatQuantity("30.000000")).toBe("30");
    expect(formatQuantity("5.250000")).toBe("5.25");
    expect(formatQuantity("0.000001")).toBe("0.000001");
  });
});
