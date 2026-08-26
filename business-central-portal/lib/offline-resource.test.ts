import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOfflineScope, getCachedResource } from "./offline-db";
import { cachedApi } from "./offline-resource";
import { NetworkUnavailableError, api } from "./api";

vi.mock("./api", () => {
  class MockNetworkUnavailableError extends Error {
    constructor(message = "Backend unavailable") {
      super(message);
      this.name = "NetworkUnavailableError";
    }
  }
  return { api: vi.fn(), NetworkUnavailableError: MockNetworkUnavailableError };
});

const mockedApi = vi.mocked(api);
const scope = {
  merchantId: "00000000-0000-0000-0000-000000000001",
  membershipId: "00000000-0000-0000-0000-000000000002",
};

beforeEach(async () => {
  mockedApi.mockReset();
  await clearOfflineScope(scope).catch(() => undefined);
});

describe("cachedApi", () => {
  it("serves a tenant-scoped snapshot only after transport failure", async () => {
    mockedApi.mockResolvedValueOnce([{ id: "product-1" }]);
    await expect(cachedApi(scope, "/products", "catalog-products")).resolves.toMatchObject({
      data: [{ id: "product-1" }],
      cachedAt: null,
    });

    mockedApi.mockRejectedValueOnce(new NetworkUnavailableError());
    await expect(cachedApi(scope, "/products", "catalog-products")).resolves.toMatchObject({
      data: [{ id: "product-1" }],
    });
    await expect(getCachedResource(scope, "catalog-products")).resolves.toMatchObject({
      data: [{ id: "product-1" }],
    });
  });

  it("does not turn an authorization failure into stale data", async () => {
    mockedApi.mockResolvedValueOnce([{ id: "product-1" }]);
    await cachedApi(scope, "/products", "catalog-products");
    mockedApi.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(cachedApi(scope, "/products", "catalog-products")).rejects.toThrow("Forbidden");
  });
});
