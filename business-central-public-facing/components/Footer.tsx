"use client";

import React from "react";
import Image from "next/image";
import { ShieldCheck, Lock } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 text-xs relative">
      {/* Clean solid accent line */}
      <div className="h-1 w-full bg-emerald-600" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-slate-800">
          {/* Brand Col */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 border border-slate-700 shadow-sm flex items-center justify-center">
                <Image
                  src="/nanonux_business_central_icon.png"
                  alt="Nano Nux Business Central Logo"
                  width={28}
                  height={28}
                  className="w-full h-full object-contain rounded-sm"
                />
              </div>
              <span className="text-base font-bold text-white tracking-tight">
                Business Central
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              The unified commerce, retail POS, and device repair operating system.
              Sub-second checkout, multi-device diagnostics, real-time FIFO inventory, and continuous offline reliability.
            </p>

            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-200 font-semibold">Production Ready</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-mono font-medium">99.99% Uptime</span>
            </div>
          </div>

          {/* Col 1: Solutions */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Capabilities</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  Omnichannel POS
                </a>
              </li>
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  Device Repair Hub
                </a>
              </li>
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  FIFO Inventory
                </a>
              </li>
              <li>
                <a href="#offline-sync" className="hover:text-white transition-colors">
                  Offline Edge Engine
                </a>
              </li>
              <li>
                <a href="#roi-calculator" className="hover:text-white transition-colors">
                  ROI Estimator
                </a>
              </li>
            </ul>
          </div>

          {/* Col 2: Modules */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">Modules</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  CORE &bull; Foundation
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  POS &bull; Cashiering
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  INVENTORY &bull; Stock
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  REPAIR &bull; Workbenches
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  SERVICE &bull; Dispatch
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  ACCOUNTING &bull; Journals
                </a>
              </li>
              <li>
                <a href="#modules" className="hover:text-white transition-colors">
                  CLINICAL &bull; Healthcare
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Business Reliability */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">Reliability</h4>
            <ul className="space-y-1.5 text-slate-400">
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  Sub-Second Checkout
                </a>
              </li>
              <li>
                <a href="#offline-sync" className="hover:text-white transition-colors">
                  Zero-Downtime Offline
                </a>
              </li>
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  Multi-Store Stock Tracking
                </a>
              </li>
              <li>
                <a href="#interactive-demo" className="hover:text-white transition-colors">
                  Device Repair Workbenches
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">
                  Hardware Compatibility
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} Business Central. All rights reserved.
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Tenant Isolation Enforced
            </span>
            <span className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              Air-Gapped Offline Ready
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
