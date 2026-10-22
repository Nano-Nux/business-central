import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import {
  legalEmail,
  legalOperator,
  legalUpdated,
  legalUpdatedISO,
} from "@/lib/legal";

export type LegalSection = { id: string; title: string; content: ReactNode };

export default function LegalPage({
  title,
  introduction,
  summary,
  sections,
}: {
  title: string;
  introduction: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            <Image
              src="/nanonux_business_central_icon.png"
              alt=""
              width={40}
              height={40}
              className="rounded-lg bg-white p-1"
            />
            <span>
              <span className="block text-sm font-semibold">
                Business Central
              </span>
              <span className="block text-xs text-slate-400">
                by {legalOperator}
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft size={15} />
            Back to website
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16"
      >
        <div className="mb-10 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Nanonux · Legal & privacy
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-600">
            {introduction}
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Effective and last updated:{" "}
            <time dateTime={legalUpdatedISO}>{legalUpdated}</time>
          </p>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-8">
            <nav
              aria-label="On this page"
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                On this page
              </p>
              <ol className="space-y-2.5 text-sm">
                {sections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block text-slate-600 hover:text-emerald-700"
                    >
                      {index + 1}. {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 sm:p-10">
            <div className="mb-10 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              <ShieldCheck
                size={20}
                className="mt-0.5 shrink-0 text-emerald-700"
              />
              <p>{summary}</p>
            </div>
            <div className="space-y-9">
              {sections.map((section, index) => (
                <section
                  id={section.id}
                  key={section.id}
                  className="scroll-mt-8"
                >
                  <h2 className="mb-3 text-xl font-semibold tracking-tight text-slate-950">
                    {index + 1}. {section.title}
                  </h2>
                  <div className="space-y-3 text-sm leading-7 text-slate-600 [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-10 rounded-xl bg-slate-50 p-5 text-sm">
              <p className="font-semibold text-slate-950">
                Questions or a privacy request?
              </p>
              <a
                href={`mailto:${legalEmail}`}
                className="mt-2 inline-flex items-center gap-1 break-all text-emerald-700 underline underline-offset-2"
              >
                {legalEmail}
                <ArrowUpRight size={14} />
              </a>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Please include enough information to identify your request, but
                do not send passwords or access tokens.
              </p>
            </div>
          </article>
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:px-8">
          <span>
            © {new Date().getFullYear()} {legalOperator}. Business Central.
          </span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/privacy-policy" className="hover:text-emerald-700">
              Privacy Policy
            </Link>
            <Link href="/terms-of-service" className="hover:text-emerald-700">
              Terms of Service
            </Link>
            <a href={`mailto:${legalEmail}`} className="hover:text-emerald-700">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
