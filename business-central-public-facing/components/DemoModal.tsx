"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  X,
  CheckCircle2,
  Building2,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    stores: "2-5",
    focus: "Electronics & Device Repair",
    notes: "",
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleReset = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg p-6 sm:p-8 rounded-2xl bg-white border border-slate-200 shadow-2xl text-left animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-7 h-7 rounded-lg overflow-hidden border border-slate-200 bg-white p-0.5 flex items-center justify-center shadow-xs">
                <Image
                  src="/nanonux_business_central_icon.png"
                  alt="Nano Nux Business Central Logo"
                  width={24}
                  height={24}
                  className="w-full h-full object-contain rounded-sm"
                />
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                1-on-1 Walkthrough
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Request Platform Walkthrough
            </h3>
            <p className="mt-1 text-slate-600 text-xs sm:text-sm">
              Schedule a personalized walkthrough with our operations team and receive sandbox credentials to evaluate Business Central.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-demo-name"
                      required
                      type="text"
                      placeholder="Marcus Vance"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="input-demo-email" className="block text-slate-700 font-medium mb-1">Work Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-demo-email"
                      required
                      type="email"
                      placeholder="marcus@apextech.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="input-demo-company" className="block text-slate-700 font-medium mb-1">Company Name</label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-demo-company"
                      required
                      type="text"
                      placeholder="Apex Tech Solutions"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="select-demo-stores" className="block text-slate-700 font-medium mb-1">Store Locations</label>
                  <select
                    id="select-demo-stores"
                    value={formData.stores}
                    onChange={(e) => setFormData({ ...formData, stores: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                  >
                    <option value="1">1 Location</option>
                    <option value="2-5">2 &ndash; 5 Locations</option>
                    <option value="6-15">6 &ndash; 15 Locations</option>
                    <option value="16+">16+ Locations</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="select-demo-focus" className="block text-slate-700 font-medium mb-1">Primary Operational Focus</label>
                <select
                  id="select-demo-focus"
                  value={formData.focus}
                  onChange={(e) => setFormData({ ...formData, focus: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 transition-colors"
                >
                  <option value="Electronics & Device Repair">Electronics &amp; Device Repair Hub</option>
                  <option value="High-Speed Retail & POS">High-Speed Retail &amp; Omnichannel POS</option>
                  <option value="Hybrid Retail + Repair">Hybrid Retail Store + Repair Service</option>
                  <option value="Multi-Warehouse Inventory">Multi-Warehouse &amp; Supply Chain</option>
                  <option value="Clinical & Specialized Service">Clinical Healthcare &amp; Encounters</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  id="btn-demo-submit"
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Submit &amp; Provision Sandbox</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Dedicated onboarding support. No marketing spam.</span>
              </div>
            </form>
          </div>
        ) : (
          <div className="py-6 text-center space-y-3 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-slate-900">Walkthrough Scheduled</h3>
            <p className="text-xs sm:text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              Thank you, <span className="text-slate-900 font-semibold">{formData.name}</span>. An enterprise sandbox has been provisioned for{" "}
              <span className="text-slate-900 font-semibold">{formData.company}</span>.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-left max-w-sm mx-auto space-y-1">
              <div className="text-slate-500">Tenant: <span className="text-slate-900 font-semibold">sandbox_apex_902</span></div>
              <div className="text-slate-500">Modules: <span className="text-emerald-700 font-semibold">CORE, POS, INVENTORY, REPAIR</span></div>
              <div className="text-slate-500">Details sent to: <span className="text-slate-900">{formData.email}</span></div>
            </div>

            <button
              onClick={handleReset}
              className="mt-3 px-5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition-colors"
            >
              Return to Site
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
