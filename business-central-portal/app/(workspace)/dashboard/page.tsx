"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/ui";

export default function DashboardPage() {
  const router = useRouter();
  const { ready, merchantReady, user, isMerchant, can } = useAuth();
  useEffect(() => {
    if (!ready || !merchantReady || !user) return;
    router.replace(
      isMerchant && can("tenant.read")
        ? "/reports"
        : can("tenant.write")
          ? "/pos"
          : can("tenant.read")
            ? "/transaction-history"
            : "/settings",
    );
  }, [ready, merchantReady, user, isMerchant, can, router]);
  return <Loading />;
}
