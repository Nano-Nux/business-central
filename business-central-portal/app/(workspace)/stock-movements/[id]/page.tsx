import { MovementDetailPage } from "@/components/history-detail-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MovementDetailPage id={(await params).id} />;
}
