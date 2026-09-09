import { describe, expect, it, vi } from "vitest";
import {
  createZxingReader,
  decodeBarcodeFromImageFile,
  startCameraScanning,
} from "./barcode-decoder";

describe("barcode-decoder", () => {
  it("creates a ZXing reader configured with barcode formats and tryHarder", () => {
    const reader = createZxingReader();
    expect(reader).toBeDefined();
    expect(typeof reader.decodeFromImageUrl).toBe("function");
    expect(typeof reader.decodeFromVideoElementContinuously).toBe("function");
  });

  it("gracefully returns null when image decoding finds no code", async () => {
    // Create a mock File
    const mockFile = new File(["dummy content"], "test.png", { type: "image/png" });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const originalCreate = globalThis.URL?.createObjectURL;
    const originalRevoke = globalThis.URL?.revokeObjectURL;
    globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/dummy");
    globalThis.URL.revokeObjectURL = vi.fn();

    try {
      const result = await decodeBarcodeFromImageFile(mockFile);
      expect(result).toBeNull();
    } finally {
      if (originalCreate) globalThis.URL.createObjectURL = originalCreate;
      if (originalRevoke) globalThis.URL.revokeObjectURL = originalRevoke;
    }
  });

  it("throws a descriptive error when navigator.mediaDevices is unavailable", async () => {
    const mockVideo = {} as HTMLVideoElement;
    const onDetected = vi.fn();

    const originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });

    try {
      await expect(startCameraScanning(mockVideo, onDetected)).rejects.toThrow(
        "Camera is unavailable or requires a secure context (HTTPS).",
      );
    } finally {
      Object.defineProperty(navigator, "mediaDevices", {
        value: originalMediaDevices,
        configurable: true,
      });
    }
  });
});
