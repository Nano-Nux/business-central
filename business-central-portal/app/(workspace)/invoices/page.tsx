import { Suspense } from "react";
import { InvoicesPage } from "@/components/invoices-page";
export default function Page() {
  return (
    <Suspense>
      <InvoicesPage />
    </Suspense>
  );
}
