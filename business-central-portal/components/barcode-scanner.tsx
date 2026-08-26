"use client";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { scanNativeBarcode, usingNativeScannerBridge } from "@/lib/native-scanner";
type Detector = {
  detect(source: ImageBitmap | HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
function makeDetector(): Detector | null {
  const ctor = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return ctor
    ? new ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] })
    : null;
}
export function BarcodeScanner({
  value,
  onChange,
  onScan,
  placeholder = "Enter barcode",
}: {
  value: string;
  onChange: (value: string) => void;
  onScan?: (value: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hardwareReady, setHardwareReady] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [error, setError] = useState("");
  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }
  function found(code: string) {
    onChange(code);
    onScan?.(code);
    setHardwareReady(false);
    stop();
  }
  async function start() {
    setError("");
    setHardwareReady(false);
    if (usingNativeScannerBridge()) {
      setScanning(true);
      try {
        const code = await scanNativeBarcode();
        if (code) found(code);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "The native barcode scanner is unavailable.",
        );
      } finally {
        setScanning(false);
      }
      return;
    }
    const scan = makeDetector();
    if (!scan || !navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setScanning(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const result = await scan.detect(videoRef.current).catch(() => []);
        if (result[0]?.rawValue) {
          found(result[0].rawValue);
          return;
        }
        window.requestAnimationFrame(loop);
      };
      void loop();
    } catch {
      stop();
      setError("Camera permission was denied or the camera is unavailable.");
    }
  }
  async function image(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const scan = makeDetector();
    if (!scan) {
      setError("Image scanning is not supported. Enter the barcode manually.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const result = await scan.detect(bitmap);
      if (result[0]?.rawValue) found(result[0].rawValue);
      else setError("No barcode was found in that image.");
      bitmap.close();
    } catch {
      setError("The selected image could not be scanned.");
    }
    event.target.value = "";
  }
  useEffect(() => {
    const refresh = () => setNativeReady(usingNativeScannerBridge());
    refresh();
    window.addEventListener("business-central-native-scanner-ready", refresh);
    return () => {
      window.removeEventListener("business-central-native-scanner-ready", refresh);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  function readyHardwareScanner() {
    stop();
    setError("");
    setHardwareReady(true);
    inputRef.current?.focus();
    inputRef.current?.select();
  }
  return (
    <div className="barcode-scanner">
      <div className="barcode-input">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setHardwareReady(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              found(value.trim());
            }
          }}
          placeholder={placeholder}
          inputMode="text"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={scanning && !nativeReady ? stop : start}
          disabled={scanning && nativeReady}
        >
          {scanning ? (nativeReady ? "Scanner open" : "Stop camera") : "Camera scanner"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-pressed={hardwareReady}
          onClick={readyHardwareScanner}
        >
          Barcode scanner
        </Button>
      </div>
      <input
        ref={fileRef}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={image}
      />
      <video
        ref={videoRef}
        hidden={!scanning || nativeReady}
        muted
        playsInline
        className="barcode-video"
      />
      {nativeReady && (
        <small>
          Camera scanning uses the mobile app securely, including when this portal is served over
          local HTTP.
        </small>
      )}
      {hardwareReady && (
        <small>Scanner ready. Scan the code with the connected barcode scanner.</small>
      )}
      {error && <small className="form-error">{error}</small>}
    </div>
  );
}
