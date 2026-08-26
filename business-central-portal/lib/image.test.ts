import { describe, expect, it } from "vitest";
import { fitImageDimensions } from "./image";

describe("fitImageDimensions", () => {
  it("reduces a landscape image to the 240px bounding box", () => {
    expect(fitImageDimensions(1200, 600)).toEqual({ width: 240, height: 120 });
  });

  it("reduces a portrait image without stretching it", () => {
    expect(fitImageDimensions(400, 800)).toEqual({ width: 120, height: 240 });
  });

  it("does not enlarge an image already inside the bounding box", () => {
    expect(fitImageDimensions(120, 80)).toEqual({ width: 120, height: 80 });
  });
});
