"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, logout, refreshSession, Session } from "./api";

export function useAdminSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const refreshPromiseRef = useRef<Promise<Session> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem("bc_admin_session");
      if (saved) { try { const parsed = JSON.parse(saved) as Session; sessionRef.current = parsed; setSession(parsed); } catch { localStorage.removeItem("bc_admin_session"); } }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = useCallback((value: Session) => { sessionRef.current = value; localStorage.setItem("bc_admin_session", JSON.stringify(value)); setSession(value); }, []);
  const clear = useCallback(() => { sessionRef.current = null; refreshPromiseRef.current = null; localStorage.removeItem("bc_admin_session"); setSession(null); }, []);
  const withAuth = useCallback(async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
    const current = sessionRef.current;
    if (!current) throw new Error("Your admin session has expired. Please sign in again.");
    try { return await operation(current.access_token); } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      try {
        if (!refreshPromiseRef.current) {
          refreshPromiseRef.current = refreshSession(current.refresh_token).then((renewed) => { persist(renewed); return renewed; }).finally(() => { refreshPromiseRef.current = null; });
        }
        const renewed = await refreshPromiseRef.current;
        return await operation(renewed.access_token);
      }
      catch { clear(); throw new Error("Your admin session expired. Please sign in again."); }
    }
  }, [persist, clear]);
  const signOut = useCallback(() => { if (session) void logout(session.access_token).catch(() => undefined); clear(); }, [session, clear]);

  return { session, ready, withAuth, signOut };
}
