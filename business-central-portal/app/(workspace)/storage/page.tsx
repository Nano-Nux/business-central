"use client";

import { StoragePage } from "@/components/storage-page";
import { NanoProductsStoragePage } from "@/components/nano-workspace-pages";
import { useAuth } from "@/lib/auth";

export default function Page() {
  const { merchant } = useAuth();
  return merchant?.pos_complexity_level === "MINI" ? <NanoProductsStoragePage /> : <StoragePage />;
}
