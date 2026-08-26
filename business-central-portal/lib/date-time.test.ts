import { describe, expect, it } from "vitest";
import { addDateOnlyDays, dateOnlyDaysBetween, formatDateOnly } from "./date-time";

describe("repair waiting dates", () => {
  it("derives an end date from a number of waiting days", () => {
    expect(addDateOnlyDays("2026-08-26", 5)).toBe("2026-08-31");
    expect(addDateOnlyDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("derives waiting days from a selected end date", () => {
    expect(dateOnlyDaysBetween("2026-08-26", "2026-09-02")).toBe(7);
    expect(dateOnlyDaysBetween("2026-08-26", "2026-08-25")).toBe(0);
  });

  it("formats date-only values without timezone drift", () => {
    expect(formatDateOnly("2026-08-26")).toBe("Aug 26, 2026");
  });
});
