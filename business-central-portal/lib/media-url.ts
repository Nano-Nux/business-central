function fileServerURL() {
  return (process.env.NEXT_PUBLIC_FILE_SERVER_URL ?? "").replace(/\/+$/, "");
}

/**
 * Convert a stored SeaweedFS media path into a browser URL without changing
 * external URLs, data URLs, or local blob previews.
 */
export function resolveMediaURL(value?: string | null) {
  const imageURL = value?.trim() ?? "";
  const baseURL = fileServerURL();
  if (!imageURL || !baseURL || !imageURL.startsWith("/media/")) return imageURL;
  return `${baseURL}${imageURL}`;
}
