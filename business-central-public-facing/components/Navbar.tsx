"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  ShoppingBag,
  Wrench,
  WifiOff,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
} from "lucide-react";

interface NavbarProps {
  onOpenDemoModal: () => void;
}

export default function Navbar({ onOpenDemoModal }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsDropdown, setSolutionsDropdown] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs py-3"
          : "bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 py-3.5 shadow-lg shadow-black/20"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo */}
          <a href="#" className="flex items-center gap-2.5 group">
            <div className={`relative w-8 h-8 rounded-lg overflow-hidden border shadow-xs bg-white p-0.5 flex items-center justify-center transition-all ${
              scrolled ? "border-slate-200 group-hover:border-emerald-500" : "border-slate-700 group-hover:border-emerald-400 shadow-emerald-500/10"
            }`}>
              <Image
                src="/nanonux_business_central_icon.png"
                alt="Nano Nux Business Central Logo"
                width={32}
                height={32}
                className="w-full h-full object-contain rounded-md"
                priority
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold tracking-tight transition-colors ${
                scrolled ? "text-slate-900 group-hover:text-emerald-700" : "text-white group-hover:text-emerald-300"
              }`}>
                Business Central
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                scrolled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-emerald-950/70 text-emerald-300 border-emerald-800/80"
              }`}>
                v2.6
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className={`hidden lg:flex items-center gap-1 font-medium text-sm transition-colors ${
            scrolled ? "text-slate-600" : "text-slate-300"
          }`}>
            {/* Solutions Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setSolutionsDropdown(true)}
              onMouseLeave={() => setSolutionsDropdown(false)}
            >
              <button
                id="btn-nav-capabilities-dropdown"
                aria-expanded={solutionsDropdown}
                aria-haspopup="true"
                className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  scrolled
                    ? "hover:text-slate-900 hover:bg-slate-100"
                    : "hover:text-white hover:bg-slate-800/70"
                }`}
                onClick={() => setSolutionsDropdown(!solutionsDropdown)}
              >
                Capabilities
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    solutionsDropdown ? "rotate-180 text-emerald-500" : (scrolled ? "text-slate-400" : "text-slate-400")
                  }`}
                />
              </button>

              {solutionsDropdown && (
                <div className="absolute top-full left-0 w-80 p-2.5 bg-white border border-slate-200 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-1 duration-150 z-50">
                  <div className="space-y-1.5">
                    <a
                      href="#interactive-demo"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-emerald-50/70 border border-transparent hover:border-emerald-200 transition-all group"
                      onClick={() => setSolutionsDropdown(false)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs shadow-emerald-500/30">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-900">
                          Omnichannel POS
                        </div>
                        <div className="text-xs text-slate-500">
                          High-speed touch cashiering, split tenders, and receipts
                        </div>
                      </div>
                    </a>

                    <a
                      href="#interactive-demo"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-indigo-50/70 border border-transparent hover:border-indigo-200 transition-all group"
                      onClick={() => setSolutionsDropdown(false)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs shadow-indigo-500/30">
                        <Wrench className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-900">
                          Device Repair Hub
                        </div>
                        <div className="text-xs text-slate-500">
                          Intake diagnostic checklists, technician stations, and FIFO parts
                        </div>
                      </div>
                    </a>

                    <a
                      href="#offline-sync"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-sky-50/70 border border-transparent hover:border-sky-200 transition-all group"
                      onClick={() => setSolutionsDropdown(false)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs shadow-sky-500/30">
                        <WifiOff className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 group-hover:text-sky-900">
                          Offline Protection
                        </div>
                        <div className="text-xs text-slate-500">
                          Keep selling when Wi-Fi drops with automatic cloud sync
                        </div>
                      </div>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <a
              href="#interactive-demo"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              Demo
            </a>

            <a
              href="#modules"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              Modules
            </a>

            <a
              href="#offline-sync"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              Offline Protection
            </a>

            <a
              href="#roi-calculator"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              ROI Calculator
            </a>

            <a
              href="#pricing"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              Pricing
            </a>

            <a
              href="#faq"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scrolled
                  ? "hover:text-slate-900 hover:bg-slate-100"
                  : "hover:text-white hover:bg-slate-800/70"
              }`}
            >
              FAQ
            </a>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              id="btn-nav-schedule-demo"
              onClick={onOpenDemoModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center gap-1.5 group cursor-pointer"
            >
              <span>Schedule Demo</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex lg:hidden items-center">
            <button
              id="btn-nav-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                scrolled
                  ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800"
              }`}
              aria-label="Toggle Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 p-4 bg-white border border-slate-200 rounded-xl shadow-lg animate-in fade-in duration-150">
            <div className="flex flex-col space-y-2 text-sm font-medium text-slate-700">
              <a
                href="#interactive-demo"
                className="p-2 rounded-md hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                POS &amp; Repair Sandbox
              </a>
              <a
                href="#modules"
                className="p-2 rounded-md hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Modules
              </a>
              <a
                href="#offline-sync"
                className="p-2 rounded-md hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Offline Protection
              </a>
              <a
                href="#roi-calculator"
                className="p-2 rounded-md hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                ROI Calculator
              </a>
              <a
                href="#pricing"
                className="p-2 rounded-md hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <div className="pt-3 border-t border-slate-100">
                <button
                  id="btn-nav-mobile-schedule-demo"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenDemoModal();
                  }}
                  className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-medium text-center text-sm cursor-pointer"
                >
                  Schedule Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
