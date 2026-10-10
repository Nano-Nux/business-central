import { Suspense } from "react";
import { StockConversionsPage } from "@/components/stock-conversions-page";
export default function Page() {
  return (
    <Suspense>
      <StockConversionsPage />
    </Suspense>
  );
}
