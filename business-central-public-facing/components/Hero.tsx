"use client";

import React from "react";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Database,
  Wifi,
  CheckCircle2,
  Barcode,
  WifiOff,
  Sparkles,
} from "lucide-react";

interface HeroProps {
  onOpenDemoModal: () => void;
  onExploreSandbox: () => void;
}

export default function Hero({ onOpenDemoModal, onExploreSandbox }: HeroProps) {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-slate-950 text-white border-b border-slate-800">
      {/* High-tech architectural dot grid background */}
      <div className="absolute inset-0 bg-dark-grid hero-grid-mask opacity-50 pointer-events-none -z-10" />

      {/* Floating Decorative Card Left (Live POS Scan) */}
      <div className="hidden xl:flex absolute left-6 2xl:left-14 top-40 animate-float-slow z-10 pointer-events-none">
        <div className="relative p-4 bg-slate-900 rounded-2xl border border-emerald-500/40 shadow-xl flex items-center gap-3.5 max-w-[260px] hover:scale-105 transition-transform duration-300">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Barcode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-white tracking-tight">Scan: PRT-DISP-15P</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono mt-0.5">
              <span className="font-bold text-emerald-400">+$189.00</span> &bull; 0.2s instant total
            </div>
          </div>
        </div>
      </div>

      {/* Floating Decorative Card Right (Zero Lost Sales) */}
      <div className="hidden xl:flex absolute right-6 2xl:right-14 top-48 animate-float-delayed z-10 pointer-events-none">
        <div className="relative p-4 bg-slate-900 rounded-2xl border border-sky-500/40 shadow-xl flex items-center gap-3.5 max-w-[270px] hover:scale-105 transition-transform duration-300">
          <div className="w-10 h-10 rounded-xl bg-sky-950 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-white tracking-tight">Wi-Fi Disconnected</span>
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">
                ACTIVE
              </span>
            </div>
            <div className="text-[11px] text-sky-300 font-mono mt-0.5">
              0 Lost Sales &bull; Auto-syncing
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          {/* Announcement Pill */}
          <button
            id="btn-hero-announcement"
            onClick={onExploreSandbox}
            className="group inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-700 shadow-md hover:border-emerald-400 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 mb-6 cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="text-xs font-semibold text-slate-100">Business Central Platform v2.6</span>
            <span className="text-slate-600">|</span>
            <span className="text-xs text-slate-300 flex items-center gap-1.5 group-hover:text-emerald-300 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>AI-Assisted Intelligence Included</span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Headline with Solid Emerald Accent */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.12]">
            Point of sale, device repair, and inventory.{" "}
            <span className="text-emerald-400">
              Built as one.
            </span>
          </h1>

          {/* Subtitle with High-Clarity Typography */}
          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 max-w-2xl leading-relaxed">
            Replace disconnected SaaS tools with a single, high-performance platform.
            Fast front-counter checkout, multi-device repair diagnostics, and FIFO stock valuation—engineered to work seamlessly online or completely offline.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full sm:w-auto">
            <button
              id="btn-hero-explore-demo"
              onClick={onExploreSandbox}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Explore Interactive Demo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              id="btn-hero-schedule-walkthrough"
              onClick={onOpenDemoModal}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-100 font-semibold text-sm shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Schedule a Walkthrough</span>
            </button>
          </div>

          {/* Interactive Feature Checklist Capsules */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 max-w-3xl">
            {[
              "Unified Customer & Order History",
              "Continuous Offline Selling Protection",
              "Granular Staff & Cash Controls",
              "Zero Hardware Lock-In",
            ].map((item, idx) => (
              <div
                key={idx}
                className="px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 hover:bg-slate-800 transition-all duration-200 flex items-center gap-2 text-xs cursor-default shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Metrics Ribbon Cards: Each with a Unique Solid Color Theme */}
          <div className="mt-12 w-full grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
            {[
              {
                label: "Checkout Speed",
                val: "Sub-Second",
                desc: "Instant barcode scan & total",
                icon: Zap,
                borderHover: "group-hover:border-emerald-400",
                accentBar: "bg-emerald-500",
                iconBg: "bg-emerald-950 border-emerald-700 text-emerald-400",
                valColor: "text-emerald-400",
              },
              {
                label: "Offline Selling",
                val: "0 Lost Sales",
                desc: "Keep selling when Wi-Fi cuts out",
                icon: Wifi,
                borderHover: "group-hover:border-sky-400",
                accentBar: "bg-sky-500",
                iconBg: "bg-sky-950 border-sky-700 text-sky-400",
                valColor: "text-sky-400",
              },
              {
                label: "Stock Accuracy",
                val: "100% Audit",
                desc: "True FIFO margins & no shrinkage",
                icon: Database,
                borderHover: "group-hover:border-amber-400",
                accentBar: "bg-amber-500",
                iconBg: "bg-amber-950 border-amber-700 text-amber-400",
                valColor: "text-amber-400",
              },
              {
                label: "Staff Control",
                val: "Role-Based",
                desc: "Managers, cashiers & tech roles",
                icon: ShieldCheck,
                borderHover: "group-hover:border-indigo-400",
                accentBar: "bg-indigo-500",
                iconBg: "bg-indigo-950 border-indigo-700 text-indigo-400",
                valColor: "text-indigo-400",
              },
            ].map((metric, i) => {
              const Icon = metric.icon;
              return (
                <div
                  key={i}
                  className={`relative p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md ${metric.borderHover} hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 text-left group overflow-hidden cursor-default`}
                >
                  {/* Top Solid Color Accent Bar */}
                  <div className={`absolute top-0 left-0 right-0 h-1 ${metric.accentBar}`} />

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {metric.label}
                    </span>
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${metric.iconBg}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className={`text-2xl font-bold tracking-tight transition-colors ${metric.valColor}`}>
                    {metric.val}
                  </div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    {metric.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
