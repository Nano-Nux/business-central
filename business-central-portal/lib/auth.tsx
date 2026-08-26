"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, NetworkUnavailableError, post } from "./api";
import { setCurrencyDefinitions } from "./currency";
import type { Currency, Merchant, Session, User } from "./types";
import {
  clearOfflineScope,
  getCachedEntities,
  listOperations,
  putCachedEntity,
  quarantineOfflineScope,
} from "./offline-db";

export class PendingOfflineChangesError extends Error {
  constructor(public count: number) {
    super(`${count} local change${count === 1 ? "" : "s"} would be discarded by signing out.`);
    this.name = "PendingOfflineChangesError";
  }
}

type AuthValue = {
  session: Session | null;
  user: User | null;
  merchant: Merchant | null;
  merchantReady: boolean;
  ready: boolean;
  isMerchant: boolean;
  login: (email: string, password: string, merchantId?: string) => Promise<User>;
  logout: (options?: { discardPending?: boolean }) => Promise<void>;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthValue | null>(null);
const STORAGE_KEY = "bc.session";

function authorizationFingerprint(user: User) {
  return JSON.stringify({
    merchantId: user.merchant_id,
    membershipId: user.membership_id,
    shopId: user.shop_id ?? "",
    roles: user.roles
      .map((role) => ({
        code: role.code,
        permissions: [...role.permission_codes].sort(),
      }))
      .sort((left, right) => left.code.localeCompare(right.code)),
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [merchantLoadedFor, setMerchantLoadedFor] = useState("");
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    api<Currency[]>("/currencies")
      .then((currencies) => {
        if (!active) return;
        setCurrencyDefinitions(currencies);
        // Refresh authenticated views that may have rendered with the code
        // fallback while the currency directory was still loading.
        setSession((current) => (current ? { ...current } : current));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.merchant_id) {
      return;
    }
    let active = true;
    const scopeKey = `${session.user.merchant_id}:${session.user.membership_id}`;
    api<Merchant>("/merchant")
      .then((next) => {
        if (active) setMerchant(next);
        if (session.user.membership_id) {
          void putCachedEntity(
            {
              merchantId: session.user.merchant_id,
              membershipId: session.user.membership_id,
            },
            "MERCHANT",
            next.id,
            next,
          );
        }
      })
      .catch(async (error) => {
        if (!(error instanceof NetworkUnavailableError)) return;
        const cached = await getCachedEntities<Merchant>(
          {
            merchantId: session.user.merchant_id,
            membershipId: session.user.membership_id,
          },
          "MERCHANT",
        ).catch(() => []);
        if (active) setMerchant(cached[0]?.payload ?? null);
      })
      .finally(() => {
        if (active) setMerchantLoadedFor(scopeKey);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.merchant_id, session?.user?.membership_id]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
      // Restore the session even when the short-lived access token has expired.
      // The API client will rotate it with the refresh token on the first 401,
      // matching the admin application's session lifecycle.
      if (saved) {
        setSession(saved);
        api<User>("/auth/me")
          .then(async (user) => {
            if (authorizationFingerprint(saved.user) !== authorizationFingerprint(user)) {
              await quarantineOfflineScope({
                merchantId: saved.user.merchant_id,
                membershipId: saved.user.membership_id,
              }).catch(() => undefined);
            }
            setSession((current) => (current ? { ...current, user } : current));
          })
          .catch((error) => {
            if (error instanceof NetworkUnavailableError) {
              return;
            }
            localStorage.removeItem(STORAGE_KEY);
            setSession(null);
          });
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<Session | null>).detail;
      setMerchant((current) => (next && current?.id === next.user.merchant_id ? current : null));
      setSession(next);
      if (!next) router.replace("/login");
    };
    window.addEventListener("bc-session", sync);
    return () => window.removeEventListener("bc-session", sync);
  }, [router]);

  useEffect(() => {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [session]);

  const login = useCallback(async (email: string, password: string, merchantId?: string) => {
    const next = await post<Session>("/auth/login", {
      email,
      password,
      merchant_id: merchantId || undefined,
    });
    if (next.user.platform_admin)
      throw new Error("Platform administrators should use the admin application.");
    const roleCodes = next.user.roles.map((role) => role.code.toUpperCase());
    if (roleCodes.includes("MANAGER"))
      throw new Error("Manager access is not available in this portal release yet.");
    if (!roleCodes.some((role) => role === "OWNER" || role === "MERCHANT" || role === "STAFF")) {
      throw new Error("This account does not have a supported merchant or staff role.");
    }
    setMerchant(null);
    setMerchantLoadedFor("");
    setSession(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next.user;
  }, []);

  const logout = useCallback(
    async (options?: { discardPending?: boolean }) => {
      const scope = session?.user
        ? {
            merchantId: session.user.merchant_id,
            membershipId: session.user.membership_id,
          }
        : null;
      if (scope && !options?.discardPending) {
        const operations = await listOperations(scope).catch(() => []);
        const unresolved = operations.filter((operation) => operation.status !== "SYNCED");
        if (unresolved.length > 0) {
          throw new PendingOfflineChangesError(unresolved.length);
        }
      }
      try {
        await post<void>("/auth/logout", {
          refresh_token: session?.refresh_token,
        });
      } catch {
        /* local logout remains available */
      }
      if (scope) await clearOfflineScope(scope).catch(() => undefined);
      localStorage.removeItem(STORAGE_KEY);
      setMerchant(null);
      setMerchantLoadedFor("");
      setSession(null);
      router.replace("/login");
    },
    [router, session],
  );

  const value = useMemo<AuthValue>(() => {
    const permissions = new Set(session?.user.roles.flatMap((role) => role.permission_codes) ?? []);
    const codes = session?.user.roles.map((role) => role.code.toUpperCase()) ?? [];
    const isMerchant = codes.some((role) => role === "OWNER" || role === "MERCHANT");
    const merchantScope = session?.user?.merchant_id
      ? `${session.user.merchant_id}:${session.user.membership_id}`
      : "";
    return {
      session,
      user: session?.user ?? null,
      merchant: session?.user?.merchant_id === merchant?.id ? merchant : null,
      merchantReady: merchantScope === "" || merchantLoadedFor === merchantScope,
      ready,
      isMerchant,
      login,
      logout,
      can: (permission) => isMerchant || permissions.has(permission),
    };
  }, [session, merchant, merchantLoadedFor, ready, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
