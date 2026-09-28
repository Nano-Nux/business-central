import Link from "next/link";
import { PageHeader } from "@/components/ui";
export default function FacebookAutomationPage() {
  return (
    <div className="page-stack">
      <PageHeader title="Facebook automation" description="Facebook automation is coming soon." />
      <section className="empty-card">
        <h2>Coming soon</h2>
        <p>No Facebook backend integration is enabled.</p>
        <Link className="button secondary" href="/automations">
          Back to automations
        </Link>
      </section>
    </div>
  );
}
