"use client";

import React from "react";
import { Check } from "lucide-react";

export default function ComparisonTable() {
  const comparisons = [
    {
      capability: "Register & Checkout Speed",
      bc: "Sub-Second Barcode Scanning & Instant Total",
      legacyPos: "Cloud latency lag (1-3 sec delays)",
      genericErp: "Clunky accounting-first screens",
      nicheRepair: "Manual ticket creation required",
    },
    {
      capability: "Offline Selling Protection",
      bc: "Zero-Downtime Offline + Auto Background Sync",
      legacyPos: "Basic cache (frequent conflicts)",
      genericErp: "None (Strictly Cloud-Only)",
      nicheRepair: "None (Internet Required)",
    },
    {
      capability: "Remote / Pop-Up Standalone Mode",
      bc: "Built-In (No internet connection required)",
      legacyPos: "Not Supported",
      genericErp: "Not Supported",
      nicheRepair: "Not Supported",
    },
    {
      capability: "Device Repair Diagnostics",
      bc: "Multi-Device Intake & 20-Point Condition Proof",
      legacyPos: "Requires 3rd-Party Integration",
      genericErp: "Requires Custom Development",
      nicheRepair: "Basic Single-Device Ticket",
    },
    {
      capability: "Inventory & Margin Accuracy",
      bc: "True FIFO Cost Layers & Real-Time Audits",
      legacyPos: "Blind Balance Adjustments",
      genericErp: "Supported (Complex Setup)",
      nicheRepair: "Average Costing Only",
    },
    {
      capability: "Unified Customer & Order Profiles",
      bc: "Single Profile Across POS, Repair Bench & Web",
      legacyPos: "Separate Silos for Web & POS",
      genericErp: "Unified but Heavy Sync Latency",
      nicheRepair: "Repair-Only Silo",
    },
    {
      capability: "Staff Permissions & Cash Controls",
      bc: "Granular Manager, Cashier & Tech Role Controls",
      legacyPos: "Limited Single-Tier Logins",
      genericErp: "Enterprise RBAC (High Cost)",
      nicheRepair: "Basic Role Permissions",
    },
    {
      capability: "AI Business Intelligence",
      bc: "Developed AI-assisted business features with structured data queries and context-based responses",
      legacyPos: "None (Static reports only)",
      genericErp: "Complex 3rd-party BI add-on",
      nicheRepair: "None",
    },
    {
      capability: "Modular Enablement",
      bc: "7 Independent Modules (Pay for what you use)",
      legacyPos: "Rigid Bundle Tiers",
      genericErp: "Mandatory Full Suite Licensing",
      nicheRepair: "Fixed Feature Tiering",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 uppercase tracking-wider inline-block mb-3">
            Competitive Benchmarks
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            How Business Central Compares
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            An objective look at how a unified single-engine platform compares against traditional POS vendors,
            heavyweight ERP suites, and niche repair tools.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="border border-slate-200 rounded-3xl bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="py-4 px-4 sm:px-6 font-bold text-slate-700 uppercase text-xs tracking-wider">Capability</th>
                  <th className="py-4 px-4 sm:px-6 font-extrabold text-slate-900 bg-emerald-50/80 border-x border-emerald-200/80">
                    <div className="flex items-center gap-2 text-emerald-900">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                      </span>
                      <span className="text-sm font-extrabold">Business Central</span>
                    </div>
                  </th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-600">Legacy Cloud POS</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-600">Generic ERPs</th>
                  <th className="py-4 px-4 sm:px-6 font-semibold text-slate-600">Niche Repair Tools</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisons.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-slate-900">{row.capability}</td>
                    <td className="py-3.5 px-4 sm:px-6 font-bold text-emerald-950 bg-emerald-50/40 border-x border-emerald-200">
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
                          <Check className="w-3 h-3" />
                        </div>
                        <span className="leading-relaxed">{row.bc}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-500">{row.legacyPos}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-500">{row.genericErp}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-slate-500">{row.nicheRepair}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
