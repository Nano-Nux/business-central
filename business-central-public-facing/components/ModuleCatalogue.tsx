"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  ShoppingBag,
  Layers,
  Wrench,
  Calendar,
  DollarSign,
  HeartPulse,
  CheckCircle2,
  TrendingUp,
  Users,
  Check,
} from "lucide-react";

export default function ModuleCatalogue() {
  const [selectedModule, setSelectedModule] = useState<string>("REPAIR");

  const modules = [
    {
      code: "CORE",
      name: "Platform Foundation & Permissions",
      icon: ShieldCheck,
      badge: "Included with every plan",
      tagline: "Role-based staff permissions, customer master, and unified product catalog.",
      description:
        "The foundation of your business. Manage your stores, assign roles to managers, cashiers, and repair technicians, maintain unified customer purchase histories, and organize your product catalog across all locations.",
      impact: "Eliminates duplicate entries and ensures staff only access their permitted screens and stores.",
      highlights: [
        "Staff permissions (Manager, Cashier, Technician)",
        "Unified customer profiles across all stores",
        "Centralized product catalog with barcodes and SKUs",
        "Safe multi-store access control",
      ],
      features: [
        "Granular role-based security preventing unauthorized discounts",
        "Customer purchase histories accessible at any register",
        "Support for product variants, sizes, and serial numbers",
        "Developed AI-assisted business features with structured data queries and context-based responses",
        "Full audit log of manager overrides and price adjustments",
      ],
    },
    {
      code: "POS",
      name: "Point-of-Sale & Cashiering",
      icon: ShoppingBag,
      badge: "Retail & Counter Checkout",
      tagline: "High-speed cashiering, split tender, offline protection, and receipt printing.",
      description:
        "Engineered for sub-second counter workflows. Scan barcodes, apply discounts, accept cash, cards, and split payments, and print thermal ESC/POS receipts. Works seamlessly even when store internet drops.",
      impact: "Keeps checkout lines moving fast and reconciles cash drawer shifts in under 3 minutes.",
      highlights: [
        "Sub-second barcode scanning & item lookup",
        "Split tender (Cash, Card, Store Credit)",
        "Thermal receipt printer & cash drawer support",
        "Cashier shift open/close audit with variance alerts",
      ],
      features: [
        "Instant search across tens of thousands of SKUs",
        "Hold cart and layaway management for busy counters",
        "Custom tax rules and automatic calculation",
        "Zero downtime: keeps selling when Wi-Fi cuts out",
      ],
    },
    {
      code: "INVENTORY",
      name: "Multi-Store FIFO Inventory",
      icon: Layers,
      badge: "Stock & Warehouse",
      tagline: "Immutable movement records, true FIFO profit margins, and inter-store transfers.",
      description:
        "Know exactly where every item and spare part is located. Stock is tracked using First-In, First-Out (FIFO) costing, giving you actual profit margins instead of rough estimates.",
      impact: "Stops inventory shrinkage and alerts you before popular items run out of stock.",
      highlights: [
        "Multi-warehouse & store-to-store transfers",
        "True FIFO profit margin calculation",
        "Low-stock alerts & automated purchase orders",
        "100% audit trail of every stock adjustment",
      ],
      features: [
        "Never lose track of items moved between store locations",
        "True cost-of-goods-sold based on batch purchase prices",
        "Fast barcode cycle counting for staff stocktakes",
        "Supplier purchase order generation and intake receiving",
      ],
    },
    {
      code: "REPAIR",
      name: "Device Repair & Diagnostics Hub",
      icon: Wrench,
      badge: "Electronics & Service Depots",
      tagline: "Multi-device intake, 20-point diagnostic checklists, technician stations, and parts tracking.",
      description:
        "Complete repair workflow from intake to pickup. Record intake condition notes and photos to avoid customer disputes, assign tickets to technician workbenches, and automatically deduct consumed replacement parts from inventory.",
      impact: "Eliminates customer damage disputes and cuts repair intake bench time by over 30 minutes.",
      highlights: [
        "Multi-device tickets (e.g. laptop + phone together)",
        "20-point intake condition inspection checklist",
        "Automatic spare part deduction upon use",
        "Estimated waiting times and customer status SMS",
      ],
      features: [
        "Intake photo capture to prove pre-existing scratches or cracks",
        "Track technician productivity and repair turnaround times",
        "Parts automatically deducted at actual FIFO cost",
        "Automatic 90-day warranty tracking on completed repairs",
      ],
    },
    {
      code: "SERVICE",
      name: "Scheduled Field & In-Store Service",
      icon: Calendar,
      badge: "Appointments & Dispatch",
      tagline: "Customer appointment bookings, technician dispatch, and billable labor.",
      description:
        "Organize appointments for in-store service consultations or on-site field visits. Assign technicians based on availability and combine labor hours with replacement parts into one clean invoice.",
      impact: "Keeps technicians fully booked and bundles service labor directly into customer invoices.",
      highlights: [
        "Interactive appointment calendar",
        "Technician scheduling & job dispatch",
        "Combined labor hours and parts billing",
        "Direct checkout at front counter or on mobile",
      ],
      features: [
        "Prevent double-booking technician benches or field staff",
        "Track billable vs non-billable service labor",
        "Mobile-friendly technician status updates",
        "One-click invoice conversion for front-counter payment",
      ],
    },
    {
      code: "ACCOUNTING",
      name: "Financial Reporting & General Ledger",
      icon: DollarSign,
      badge: "Financial Governance",
      tagline: "Automated double-entry journals, sales tax reports, and audit-ready exports.",
      description:
        "Every sale, refund, and consumed repair part is automatically posted to your general ledger. Generates accurate Profit & Loss statements and exports clean CSV reports formatted for your accountant.",
      impact: "Saves dozens of bookkeeping hours each month and gives you accurate daily profit figures.",
      highlights: [
        "Automatic daily revenue and refund reconciliation",
        "Sales tax reporting across multiple jurisdictions",
        "True gross margin tracking by store and product",
        "One-click exports for QuickBooks, Xero, or spreadsheets",
      ],
      features: [
        "Real-time visibility into net profit by store location",
        "Automated cost-of-goods-sold linked to inventory movements",
        "Cash drawer over/short discrepancy tracking",
        "Period-end close reports with complete audit trails",
      ],
    },
    {
      code: "CLINICAL",
      name: "Clinical & Healthcare Records",
      icon: HeartPulse,
      badge: "Specialized Encounters",
      tagline: "Secure patient intake, digital consent capture, and confidential encounter histories.",
      description:
        "Optional compliance extension for optometry, dental, or medical service clinics. Keeps patient health intake confidential while integrating with your front-counter scheduling and billing.",
      impact: "Safeguards patient privacy while unifying appointments and billing under one system.",
      highlights: [
        "Confidential patient records with access controls",
        "Digital signature capture for consent forms",
        "Encounter histories linked to billing",
        "Audit logs aligned with healthcare compliance",
      ],
      features: [
        "Separate permissions for clinical staff vs retail staff",
        "Secure storage for intake forms and treatment notes",
        "Unified checkout for consultation and retail products",
        "Exportable compliance and patient visit logs",
      ],
    },
  ];

  const currentMod = modules.find((m) => m.code === selectedModule) || modules[3];

  const getModuleTheme = (code: string) => {
    switch (code) {
      case "CORE":
        return {
          btnActive: "bg-slate-900 border-slate-900 text-white shadow-md",
          panelBg: "bg-slate-50",
          badge: "bg-slate-100 text-slate-800 border-slate-300",
          iconColor: "text-slate-700",
        };
      case "POS":
        return {
          btnActive: "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/30",
          panelBg: "bg-emerald-50/40 border-emerald-200",
          badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
          iconColor: "text-emerald-600",
        };
      case "INVENTORY":
        return {
          btnActive: "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/30",
          panelBg: "bg-amber-50/40 border-amber-200",
          badge: "bg-amber-50 text-amber-700 border-amber-200",
          iconColor: "text-amber-600",
        };
      case "REPAIR":
        return {
          btnActive: "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30",
          panelBg: "bg-indigo-50/40 border-indigo-200",
          badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
          iconColor: "text-indigo-600",
        };
      case "SERVICE":
        return {
          btnActive: "bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-600/30",
          panelBg: "bg-violet-50/40 border-violet-200",
          badge: "bg-violet-50 text-violet-700 border-violet-200",
          iconColor: "text-violet-600",
        };
      case "ACCOUNTING":
        return {
          btnActive: "bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-600/30",
          panelBg: "bg-sky-50/40 border-sky-200",
          badge: "bg-sky-50 text-sky-700 border-sky-200",
          iconColor: "text-sky-600",
        };
      case "CLINICAL":
        return {
          btnActive: "bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-600/30",
          panelBg: "bg-rose-50/40 border-rose-200",
          badge: "bg-rose-50 text-rose-700 border-rose-200",
          iconColor: "text-rose-600",
        };
      default:
        return {
          btnActive: "bg-slate-900 border-slate-900 text-white",
          panelBg: "bg-slate-50",
          badge: "bg-slate-100 text-slate-700 border-slate-200",
          iconColor: "text-slate-600",
        };
    }
  };

  const currentTheme = getModuleTheme(currentMod.code);

  return (
    <section id="modules" className="py-16 md:py-24 bg-white border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider inline-block mb-3">
            Modular Architecture
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Tailor the Platform to Your Business
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            Enable only the capabilities you need. A retail boutique runs <code className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">CORE</code> + <code className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">POS</code>,
            while an electronics repair franchise enables <code className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">REPAIR</code> + <code className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">INVENTORY</code> + <code className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">ACCOUNTING</code>.
          </p>
        </div>

        {/* Module Selector Buttons */}
        <div className="flex items-center justify-start lg:justify-center gap-2 overflow-x-auto pb-3 mb-8">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const isSelected = mod.code === selectedModule;
            const modTheme = getModuleTheme(mod.code);
            return (
              <button
                key={mod.code}
                onClick={() => setSelectedModule(mod.code)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? `${modTheme.btnActive} scale-105`
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 hover:-translate-y-0.5"
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? "text-white" : modTheme.iconColor}`} />
                <span>{mod.code}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Module Detail Panel */}
        <div className={`p-6 sm:p-10 rounded-3xl border border-slate-200 ${currentTheme.panelBg} shadow-sm hover:shadow-lg transition-all duration-300`}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Info & Features */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${currentTheme.badge}`}>
                    {currentMod.badge}
                  </span>
                  <span className="text-xs text-slate-500 font-mono font-medium">Module: {currentMod.code}</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {currentMod.name}
                </h3>
                <p className="text-sm font-semibold text-slate-800 mt-1.5">{currentMod.tagline}</p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mt-2.5">{currentMod.description}</p>
              </div>

              {/* Feature bullets */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Daily Operational Benefits
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {currentMod.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-white/90 backdrop-blur-xs border border-slate-200/90 text-slate-700 hover:border-slate-300 hover:shadow-xs transition-all">
                      <CheckCircle2 className={`w-4 h-4 ${currentTheme.iconColor} shrink-0 mt-0.5`} />
                      <span className="leading-relaxed font-medium">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Business Impact & Operational Highlights */}
            <div className="lg:col-span-5 space-y-4">
              {/* Business Impact Card */}
              <div className="p-6 rounded-2xl bg-white border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-emerald-100 font-bold text-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-emerald-950 font-bold">Business Impact &amp; Bottom Line</span>
                </div>
                <p className="text-slate-700 leading-relaxed pt-1">
                  {currentMod.impact}
                </p>
              </div>

              {/* Operational Highlights */}
              <div className="p-6 rounded-2xl bg-white border border-indigo-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200 space-y-3 text-xs">
                <div className="flex items-center gap-2 pb-2.5 border-b border-indigo-100 font-bold text-slate-900">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-indigo-950 font-bold">Key Staff Highlights</span>
                </div>
                <div className="space-y-2 pt-1">
                  {currentMod.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-slate-700 font-medium">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zero Lock-in guarantee */}
              <div className="p-3.5 rounded-xl bg-slate-100/90 border border-slate-200 text-xs text-slate-600 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Modules can be toggled on or off at any time as your business grows.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
