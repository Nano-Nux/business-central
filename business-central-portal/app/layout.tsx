import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AuthProvider } from "@/lib/auth";
import { PwaRegister } from "@/components/pwa-register";
import { ShopProvider } from "@/lib/shop";
import { OfflineProvider } from "@/lib/offline";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Business Central", template: "%s · Business Central" },
  description: "A calm, fast workspace for your shop.",
  applicationName: "Business Central",
  icons: {
    icon: [
      {
        url: "/nanonux_business_central_icon.png",
        type: "image/png",
        sizes: "72x72",
      },
    ],
    shortcut: "/nanonux_business_central_icon.png",
    apple: [
      {
        url: "/nanonux_business_central_icon.png",
        type: "image/png",
        sizes: "72x72",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Business Central",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

const randomUuidCompatibilityScript = `
  (() => {
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.randomUUID === "function") return;
    Object.defineProperty(cryptoApi, "randomUUID", {
      configurable: true,
      value: () => {
        const bytes = new Uint8Array(16);
        if (typeof cryptoApi.getRandomValues === "function") {
          cryptoApi.getRandomValues(bytes);
        } else {
          const seed = Date.now() + (globalThis.performance?.now?.() ?? 0);
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256) ^ ((seed / 2 ** (index % 8)) & 255);
          }
        }
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
      },
    });
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Script id="random-uuid-compatibility" strategy="beforeInteractive">
          {randomUuidCompatibilityScript}
        </Script>
        <AuthProvider>
          <OfflineProvider>
            <ShopProvider>
              <PwaRegister />
              {children}
            </ShopProvider>
          </OfflineProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
