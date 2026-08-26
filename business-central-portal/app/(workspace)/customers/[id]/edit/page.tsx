"use client";

import { use } from "react";
import { CustomerEditPage } from "@/components/merchant-edit-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerEditPage id={use(params).id} />;
}
