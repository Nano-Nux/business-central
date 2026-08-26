import { describe, expect, it, vi } from "vitest";
import { randomUuid } from "./random-uuid";

describe("randomUuid", () => {
  it("uses the browser implementation when available", () => {
    const native =
      "123e4567-e89b-42d3-a456-426614174000" as `${string}-${string}-${string}-${string}-${string}`;
    const cryptoApi = {
      randomUUID: vi.fn(() => native),
      getRandomValues: vi.fn(),
    } as unknown as Crypto;

    expect(randomUuid(cryptoApi)).toBe(native);
    expect(cryptoApi.randomUUID).toHaveBeenCalledOnce();
  });

  it("creates an RFC 4122 version 4 UUID when randomUUID is missing", () => {
    const cryptoApi = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    } as unknown as Crypto;

    expect(randomUuid(cryptoApi)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });
});
