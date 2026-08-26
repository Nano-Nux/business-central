"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { cachedApi } from "./offline-resource";

function reportCacheState(id: string, path: string, cachedAt: string | null) {
  window.dispatchEvent(
    new CustomEvent("bc-resource-cache-state", {
      detail: { id, path, cachedAt },
    }),
  );
}

export function useCachedQuery<T>(path: string, cacheKey = path) {
  const { user } = useAuth();
  const instanceId = useId();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const scope = useMemo(
    () => (user ? { merchantId: user.merchant_id, membershipId: user.membership_id } : null),
    [user],
  );

  const reload = useCallback(async () => {
    if (!path) {
      setData(undefined);
      setCachedAt(null);
      setError("");
      setLoading(false);
      reportCacheState(instanceId, path, null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await cachedApi<T>(scope, path, cacheKey);
      setData(result.data);
      setCachedAt(result.cachedAt);
      reportCacheState(instanceId, path, result.cachedAt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this page.");
      reportCacheState(instanceId, path, null);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, instanceId, path, scope]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void reload(), 0);
    const refreshOnline = () => void reload();
    window.addEventListener("bc-resource-refresh", refreshOnline);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("bc-resource-refresh", refreshOnline);
      reportCacheState(instanceId, path, null);
    };
  }, [instanceId, path, reload]);

  return { data, loading, error, cachedAt, reload };
}
