"use client";

import { use } from "react";
import { RepairEditPage } from "@/components/merchant-edit-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RepairEditPage id={use(params).id} />;
}
