import { invoiceCanvas } from "./invoice";
import type { Invoice, Shop } from "./types";

export type PrinterDevice = {
  id: string;
  name: string;
  device?: BluetoothDevice;
  native?: boolean;
};
let activePrinter: PrinterDevice | null = null;

export const DEFAULT_PRINTER_FONT_SIZE_PX = 14;
export const DEFAULT_PRINTER_PAPER_WIDTH_MM = 80;

const printableWidthPixels: Record<number, number> = {
  44: 288,
  58: 384,
  80: 576,
  110: 832,
  210: 1600,
};

export function printerPaperWidthPixels(paperWidthMm: number) {
  return printableWidthPixels[paperWidthMm] ?? printableWidthPixels[DEFAULT_PRINTER_PAPER_WIDTH_MM];
}

type PrinterSettingsShop = Pick<Shop, "id" | "address">;

function shopSetting(shop: PrinterSettingsShop | null | undefined, key: string) {
  return shop?.address?.[key];
}

export function storedPrinterFontSizePx(shop?: PrinterSettingsShop | null) {
  if (typeof window === "undefined") return DEFAULT_PRINTER_FONT_SIZE_PX;
  const storedPixels = Number(
    shopSetting(shop, "printer_font_size_px") ??
      (shop?.id ? localStorage.getItem(`bc.printer.fontSizePx.${shop.id}`) : null) ??
      localStorage.getItem("bc.printer.fontSizePx"),
  );
  if (storedPixels >= 10 && storedPixels <= 24) return storedPixels;

  // Preserve the equivalent size for users who previously selected a percentage scale.
  const legacyScale = Number(localStorage.getItem("bc.printer.fontScale"));
  return legacyScale >= 0.8 && legacyScale <= 1.3
    ? Math.round(DEFAULT_PRINTER_FONT_SIZE_PX * legacyScale)
    : DEFAULT_PRINTER_FONT_SIZE_PX;
}

export function storedPrinterPaperWidthMm(shop?: PrinterSettingsShop | null) {
  if (typeof window === "undefined") return DEFAULT_PRINTER_PAPER_WIDTH_MM;
  const storedWidth = Number(
    shopSetting(shop, "printer_paper_width_mm") ??
      (shop?.id ? localStorage.getItem(`bc.printer.paperWidthMm.${shop.id}`) : null) ??
      localStorage.getItem("bc.printer.paperWidthMm"),
  );
  return printableWidthPixels[storedWidth] ? storedWidth : DEFAULT_PRINTER_PAPER_WIDTH_MM;
}

export function getActivePrinter() {
  return activePrinter;
}
type BluetoothRemoteGATTCharacteristic = {
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  writeValue: (value: BufferSource) => Promise<void>;
};
type BluetoothRemoteGATTService = {
  getCharacteristics: () => Promise<BluetoothRemoteGATTCharacteristic[]>;
};
type BluetoothRemoteGATTServer = {
  connected: boolean;
  connect: () => Promise<BluetoothRemoteGATTServer>;
  getPrimaryServices: () => Promise<BluetoothRemoteGATTService[]>;
};
type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
};
type BluetoothAPI = {
  requestDevice: (options: {
    acceptAllDevices: boolean;
    optionalServices: number[];
  }) => Promise<BluetoothDevice>;
  getAvailability?: () => Promise<boolean>;
};
type NativePrinterBridge = {
  available: () => Promise<boolean>;
  scan: () => Promise<{ id: string; name: string }>;
  connect: (id: string) => Promise<boolean>;
  print: (bytes: string) => Promise<boolean>;
};

function nativePrinter() {
  return (window as Window & { BusinessCentralNativePrinter?: NativePrinterBridge })
    .BusinessCentralNativePrinter;
}

export function usingNativePrinterBridge() {
  return typeof window !== "undefined" && Boolean(nativePrinter());
}

function bluetooth() {
  return (navigator as Navigator & { bluetooth?: BluetoothAPI }).bluetooth;
}
export async function bluetoothAvailable() {
  const native = nativePrinter();
  if (native) return native.available();
  const api = bluetooth();
  if (!api) return false;
  return api.getAvailability ? api.getAvailability() : true;
}
export async function scanPrinter(): Promise<PrinterDevice> {
  const native = nativePrinter();
  if (native) {
    const selected = await native.scan();
    return { ...selected, native: true };
  }
  const api = bluetooth();
  if (!api)
    throw new Error(
      "Bluetooth printing requires Chrome or Edge on Android/Desktop in a secure HTTPS page.",
    );
  const device = await api.requestDevice({
    acceptAllDevices: true,
    optionalServices: [0x18f0, 0xffe0, 0xff00],
  });
  return { id: device.id, name: device.name || "Thermal printer", device };
}
export async function connectPrinter(printer: PrinterDevice) {
  if (printer.native) {
    const native = nativePrinter();
    if (!native) throw new Error("The native printer bridge is unavailable.");
    await native.connect(printer.id);
    activePrinter = printer;
    return printer;
  }
  if (!printer.device?.gatt)
    throw new Error("This device does not expose a Bluetooth GATT connection.");
  await printer.device.gatt.connect();
  activePrinter = printer;
  return printer;
}

function raster(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read invoice image.");
  const widthBytes = Math.ceil(canvas.width / 8),
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    output = new Uint8Array(8 + widthBytes * canvas.height);
  output.set([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 255,
    (widthBytes >> 8) & 255,
    canvas.height & 255,
    (canvas.height >> 8) & 255,
  ]);
  let offset = 8;
  for (let y = 0; y < canvas.height; y++) {
    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x >= canvas.width) continue;
        const index = (y * canvas.width + x) * 4;
        const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
        if (data[index + 3] > 30 && luminance < 160) byte |= 0x80 >> bit;
      }
      output[offset++] = byte;
    }
  }
  return output;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function printInvoice(
  printer: PrinterDevice,
  invoice: Invoice,
  fontSizePx = DEFAULT_PRINTER_FONT_SIZE_PX,
  paperWidthMm = DEFAULT_PRINTER_PAPER_WIDTH_MM,
) {
  const fontScale = fontSizePx / DEFAULT_PRINTER_FONT_SIZE_PX;
  const rasterBytes = raster(
    await invoiceCanvas(invoice, fontScale, printerPaperWidthPixels(paperWidthMm), 0),
  );
  if (printer.native) {
    const native = nativePrinter();
    if (!native) throw new Error("The native printer bridge is unavailable.");
    const bytes = new Uint8Array(2 + rasterBytes.length + 6);
    bytes.set([0x1b, 0x40], 0);
    bytes.set(rasterBytes, 2);
    bytes.set([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00], 2 + rasterBytes.length);
    await native.print(base64(bytes));
    return;
  }
  if (!printer.device) throw new Error("The Bluetooth printer is unavailable.");
  const server = printer.device.gatt?.connected
    ? printer.device.gatt
    : await printer.device.gatt?.connect();
  if (!server) throw new Error("Connect the printer first.");
  const services = await server.getPrimaryServices();
  let characteristic: BluetoothRemoteGATTCharacteristic | undefined;
  for (const service of services) {
    const values = await service.getCharacteristics();
    characteristic = values.find((value) => value.writeValueWithoutResponse || value.writeValue);
    if (characteristic) break;
  }
  if (!characteristic) throw new Error("No writable ESC/POS characteristic was found.");
  const bytes = rasterBytes;
  const write =
    characteristic.writeValueWithoutResponse?.bind(characteristic) ??
    characteristic.writeValue.bind(characteristic);
  await write(new Uint8Array([0x1b, 0x40]));
  for (let offset = 0; offset < bytes.length; offset += 180)
    await write(bytes.slice(offset, offset + 180));
  await write(new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]));
}
