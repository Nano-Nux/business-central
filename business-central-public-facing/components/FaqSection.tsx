"use client";

import React, { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState("");

  const faqs = [
    {
      q: "How does offline protection work if our store internet cuts out?",
      a: "Your registers never freeze. When your Wi-Fi or broadband drops, the register keeps scanning barcodes, ringing up customers, and printing receipts without delay. All transactions are securely stored locally on your device. The instant connectivity returns, everything syncs automatically to your central cloud dashboard with zero duplicate charges and zero lost inventory records.",
    },
    {
      q: "Can our store operate exclusively with POS and Inventory, without the Repair module?",
      a: "Yes. Business Central is completely modular. If you only run retail, your staff only see POS and Inventory screens. If you operate an electronics or device repair depot, you can enable repair tickets and service workbenches. You only pay for what you use, keeping your staff interface fast, focused, and uncluttered.",
    },
    {
      q: "What receipt printers, barcode scanners, and cash drawers are supported?",
      a: "You are never locked into proprietary hardware. We support industry-standard thermal receipt printers (Epson, Star Micronics via USB, Ethernet, or Bluetooth), standard USB/Bluetooth 1D/2D barcode scanners (Zebra, Honeywell), and standard cash drawers connected via RJ11 printer kickout.",
    },
    {
      q: "How is Business Central hosted, backed up, and secured?",
      a: "Business Central is delivered as a secure cloud platform with 99.99% uptime, automated continuous cloud backups, and end-to-end encryption. Your store data is protected by enterprise-grade tenant isolation, ensuring only authorized members of your team can access your financials and customer records. Dedicated private cloud hosting is also available for enterprise chains.",
    },
    {
      q: "Can we use Business Central in remote locations with zero internet?",
      a: "Yes. Business Central offers a dedicated standalone offline mode designed for pop-up kiosks, remote field locations, and trade shows. You can ring up sales, manage stock, and print receipts indefinitely without any internet connection.",
    },
    {
      q: "How easily can we migrate our data from our existing POS or repair software?",
      a: "We provide simple, guided import tools and dedicated onboarding assistance. You can bring over all your existing customer lists, product catalogs with variants, supplier records, and opening stock levels from systems like Lightspeed, Square, Shopify, or RepairQ with zero downtime.",
    },
    {
      q: "Does Business Central offer AI-assisted business features?",
      a: "Yes. We have developed AI-assisted business features with structured data queries and context-based responses. Instead of manually combing through complex reporting tabs, store owners can ask natural language questions—such as inventory reorder recommendations, technician turnaround rates, and top-selling product categories—and receive immediate, accurate responses derived directly from verified store data.",
    },
  ];

  const filteredFaqs = faqs.filter(
    (item) =>
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section id="faq" className="py-16 md:py-24 bg-white border-b border-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center mb-12">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider inline-block mb-3">
            Knowledge &amp; Support
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            Everything you need to know about tenant isolation, offline delta synchronization,
            and modular platform configuration.
          </p>

          {/* Search bar */}
          <div className="mt-7 relative max-w-md mx-auto">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 hover:border-indigo-300 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all shadow-xs"
            />
          </div>
        </div>

        {/* Accordion list */}
        <div className="space-y-3">
          {filteredFaqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isOpen
                    ? "border-emerald-300 shadow-sm bg-emerald-50/20"
                    : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <span className={`font-bold text-sm sm:text-base transition-colors ${isOpen ? "text-emerald-950" : "text-slate-900"}`}>
                    {faq.q}
                  </span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isOpen ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 pt-1 text-slate-600 text-xs sm:text-sm leading-relaxed border-t border-emerald-100/70 animate-in fade-in-50 duration-150">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
