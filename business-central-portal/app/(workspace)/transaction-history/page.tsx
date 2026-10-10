import { Suspense } from "react";
import { HistoryWorkspace } from "@/components/history-workspace";

export default function Page() {
  return (
    <Suspense>
      <HistoryWorkspace standalone transactions />
    </Suspense>
  );
}
