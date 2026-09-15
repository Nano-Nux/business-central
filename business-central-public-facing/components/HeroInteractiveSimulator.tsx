"use client";

import React, { useState } from "react";
import {
  ShoppingBag,
  Wrench,
  Layers,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Printer,
  Plus,
  Minus,
  Barcode,
  Clock,
  User,
  Check,
} from "lucide-react";

type RepairStage = "RECEIVED" | "IN_PROGRESS" | "WAITING_PARTS" | "READY_FOR_PICKUP" | "COMPLETED";

interface CartItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  category: string;
}

export default function HeroInteractiveSimulator() {
  const [activeTab, setActiveTab] = useState<"pos" | "repair" | "inventory" | "offline">("pos");

  // --- POS State ---
  const [cart, setCart] = useState<CartItem[]>([
    { id: "1", name: "OLED Display Assembly (15 Pro)", sku: "PRT-DISP-15P", price: 189.0, qty: 1, category: "Parts" },
    { id: "2", name: "High-Speed Barcode Scanner", sku: "HW-SCAN-2D", price: 125.0, qty: 1, category: "Hardware" },
  ]);
  const [selectedTender, setSelectedTender] = useState<"card" | "cash" | "split">("card");
  const [checkoutComplete, setCheckoutComplete] = useState(false);

  const catalog = [
    { id: "1", name: "OLED Display Assembly (15 Pro)", sku: "PRT-DISP-15P", price: 189.0, category: "Parts" },
    { id: "2", name: "High-Speed Barcode Scanner", sku: "HW-SCAN-2D", price: 125.0, category: "Hardware" },
    { id: "3", name: "Thermal Receipt Paper (50pk)", sku: "SUP-ROLL-80MM", price: 34.5, category: "Supplies" },
    { id: "4", name: "Type-C Charging Port Board", sku: "PRT-PORT-C", price: 28.0, category: "Parts" },
    { id: "5", name: "9H Tempered Glass Protector", sku: "ACC-SCRN-9H", price: 14.99, category: "Accessories" },
    { id: "6", name: "Battery Pack Li-Ion 4400mAh", sku: "PRT-BATT-44", price: 54.0, category: "Parts" },
  ];

  const addToCart = (item: (typeof catalog)[0]) => {
    setCart((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) {
        return prev.map((p) => (p.id === item.id ? { ...p, qty: p.qty + 1 } : p));
      }
      return [...prev, { ...item, qty: 1 }];
    });
    setCheckoutComplete(false);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
    setCheckoutComplete(false);
  };

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const tax = subtotal * 0.0825;
  const total = subtotal + tax;

  // --- Repair State ---
  const [repairStatus, setRepairStatus] = useState<RepairStage>("IN_PROGRESS");
  const [diagnosticChecks, setDiagnosticChecks] = useState({
    touchSensor: true,
    faceIdCamera: true,
    batteryHealth: true,
    logicBoardRail: false,
    chassisAlignment: true,
  });
  const allocatedParts = [
    { name: "Super Retina XDR Panel", sku: "PART-15P-DISP", cost: 140.0, status: "Consumed (FIFO Layer #102)" },
    { name: "Thermal Adhesive Seal", sku: "ADH-GSK-09", cost: 4.5, status: "Consumed (FIFO Layer #88)" },
  ];

  // --- Offline Simulation State ---
  const [isOnline, setIsOnline] = useState(true);
  const [offlineMutations, setOfflineMutations] = useState<
    Array<{ id: string; action: string; time: string; entity: string }>
  >([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const toggleConnection = () => {
    if (isOnline) {
      setIsOnline(false);
    } else {
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        setIsOnline(true);
        setOfflineMutations([]);
      }, 1200);
    }
  };

  const triggerOfflineAction = (actionName: string, entity: string) => {
    const newMut = {
      id: `MUT-${Math.floor(1000 + Math.random() * 9000)}`,
      action: actionName,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      entity,
    };
    setOfflineMutations((prev) => [newMut, ...prev]);
  };

  return (
    <section id="interactive-demo" className="py-14 md:py-20 bg-slate-50/60 border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Interactive Product Sandbox
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">
            Click through the live tabs below to test POS cashiering, device repair workbenches,
            FIFO inventory, and offline SQLite synchronization.
          </p>
        </div>

        {/* Clean Light Desktop Window Frame */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* Window Header Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 bg-slate-900 text-white px-4 sm:px-6 py-3 gap-3">
            {/* Window control dots */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/60 shadow-xs"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/60 shadow-xs"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/60 shadow-xs"></div>
              <span className="ml-3 text-xs font-semibold text-slate-300 hidden md:inline flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Business Central Portal &bull; Store #104 (Downtown Flagship)</span>
              </span>
            </div>

            {/* Segmented Control Switcher */}
            <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 overflow-x-auto text-xs font-medium gap-1">
              <button
                onClick={() => setActiveTab("pos")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === "pos"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/40 font-bold scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <ShoppingBag className={`w-3.5 h-3.5 ${activeTab === "pos" ? "text-white" : "text-emerald-400"}`} />
                <span>Omnichannel POS</span>
              </button>

              <button
                onClick={() => setActiveTab("repair")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === "repair"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40 font-bold scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Wrench className={`w-3.5 h-3.5 ${activeTab === "repair" ? "text-white" : "text-indigo-400"}`} />
                <span>Device Repair Hub</span>
              </button>

              <button
                onClick={() => setActiveTab("inventory")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === "inventory"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/40 font-bold scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Layers className={`w-3.5 h-3.5 ${activeTab === "inventory" ? "text-white" : "text-amber-400"}`} />
                <span>FIFO Inventory</span>
              </button>

              <button
                onClick={() => setActiveTab("offline")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === "offline"
                    ? "bg-sky-600 text-white shadow-md shadow-sky-600/40 font-bold scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Wifi className={`w-3.5 h-3.5 ${activeTab === "offline" ? "text-white" : "text-sky-400"}`} />
                <span>Offline Edge Engine</span>
              </button>
            </div>
          </div>

          {/* Window Body */}
          <div className="p-4 sm:p-6 bg-white min-h-[500px]">
            {/* TAB 1: POS */}
            {activeTab === "pos" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
                {/* Left: Product Grid */}
                <div className="lg:col-span-7 flex flex-col space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <Barcode className="w-4 h-4 text-emerald-600" />
                      <span>Product Catalog (Click to Ring Up)</span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">6 Items Available</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {catalog.map((prod) => {
                      const getCatBadge = (cat: string) => {
                        switch (cat) {
                          case "Parts": return "bg-indigo-50 text-indigo-700 border-indigo-200";
                          case "Hardware": return "bg-sky-50 text-sky-700 border-sky-200";
                          case "Supplies": return "bg-amber-50 text-amber-700 border-amber-200";
                          case "Accessories": return "bg-rose-50 text-rose-700 border-rose-200";
                          default: return "bg-slate-100 text-slate-700 border-slate-200";
                        }
                      };
                      return (
                        <div
                          key={prod.id}
                          onClick={() => addToCart(prod)}
                          className="p-3.5 rounded-xl border border-slate-200/90 hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5 bg-slate-50/50 hover:bg-white active:scale-[0.98] transition-all duration-200 cursor-pointer flex flex-col justify-between group"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getCatBadge(prod.category)}`}>
                                {prod.category}
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                ${prod.price.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                              {prod.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">{prod.sku}</div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-600">
                            <span className="text-[11px] font-semibold text-emerald-700">Add to cart</span>
                            <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                              <Plus className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Cart & Tender */}
                <div className="lg:col-span-5 flex flex-col p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-slate-700" />
                      <span className="text-sm font-bold text-slate-900">Active Register</span>
                      <span className="text-xs font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        #ORD-7819
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>Sarah J. (Walk-in)</span>
                    </div>
                  </div>

                  {/* Cart Items */}
                  <div className="my-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">Cart is empty. Click items to add.</div>
                    ) : (
                      cart.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs hover:border-slate-300 transition-colors"
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="font-semibold text-slate-900 truncate">{item.name}</div>
                            <div className="text-[11px] text-slate-500">
                              ${item.price.toFixed(2)} &times; {item.qty}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQty(item.id, -1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-semibold text-slate-900 px-1 text-xs">{item.qty}</span>
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Totals */}
                  <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="font-medium text-slate-900">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Sales Tax (8.25%)</span>
                      <span className="font-medium text-slate-900">${tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Total</span>
                      <span className="text-emerald-700 font-extrabold">${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Tender */}
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <span className="text-[11px] font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Payment Method</span>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(["card", "cash", "split"] as const).map((method) => {
                        const getActiveMethodStyle = (m: string) => {
                          switch (m) {
                            case "card": return "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold border-indigo-600";
                            case "cash": return "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold border-emerald-600";
                            case "split": return "bg-amber-600 text-white shadow-md shadow-amber-600/30 font-bold border-amber-600";
                            default: return "bg-slate-900 text-white";
                          }
                        };
                        return (
                          <button
                            key={method}
                            onClick={() => setSelectedTender(method)}
                            className={`py-2 rounded-lg capitalize font-medium transition-all cursor-pointer border ${
                              selectedTender === method
                                ? getActiveMethodStyle(method)
                                : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                            }`}
                          >
                            {method === "split" ? "Split Tender" : method}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Submit button */}
                  <button
                    disabled={cart.length === 0}
                    onClick={() => setCheckoutComplete(true)}
                    className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Complete Sale &amp; Print Receipt</span>
                  </button>

                  {/* Receipt Confirmation */}
                  {checkoutComplete && (
                    <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs animate-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Payment Authorized &amp; Completed</span>
                      </div>
                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <div>Auth Code: <span className="font-mono text-slate-900">TX-984022</span> &bull; Tender: {selectedTender.toUpperCase()}</div>
                        <div>Order recorded in store ledger in 8.4ms.</div>
                        <div className="text-emerald-700">&bull; ESC/POS receipt queued to LAN thermal printer.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: REPAIR */}
            {activeTab === "repair" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
                {/* Left: Device Card */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="p-5 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="flex items-start justify-between pb-3 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                            TICKET #REP-8942
                          </span>
                          <span className="text-xs text-slate-500">Service Order</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-1">
                          Apple iPhone 15 Pro Max &bull; 256GB Natural Titanium
                        </h3>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          IMEI: 359128092182910 &bull; Customer: Marcus Vance
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {repairStatus.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Diagnostic checks */}
                    <div className="mt-4">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>20-Point Intake Diagnostic Checklist</span>
                        <span className="text-emerald-700 font-mono text-xs">4 of 5 Passed</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {Object.entries(diagnosticChecks).map(([key, val]) => (
                          <div
                            key={key}
                            onClick={() =>
                              setDiagnosticChecks((prev) => ({
                                ...prev,
                                [key]: !prev[key as keyof typeof prev],
                              }))
                            }
                            className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-slate-300 transition-colors"
                          >
                            <span className="text-slate-700 capitalize">
                              {key.replace(/([A-Z])/g, " $1")}
                            </span>
                            {val ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Allocated parts */}
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Allocated Replacement Parts</span>
                        <span className="text-xs text-indigo-700 font-medium">Automatic FIFO Deduction</span>
                      </div>
                      <div className="space-y-2">
                        {allocatedParts.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{p.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{p.sku}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-slate-900">${p.cost.toFixed(2)}</div>
                              <div className="text-[10px] text-emerald-700">{p.status}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: State Transition Stepper */}
                <div className="lg:col-span-5 p-5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                      <Wrench className="w-4 h-4 text-indigo-600" />
                      <span>Repair Lifecycle Workflow</span>
                    </h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Click any phase to simulate status progression, waiting time updates, and customer SMS triggers.
                    </p>

                    <div className="space-y-2 text-xs">
                      {[
                        { key: "RECEIVED", label: "1. Received & Diagnostic Intake", desc: "Clock started; barcode generated", activeClass: "bg-slate-900 text-white border-slate-900 shadow-md", iconColor: "text-slate-300" },
                        { key: "IN_PROGRESS", label: "2. In Progress / Active Bench", desc: "Assigned to Station #4 (Alex M.)", activeClass: "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/30", iconColor: "text-white" },
                        { key: "WAITING_PARTS", label: "3. Waiting for Parts / Supplier", desc: "Auto-hold waiting period", activeClass: "bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/30", iconColor: "text-white" },
                        { key: "READY_FOR_PICKUP", label: "4. Ready for Pickup", desc: "Customer notification dispatched", activeClass: "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30", iconColor: "text-white" },
                        { key: "COMPLETED", label: "5. Paid & Closed", desc: "90-day warranty activated", activeClass: "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/30", iconColor: "text-white" },
                      ].map((step) => {
                        const isCurrent = repairStatus === step.key;
                        return (
                          <div
                            key={step.key}
                            onClick={() => setRepairStatus(step.key as RepairStage)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                              isCurrent
                                ? `${step.activeClass} font-semibold scale-[1.01]`
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs">{step.label}</span>
                              {isCurrent && <Check className={`w-4 h-4 ${step.iconColor}`} />}
                            </div>
                            <div className={`text-[11px] mt-0.5 ${isCurrent ? "text-slate-100 opacity-90" : "text-slate-500"}`}>{step.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-white border border-slate-200 text-xs">
                    <div className="flex items-center gap-1.5 text-indigo-700 font-semibold mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Derived Turnaround Metrics</span>
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <div>Intake Date: Today 09:30 AM &bull; Estimated Wait: 1.5 Days</div>
                      <div>Assigned Bench: Precision Electronics Station #4</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: INVENTORY */}
            {activeTab === "inventory" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-600" />
                      <span>Multi-Location Inventory Matrix &amp; FIFO Cost Layers</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Strict FIFO cost layering with append-only movement journals. No blind balance updates.
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                    Locations: Central DC + 2 Stores
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-semibold">
                        <th className="py-2.5 px-3">Item &amp; SKU</th>
                        <th className="py-2.5 px-3">Central DC</th>
                        <th className="py-2.5 px-3">Store #104</th>
                        <th className="py-2.5 px-3">Store #108</th>
                        <th className="py-2.5 px-3">FIFO Cost Layer</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { sku: "PRT-DISP-15P", name: "Super Retina OLED Panel", dc: "84 units", s1: "12 units", s2: "8 units", fifo: "$138.50 / $142.00", status: "Optimal", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                        { sku: "PRT-BATT-44", name: "OEM High-Capacity Battery", dc: "140 units", s1: "4 units", s2: "2 units", fifo: "$22.40 / $24.10", status: "Low Stock", color: "text-amber-700 bg-amber-50 border-amber-200" },
                        { sku: "HW-SCAN-2D", name: "Enterprise Wireless Scanner", dc: "30 units", s1: "5 units", s2: "6 units", fifo: "$74.00", status: "Optimal", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                        { sku: "PRT-PORT-C", name: "Type-C Charging Sub-Assembly", dc: "95 units", s1: "18 units", s2: "15 units", fifo: "$16.80", status: "Optimal", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                      ].map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{row.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{row.sku}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{row.dc}</td>
                          <td className="py-2.5 px-3 text-slate-700">{row.s1}</td>
                          <td className="py-2.5 px-3 text-slate-700">{row.s2}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{row.fifo}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${row.color}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Recent Immutable Movements Ledger</span>
                    <span className="text-emerald-700 font-medium">100% Traceability</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="font-bold text-emerald-700">MOV #8921:</span> PO-Receipt (+50 units)
                      <div className="text-slate-500">Central DC &bull; Supplier: FoxTek Direct</div>
                    </div>
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="font-bold text-indigo-700">MOV #8922:</span> Repair Consume (-1 unit)
                      <div className="text-slate-500">Store #104 &bull; Ticket #REP-8942</div>
                    </div>
                    <div className="p-2 rounded bg-white border border-slate-200">
                      <span className="font-bold text-sky-700">MOV #8923:</span> Inter-Store Transfer (-10)
                      <div className="text-slate-500">Central DC &rarr; Store #108</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: OFFLINE */}
            {activeTab === "offline" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Outage Toggle Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isOnline ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
                        }`}
                      ></span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Network Mode: {isOnline ? "Online (Cloud Connected)" : "Offline (Local SQLite Buffer)"}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Toggle the button to simulate internet loss. Rings up sales and tickets locally; reconnecting triggers automated delta synchronization.
                    </p>
                  </div>

                  <button
                    onClick={toggleConnection}
                    className={`px-4 py-2 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 shrink-0 ${
                      isOnline
                        ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                    }`}
                  >
                    {isOnline ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5" />
                        <span>Simulate Network Cut</span>
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5" />
                        <span>Restore Connection</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left: Actions */}
                  <div className="lg:col-span-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Execute Local Actions
                    </h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Perform cashier sales or repair intakes. Watch them buffer safely on your local device.
                    </p>

                    <div className="space-y-2">
                      <button
                        onClick={() => triggerOfflineAction("POS_SALE_CASH", "Order #ORD-7198 ($142.50)")}
                        className="w-full text-left p-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors text-xs flex items-center justify-between group"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">Ring Up POS Sale (Cash Tender)</div>
                          <div className="text-[11px] text-slate-500">Queues sale and records stock movement</div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                      </button>

                      <button
                        onClick={() => triggerOfflineAction("REPAIR_INTAKE", "Ticket #REP-9011 (iPad Pro)")}
                        className="w-full text-left p-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors text-xs flex items-center justify-between group"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">Intake Device Repair Ticket</div>
                          <div className="text-[11px] text-slate-500">Buffers checklist and customer intake</div>
                        </div>
                        <Plus className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                      </button>
                    </div>
                  </div>

                  {/* Right: Local Mutation Journal */}
                  <div className="lg:col-span-6 p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <span className="text-xs font-semibold text-slate-900">Local Transaction Queue</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-600">
                          {offlineMutations.length} Buffered
                        </span>
                      </div>

                      <div className="my-2 space-y-1.5 max-h-36 overflow-y-auto">
                        {offlineMutations.length === 0 ? (
                           <div className="py-6 text-center text-slate-400 text-xs">
                            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-slate-400" />
                            <span>Queue is empty. Database is in sync.</span>
                          </div>
                        ) : (
                          offlineMutations.map((mut) => (
                            <div
                              key={mut.id}
                              className="p-2 rounded bg-white border border-slate-200 text-xs flex items-center justify-between"
                            >
                              <div>
                                <span className="font-semibold text-slate-900">{mut.action}</span>
                                <div className="text-[11px] text-slate-500">{mut.entity}</div>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">{mut.time}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {isSyncing && (
                      <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5 font-medium animate-pulse">
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Syncing transactions with central cloud database...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
