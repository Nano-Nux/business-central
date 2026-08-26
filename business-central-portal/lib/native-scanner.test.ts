import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nativeScannerAvailable,
  scanNativeBarcode,
  usingNativeScannerBridge,
} from "./native-scanner";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("native barcode scanner bridge", () => {
  it("detects the Flutter bridge and returns its scanned value", async () => {
    const bridge = {
      available: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue("8851234567890"),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { BusinessCentralNativeScanner: bridge },
    });

    expect(usingNativeScannerBridge()).toBe(true);
    await expect(nativeScannerAvailable()).resolves.toBe(true);
    await expect(scanNativeBarcode()).resolves.toBe("8851234567890");
    expect(bridge.scan).toHaveBeenCalledOnce();
  });

  it("reports an unavailable bridge outside the mobile WebView", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    expect(usingNativeScannerBridge()).toBe(false);
    await expect(nativeScannerAvailable()).resolves.toBe(false);
    await expect(scanNativeBarcode()).rejects.toThrow("The native barcode scanner is unavailable.");
  });
});
