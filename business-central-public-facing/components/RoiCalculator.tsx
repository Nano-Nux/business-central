"use client";

import React, { useState } from "react";
import {
  DollarSign,
  Clock,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

interface RoiCalculatorProps {
  onOpenDemoModal: () => void;
}

export default function RoiCalculator({ onOpenDemoModal }: RoiCalculatorProps) {
  const [locations, setLocations] = useState<number>(3);
  const [ordersPerMonth, setOrdersPerMonth] = useState<number>(2400);
  const [techCount, setTechCount] = useState<number>(4);

  // Business calculations based on benchmark research
  const totalHoursSavedMonthly = locations * 32 + techCount * 18;
  const downtimeSavedAnnual = Math.round(locations * 4.2 * 450);
  const laborSavingsAnnual = Math.round(totalHoursSavedMonthly * 24 * 12);
  const saasConsolidationSavingsAnnual = Math.round(locations * 280 * 12);
  const totalAnnualValue = laborSavingsAnnual + downtimeSavedAnnual + saasConsolidationSavingsAnnual;

  return (
    <section id="roi-calculator" className="py-14 md:py-20 bg-slate-50/50 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Return on Investment Estimator
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">
            Consolidating separate POS, repair ticketing, and inventory tools into Business Central
            reduces staff labor hours and protects against network outage losses.
          </p>
        </div>

        {/* Calculator Main Box */}
        <div className="p-6 sm:p-8 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Sliders */}
            <div className="lg:col-span-7 space-y-6">
              {/* Slider 1: Locations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-900">Active Retail &amp; Service Locations</span>
                  <span className="font-bold text-emerald-800 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs shadow-xs">
                    {locations} {locations === 1 ? "Store" : "Stores"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={locations}
                  onChange={(e) => setLocations(parseInt(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>1 Store</span>
                  <span>15 Stores</span>
                  <span>30+ Stores</span>
                </div>
              </div>

              {/* Slider 2: Monthly Orders */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-900">Monthly Transactions per Store</span>
                  <span className="font-bold text-indigo-800 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-xs shadow-xs">
                    {ordersPerMonth.toLocaleString()} Orders / mo
                  </span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="15000"
                  step="100"
                  value={ordersPerMonth}
                  onChange={(e) => setOrdersPerMonth(parseInt(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>300 / mo</span>
                  <span>7,500 / mo</span>
                  <span>15,000+ / mo</span>
                </div>
              </div>

              {/* Slider 3: Technicians */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-900">Repair Technicians &amp; Bench Staff</span>
                  <span className="font-bold text-violet-800 px-3 py-1 rounded-full bg-violet-50 border border-violet-200 text-xs shadow-xs">
                    {techCount} {techCount === 1 ? "Technician" : "Technicians"}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={techCount}
                  onChange={(e) => setTechCount(parseInt(e.target.value))}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>0 (Retail only)</span>
                  <span>10 Techs</span>
                  <span>20+ Techs</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Benchmarks reflect sub-second checkout, automated FIFO part deduction, and zero outage downtime.</span>
              </div>
            </div>

            {/* Right: Value Calculation Summary */}
            <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-slate-900 text-white flex flex-col justify-between shadow-xl border border-slate-800 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Estimated Annual Benefit</span>
                  <span className="text-emerald-300 font-bold px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 shadow-xs">
                    Consolidated Value
                  </span>
                </div>

                <div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight text-emerald-400">
                    ${totalAnnualValue.toLocaleString()}
                    <span className="text-sm font-semibold text-slate-400 ml-1.5">/ year</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Total projected operational, downtime, and SaaS consolidation savings</p>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-slate-800/90 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 text-slate-300 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-slate-200">Staff Labor Hours Saved</span>
                    </div>
                    <span className="text-emerald-300 font-bold">{totalHoursSavedMonthly} hrs / mo</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-sky-500/30 text-slate-300 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-sky-950/80 border border-sky-500/40 flex items-center justify-center text-sky-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-slate-200">Outage Revenue Protected</span>
                    </div>
                    <span className="text-sky-300 font-bold">${downtimeSavedAnnual.toLocaleString()} / yr</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-indigo-500/30 text-slate-300 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <DollarSign className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-medium text-slate-200">SaaS Tool Consolidation</span>
                    </div>
                    <span className="text-indigo-300 font-bold">${saasConsolidationSavingsAnnual.toLocaleString()} / yr</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-800/90 relative z-10">
                <button
                  onClick={onOpenDemoModal}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
                >
                  <span>Review Savings with a Specialist</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
