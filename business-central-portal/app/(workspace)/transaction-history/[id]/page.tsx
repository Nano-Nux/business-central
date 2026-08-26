import { TransactionDetailPage } from "@/components/history-detail-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TransactionDetailPage id={(await params).id} />;
}
