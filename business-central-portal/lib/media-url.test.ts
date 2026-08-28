import { describe, expect, it } from "vitest";
import { resolveMediaURL } from "./media-url";

describe("resolveMediaURL", () => {
  it("leaves an empty URL unchanged", () => {
    expect(resolveMediaURL("")).toBe("");
  });

  it("leaves external URLs unchanged", () => {
    expect(resolveMediaURL("https://example.com/image.png")).toBe("https://example.com/image.png");
  });

  it("leaves a stored path relative when no file-server base is configured", () => {
    expect(resolveMediaURL("/media/merchant/image.png")).toBe("/media/merchant/image.png");
  });

  it("prefixes a stored path with the configured file-server URL", () => {
    process.env.NEXT_PUBLIC_FILE_SERVER_URL = "https://files.example.com/";
    expect(resolveMediaURL("/media/merchant/image.png")).toBe(
      "https://files.example.com/media/merchant/image.png",
    );
    delete process.env.NEXT_PUBLIC_FILE_SERVER_URL;
  });
});
