import { RepairSyncReviewPage } from "@/components/repair-sync-review-page";

export default async function Page({ params }: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await params;
  return <RepairSyncReviewPage operationId={operationId} />;
}
