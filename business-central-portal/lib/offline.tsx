"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import {
  discardOfflineOperation,
  discardOfflineOperations,
  getMetadata,
  isIndexedDbAvailable,
  listOperations,
  retryOfflineOperation,
  retryOfflineOperations,
  type OfflineOperation,
  type OfflineScope,
} from "./offline-db";
import { resolvePortalConflict, synchronizePortal, type SyncSummary } from "./portal-sync";
import { inspectOfflineStorage, type OfflineStorageStatus } from "./offline-storage";

export type ConnectivityStatus = "online" | "offline" | "reconnecting" | "syncing" | "error";

type OfflineValue = {
  scope: OfflineScope | null;
  status: ConnectivityStatus;
  storageAvailable: boolean;
  storage: OfflineStorageStatus;
  staleResources: Array<{ path: string; cachedAt: string }>;
  pending: number;
  failed: number;
  conflicts: number;
  rejected: number;
  operations: OfflineOperation[];
  lastSyncAt: string | null;
  lastError: string;
  syncNow: () => Promise<SyncSummary | null>;
  resolveConflict: (
    operation: OfflineOperation,
    strategy: "KEEP_SERVER" | "APPLY_CLIENT",
  ) => Promise<boolean>;
  retryOperation: (operation: OfflineOperation) => Promise<void>;
  discardOperation: (operation: OfflineOperation) => Promise<void>;
  retryAllUnsuccessful: () => Promise<void>;
  discardAllUnsuccessful: () => Promise<void>;
  clearLastError: () => void;
  refresh: () => Promise<void>;
};

const OfflineContext = createContext<OfflineValue | null>(null);

function operationCounts(operations: OfflineOperation[]) {
  return {
    pending: operations.filter((operation) =>
      ["PENDING", "SYNCING", "FAILED", "BLOCKED"].includes(operation.status),
    ).length,
    failed: operations.filter((operation) => operation.status === "FAILED").length,
    conflicts: operations.filter((operation) => operation.status === "CONFLICT").length,
    rejected: operations.filter((operation) => operation.status === "REJECTED").length,
  };
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const scope = useMemo<OfflineScope | null>(
    () =>
      user?.merchant_id && user.membership_id
        ? {
            merchantId: user.merchant_id,
            membershipId: user.membership_id,
          }
        : null,
    [user],
  );
  const storageAvailable = isIndexedDbAvailable();
  const [status, setStatus] = useState<ConnectivityStatus>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );
  const syncInFlight = useRef<Promise<SyncSummary | null> | null>(null);
  const [counts, setCounts] = useState({
    pending: 0,
    failed: 0,
    conflicts: 0,
    rejected: 0,
  });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState("");
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [storage, setStorage] = useState<OfflineStorageStatus>({
    supported: false,
    persisted: null,
    usage: null,
    quota: null,
    warning: "",
  });
  const [staleResources, setStaleResources] = useState<Array<{ path: string; cachedAt: string }>>(
    [],
  );

  const refresh = useCallback(async () => {
    if (!scope || !storageAvailable) {
      setCounts({ pending: 0, failed: 0, conflicts: 0, rejected: 0 });
      setOperations([]);
      setLastSyncAt(null);
      return;
    }
    try {
      const [operations, syncedAt] = await Promise.all([
        listOperations(scope),
        getMetadata<string>(scope, "last-sync-at"),
      ]);
      setCounts(operationCounts(operations));
      setOperations(operations);
      setLastSyncAt(syncedAt);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Offline storage could not be read.");
    }
  }, [scope, storageAvailable]);

  const syncNow = useCallback(async () => {
    if (syncInFlight.current) return syncInFlight.current;
    if (!scope || !storageAvailable || !navigator.onLine) {
      setStatus("offline");
      return null;
    }
    setStatus((current) => (current === "offline" ? "reconnecting" : "syncing"));
    setLastError("");
    const request = (async () => {
      try {
        const summary = await synchronizePortal(scope);
        setStatus("online");
        await refresh();
        window.dispatchEvent(new Event("bc-resource-refresh"));
        return summary;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Synchronization failed.";
        setLastError(message);
        setStatus(navigator.onLine ? "error" : "offline");
        await refresh();
        return null;
      } finally {
        syncInFlight.current = null;
      }
    })();
    syncInFlight.current = request;
    return request;
  }, [refresh, scope, storageAvailable]);

  const resolveConflict = useCallback(
    async (operation: OfflineOperation, strategy: "KEEP_SERVER" | "APPLY_CLIENT") => {
      if (!scope || !navigator.onLine) {
        setStatus("offline");
        return false;
      }
      setStatus("syncing");
      setLastError("");
      try {
        await resolvePortalConflict(scope, operation, strategy);
        setStatus("online");
        await refresh();
        window.dispatchEvent(new Event("bc-resource-refresh"));
        return true;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Conflict resolution failed.");
        setStatus(navigator.onLine ? "error" : "offline");
        return false;
      }
    },
    [refresh, scope],
  );

  const retryOperation = useCallback(
    async (operation: OfflineOperation) => {
      await retryOfflineOperation(operation);
      await refresh();
      if (navigator.onLine && status !== "offline") {
        void syncNow();
      }
    },
    [refresh, status, syncNow],
  );

  const discardOperation = useCallback(
    async (operation: OfflineOperation) => {
      if (!scope) return;
      await discardOfflineOperation(scope, operation);
      await refresh();
      window.dispatchEvent(new Event("bc-resource-refresh"));
    },
    [refresh, scope],
  );

  const retryAllUnsuccessful = useCallback(async () => {
    const unsuccessful = operations.filter((op) =>
      ["FAILED", "REJECTED", "CONFLICT", "BLOCKED"].includes(op.status),
    );
    if (unsuccessful.length === 0) return;
    await retryOfflineOperations(unsuccessful);
    await refresh();
    if (navigator.onLine && status !== "offline") {
      void syncNow();
    }
  }, [operations, refresh, status, syncNow]);

  const discardAllUnsuccessful = useCallback(async () => {
    if (!scope) return;
    const unsuccessful = operations.filter((op) =>
      ["FAILED", "REJECTED", "CONFLICT", "BLOCKED"].includes(op.status),
    );
    if (unsuccessful.length === 0) return;
    await discardOfflineOperations(scope, unsuccessful);
    await refresh();
    window.dispatchEvent(new Event("bc-resource-refresh"));
  }, [operations, refresh, scope]);

  const clearLastError = useCallback(() => {
    setLastError("");
  }, []);

  useEffect(() => {
    const cachedResources = new Map<string, { path: string; cachedAt: string }>();
    const resetTimer = window.setTimeout(() => setStaleResources([]), 0);
    const cacheState = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id: string;
          path: string;
          cachedAt: string | null;
        }>
      ).detail;
      if (!detail?.id) return;
      if (detail.cachedAt) {
        cachedResources.set(detail.id, {
          path: detail.path,
          cachedAt: detail.cachedAt,
        });
      } else {
        cachedResources.delete(detail.id);
      }
      setStaleResources([...cachedResources.values()]);
    };
    const storageError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setStorage((current) => ({
        ...current,
        warning: message || "Offline storage could not be updated.",
      }));
    };
    window.addEventListener("bc-resource-cache-state", cacheState);
    window.addEventListener("bc-offline-storage-error", storageError);
    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("bc-resource-cache-state", cacheState);
      window.removeEventListener("bc-offline-storage-error", storageError);
    };
  }, [scope]);

  useEffect(() => {
    const browserOnline = () => {
      setStatus("reconnecting");
      void syncNow();
    };
    const browserOffline = () => setStatus("offline");
    const apiConnectivity = (event: Event) => {
      const available = (event as CustomEvent<{ available: boolean }>).detail?.available;
      if (!available) setStatus("offline");
      else if (status === "offline") {
        setStatus("reconnecting");
        void syncNow();
      }
    };
    window.addEventListener("online", browserOnline);
    window.addEventListener("offline", browserOffline);
    window.addEventListener("bc-connectivity", apiConnectivity);
    window.addEventListener("bc-offline-data-changed", refresh);
    window.addEventListener("bc-sync-requested", browserOnline);
    return () => {
      window.removeEventListener("online", browserOnline);
      window.removeEventListener("offline", browserOffline);
      window.removeEventListener("bc-connectivity", apiConnectivity);
      window.removeEventListener("bc-offline-data-changed", refresh);
      window.removeEventListener("bc-sync-requested", browserOnline);
    };
  }, [refresh, status, syncNow]);

  useEffect(() => {
    if (!ready || !scope) return;
    const timer = window.setTimeout(() => {
      void inspectOfflineStorage(true).then(setStorage);
      void refresh().then(() => {
        if (navigator.onLine) void syncNow();
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, refresh, scope, syncNow]);

  useEffect(() => {
    if (!ready || !scope || !storageAvailable || !navigator.onLine) return;
    const retryAt = operations
      .filter(
        (operation) =>
          (operation.status === "PENDING" || operation.status === "FAILED") &&
          operation.nextRetryAt,
      )
      .map((operation) => Date.parse(operation.nextRetryAt as string))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (retryAt === undefined) return;
    const timer = window.setTimeout(() => void syncNow(), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [operations, ready, scope, storageAvailable, syncNow]);

  const value = useMemo<OfflineValue>(
    () => ({
      scope,
      status,
      storageAvailable,
      storage,
      staleResources,
      ...counts,
      operations,
      lastSyncAt,
      lastError,
      syncNow,
      resolveConflict,
      retryOperation,
      discardOperation,
      retryAllUnsuccessful,
      discardAllUnsuccessful,
      clearLastError,
      refresh,
    }),
    [
      scope,
      status,
      storageAvailable,
      storage,
      staleResources,
      counts,
      operations,
      lastSyncAt,
      lastError,
      syncNow,
      resolveConflict,
      retryOperation,
      discardOperation,
      retryAllUnsuccessful,
      discardAllUnsuccessful,
      clearLastError,
      refresh,
    ],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useOffline must be used inside OfflineProvider");
  return value;
}
