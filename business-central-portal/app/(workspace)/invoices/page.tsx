"use client";

import { Suspense } from "react";
import { redirect, useSearchParams } from "next/navigation";

function InvoiceRedirect() {
  const params = useSearchParams();
  const invoice = params.get("invoice");
  return redirect(
    invoice
      ? `/transaction-history?invoice=${encodeURIComponent(invoice)}`
      : "/transaction-history",
  );
}

export default function Page() {
  return (
    <Suspense>
      <InvoiceRedirect />
    </Suspense>
  );
}
