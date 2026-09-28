import Link from "next/link";
import { PageHeader } from "@/components/ui";
export default function WhatsAppAutomationPage() {
  return (
    <div className="page-stack">
      <PageHeader title="WhatsApp automation" description="WhatsApp automation is coming soon." />
      <section className="empty-card">
        <h2>Coming soon</h2>
        <p>No WhatsApp backend integration is enabled.</p>
        <Link className="button secondary" href="/automations">
          Back to automations
        </Link>
      </section>
    </div>
  );
}
