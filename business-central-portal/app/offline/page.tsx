import Link from "next/link";
import { BrandIcon } from "@/components/brand-icon";

export default function OfflinePage() {
  return (
    <main className="screen-center">
      <section className="offline-card">
        <span className="brand-mark">
          <BrandIcon />
        </span>
        <p className="eyebrow">You’re offline</p>
        <h1>The workspace needs a connection</h1>
        <p>
          The app shell is available, but operational data stays protected on the Business Central
          backend. Reconnect to continue.
        </p>
        <Link className="button button-primary" href="/dashboard">
          Try again
        </Link>
      </section>
    </main>
  );
}
