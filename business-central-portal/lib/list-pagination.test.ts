import { describe, expect, it } from "vitest";
import { getPaginationPages, paginateItems } from "./list-pagination";

describe("list pagination", () => {
  it("returns the requested page and clamps an out-of-range index", () => {
    expect(paginateItems([1, 2, 3, 4, 5], 1, 2)).toMatchObject({
      currentPage: 1,
      pageItems: [3, 4],
      totalPages: 3,
    });
    expect(paginateItems([1, 2], 9, 10).currentPage).toBe(0);
  });

  it("keeps the first, last, and nearby page indexes for long lists", () => {
    expect(getPaginationPages(5, 12)).toEqual([0, 4, 5, 6, 11]);
    expect(getPaginationPages(0, 3)).toEqual([0, 1, 2]);
  });
});
