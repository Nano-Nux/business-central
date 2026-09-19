import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  usingNativeDatabaseBridge,
  callNativeDatabase,
  nativeDb,
} from "./native-database";

const originalWindow = globalThis.window;

describe("native-database bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("detects when bridge is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    expect(usingNativeDatabaseBridge()).toBe(false);
  });

  it("detects when channel is available", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        BusinessCentralDatabaseChannel: { postMessage: vi.fn() },
      },
    });
    expect(usingNativeDatabaseBridge()).toBe(true);
  });

  it("dispatches requests to channel and resolves successfully", async () => {
    let sentMessage = "";
    const mockWin: any = {
      BusinessCentralDatabaseChannel: {
        postMessage: vi.fn((msg: string) => {
          sentMessage = msg;
          const parsed = JSON.parse(msg);
          setTimeout(() => {
            if (mockWin.__businessCentralNativeDatabaseResolve) {
              mockWin.__businessCentralNativeDatabaseResolve(
                parsed.id,
                [{ id: "prod-1", name: "Sample Product" }],
                null,
              );
            }
          }, 10);
        }),
      },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWin,
    });

    const products = await nativeDb.getProducts();
    expect(products).toEqual([{ id: "prod-1", name: "Sample Product" }]);
    expect(sentMessage).toContain("getProducts");
  });

  it("rejects when Flutter bridge returns an error", async () => {
    const mockWin: any = {
      BusinessCentralDatabaseChannel: {
        postMessage: vi.fn((msg: string) => {
          const parsed = JSON.parse(msg);
          setTimeout(() => {
            if (mockWin.__businessCentralNativeDatabaseResolve) {
              mockWin.__businessCentralNativeDatabaseResolve(
                parsed.id,
                null,
                "SQLite constraint failed",
              );
            }
          }, 10);
        }),
      },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWin,
    });

    await expect(nativeDb.saveProduct({ name: "Fail" })).rejects.toThrow(
      "SQLite constraint failed",
    );
  });
});
