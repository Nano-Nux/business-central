export type NativeScannerBridge = {
  available: () => Promise<boolean>;
  scan: () => Promise<string | null>;
};

function nativeScanner() {
  return (
    window as Window & {
      BusinessCentralNativeScanner?: NativeScannerBridge;
    }
  ).BusinessCentralNativeScanner;
}

export function usingNativeScannerBridge() {
  return typeof window !== "undefined" && Boolean(nativeScanner());
}

export async function nativeScannerAvailable() {
  const bridge = nativeScanner();
  return bridge ? bridge.available() : false;
}

export async function scanNativeBarcode() {
  const bridge = nativeScanner();
  if (!bridge) throw new Error("The native barcode scanner is unavailable.");
  return bridge.scan();
}
