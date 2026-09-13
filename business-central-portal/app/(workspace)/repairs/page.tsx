"use client";

import { useAuth } from "@/lib/auth";
import { RepairsPage } from "@/components/repairs-page";
import { RepairHubPage } from "@/components/repair-hub-page";

export default function RepairsEntryPage() {
  const { merchant } = useAuth();
  if (merchant?.pos_complexity_level === "MINI") {
    return <RepairHubPage />;
  }
  return <RepairsPage />;
}
