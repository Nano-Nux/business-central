import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bluetoothAvailable,
  connectPrinter,
  getActivePrinter,
  scanPrinter,
  storedPrinterFontSizePx,
  storedPrinterPaperWidthMm,
  usingNativePrinterBridge,
} from "./thermal-printer";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("native thermal printer bridge", () => {
  it("discovers and connects through the Flutter WebView bridge", async () => {
    const bridge = {
      available: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({ id: "AA:BB", name: "POS-58" }),
      connect: vi.fn().mockResolvedValue(true),
      print: vi.fn().mockResolvedValue(true),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { BusinessCentralNativePrinter: bridge },
    });

    expect(usingNativePrinterBridge()).toBe(true);
    await expect(bluetoothAvailable()).resolves.toBe(true);
    const printer = await scanPrinter();
    expect(printer).toEqual({ id: "AA:BB", name: "POS-58", native: true });
    await connectPrinter(printer);

    expect(bridge.connect).toHaveBeenCalledWith("AA:BB");
    expect(getActivePrinter()).toBe(printer);
  });
});

describe("shop printer settings", () => {
  it("reads the persisted values from the selected shop", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    const shop = {
      id: "shop-a",
      address: {
        printer_font_size_px: "19",
        printer_paper_width_mm: "58",
      },
    };

    expect(storedPrinterFontSizePx(shop)).toBe(19);
    expect(storedPrinterPaperWidthMm(shop)).toBe(58);
  });
});
