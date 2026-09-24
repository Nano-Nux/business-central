import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usingNativeDatabaseBridge, callNativeDatabase, nativeDb } from "./native-database";

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

  it("handles deleteProduct and getOrder", async () => {
    const mockWin: any = {
      BusinessCentralDatabaseChannel: {
        postMessage: vi.fn((msg: string) => {
          const parsed = JSON.parse(msg);
          setTimeout(() => {
            if (mockWin.__businessCentralNativeDatabaseResolve) {
              if (parsed.method === "deleteProduct") {
                mockWin.__businessCentralNativeDatabaseResolve(parsed.id, true, null);
              } else if (parsed.method === "getOrder") {
                mockWin.__businessCentralNativeDatabaseResolve(
                  parsed.id,
                  { id: parsed.payload.id, number: "ORD-99" },
                  null,
                );
              }
            }
          }, 5);
        }),
      },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWin,
    });

    const deleted = await nativeDb.deleteProduct("prod-del-1");
    expect(deleted).toBe(true);

    const order = await nativeDb.getOrder("ord-99");
    expect(order).toEqual({ id: "ord-99", number: "ORD-99" });
  });

  it("delegates to previous resolver when request ID is not in pending map", () => {
    const prevResolver = vi.fn();
    const mockWin: any = {
      __businessCentralNativeDatabaseResolve: prevResolver,
      BusinessCentralDatabaseChannel: { postMessage: vi.fn() },
    };

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: mockWin,
    });

    // Re-initialize to chain prevResolver
    callNativeDatabase("getProducts"); // registers handler

    // Invoke resolver with an unknown ID
    mockWin.__businessCentralNativeDatabaseResolve("unknown_req_id", { success: true }, null);
    expect(prevResolver).toHaveBeenCalledWith("unknown_req_id", { success: true }, null);
  });
});
