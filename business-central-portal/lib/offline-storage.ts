export type OfflineStorageStatus = {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  warning: string;
};

const LOW_STORAGE_BYTES = 25 * 1024 * 1024;

export function storageWarning(
  persisted: boolean | null,
  usage: number | null,
  quota: number | null,
) {
  if (usage !== null && quota !== null) {
    const available = Math.max(0, quota - usage);
    if (available < LOW_STORAGE_BYTES || (quota > 0 && available / quota < 0.1)) {
      return "Browser storage is nearly full. Synchronize pending work before clearing site data.";
    }
  }
  if (persisted === false) {
    return "Offline data uses best-effort browser storage and may be removed under storage pressure.";
  }
  return "";
}

export async function inspectOfflineStorage(
  requestPersistence = false,
): Promise<OfflineStorageStatus> {
  if (typeof navigator === "undefined") {
    return {
      supported: false,
      persisted: null,
      usage: null,
      quota: null,
      warning: "",
    };
  }

  if (!navigator.storage) {
    const indexedDbAvailable = typeof indexedDB !== "undefined";
    return {
      supported: false,
      persisted: null,
      usage: null,
      quota: null,
      warning: indexedDbAvailable ? "" : "Offline storage is unavailable in this browser.",
    };
  }

  try {
    let persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    if (!persisted && requestPersistence && navigator.storage.persist) {
      persisted = await navigator.storage.persist();
    }
    const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    const usage = estimate.usage ?? null;
    const quota = estimate.quota ?? null;
    return {
      supported: true,
      persisted,
      usage,
      quota,
      warning: storageWarning(persisted, usage, quota),
    };
  } catch {
    return {
      supported: true,
      persisted: null,
      usage: null,
      quota: null,
      warning: "Browser storage protection could not be verified.",
    };
  }
}
