import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from "@zxing/library";

const DETECTOR_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
];

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.AZTEC,
  BarcodeFormat.PDF_417,
  BarcodeFormat.CODABAR,
];

export function createZxingReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

type NativeDetector = {
  detect(source: ImageBitmap | HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};

type NativeDetectorConstructor = new (options?: { formats?: string[] }) => NativeDetector;

function makeNativeDetector(): NativeDetector | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: NativeDetectorConstructor })
    .BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: DETECTOR_FORMATS });
  } catch {
    return null;
  }
}

export async function decodeBarcodeFromImageFile(file: File): Promise<string | null> {
  // 1. Try native BarcodeDetector if available
  const native = makeNativeDetector();
  if (native && typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      const results = await native.detect(bitmap);
      bitmap.close();
      if (results[0]?.rawValue) {
        return results[0].rawValue;
      }
    } catch {
      // Fallback to ZXing on any failure
    }
  }

  // 2. Pure JS ZXing fallback
  if (
    typeof window !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  ) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = createZxingReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      return result?.getText() ?? null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return null;
}

export type CameraScannerSession = {
  stop: () => void;
};

export async function startCameraScanning(
  videoElement: HTMLVideoElement,
  onDetected: (code: string) => void,
): Promise<CameraScannerSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is unavailable or requires a secure context (HTTPS).");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
  });

  videoElement.srcObject = stream;
  await videoElement.play().catch(() => undefined);

  let stopped = false;
  let animationFrameId: number | null = null;
  let zxingReader: BrowserMultiFormatReader | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (animationFrameId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    stream.getTracks().forEach((track) => track.stop());
    if (videoElement) {
      videoElement.srcObject = null;
    }
    if (zxingReader) {
      try {
        zxingReader.reset();
      } catch {
        // ignore
      }
      zxingReader = null;
    }
  };

  const handleFound = (code: string) => {
    if (stopped) return;
    stop();
    onDetected(code);
  };

  // Try native BarcodeDetector first for performance
  const native = makeNativeDetector();
  if (native) {
    const scanLoop = async () => {
      if (stopped) return;
      try {
        const results = await native.detect(videoElement);
        if (results[0]?.rawValue) {
          handleFound(results[0].rawValue);
          return;
        }
      } catch {
        // If native detection fails during streaming, switch to ZXing
        startZxingStream();
        return;
      }
      if (!stopped && typeof window !== "undefined") {
        animationFrameId = window.requestAnimationFrame(scanLoop);
      }
    };
    animationFrameId = window.requestAnimationFrame(scanLoop);
    return { stop };
  }

  // Fallback to ZXing continuous video decode
  function startZxingStream() {
    if (stopped) return;
    try {
      zxingReader = createZxingReader();
      zxingReader.decodeFromVideoElementContinuously(videoElement, (result) => {
        if (stopped) return;
        if (result && result.getText()) {
          handleFound(result.getText());
        }
      });
    } catch {
      // ignore
    }
  }

  startZxingStream();
  return { stop };
}
