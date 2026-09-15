import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Central | Unified POS, Repair & Inventory Platform",
    short_name: "Business Central",
    description:
      "Enterprise point of sale, multi-device repair diagnostics, FIFO inventory, and continuous offline reliability.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#10b981",
    icons: [
      {
        src: "/nanonux_business_central_icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["business", "productivity", "finance", "utilities"],
    orientation: "any",
    lang: "en",
  };
}
