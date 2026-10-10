// Browser routes only. Backend API resource paths remain unchanged.
const aliases = [
  ["/catalog/attributes", "/catalog/variant-attributes"],
  ["/deliveries", "/customers-and-deliveries/deliveries"],
  ["/customers", "/customers-and-deliveries"],
  ["/stock-assets", "/stock-barcodes"],
  ["/stock-movements", "/stock-history"],
  ["/accounts", "/staff-accounts"],
] as const;

function replacePrefix(path: string, from: string, to: string): string | undefined {
  if (
    path === from ||
    path.startsWith(`${from}/`) ||
    path.startsWith(`${from}?`) ||
    path.startsWith(`${from}#`)
  ) {
    return to + path.slice(from.length);
  }
}

export function getCanonicalWorkspaceHref(href: string, mode?: string): string {
  for (const [legacy, canonical] of aliases) {
    const replaced = replacePrefix(href, legacy, canonical);
    if (replaced !== undefined) return replaced;
  }
  const combined = mode === "NANO" || mode === "MINI";
  const source = mode === "NANO" ? "/catalog" : "/storage";
  if (combined) {
    // Catalog children remain separate pages, even in Nano.
    for (const path of mode === "NANO"
      ? ["/catalog", "/products", "/storage", "/stock-in"]
      : [source]) {
      if (href.split(/[?#]/)[0] === path) return "/products-and-storage" + href.slice(path.length);
    }
  } else {
    const replaced = replacePrefix(href, "/products-and-storage", "/storage");
    if (replaced !== undefined) return replaced;
  }
  return href;
}

// Existing page ownership and access guards use these source routes.
export function getWorkspaceSourcePath(path: string, mode?: string): string {
  for (const [legacy, canonical] of aliases) {
    const replaced = replacePrefix(path, canonical, legacy);
    if (replaced !== undefined) return replaced;
  }
  return (
    replacePrefix(path, "/products-and-storage", mode === "NANO" ? "/catalog" : "/storage") ?? path
  );
}
