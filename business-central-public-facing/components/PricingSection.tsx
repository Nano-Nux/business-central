"use client";

import React, { useState } from "react";
import { Check, ArrowRight } from "lucide-react";

interface PricingSectionProps {
  onOpenDemoModal: () => void;
}

export default function PricingSection({ onOpenDemoModal }: PricingSectionProps) {
  const [annual, setAnnual] = useState(false);

  const tiers = [
    {
      name: "Starter Merchant",
      badge: "Single Location",
      desc: "For standalone retail stores or boutique service shops demanding high reliability.",
      monthlyPrice: 80000,
      annualPrice: 64000,
      popular: false,
      features: [
        "1 Store Location & up to 3 Active Registers",
        "Modules: CORE + POS + INVENTORY",
        "Continuous Offline Selling Protection",
        "Unified Customer Database & Product Catalog",
        "Standard Receipt Printer & Cash Drawer Support",
        "Standard Email & Chat Support",
      ],
      cta: "Start Free Sandbox",
    },
    {
      name: "Growth Omnichannel",
      badge: "Most Popular",
      desc: "For multi-location retail chains and active electronics repair workshops.",
      monthlyPrice: 150000,
      annualPrice: 120000,
      popular: true,
      features: [
        "Up to 5 Store Locations & Unlimited Registers",
        "Modules: CORE + POS + INVENTORY + REPAIR + SERVICE",
        "Automatic Background Sync & Register Reconcile",
        "Multi-Device Repair Intake & Condition Checks",
        "Real-Time FIFO Inventory & Margin Audits",
        "AI-assisted business features with structured data queries and context-based responses",
        "Priority 24/7 Support with 1-hr Response SLA",
      ],
      cta: "Schedule 14-Day Trial",
    },
    {
      name: "Enterprise Multi-Store",
      badge: "Franchise & Scale",
      desc: "For multi-store chains requiring custom SLAs, dedicated infrastructure, and rollout support.",
      monthlyPrice: 400000,
      annualPrice: 320000,
      popular: false,
      features: [
        "Unlimited Store Locations & Registers",
        "All 7 Modules Unlocked (incl. Accounting & Clinical)",
        "Dedicated High-Availability Cloud Infrastructure",
        "AI-assisted business features with structured data queries and context-based responses",
        "Optional Standalone Offline Setup for Remote Facilities",
        "Custom ERP Integrations & Data Migration Assistance",
        "99.99% Guaranteed SLA + Dedicated Account Manager",
      ],
      cta: "Contact Enterprise Sales",
    },
  ];

  return (
    <section id="pricing" className="py-14 md:py-20 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Transparent, Predictable Pricing
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">
            No hidden payment gateway surcharges or forced bundle fees. Pay only for the locations and modules you operate.
          </p>

          {/* Billing Switcher */}
          <div className="mt-6 inline-flex items-center gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              onClick={() => setAnnual(false)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !annual ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                annual ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {tiers.map((tier, i) => {
            const price = annual ? tier.annualPrice : tier.monthlyPrice;
            return (
              <div
                key={i}
                className={`rounded-3xl p-7 sm:p-9 flex flex-col justify-between transition-all duration-300 ${
                  tier.popular
                    ? "border-2 border-emerald-500 bg-white shadow-2xl shadow-emerald-500/15 hover:-translate-y-2 relative"
                    : "border border-slate-200 bg-white shadow-sm hover:shadow-xl hover:border-slate-300 hover:-translate-y-2"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-200 animate-pulse"></span>
                    <span>Most Popular</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                      tier.popular
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : i === 2
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}>
                      {tier.badge}
                    </span>
                  </div>

                  <h3 className="text-2xl font-extrabold text-slate-900 mb-1 tracking-tight">{tier.name}</h3>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">{tier.desc}</p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-6 pb-6 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">MMK</span>
                    <span className={`text-4xl font-black tracking-tight ${tier.popular ? "text-emerald-700" : "text-slate-900"}`}>
                      {price.toLocaleString()}
                    </span>
                    <span className="text-xs font-medium text-slate-500">/ month</span>
                  </div>

                  {/* Features */}
                  <div className="space-y-2 mb-8 text-xs text-slate-700">
                    {tier.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-1 rounded-md hover:bg-slate-50 transition-colors">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          tier.popular ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                        }`}>
                          <Check className="w-3 h-3" />
                        </div>
                        <span className="leading-relaxed font-medium">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={onOpenDemoModal}
                  className={`w-full py-3.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer ${
                    tier.popular
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                      : i === 2
                      ? "bg-slate-900 hover:bg-slate-800 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                      : "bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 hover:border-slate-400 shadow-xs hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                >
                  <span>{tier.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
