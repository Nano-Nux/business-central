"use client";

import { useEffect } from "react";
import { resolveInitialAppearance, setupDelayedBridgeListener } from "@/lib/theme-storage";

export function ThemeSync() {
  useEffect(() => {
    void resolveInitialAppearance();
    const cleanup = setupDelayedBridgeListener();
    return cleanup;
  }, []);

  return null;
}
