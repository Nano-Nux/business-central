import { describe, expect, it } from "vitest";
import type { ApiEnvelope } from "./types";
import { loadResourcePages } from "./resource-pages";

describe("complete resource reads", () => {
  it("includes later stock pages and preserves the product filter", async () => {
    const paths: string[] = [];
    const read = async <T>(path: string): Promise<ApiEnvelope<T>> => {
      paths.push(path);
      const url = new URL(path, "http://test.local");
      expect(url.searchParams.get("filter")).toBe("product_name:Tea & milk");
      const index = Number(url.searchParams.get("page_index"));
      return { data: [{ id: `variant-${index}` }] as T, meta: { total_pages: 3 } };
    };
    const result = await loadResourcePages<{ id: string }>(
      "/inventory/storage?page_index=0&page_size=100&filter=product_name%3ATea+%26+milk",
      true,
      read,
    );
    expect(result.data.map((item) => item.id)).toEqual(["variant-0", "variant-1", "variant-2"]);
    expect(paths).toHaveLength(3);
  });

  it("rejects an incomplete stock read when a later page fails", async () => {
    let calls = 0;
    const read = async <T>(): Promise<ApiEnvelope<T>> => {
      if (calls++) throw new Error("Stock unavailable");
      return { data: [] as T, meta: { total_pages: 2 } };
    };
    await expect(loadResourcePages("/inventory/storage", true, read)).rejects.toThrow(
      "Stock unavailable",
    );
  });
});
