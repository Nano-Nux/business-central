import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectOfflineStorage, storageWarning } from "./offline-storage";

afterEach(() => vi.unstubAllGlobals());

describe("storageWarning", () => {
  it("warns when available storage is below the absolute threshold", () => {
    expect(storageWarning(true, 90, 100)).toContain("nearly full");
  });

  it("warns when offline data is not persistent", () => {
    expect(storageWarning(false, 10, 1_000_000_000)).toContain("best-effort");
  });

  it("does not warn for protected storage with capacity", () => {
    expect(storageWarning(true, 10, 1_000_000_000)).toBe("");
  });

  it("does not treat a missing Storage Manager API as an error when IndexedDB exists", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", {});

    await expect(inspectOfflineStorage(true)).resolves.toEqual({
      supported: false,
      persisted: null,
      usage: null,
      quota: null,
      warning: "",
    });
  });

  it("reports unavailable offline storage when neither browser API exists", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("indexedDB", undefined);

    await expect(inspectOfflineStorage()).resolves.toMatchObject({
      supported: false,
      warning: "Offline storage is unavailable in this browser.",
    });
  });
});
