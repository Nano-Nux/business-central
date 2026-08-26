"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiPage, NetworkUnavailableError } from "./api";
import type { ApiEnvelope } from "./types";
import { useAuth } from "./auth";
import { getCachedResource, putCachedResource } from "./offline-db";

function reportCacheState(id: string, path: string, cachedAt: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("bc-resource-cache-state", {
      detail: { id, path, cachedAt },
    }),
  );
}

function reportStorageError(error: unknown) {
  if (typeof window === "undefined") return;
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

export function useResource<T>(path: string, cacheKey = path) {
  const { user } = useAuth();
  const instanceId = useId();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<ApiEnvelope<T[]>["meta"]>();
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const scope = useMemo(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );
  const reload = useCallback(async () => {
    if (!path) {
      setData([]);
      setMeta(undefined);
      setCachedAt(null);
      setError("");
      reportCacheState(instanceId, path, null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiPage<T[]>(path);
      setData(response.data);
      setMeta(response.meta);
      setCachedAt(null);
      if (scope) {
        await putCachedResource(scope, cacheKey, response.data, response.meta).catch(
          reportStorageError,
        );
      }
      reportCacheState(instanceId, path, null);
    } catch (reason) {
      const cached =
        reason instanceof NetworkUnavailableError && scope
          ? await getCachedResource<T[]>(scope, cacheKey).catch(() => null)
          : null;
      if (cached) {
        setData(cached.data);
        setMeta(cached.meta);
        setCachedAt(cached.cachedAt);
        reportCacheState(instanceId, path, cached.cachedAt);
      } else {
        reportCacheState(instanceId, path, null);
        setError(reason instanceof Error ? reason.message : "Could not load this page.");
      }
    } finally {
      setLoading(false);
    }
  }, [cacheKey, instanceId, path, scope]);
  const updateLocal = useCallback(
    (update: (current: T[]) => T[]) => setData((current) => update(current)),
    [],
  );
  useEffect(() => {
    let current = true;
    if (!path) {
      const resetTimer = window.setTimeout(() => {
        if (!current) return;
        setData([]);
        setMeta(undefined);
        setCachedAt(null);
        setError("");
        setLoading(false);
        reportCacheState(instanceId, path, null);
      }, 0);
      return () => {
        current = false;
        window.clearTimeout(resetTimer);
        reportCacheState(instanceId, path, null);
      };
    }
    apiPage<T[]>(path)
      .then((response) => {
        if (current) {
          setData(response.data);
          setMeta(response.meta);
          setCachedAt(null);
          reportCacheState(instanceId, path, null);
          if (scope) {
            void putCachedResource(scope, cacheKey, response.data, response.meta).catch(
              reportStorageError,
            );
          }
        }
      })
      .catch(async (reason) => {
        if (!current) return;
        const cached =
          reason instanceof NetworkUnavailableError && scope
            ? await getCachedResource<T[]>(scope, cacheKey).catch(() => null)
            : null;
        if (!current) return;
        if (cached) {
          setData(cached.data);
          setMeta(cached.meta);
          setCachedAt(cached.cachedAt);
          reportCacheState(instanceId, path, cached.cachedAt);
        } else {
          reportCacheState(instanceId, path, null);
          setError(reason instanceof Error ? reason.message : "Could not load this page.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      reportCacheState(instanceId, path, null);
    };
  }, [cacheKey, instanceId, path, scope]);

  useEffect(() => {
    const refreshOnline = () => void reload();
    window.addEventListener("bc-resource-refresh", refreshOnline);
    return () => window.removeEventListener("bc-resource-refresh", refreshOnline);
  }, [reload]);
  return { data, loading, error, meta, reload, updateLocal, cachedAt };
}
