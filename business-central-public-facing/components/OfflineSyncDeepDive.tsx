"use client";

import React from "react";
import {
  ShieldCheck,
  RotateCcw,
  Database,
  Lock,
  CheckCircle2,
} from "lucide-react";

export default function OfflineSyncDeepDive() {
  return (
    <section id="offline-sync" className="py-16 md:py-24 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 uppercase tracking-wider inline-block mb-3">
            High-Availability Architecture
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Offline Protection &amp; Edge Resilience
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            Most cloud POS systems freeze when your internet cuts out. Business Central buffers transactions locally on your device,
            reconciles changes automatically the second connection returns, and even supports a 100% standalone offline mode for remote sites.
          </p>
        </div>

        {/* The Two Runtime Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          {/* Mode 1: ONLINE with Local Fallback */}
          <div className="p-6 sm:p-9 rounded-3xl border border-emerald-200 bg-emerald-50/40 shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                  Mode 01 &bull; Online + Instant Fallback
                </span>
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50/80 px-2.5 py-0.5 rounded-full border border-emerald-200">Default Production</span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-emerald-950 transition-colors">Continuous Background Synchronization</h3>
              <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
                Operates connected to your cloud store database. If the store router reboots or broadband cuts out,
                the register immediately keeps ringing up sales locally without disrupting cashier operations.
              </p>

              <div className="space-y-3 text-xs mb-6">
                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-emerald-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Encrypted Local Buffer</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Orders, repair tickets, and part deductions buffer safely on device memory.</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-emerald-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Intelligent Conflict Resolution</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Multiple registers reconcile cleanly without duplicate orders or manual sync errors.</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-emerald-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Instant Background Sync</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Syncs silently the exact second connectivity returns.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-emerald-100 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">Protocol: Automatic Reconnection</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-bold shadow-xs">Zero Lost Sales</span>
            </div>
          </div>

          {/* Mode 2: FULLY_OFFLINE Air-Gapped Mode */}
          <div className="p-6 sm:p-9 rounded-3xl border border-sky-200 bg-sky-50/40 shadow-sm hover:shadow-xl hover:border-sky-300 transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-300 shadow-xs">
                  Mode 02 &bull; Standalone Offline Mode
                </span>
                <span className="text-xs font-semibold text-sky-800 bg-sky-50/80 px-2.5 py-0.5 rounded-full border border-sky-200">Remote / Field / Pop-Up</span>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-sky-950 transition-colors">Zero Internet Dependency</h3>
              <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
                Ideal for trade shows, remote pop-ups, mobile service vans, and high-security facilities that require completely isolated, non-networked operations.
              </p>

              <div className="space-y-3 text-xs mb-6">
                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-sky-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0 mt-0.5">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Zero Network Reliance</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Operates completely disconnected from the public internet.</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-sky-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Full On-Device POS</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Complete checkout, catalog search, barcode scanning, and receipt printing.</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-xs border border-sky-100 shadow-xs flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Complete Data Sovereignty</div>
                    <div className="text-slate-500 mt-0.5 leading-relaxed">Store transactions remain 100% localized to your secure hardware.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-sky-100 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">Network Dependency: None</span>
              <span className="px-2.5 py-1 rounded-full bg-sky-600 text-white font-bold shadow-xs">100% Local Execution</span>
            </div>
          </div>
        </div>

        {/* Idempotency Explanation Strip */}
        <div className="p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-xl text-xs">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/90 border border-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">Transaction Protection &amp; Double-Charge Prevention</div>
                <div className="text-slate-300 mt-0.5 leading-relaxed">
                  Every transaction carries a unique cryptographic identifier, ensuring that when offline registers reconnect, payments and inventory are never charged or deducted twice.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs shrink-0 flex-wrap">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Zero Double-Billing
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-950/80 border border-sky-500/40 text-sky-300 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                Zero Ghost Deductions
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
