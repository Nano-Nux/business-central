import { api, NetworkUnavailableError } from "./api";
import { getCachedResource, putCachedResource, type OfflineScope } from "./offline-db";

export type OfflineResourceResult<T> = {
  data: T;
  cachedAt: string | null;
};

export async function cachedApi<T>(
  scope: OfflineScope | null,
  path: string,
  cacheKey = path,
): Promise<OfflineResourceResult<T>> {
  try {
    const data = await api<T>(path);
    if (scope) {
      await putCachedResource(scope, cacheKey, data).catch((error) => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("bc-offline-storage-error", {
              detail: {
                message:
                  error instanceof Error
                    ? `Offline cache could not be updated: ${error.message}`
                    : "Offline cache could not be updated.",
              },
            }),
          );
        }
      });
    }
    return { data, cachedAt: null };
  } catch (error) {
    if (!(error instanceof NetworkUnavailableError) || !scope) throw error;
    const cached = await getCachedResource<T>(scope, cacheKey).catch(() => null);
    if (!cached) throw error;
    return { data: cached.data, cachedAt: cached.cachedAt };
  }
}
