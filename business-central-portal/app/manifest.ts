import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Central Merchant Workspace",
    short_name: "Business Central",
    description: "Sales, stock, repairs and reporting for your shop.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f7f7",
    theme_color: "#000000",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New sale",
        short_name: "POS",
        url: "/pos",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Today",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/app-icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
