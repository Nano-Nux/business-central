"use client";

import React from "react";
import {
  ShoppingBag,
  Wrench,
  Layers,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface StoreOperationsProps {
  onOpenDemoModal: () => void;
}

export default function StoreOperations({ onOpenDemoModal }: StoreOperationsProps) {
  const pillars = [
    {
      icon: ShoppingBag,
      title: "At the Front Counter",
      subtitle: "Point of Sale & Fast Cashiering",
      themeBg: "bg-emerald-50/40",
      borderHover: "hover:border-emerald-300",
      topBar: "bg-emerald-500",
      iconBg: "bg-emerald-600 text-white shadow-sm",
      subtitleColor: "text-emerald-700 font-bold",
      checkColor: "text-emerald-600",
      desc: "Speed up lines and keep customers smiling. Barcode scanning and customer lookup happen in milliseconds. Accept cards, cash, or split tenders, and print ESC/POS thermal receipts with zero lag.",
      points: [
        "Sub-second barcode scanning across 80,000+ SKUs",
        "Split-tender payments with automatic cash drawer kickout",
        "Unified customer history for instant return and warranty lookups",
        "Cashier shift reconciliation with variance tracking",
      ],
    },
    {
      icon: Wrench,
      title: "At the Service Bench",
      subtitle: "Device Repair & Diagnostics Hub",
      themeBg: "bg-indigo-50/40",
      borderHover: "hover:border-indigo-300",
      topBar: "bg-indigo-600",
      iconBg: "bg-indigo-600 text-white shadow-sm",
      subtitleColor: "text-indigo-700 font-bold",
      checkColor: "text-indigo-600",
      desc: "Eliminate customer damage disputes and cut repair intake bench time. Complete 20-point condition inspection checklists with photo proof, assign jobs to technicians, and automatically deduct consumed spare parts.",
      points: [
        "Multi-device intake tickets (e.g. laptop + smartphone)",
        "20-point intake condition checklists with photo uploads",
        "Automatic spare parts deduction at true FIFO cost",
        "Estimated waiting times and automatic customer SMS updates",
      ],
    },
    {
      icon: Layers,
      title: "In the Stockroom",
      subtitle: "Multi-Store Inventory & True Profit",
      themeBg: "bg-amber-50/40",
      borderHover: "hover:border-amber-300",
      topBar: "bg-amber-500",
      iconBg: "bg-amber-600 text-white shadow-sm",
      subtitleColor: "text-amber-700 font-bold",
      checkColor: "text-amber-600",
      desc: "Stop inventory shrinkage before it hurts your bottom line. Track stock balances across retail stores and central warehouses with immutable movement records and true First-In, First-Out (FIFO) profit margin accounting.",
      points: [
        "Store-to-store stock transfers with digital receipt confirmation",
        "Automated low-stock alerts before items sell out",
        "True FIFO profit margins based on actual purchase costs",
        "Fast barcode cycle counting for staff inventory audits",
      ],
    },
    {
      icon: Smartphone,
      title: "Anywhere You Are",
      subtitle: "Owner Analytics & Offline Reliability",
      themeBg: "bg-sky-50/40",
      borderHover: "hover:border-sky-300",
      topBar: "bg-sky-500",
      iconBg: "bg-sky-600 text-white shadow-sm",
      subtitleColor: "text-sky-700 font-bold",
      checkColor: "text-sky-600",
      desc: "Stay in control whether you are at the store, at home, or on the road. Check live sales, staff performance, and profit margins from any phone or laptop. If your store Wi-Fi goes down, registers keep selling without interruption.",
      points: [
        "Real-time daily sales and gross profit dashboards",
        "Developed AI-assisted business features with structured data queries and context-based responses",
        "Never freezes: built-in offline protection keeps registers selling when internet cuts out",
        "Automatic background synchronization when Wi-Fi returns",
        "Role-based staff permissions preventing unauthorized discounts",
      ],
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-slate-50/70 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider inline-block mb-3">
            Unified Workflow Engine
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Built for Your Daily Store Operations
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            Business Central connects every part of your business into one seamless workflow—from
            the front checkout counter to the repair workbench and backroom inventory.
          </p>
        </div>

        {/* 4 Operations Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={i}
                className={`relative p-6 sm:p-8 rounded-2xl border border-slate-200 ${p.themeBg} shadow-sm hover:shadow-xl ${p.borderHover} hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group overflow-hidden`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${p.topBar} opacity-80 group-hover:opacity-100 transition-opacity duration-300`} />
                <div>
                  <div className={`w-12 h-12 rounded-2xl ${p.iconBg} flex items-center justify-center mb-5 group-hover:scale-105 transition-all duration-200`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className={`text-xs uppercase tracking-wider mb-1 ${p.subtitleColor}`}>
                    {p.subtitle}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-slate-950 transition-colors">{p.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
                    {p.desc}
                  </p>

                  <div className="space-y-2 pt-3 border-t border-slate-200/80 text-xs text-slate-700">
                    {p.points.map((pt, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-1 rounded-md hover:bg-white/80 transition-colors">
                        <CheckCircle2 className={`w-4 h-4 ${p.checkColor} shrink-0 mt-0.5`} />
                        <span className="leading-relaxed font-medium">{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner */}
        <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-300 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3.5 text-slate-700">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base text-slate-900">Zero Hardware Lock-In</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Works with your existing receipt printers (Epson, Star), barcode scanners, cash drawers, and card terminals.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenDemoModal}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 shrink-0 flex items-center gap-1.5 group cursor-pointer"
          >
            <span>Schedule Store Walkthrough</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </section>
  );
}
