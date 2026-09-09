import Link from "next/link";
import { BrandIcon } from "@/components/brand-icon";

export default function OfflinePage() {
  return (
    <main className="screen-center min-h-screen grid place-items-center p-4 bg-canvas text-ink">
      <section className="offline-card w-full max-w-[420px] text-center bg-paper border border-line rounded-2xl p-6 sm:p-8 shadow-portal">
        <span className="brand-mark inline-flex items-center justify-center w-12 h-12 rounded-xl bg-ink text-paper mb-4 mx-auto">
          <BrandIcon />
        </span>
        <p className="eyebrow text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
          You’re offline
        </p>
        <h1 className="text-xl sm:text-2xl font-serif font-medium tracking-tight text-ink m-0 my-2">
          The workspace needs a connection
        </h1>
        <p className="text-xs sm:text-sm text-muted leading-relaxed m-0 mb-6">
          The app shell is available, but operational data stays protected on the Business Central
          backend. Reconnect to continue.
        </p>
        <Link
          className="button button-primary inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-ink text-paper font-semibold text-sm hover:opacity-90 transition"
          href="/dashboard"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}
