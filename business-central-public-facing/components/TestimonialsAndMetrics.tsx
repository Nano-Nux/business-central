"use client";

import React from "react";
import { Star } from "lucide-react";

export default function TestimonialsAndMetrics() {
  const testimonials = [
    {
      quote:
        "We previously ran separate systems for retail sales and device repair intake. It was a constant source of inventory discrepancies. Business Central unified intake diagnostics, FIFO parts costing, and front-counter POS into one platform. Our stock shrinkage dropped to under 0.2%.",
      author: "Marcus Vance",
      title: "VP of Retail & Service Operations",
      company: "Apex Tech & Mobile Solutions",
      locations: "12 Store Locations",
      rating: 5,
      topBar: "bg-emerald-500",
      avatarBg: "bg-emerald-600 text-white shadow-sm",
      badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    {
      quote:
        "During a major regional internet blackout last holiday season, our registers kept ringing up sales without missing a beat. Over 900 transactions completed completely offline and synced to our main dashboard the moment our connection returned.",
      author: "Elena Rostova",
      title: "VP of Retail Operations",
      company: "Vanguard Electronics Retail",
      locations: "7 High-Velocity Stores",
      rating: 5,
      topBar: "bg-sky-500",
      avatarBg: "bg-sky-600 text-white shadow-sm",
      badgeBg: "bg-sky-50 text-sky-700 border-sky-200",
    },
    {
      quote:
        "The checkout speed is extraordinary—every barcode scan across our 85,000 SKUs returns immediately. The multi-device intake ticket workflow alone cut our technician bench intake time by more than 35 minutes per customer.",
      author: "David Chen",
      title: "Managing Director",
      company: "Metro Hardware & Precision Hubs",
      locations: "18 Store Depots",
      rating: 5,
      topBar: "bg-indigo-600",
      avatarBg: "bg-indigo-600 text-white shadow-sm",
      badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
  ];

  return (
    <section className="py-16 md:py-24 bg-slate-50/70 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wider inline-block mb-3">
            Verified Customer Results
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Trusted by Multi-Store Operators
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            See how high-throughput retail chains and repair workshops manage their daily checkout,
            technician workbenches, and multi-location inventory on Business Central.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="relative p-7 sm:p-8 rounded-3xl border border-slate-200/90 bg-white shadow-sm hover:shadow-xl hover:border-slate-300 hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group cursor-default overflow-hidden"
            >
              {/* Top Colored Accent Bar */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${t.topBar} opacity-90`} />

              <div>
                <div className="flex items-center justify-between mb-4">
                  {/* Rating stars */}
                  <div className="flex items-center gap-0.5 text-amber-400 group-hover:scale-105 transition-transform origin-left">
                    {[...Array(t.rating)].map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-amber-400 drop-shadow-xs" />
                    ))}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.badgeBg}`}>
                    {t.locations}
                  </span>
                </div>

                <p className="text-slate-700 text-xs sm:text-sm leading-relaxed mb-6 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl ${t.avatarBg} font-extrabold text-xs flex items-center justify-center shrink-0`}>
                  {t.author.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate">{t.author}</div>
                  <div className="text-xs text-slate-500 truncate">{t.title} &bull; {t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
