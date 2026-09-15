"use client";

import React, { useState } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import HeroInteractiveSimulator from "@/components/HeroInteractiveSimulator";
import ModuleCatalogue from "@/components/ModuleCatalogue";
import StoreOperations from "@/components/StoreOperations";
import OfflineSyncDeepDive from "@/components/OfflineSyncDeepDive";
import RoiCalculator from "@/components/RoiCalculator";
import ComparisonTable from "@/components/ComparisonTable";
import PricingSection from "@/components/PricingSection";
import TestimonialsAndMetrics from "@/components/TestimonialsAndMetrics";
import FaqSection from "@/components/FaqSection";
import DemoModal from "@/components/DemoModal";
import Footer from "@/components/Footer";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const scrollToSandbox = () => {
    const el = document.getElementById("interactive-demo");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-slate-900 selection:text-white">
      {/* Navigation Header */}
      <Navbar onOpenDemoModal={() => setDemoModalOpen(true)} />

      {/* Main Page Flow */}
      <main className="flex-1 flex flex-col">
        {/* 1. Hero Section */}
        <Hero
          onOpenDemoModal={() => setDemoModalOpen(true)}
          onExploreSandbox={scrollToSandbox}
        />

        {/* 2. Interactive Product Sandbox Simulator */}
        <HeroInteractiveSimulator />

        {/* 3. Daily Store Operations & Hardware */}
        <StoreOperations onOpenDemoModal={() => setDemoModalOpen(true)} />

        {/* 4. Module Catalogue */}
        <ModuleCatalogue />

        {/* 5. Edge Offline Protocol Deep-Dive */}
        <OfflineSyncDeepDive />

        {/* 6. Interactive ROI & Cost Calculator */}
        <RoiCalculator onOpenDemoModal={() => setDemoModalOpen(true)} />

        {/* 7. Detailed Comparison Table */}
        <ComparisonTable />

        {/* 8. Verified Customer Testimonials & Metrics */}
        <TestimonialsAndMetrics />

        {/* 9. Transparent Pricing */}
        <PricingSection onOpenDemoModal={() => setDemoModalOpen(true)} />

        {/* 10. Searchable FAQ */}
        <FaqSection />

        {/* 11. High-Converting Conversion Banner */}
        <section id="cta-banner" aria-labelledby="cta-heading" className="py-16 md:py-24 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative rounded-3xl p-8 sm:p-16 bg-slate-950 text-white shadow-xl border border-slate-800 text-center overflow-hidden">
              <div className="relative z-10">
                <span className="text-xs font-bold px-3.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 inline-block mb-4 shadow-xs">
                  Unify Your Operations Today
                </span>

                <h2 id="cta-heading" className="text-3xl sm:text-5xl font-black text-white tracking-tight max-w-3xl mx-auto leading-tight">
                  Ready to upgrade your store and repair management?
                </h2>

                <p className="mt-4 text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
                  Join forward-thinking retailers and electronics service chains running on sub-second checkout,
                  strict FIFO stock valuation, and zero-downtime offline mobility.
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                  <button
                    id="btn-cta-walkthrough"
                    onClick={() => setDemoModalOpen(true)}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Request Platform Walkthrough</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    id="btn-cta-interactive-demo"
                    onClick={scrollToSandbox}
                    className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-white font-semibold text-sm border border-slate-700 hover:border-slate-600 shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
                  >
                    Try Interactive Demo
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-5 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Free 14-day evaluation
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    No credit card required
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Full onboarding support
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <Footer />

      {/* Demo Booking Modal */}
      <DemoModal isOpen={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  );
}
