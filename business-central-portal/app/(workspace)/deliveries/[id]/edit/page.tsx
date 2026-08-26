"use client";

import { use } from "react";
import { DeliveryEditPage } from "@/components/merchant-edit-pages";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DeliveryEditPage id={use(params).id} />;
}
