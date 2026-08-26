const CACHE = "business-central-shell-v5";
const SHELL_PAGES = [
  "/login",
  "/offline",
  "/dashboard",
  "/catalog",
  "/categories",
  "/products",
  "/units",
  "/unit-conversions",
  "/pricing",
  "/promotions",
  "/customers",
  "/deliveries",
  "/pos",
  "/stock-in",
  "/reports",
  "/invoices",
  "/stock-movements",
  "/transaction-history",
  "/repairs",
  "/repairs/catalog",
  "/accounts",
  "/settings",
  "/settings/application",
  "/settings/merchant",
  "/settings/printer",
  "/settings/repair-specs",
  "/settings/staff",
  "/settings/tax-notes",
];
const SHELL_ASSETS = [
  "/app-icon.svg",
  "/app-icon-maskable.svg",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/app-icon-maskable-512.png",
  "/nanonux_business_central_icon.png",
];

async function precacheShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL_ASSETS);
  const discoveredAssets = new Set();
  for (const page of SHELL_PAGES) {
    const response = await fetch(page, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not precache ${page}.`);
    await cache.put(page, response.clone());
    const html = await response.text();
    for (const match of html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g)) {
      discoveredAssets.add(match[1].replaceAll("&amp;", "&"));
    }
  }
  await Promise.all(
    [...discoveredAssets].map(async (asset) => {
      const response = await fetch(asset, { cache: "no-store" });
      if (response.ok) await cache.put(asset, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("business-central-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match("/dashboard")) ||
            (await cache.match("/offline")) ||
            Response.error()
          );
        }),
    );
    return;
  }

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/app-icon"))
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "business-central-portal-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "BUSINESS_CENTRAL_SYNC_REQUESTED" });
      }
    }),
  );
});
