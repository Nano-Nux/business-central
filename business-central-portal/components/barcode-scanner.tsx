"use client";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { scanNativeBarcode, usingNativeScannerBridge } from "@/lib/native-scanner";
import {
  decodeBarcodeFromImageFile,
  startCameraScanning,
  type CameraScannerSession,
} from "@/lib/barcode-decoder";

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
  const scannerSessionRef = useRef<CameraScannerSession | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hardwareReady, setHardwareReady] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [error, setError] = useState("");

  function stop() {
    scannerSessionRef.current?.stop();
    scannerSessionRef.current = null;
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

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fileRef.current?.click();
      return;
    }

    try {
      setScanning(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) {
        setScanning(false);
        return;
      }
      scannerSessionRef.current?.stop();
      scannerSessionRef.current = await startCameraScanning(video, (code) => {
        found(code);
      });
    } catch {
      stop();
      setError("Camera permission was denied or the camera is unavailable.");
    }
  }

  async function image(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const code = await decodeBarcodeFromImageFile(file);
      if (code) {
        found(code);
      } else {
        setError("No barcode was found in that image.");
      }
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
      scannerSessionRef.current?.stop();
      scannerSessionRef.current = null;
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
          data-barcode-input="true"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setHardwareReady(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const val = (event.currentTarget.value || value).trim();
              if (val) found(val);
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
