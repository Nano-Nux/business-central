"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
      const syncRequested = (event: MessageEvent) => {
        if (event.data?.type === "BUSINESS_CENTRAL_SYNC_REQUESTED") {
          window.dispatchEvent(new Event("bc-sync-requested"));
        }
      };
      navigator.serviceWorker.addEventListener("message", syncRequested);
      return () => navigator.serviceWorker.removeEventListener("message", syncRequested);
    }
  }, []);
  return null;
}
