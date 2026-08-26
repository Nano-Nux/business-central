import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

describe("service-worker offline contract", () => {
  it("precaches the application shells needed for offline launch", () => {
    for (const page of [
      "/login",
      "/offline",
      "/dashboard",
      "/catalog",
      "/reports",
      "/invoices",
      "/transaction-history",
    ]) {
      expect(serviceWorker).toContain(`"${page}"`);
    }
  });

  it("does not intercept API or mutation requests", () => {
    expect(serviceWorker).toContain('request.method !== "GET"');
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
  });

  it("falls back to a cached route before the generic offline page", () => {
    expect(serviceWorker).toContain("cache.match(request, { ignoreSearch: true })");
    expect(serviceWorker).toContain('cache.match("/dashboard")');
    expect(serviceWorker).toContain('cache.match("/offline")');
  });
});
