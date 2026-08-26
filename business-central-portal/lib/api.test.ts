import { afterEach, describe, expect, it, vi } from "vitest";
import { post } from "./api";

describe("API mutation deduplication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces identical mutations while the first request is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { onLine: true });

    const body = { name: "travel-mate-p214", product_type: "PHYSICAL" };
    const first = post<{ id: string }>("/catalog/products", body);
    const second = post<{ id: string }>("/catalog/products", body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(
      new Response(JSON.stringify({ data: { id: "product-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: "product-1" },
      { id: "product-1" },
    ]);
  });
});
