import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import JsonLd from "@/components/JsonLd";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://business-central.nanonux.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Business Central | Unified POS, Device Repair & FIFO Inventory Platform",
    template: "%s | Business Central",
  },
  description:
    "High-performance operating system for multi-location retail, sub-second POS cashiering, multi-device repair diagnostics, real-time FIFO inventory tracking, and air-gapped offline synchronization.",
  keywords: [
    "Business Central",
    "Point of Sale",
    "POS Software",
    "Retail POS System",
    "Device Repair POS",
    "Phone Repair Shop Software",
    "Electronics Repair Software",
    "Computer Repair Shop Management",
    "FIFO Inventory Software",
    "Offline POS System",
    "Offline Point of Sale",
    "Multi-Store Retail POS",
    "Retail Management System",
    "Sub-second Cashiering",
    "Thermal Receipt POS",
    "Air-Gapped Offline POS",
    "Nano Nux",
  ],
  authors: [{ name: "Nano Nux Team", url: siteUrl }],
  creator: "Nano Nux",
  publisher: "Nano Nux",
  category: "technology",
  classification: "Business Management Software",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Business Central | Unified POS, Device Repair & FIFO Inventory Platform",
    description:
      "Sub-second touch checkout, 20-point repair diagnostics, FIFO stock valuation, and zero-downtime offline delta synchronization.",
    url: "/",
    siteName: "Business Central",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Business Central | Unified Retail POS & Device Repair Platform",
    description:
      "High-speed POS, multi-device repair diagnostics, FIFO inventory ledger, and continuous offline reliability.",
    creator: "@nanonux",
  },
  icons: {
    icon: [
      { url: "/nanonux_business_central_icon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/nanonux_business_central_icon.png",
    apple: "/nanonux_business_central_icon.png",
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    other: {
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION || "",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <JsonLd siteUrl={siteUrl} />
      </head>
      <body className="min-h-full flex flex-col bg-white text-slate-900 selection:bg-slate-900 selection:text-white font-sans">
        {children}
      </body>
    </html>
  );
}
