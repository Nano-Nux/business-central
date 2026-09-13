import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portalDir = path.resolve(__dirname, "..");
const publicDir = path.join(portalDir, "public", "guide-screenshots");
const rootGuideDir = path.join(portalDir, "guide-screenshots");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(rootGuideDir, { recursive: true });

const commonStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body { background: #0f172a; color: #f8fafc; padding: 24px; min-height: 750px; display: flex; flex-direction: column; }
  .shell { background: #1e293b; border-radius: 14px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); flex: 1; display: flex; flex-direction: column; position: relative; }
  .topbar { background: #0f172a; border-bottom: 1px solid #334155; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; color: #38bdf8; }
  .brand-badge { background: #0284c7; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: 800; }
  .status-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 3px 10px; border-radius: 9999px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
  .content { padding: 24px; flex: 1; display: flex; flex-direction: column; gap: 20px; position: relative; }
  
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 18px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .card-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
  
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-success { background: #10b981; color: white; }
  .btn-secondary { background: #334155; color: #cbd5e1; border: 1px solid #475569; }
  
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .stat-box { background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 14px; }
  .stat-label { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
  .stat-value { font-size: 20px; font-weight: 700; color: #f8fafc; }
  
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; padding: 10px 12px; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; }
  .table td { padding: 12px; border-bottom: 1px solid #334155; color: #e2e8f0; }
  
  .badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
  .badge-blue { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
  .badge-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
  .badge-purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

  /* SVG Annotation Layer */
  .annotation-layer { position: absolute; inset: 0; pointer-events: none; z-index: 50; width: 100%; height: 100%; }
  .step-badge {
    position: absolute;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    font-weight: 800;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.8), 0 2px 6px rgba(0,0,0,0.4);
    border: 2px solid #ffffff;
    z-index: 60;
  }
`;

const screens = [
  // 1. POS MINI
  {
    name: "pos-mini.png",
    title: "POS Mini Mode - Streamlined Cashier",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand">
            <span>Business Central</span>
            <span class="brand-badge" style="background: #10b981;">POS MINI</span>
            <span style="color: #94a3b8; font-size: 13px;">Shop: Downtown Quickmart</span>
          </div>
          <div class="status-tag"><span class="dot"></span> Online & Synchronized</div>
        </div>
        <div class="content" style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px;">
          <!-- Left: Quick Tap Catalog & Search -->
          <div class="card" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; gap: 10px;">
              <input type="text" value="Scan barcode or type item name..." style="flex: 1; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #94a3b8; font-size: 14px;" />
              <button class="btn btn-secondary">Scanner [F2]</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; flex: 1;">
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">🥤</div>
                <div style="font-weight: 600; font-size: 13px;">Iced Milk Tea</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$2.50</div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">🥪</div>
                <div style="font-weight: 600; font-size: 13px;">Club Sandwich</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$4.00</div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">☕</div>
                <div style="font-weight: 600; font-size: 13px;">Americano</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$2.00</div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">🥐</div>
                <div style="font-weight: 600; font-size: 13px;">Butter Croissant</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$1.80</div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">🍪</div>
                <div style="font-weight: 600; font-size: 13px;">Choco Cookie</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$1.20</div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 14px; cursor: pointer; text-align: center;">
                <div style="font-size: 24px; margin-bottom: 6px;">🍎</div>
                <div style="font-weight: 600; font-size: 13px;">Fuji Apple</div>
                <div style="color: #38bdf8; font-weight: 700; margin-top: 4px;">$1.00</div>
              </div>
            </div>
          </div>

          <!-- Right: Fast Cart & Checkout -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="card-header">
                <span class="card-title">Current Ticket (#042)</span>
                <span class="badge badge-green">3 Items</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; padding: 8px; background: #0f172a; border-radius: 6px;">
                  <div>
                    <div style="font-weight: 600;">Iced Milk Tea</div>
                    <small style="color: #94a3b8;">Qty: 2 × $2.50</small>
                  </div>
                  <div style="font-weight: 700; color: #38bdf8;">$5.00</div>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: #0f172a; border-radius: 6px;">
                  <div>
                    <div style="font-weight: 600;">Butter Croissant</div>
                    <small style="color: #94a3b8;">Qty: 1 × $1.80</small>
                  </div>
                  <div style="font-weight: 700; color: #38bdf8;">$1.80</div>
                </div>
              </div>
            </div>

            <!-- Total & Fast Pay -->
            <div style="border-top: 1px solid #334155; padding-top: 16px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #94a3b8;">
                <span>Subtotal</span>
                <span>$6.80</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 20px; font-weight: 800;">
                <span>Total Due</span>
                <span style="color: #10b981;">$6.80</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <button class="btn btn-secondary" style="padding: 12px;">$10 Cash</button>
                <button class="btn btn-secondary" style="padding: 12px;">$20 Cash</button>
              </div>
              <button class="btn btn-success" style="width: 100%; padding: 14px; font-size: 16px; font-weight: 700;">
                ⚡ Exact Cash Checkout ($6.80)
              </button>
            </div>
          </div>
        </div>

        <!-- Annotations Layer -->
        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <defs>
            <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            <marker id="arrow-red" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
          </defs>

          <!-- Box 1: Quick Tap Grid -->
          <rect x="45" y="160" width="620" height="480" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="6,4" />
          
          <!-- Box 2: Fast Checkout Button -->
          <rect x="715" y="580" width="440" height="75" rx="8" fill="rgba(16, 185, 129, 0.1)" stroke="#10b981" stroke-width="3" />

          <!-- Circle around Barcode input -->
          <rect x="50" y="95" width="500" height="50" rx="8" fill="none" stroke="#f59e0b" stroke-width="2.5" />

          <!-- Arrows -->
          <path d="M 300 60 L 300 90" stroke="#f59e0b" stroke-width="3" marker-end="url(#arrow-green)" />
          <path d="M 935 520 L 935 570" stroke="#10b981" stroke-width="3.5" marker-end="url(#arrow-green)" />
          <path d="M 680 320 L 710 320" stroke="#38bdf8" stroke-width="3" marker-end="url(#arrow-blue)" />
        </svg>

        <!-- Step Badges -->
        <div class="step-badge" style="left: 300px; top: 75px;">1</div>
        <div class="step-badge" style="left: 45px; top: 145px;">2</div>
        <div class="step-badge" style="left: 710px; top: 180px;">3</div>
        <div class="step-badge" style="left: 920px; top: 560px;">4</div>
      </div>
    `,
  },

  // 2. POS SIMPLE
  {
    name: "pos-simple.png",
    title: "POS Simple Mode - Standard Retail Register",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand">
            <span>Business Central</span>
            <span class="brand-badge" style="background: #2563eb;">POS SIMPLE</span>
            <span style="color: #94a3b8; font-size: 13px;">Shop: Downtown Flagship</span>
          </div>
          <div class="status-tag"><span class="dot"></span> Online & Ready</div>
        </div>
        <div class="content" style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px;">
          <!-- Left: Catalog & Search & Filters -->
          <div class="card" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; gap: 10px;">
              <input type="text" value="🔍 Wireless Bluetooth Headset" style="flex: 1; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #f8fafc; font-size: 14px;" />
              <button class="btn btn-secondary">Category: All</button>
            </div>
            <div style="display: flex; gap: 8px;">
              <span class="badge badge-blue">All (48)</span>
              <span class="badge badge-green">Audio & Sound</span>
              <span class="badge badge-amber">Charging Cables</span>
              <span class="badge badge-purple">Accessories</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px;">
                <div style="font-weight: 600; font-size: 13px;">Wireless Headset ANC</div>
                <small style="color: #94a3b8;">SKU: AUD-992</small>
                <div style="display: flex; justify-content: space-between; margin-top: 8px; align-items: center;">
                  <span style="color: #10b981; font-weight: 700;">$45.00</span>
                  <span class="badge badge-green">14 in stock</span>
                </div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px;">
                <div style="font-weight: 600; font-size: 13px;">Fast USB-C 65W Cable</div>
                <small style="color: #94a3b8;">SKU: CBL-041</small>
                <div style="display: flex; justify-content: space-between; margin-top: 8px; align-items: center;">
                  <span style="color: #10b981; font-weight: 700;">$12.50</span>
                  <span class="badge badge-green">28 in stock</span>
                </div>
              </div>
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px;">
                <div style="font-weight: 600; font-size: 13px;">Phone Case Silicone</div>
                <small style="color: #94a3b8;">SKU: ACC-108</small>
                <div style="display: flex; justify-content: space-between; margin-top: 8px; align-items: center;">
                  <span style="color: #10b981; font-weight: 700;">$8.00</span>
                  <span class="badge badge-green">45 in stock</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Cart, Customer, Payment Tender -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; gap: 8px; margin-bottom: 12px; background: #0f172a; padding: 8px; border-radius: 6px; align-items: center;">
                <span style="font-size: 16px;">👤</span>
                <input type="text" value="Customer: John Doe (0912345678)" style="background: transparent; border: none; color: #38bdf8; font-size: 13px; font-weight: 600; flex: 1;" />
              </div>
              <div class="card-header">
                <span class="card-title">Cart Items</span>
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;">Hold Cart</button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; padding: 10px; background: #0f172a; border-radius: 6px;">
                  <div>
                    <div style="font-weight: 600;">Wireless Headset ANC</div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px;">
                      <button class="btn btn-secondary" style="padding: 2px 6px;">-</button>
                      <span>1</span>
                      <button class="btn btn-secondary" style="padding: 2px 6px;">+</button>
                      <small style="color: #94a3b8;">@ $45.00</small>
                    </div>
                  </div>
                  <div style="font-weight: 700; color: #38bdf8;">$45.00</div>
                </div>
              </div>
            </div>

            <!-- Payment tender -->
            <div style="border-top: 1px solid #334155; padding-top: 14px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #94a3b8;">
                <span>Discount / Promo</span>
                <span style="color: #34d399;">-$5.00 (PROMO10)</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 20px; font-weight: 800;">
                <span>Total Due</span>
                <span style="color: #10b981;">$40.00</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <button class="btn btn-secondary">💵 Cash</button>
                <button class="btn btn-secondary">💳 Card</button>
                <button class="btn btn-secondary">📱 Transfer</button>
              </div>
              <button class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 15px; font-weight: 700;">
                Complete Sale & Print Receipt
              </button>
            </div>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <defs>
            <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" /></marker>
            <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" /></marker>
          </defs>
          <rect x="50" y="95" width="480" height="48" rx="8" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="715" y="95" width="440" height="42" rx="6" fill="rgba(56, 189, 248, 0.1)" stroke="#38bdf8" stroke-width="2" />
          <rect x="715" y="150" width="440" height="150" rx="8" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
          <rect x="715" y="520" width="440" height="140" rx="8" fill="none" stroke="#10b981" stroke-width="2.5" />
          <path d="M 280 60 L 280 90" stroke="#38bdf8" stroke-width="3" marker-end="url(#arrow-blue)" />
          <path d="M 935 480 L 935 515" stroke="#10b981" stroke-width="3" marker-end="url(#arrow-green)" />
        </svg>

        <div class="step-badge" style="left: 280px; top: 75px;">1</div>
        <div class="step-badge" style="left: 710px; top: 80px;">2</div>
        <div class="step-badge" style="left: 710px; top: 140px;">3</div>
        <div class="step-badge" style="left: 920px; top: 505px;">4</div>
      </div>
    `,
  },

  // 3. POS COMPLEX
  {
    name: "pos-complex.png",
    title: "POS Complex Mode - Matrix Variants & Multi-Attribute Register",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand">
            <span>Business Central</span>
            <span class="brand-badge" style="background: #8b5cf6;">POS COMPLEX</span>
            <span style="color: #94a3b8; font-size: 13px;">Shop: Mega Tech Superstore</span>
          </div>
          <div class="status-tag"><span class="dot"></span> Online & Sync Active</div>
        </div>
        <div class="content" style="display: grid; grid-template-columns: 1.5fr 1.1fr; gap: 20px;">
          <div class="card" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; gap: 10px;">
              <input type="text" value="iPhone 15 Pro Max [Scanning...]" style="flex: 1; padding: 12px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #f8fafc; font-size: 14px;" />
              <button class="btn btn-secondary">F2 Scan</button>
            </div>

            <!-- Matrix Variant Selector Modal/Drawer inside screen -->
            <div style="background: #0f172a; border: 1px solid #475569; border-radius: 8px; padding: 16px;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px; color: #c084fc;">Select Matrix Variant: iPhone 15 Pro Max</div>
              <div style="margin-bottom: 10px;">
                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">COLOR ATTRIBUTE</label>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-secondary" style="border-color: #8b5cf6; background: rgba(139,92,246,0.2);">Natural Titanium</button>
                  <button class="btn btn-secondary">Blue Titanium</button>
                  <button class="btn btn-secondary">White Titanium</button>
                  <button class="btn btn-secondary">Black Titanium</button>
                </div>
              </div>
              <div style="margin-bottom: 12px;">
                <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 4px;">STORAGE ATTRIBUTE</label>
                <div style="display: flex; gap: 8px;">
                  <button class="btn btn-secondary">256 GB</button>
                  <button class="btn btn-secondary" style="border-color: #8b5cf6; background: rgba(139,92,246,0.2);">512 GB ($1,399)</button>
                  <button class="btn btn-secondary">1 TB ($1,599)</button>
                </div>
              </div>
              <button class="btn btn-primary" style="width: 100%; background: #7c3aed;">Add Selected Variant to Cart</button>
            </div>
          </div>

          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="card-header">
                <span class="card-title">Complex Order (#109)</span>
                <span class="badge badge-purple">Delivery Assigned</span>
              </div>
              <div style="background: #0f172a; padding: 10px; border-radius: 6px; margin-bottom: 10px;">
                <div style="font-weight: 600; font-size: 13px;">iPhone 15 Pro Max (Natural / 512GB)</div>
                <small style="color: #94a3b8;">Barcode: 880928374921 | IMEI: 354892019283</small>
                <div style="display: flex; justify-content: space-between; margin-top: 6px;">
                  <span>Qty: 1</span>
                  <span style="font-weight: 700; color: #38bdf8;">$1,399.00</span>
                </div>
              </div>
              <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; font-size: 12px; color: #94a3b8; display: flex; justify-content: space-between;">
                <span>🚚 Delivery: Express Courier</span>
                <span style="color: #e2e8f0; font-weight: 600;">+$15.00</span>
              </div>
            </div>

            <div style="border-top: 1px solid #334155; padding-top: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #94a3b8;">
                <span>Subtotal</span>
                <span>$1,414.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 20px; font-weight: 800;">
                <span>Total</span>
                <span style="color: #10b981;">$1,414.00</span>
              </div>
              <button class="btn btn-success" style="width: 100%; padding: 14px; font-size: 15px; font-weight: 700;">
                Accept Split / Card Payment
              </button>
            </div>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <defs>
            <marker id="arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 1 L 10 5 L 0 9 z" fill="#8b5cf6" /></marker>
          </defs>
          <rect x="45" y="145" width="590" height="230" rx="10" fill="none" stroke="#8b5cf6" stroke-width="2.5" />
          <circle cx="85" cy="245" r="24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-dasharray="4,2" />
          <rect x="680" y="145" width="480" height="150" rx="8" fill="none" stroke="#38bdf8" stroke-width="2" />
          <path d="M 320 105 L 320 140" stroke="#8b5cf6" stroke-width="3" marker-end="url(#arrow-purple)" />
        </svg>

        <div class="step-badge" style="left: 310px; top: 90px;">1</div>
        <div class="step-badge" style="left: 45px; top: 135px;">2</div>
        <div class="step-badge" style="left: 670px; top: 135px;">3</div>
        <div class="step-badge" style="left: 920px; top: 580px;">4</div>
      </div>
    `,
  },

  // 4. DASHBOARD (TODAY)
  {
    name: "dashboard-overview.png",
    title: "Dashboard - Realtime Business Metrics & Today's Performance",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">TODAY</span></div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary">+ New Sale</button>
            <button class="btn btn-secondary">Stock In</button>
          </div>
        </div>
        <div class="content">
          <div class="stat-grid">
            <div class="stat-box">
              <div class="stat-label">TODAY'S REVENUE</div>
              <div class="stat-value" style="color: #10b981;">$3,420.50</div>
              <small style="color: #34d399;">▲ +12.4% vs yesterday</small>
            </div>
            <div class="stat-box">
              <div class="stat-label">COMPLETED ORDERS</div>
              <div class="stat-value">64 orders</div>
              <small style="color: #94a3b8;">Avg ticket: $53.40</small>
            </div>
            <div class="stat-box">
              <div class="stat-label">ACTIVE REPAIRS</div>
              <div class="stat-value" style="color: #f59e0b;">9 devices</div>
              <small style="color: #fbbf24;">2 ready for pickup</small>
            </div>
            <div class="stat-box">
              <div class="stat-label">LOW STOCK ALERTS</div>
              <div class="stat-value" style="color: #ef4444;">4 items</div>
              <small style="color: #f87171;">Reorder required</small>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; flex: 1;">
            <div class="card">
              <div class="card-header">
                <span class="card-title">Recent Transactions Today</span>
                <span class="badge badge-blue">Live Stream</span>
              </div>
              <table class="table">
                <thead><tr><th>Time</th><th>Order #</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td>10:45 AM</td><td>ORD-8821</td><td>Walk-in</td><td>$18.50</td><td><span class="badge badge-green">Paid</span></td></tr>
                  <tr><td>10:32 AM</td><td>ORD-8820</td><td>Alice Smith</td><td>$145.00</td><td><span class="badge badge-green">Paid</span></td></tr>
                  <tr><td>10:15 AM</td><td>ORD-8819</td><td>Tech Corp</td><td>$420.00</td><td><span class="badge badge-blue">Credit</span></td></tr>
                </tbody>
              </table>
            </div>

            <div class="card">
              <div class="card-header">
                <span class="card-title">Urgent Alerts</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 6px;">
                  <strong style="color: #f87171; font-size: 13px;">Critical Low Stock:</strong>
                  <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">Thermal Paper Roll 80mm has only 2 units remaining.</div>
                </div>
                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 10px; border-radius: 6px;">
                  <strong style="color: #fbbf24; font-size: 13px;">Pending Sync:</strong>
                  <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">All registers synced. Database healthy.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="90" width="1120" height="110" rx="10" fill="none" stroke="#10b981" stroke-width="2.5" />
          <circle cx="1080" cy="48" r="28" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="40" y="220" width="740" height="420" rx="10" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6,4" />
          <rect x="800" y="220" width="360" height="420" rx="10" fill="none" stroke="#ef4444" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 40px; top: 80px;">1</div>
        <div class="step-badge" style="left: 1060px; top: 10px;">2</div>
        <div class="step-badge" style="left: 40px; top: 210px;">3</div>
        <div class="step-badge" style="left: 790px; top: 210px;">4</div>
      </div>
    `,
  },

  // 5. CATALOG & PRODUCTS
  {
    name: "catalog-products.png",
    title: "Catalog Management - Products, Pricing, and Barcodes",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">CATALOG</span></div>
          <button class="btn btn-primary">+ Add New Product</button>
        </div>
        <div class="content">
          <div style="display: flex; gap: 12px; margin-bottom: 10px;">
            <input type="text" value="Filter by SKU, name, or barcode..." style="flex: 1; padding: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #94a3b8;" />
            <button class="btn btn-secondary">All Brands</button>
            <button class="btn btn-secondary">All Categories</button>
            <button class="btn btn-secondary">Export CSV</button>
          </div>
          <div class="card" style="padding: 0; overflow: hidden;">
            <table class="table">
              <thead>
                <tr style="background: #0f172a;">
                  <th>Product Name</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th>Cost Price</th>
                  <th>Selling Price</th>
                  <th>Stock On Hand</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Espresso Blend Beans (1kg)</strong></td>
                  <td><code>885012398711</code></td>
                  <td>Coffee & Beverage</td>
                  <td>$12.00</td>
                  <td style="color: #10b981; font-weight: 700;">$24.00</td>
                  <td><span class="badge badge-green">32 bags</span></td>
                  <td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td>
                </tr>
                <tr>
                  <td><strong>Stainless Milk Pitcher 600ml</strong></td>
                  <td><code>885012398712</code></td>
                  <td>Barista Tools</td>
                  <td>$8.50</td>
                  <td style="color: #10b981; font-weight: 700;">$18.00</td>
                  <td><span class="badge badge-green">14 pcs</span></td>
                  <td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td>
                </tr>
                <tr>
                  <td><strong>Paper Cup 16oz (Pack of 50)</strong></td>
                  <td><code>885012398713</code></td>
                  <td>Packaging</td>
                  <td>$4.00</td>
                  <td style="color: #10b981; font-weight: 700;">$7.50</td>
                  <td><span class="badge badge-amber">3 packs</span></td>
                  <td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="85" width="700" height="46" rx="8" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="40" y="145" width="1120" height="280" rx="8" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 75px;">2</div>
        <div class="step-badge" style="left: 35px; top: 135px;">3</div>
      </div>
    `,
  },

  // 6. VARIANT ATTRIBUTES (COMPLEX MODE)
  {
    name: "catalog-attributes.png",
    title: "Variant Attributes - Complex Matrix & Attribute Definitions",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge" style="background: #8b5cf6;">ATTRIBUTES</span></div>
          <button class="btn btn-primary" style="background: #7c3aed;">+ Define New Attribute</button>
        </div>
        <div class="content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Configured Variant Attributes</span>
              <span class="badge badge-purple">Complex Mode Only</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-weight: 700; font-size: 14px; color: #38bdf8;">Color (Visual Swatch)</div>
                <div style="display: flex; gap: 6px; margin-top: 8px;">
                  <span class="badge badge-purple">Midnight Black</span>
                  <span class="badge badge-purple">Starlight Silver</span>
                  <span class="badge badge-purple">Deep Blue</span>
                </div>
              </div>
              <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155;">
                <div style="font-weight: 700; font-size: 14px; color: #38bdf8;">Storage Capacity</div>
                <div style="display: flex; gap: 6px; margin-top: 8px;">
                  <span class="badge badge-blue">128 GB</span>
                  <span class="badge badge-blue">256 GB</span>
                  <span class="badge badge-blue">512 GB</span>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Generated SKU Matrix Preview</span>
            </div>
            <table class="table">
              <thead><tr><th>Attribute Combination</th><th>Generated SKU</th><th>Price Offset</th></tr></thead>
              <tbody>
                <tr><td>Black / 128GB</td><td><code>DEV-BLK-128</code></td><td>Base ($899)</td></tr>
                <tr><td>Black / 256GB</td><td><code>DEV-BLK-256</code></td><td>+$100 ($999)</td></tr>
                <tr><td>Silver / 256GB</td><td><code>DEV-SLV-256</code></td><td>+$100 ($999)</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#8b5cf6" stroke-width="2.5" />
          <rect x="40" y="90" width="540" height="380" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="620" y="90" width="540" height="380" rx="10" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 80px;">2</div>
        <div class="step-badge" style="left: 610px; top: 80px;">3</div>
      </div>
    `,
  },

  // 7. STORAGE & WAREHOUSES
  {
    name: "storage-warehouses.png",
    title: "Storage - Bin Locations, Shelves, and Stock Distribution",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">STORAGE</span></div>
          <button class="btn btn-primary">+ Add Storage Location</button>
        </div>
        <div class="content" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Main Store Floor</span>
              <span class="badge badge-green">Active</span>
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">Front display shelves and cashier counter stock.</p>
            <div style="font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">428 items</div>
            <small style="color: #10b981;">Capacity: 75% utilized</small>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">Backroom Warehouse A</span>
              <span class="badge badge-green">Active</span>
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">Bulk cases, cartons, and reserve inventory.</p>
            <div style="font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">1,240 items</div>
            <small style="color: #34d399;">Capacity: 54% utilized</small>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">Repair Diagnostics Room</span>
              <span class="badge badge-amber">Restricted</span>
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">Spare parts, replacement screens, and work orders.</p>
            <div style="font-size: 22px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">86 parts</div>
            <small style="color: #fbbf24;">Technician access only</small>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="90" width="360" height="260" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 80px;">2</div>
      </div>
    `,
  },

  // 8. STOCK IN (RECEIVING)
  {
    name: "stock-in.png",
    title: "Stock In - Inventory Intake & Supplier Batch Orders",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge" style="background: #0284c7;">STOCK IN</span></div>
          <button class="btn btn-success">Save & Post Stock In</button>
        </div>
        <div class="content">
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-title" style="margin-bottom: 12px;">Batch & Supplier Information</div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;">
              <div>
                <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">SUPPLIER</label>
                <input type="text" value="Apex Wholesale Distributors" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc;" />
              </div>
              <div>
                <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">INVOICE / PO REF</label>
                <input type="text" value="PO-2026-9921" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc;" />
              </div>
              <div>
                <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">RECEIVING STORAGE</label>
                <input type="text" value="Backroom Warehouse A" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc;" />
              </div>
              <div>
                <label style="font-size: 12px; color: #94a3b8; display: block; margin-bottom: 4px;">DELIVERY DATE</label>
                <input type="text" value="Today, 2026-09-14" style="width: 100%; padding: 8px; background: #0f172a; border: 1px solid #334155; border-radius: 6px; color: #f8fafc;" />
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Received Item Line Entries</span>
              <button class="btn btn-secondary">+ Scan / Add Item</button>
            </div>
            <table class="table">
              <thead><tr><th>Barcode / SKU</th><th>Item Description</th><th>Received Qty</th><th>Unit Cost</th><th>Subtotal</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td><code>885012398711</code></td><td>Espresso Blend Beans (1kg)</td><td>+50 bags</td><td>$11.50</td><td>$575.00</td><td>✕</td></tr>
                <tr><td><code>885012398712</code></td><td>Stainless Milk Pitcher 600ml</td><td>+20 pcs</td><td>$8.00</td><td>$160.00</td><td>✕</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="130" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="40" y="240" width="1120" height="280" rx="10" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" />
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 35px; top: 230px;">2</div>
        <div class="step-badge" style="left: 1090px; top: 15px;">3</div>
      </div>
    `,
  },

  // 9. STOCK ASSETS / BARCODES
  {
    name: "stock-assets.png",
    title: "Stock Assets - Barcode Generation & Asset Tracking",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">STOCK BARCODES</span></div>
          <button class="btn btn-primary">Print Barcode Labels</button>
        </div>
        <div class="content">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Tracked Serial / Barcode Assets</span>
              <span class="badge badge-green">Thermal Printable</span>
            </div>
            <table class="table">
              <thead><tr><th>Barcode Tag</th><th>Product Name</th><th>Storage Location</th><th>Status</th><th>Registered Date</th></tr></thead>
              <tbody>
                <tr><td><code>SN-2026-009182</code></td><td>iPad Pro 11-inch M4</td><td>Main Store Floor</td><td><span class="badge badge-green">In Stock</span></td><td>2026-09-10</td></tr>
                <tr><td><code>SN-2026-009183</code></td><td>iPad Pro 11-inch M4</td><td>Main Store Floor</td><td><span class="badge badge-blue">Reserved</span></td><td>2026-09-10</td></tr>
                <tr><td><code>SN-2026-009184</code></td><td>Sony WH-1000XM5</td><td>Backroom Warehouse A</td><td><span class="badge badge-green">In Stock</span></td><td>2026-09-12</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="85" width="1120" height="380" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 75px;">2</div>
      </div>
    `,
  },

  // 10. STOCK MOVEMENTS & AUDIT
  {
    name: "stock-movements.png",
    title: "Stock Movements - Realtime Inventory Ledger & Audit Trail",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">STOCK MOVEMENTS</span></div>
          <div style="font-size: 13px; color: #94a3b8;">Audit Log: Real-time In/Out tracking</div>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Timestamp</th><th>Type</th><th>Product SKU</th><th>Quantity Change</th><th>Operator</th><th>Reason / Ref</th></tr></thead>
              <tbody>
                <tr><td>11:02 AM</td><td><span class="badge badge-blue">Stock In</span></td><td><code>COF-ESP-01</code></td><td style="color: #10b981; font-weight: 700;">+50 bags</td><td>Store Manager</td><td>PO-2026-9921</td></tr>
                <tr><td>10:45 AM</td><td><span class="badge badge-green">POS Sale</span></td><td><code>TEA-MLK-02</code></td><td style="color: #ef4444; font-weight: 700;">-2 cups</td><td>Cashier #1</td><td>Receipt #042</td></tr>
                <tr><td>09:15 AM</td><td><span class="badge badge-amber">Damage / Scrap</span></td><td><code>GLS-PCH-01</code></td><td style="color: #ef4444; font-weight: 700;">-1 pc</td><td>Store Manager</td><td>Dropped in transit</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="380" rx="10" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
      </div>
    `,
  },

  // 11. TRANSACTION HISTORY
  {
    name: "transaction-history.png",
    title: "Transaction History - Sales Ledger & Receipt Reprinting",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">TRANSACTIONS</span></div>
          <div style="display: flex; gap: 10px;">
            <input type="date" value="2026-09-14" style="background: #0f172a; border: 1px solid #334155; color: white; padding: 6px 12px; border-radius: 6px;" />
            <button class="btn btn-secondary">Filter</button>
          </div>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Receipt #</th><th>Time</th><th>Customer</th><th>Payment</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                <tr><td><code>REC-001092</code></td><td>10:45 AM</td><td>Walk-in</td><td>Cash</td><td style="font-weight: 700;">$6.80</td><td><span class="badge badge-green">Completed</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Reprint</button></td></tr>
                <tr><td><code>REC-001091</code></td><td>10:30 AM</td><td>Sarah Jenkins</td><td>Card (Visa)</td><td style="font-weight: 700;">$45.00</td><td><span class="badge badge-green">Completed</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Reprint</button></td></tr>
                <tr><td><code>REC-001090</code></td><td>09:55 AM</td><td>Michael Brown</td><td>Cash</td><td style="font-weight: 700;">$14.20</td><td><span class="badge badge-amber">Refunded</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">View</button></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="380" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <circle cx="1070" cy="180" r="24" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 1050px; top: 140px;">2</div>
      </div>
    `,
  },

  // 12. CUSTOMERS
  {
    name: "customers.png",
    title: "Customer Directory - Contacts, History, and Store Credit",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">CUSTOMERS</span></div>
          <button class="btn btn-primary">+ Add New Customer</button>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Customer Name</th><th>Phone Number</th><th>Email</th><th>Total Spent</th><th>Store Credit / Debt</th><th>Actions</th></tr></thead>
              <tbody>
                <tr><td><strong>Alice Smith</strong></td><td>+1 (555) 019-2834</td><td>alice@example.com</td><td>$1,420.00</td><td><span class="badge badge-green">Credit: $50.00</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Profile</button></td></tr>
                <tr><td><strong>Tech Innovations LLC</strong></td><td>+1 (555) 014-9981</td><td>orders@techinnov.com</td><td>$8,940.00</td><td><span class="badge badge-amber">Due: $420.00</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Profile</button></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="85" width="1120" height="280" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 75px;">2</div>
      </div>
    `,
  },

  // 13. DELIVERIES
  {
    name: "deliveries.png",
    title: "Deliveries - Order Dispatch, Drivers, and Tracking",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">DELIVERIES</span></div>
          <button class="btn btn-primary">+ Create Delivery Batch</button>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Delivery #</th><th>Associated Order</th><th>Customer & Address</th><th>Courier / Driver</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                <tr><td><code>DEL-0098</code></td><td>ORD-8820 ($145)</td><td>Alice Smith, 742 Evergreen Terr.</td><td>City Courier (Alex)</td><td><span class="badge badge-purple">In Transit</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Track</button></td></tr>
                <tr><td><code>DEL-0099</code></td><td>ORD-8822 ($89)</td><td>Bob Miller, 120 Elm St.</td><td>Unassigned</td><td><span class="badge badge-amber">Pending Dispatch</span></td><td><button class="btn btn-primary" style="padding: 4px 8px;">Assign</button></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="280" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <circle cx="1060" cy="240" r="24" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 1040px; top: 200px;">2</div>
      </div>
    `,
  },

  // 14. DEVICE REPAIRS WORKFLOW
  {
    name: "repairs-workflow.png",
    title: "Device Repairs - Work Orders, Diagnostics & Inspection Checklist",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge" style="background: #f59e0b;">DEVICE REPAIR HUB</span></div>
          <button class="btn btn-primary" style="background: #d97706;">+ New Repair Ticket</button>
        </div>
        <div class="content">
          <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">
            <div class="stat-box"><div class="stat-label">1. INTAKE</div><div class="stat-value">3 tickets</div></div>
            <div class="stat-box"><div class="stat-label">2. DIAGNOSING</div><div class="stat-value" style="color: #38bdf8;">2 devices</div></div>
            <div class="stat-box"><div class="stat-label">3. IN PROGRESS</div><div class="stat-value" style="color: #f59e0b;">4 devices</div></div>
            <div class="stat-box"><div class="stat-label">4. READY FOR PICKUP</div><div class="stat-value" style="color: #10b981;">2 devices</div></div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Active Repair Ticket: Samsung Galaxy S23 Ultra (REP-049)</span>
              <span class="badge badge-amber">In Progress</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div style="background: #0f172a; padding: 12px; border-radius: 8px;">
                <strong style="font-size: 13px; color: #38bdf8;">Reported Issues & Diagnostic Notes</strong>
                <p style="font-size: 12px; color: #cbd5e1; margin-top: 6px;">Cracked AMOLED screen after drop; touch response unresponsive on bottom half.</p>
                <div style="margin-top: 10px; display: flex; gap: 6px;">
                  <span class="badge badge-purple">Cracked Screen</span>
                  <span class="badge badge-purple">Touch Unresponsive</span>
                </div>
              </div>
              <div style="background: #0f172a; padding: 12px; border-radius: 8px;">
                <strong style="font-size: 13px; color: #10b981;">Parts & Labor Estimate</strong>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
                  <span>OEM AMOLED Display Replacement</span>
                  <span>$180.00</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
                  <span>Technician Labor Fee</span>
                  <span>$45.00</span>
                </div>
                <div style="border-top: 1px solid #334155; margin-top: 8px; padding-top: 6px; display: flex; justify-content: space-between; font-weight: 700; color: #10b981;">
                  <span>Total Estimate</span>
                  <span>$225.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="90" rx="10" fill="none" stroke="#f59e0b" stroke-width="2.5" />
          <rect x="40" y="195" width="1120" height="320" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 35px; top: 185px;">2</div>
        <div class="step-badge" style="left: 1090px; top: 15px;">3</div>
      </div>
    `,
  },

  // 15. INVOICES & PRINTING
  {
    name: "invoices.png",
    title: "Invoices - Thermal 80mm/58mm Printing & Receipt Engine",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">INVOICES</span></div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary">🖨 Thermal Print (80mm)</button>
            <button class="btn btn-secondary">📄 Export A4 PDF</button>
          </div>
        </div>
        <div class="content" style="display: flex; justify-content: center;">
          <!-- Simulated Thermal Receipt -->
          <div style="width: 360px; background: #ffffff; color: #000000; border-radius: 4px; padding: 24px; font-family: monospace; font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">BUSINESS CENTRAL</div>
            <div style="text-align: center; font-size: 11px; margin-bottom: 12px;">DOWNTOWN SHOP #01<br />Tel: +1 (555) 019-2834</div>
            <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 10px;">
              <div>RC: #001092 &nbsp;&nbsp;&nbsp; 14-Sep-2026 10:45</div>
              <div>CASHIER: Staff #02</div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Iced Milk Tea (x2)</span>
              <span>$5.00</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span>Butter Croissant</span>
              <span>$1.80</span>
            </div>
            <div style="border-top: 1px dashed #000; padding-top: 6px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 15px;">
                <span>TOTAL DUE:</span>
                <span>$6.80</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
                <span>TENDER (CASH):</span>
                <span>$10.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>CHANGE GIVEN:</span>
                <span>$3.20</span>
              </div>
            </div>
            <div style="text-align: center; margin-top: 16px; font-size: 11px;">
              THANK YOU FOR YOUR VISIT!<br />PLEASE COME AGAIN
            </div>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1010" cy="48" r="24" fill="none" stroke="#10b981" stroke-width="2.5" />
          <circle cx="1140" cy="48" r="24" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="410" y="85" width="380" height="520" rx="8" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6,4" />
        </svg>

        <div class="step-badge" style="left: 990px; top: 15px;">1</div>
        <div class="step-badge" style="left: 400px; top: 75px;">2</div>
      </div>
    `,
  },

  // 16. REPORTS & ANALYTICS
  {
    name: "reports.png",
    title: "Reports - Sales Performance, Profit Margins, and Top Products",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">REPORTS & ANALYTICS</span></div>
          <button class="btn btn-secondary">Download Financial Report</button>
        </div>
        <div class="content">
          <div class="stat-grid" style="margin-bottom: 16px;">
            <div class="stat-box"><div class="stat-label">MONTHLY REVENUE</div><div class="stat-value" style="color: #10b981;">$48,920</div></div>
            <div class="stat-box"><div class="stat-label">NET ESTIMATED PROFIT</div><div class="stat-value" style="color: #38bdf8;">$18,450</div></div>
            <div class="stat-box"><div class="stat-label">AVERAGE BASKET SIZE</div><div class="stat-value">$34.80</div></div>
            <div class="stat-box"><div class="stat-label">REPEAT CUSTOMER RATE</div><div class="stat-value" style="color: #c084fc;">68%</div></div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">Top 3 Best Selling Products This Month</span></div>
            <table class="table">
              <thead><tr><th>Product Name</th><th>Units Sold</th><th>Gross Revenue</th><th>Gross Margin</th></tr></thead>
              <tbody>
                <tr><td>Espresso Blend Beans (1kg)</td><td>340 bags</td><td>$8,160</td><td><span class="badge badge-green">50% Margin</span></td></tr>
                <tr><td>Wireless Headset ANC</td><td>120 units</td><td>$5,400</td><td><span class="badge badge-green">45% Margin</span></td></tr>
                <tr><td>Iced Milk Tea</td><td>1,280 cups</td><td>$3,200</td><td><span class="badge badge-green">65% Margin</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="1120" height="90" rx="10" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="195" width="1120" height="280" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 35px; top: 185px;">2</div>
      </div>
    `,
  },

  // 17. PROMOTIONS
  {
    name: "promotions.png",
    title: "Promotions - Discount Rules, Coupons, and Date Validity",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">PROMOTIONS</span></div>
          <button class="btn btn-primary">+ Create Promotion</button>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Campaign Name</th><th>Promo Code</th><th>Discount Value</th><th>Min. Spend</th><th>Validity Period</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td><strong>Weekend Flash Sale</strong></td><td><code>FLASH10</code></td><td>10% Off</td><td>$20.00</td><td>Fri - Sun</td><td><span class="badge badge-green">Active</span></td></tr>
                <tr><td><strong>New Customer Welcome</strong></td><td><code>WELCOME5</code></td><td>$5.00 Off</td><td>$25.00</td><td>Always Active</td><td><span class="badge badge-green">Active</span></td></tr>
                <tr><td><strong>Holiday Special Promo</strong></td><td><code>HOLIDAY20</code></td><td>20% Off</td><td>$50.00</td><td>Expired</td><td><span class="badge badge-amber">Inactive</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="85" width="1120" height="280" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 75px;">2</div>
      </div>
    `,
  },

  // 18. STAFF ACCOUNTS
  {
    name: "staff-accounts.png",
    title: "Staff Accounts - Roles, PIN Codes, and Security Permissions",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">STAFF ACCOUNTS</span></div>
          <button class="btn btn-primary">+ Invite Team Member</button>
        </div>
        <div class="content">
          <div class="card">
            <table class="table">
              <thead><tr><th>Staff Member</th><th>Assigned Role</th><th>Shop Access</th><th>Quick PIN</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                <tr><td><strong>Robert Chen</strong><br /><small style="color: #94a3b8;">robert@shop.com</small></td><td><span class="badge badge-purple">Shop Manager</span></td><td>All Branches</td><td>•••• (Active)</td><td><span class="badge badge-green">Active</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td></tr>
                <tr><td><strong>Sarah Jenkins</strong><br /><small style="color: #94a3b8;">sarah@shop.com</small></td><td><span class="badge badge-blue">Cashier</span></td><td>Downtown Flagship</td><td>•••• (Active)</td><td><span class="badge badge-green">Active</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td></tr>
                <tr><td><strong>David Kim</strong><br /><small style="color: #94a3b8;">david@shop.com</small></td><td><span class="badge badge-amber">Technician</span></td><td>Repair Hub</td><td>•••• (Active)</td><td><span class="badge badge-green">Active</span></td><td><button class="btn btn-secondary" style="padding: 4px 8px;">Edit</button></td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <circle cx="1110" cy="48" r="26" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="40" y="85" width="1120" height="280" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 1090px; top: 15px;">1</div>
        <div class="step-badge" style="left: 35px; top: 75px;">2</div>
      </div>
    `,
  },

  // 19. SETTINGS & SYSTEM
  {
    name: "settings-system.png",
    title: "Settings - Printer Pairing, Offline Sync, and Multi-Language",
    html: `
      <div class="shell">
        <div class="topbar">
          <div class="brand"><span>Business Central</span><span class="brand-badge">SETTINGS</span></div>
          <div class="status-tag"><span class="dot"></span> All Systems Operational</div>
        </div>
        <div class="content" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
          <div class="card">
            <div class="card-header"><span class="card-title">🖨 Thermal Printer</span><span class="badge badge-green">Connected</span></div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">ESC/POS Bluetooth 80mm Printer paired with Cash Drawer pulse.</p>
            <button class="btn btn-secondary" style="width: 100%;">Print Test Receipt</button>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">🌐 Language Setting</span><span class="badge badge-blue">English</span></div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">Instant multi-language switching across all registers:</p>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary" style="padding: 6px 12px;">English</button>
              <button class="btn btn-secondary" style="padding: 6px 12px;">မြန်မာ</button>
              <button class="btn btn-secondary" style="padding: 6px 12px;">ไทย</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><span class="card-title">⚡ Offline & Sync</span><span class="badge badge-green">Synced</span></div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px;">Local SQLite/IndexedDB queue holding 0 pending operations.</p>
            <button class="btn btn-secondary" style="width: 100%;">Force Sync Now</button>
          </div>
        </div>

        <svg class="annotation-layer" viewBox="0 0 1200 700">
          <rect x="40" y="85" width="360" height="240" rx="10" fill="none" stroke="#10b981" stroke-width="2.5" />
          <rect x="420" y="85" width="360" height="240" rx="10" fill="none" stroke="#38bdf8" stroke-width="2.5" />
          <rect x="800" y="85" width="360" height="240" rx="10" fill="none" stroke="#f59e0b" stroke-width="2.5" />
        </svg>

        <div class="step-badge" style="left: 35px; top: 75px;">1</div>
        <div class="step-badge" style="left: 415px; top: 75px;">2</div>
        <div class="step-badge" style="left: 795px; top: 75px;">3</div>
      </div>
    `,
  },
];

async function generateAll() {
  console.log("Launching Playwright Chromium for screenshot generation...");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 720 },
    deviceScaleFactor: 2, // High DPI 2x retina
  });
  const page = await context.newPage();

  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    console.log(`[${i + 1}/${screens.length}] Generating ${s.name} (${s.title})...`);

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>${commonStyles}</style>
        </head>
        <body>
          ${s.html}
        </body>
      </html>
    `;

    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    const buffer = await page.screenshot({ type: "png" });

    // Save to public/guide-screenshots/
    const pubPath = path.join(publicDir, s.name);
    fs.writeFileSync(pubPath, buffer);

    // Save copy to root guide-screenshots/
    const rootPath = path.join(rootGuideDir, s.name);
    fs.writeFileSync(rootPath, buffer);
  }

  await browser.close();
  console.log("All 19 high-resolution annotated screenshots generated successfully!");
  console.log("Files available in:");
  console.log(" 1. Web public folder:", publicDir);
  console.log(" 2. Explorer root folder:", rootGuideDir);
}

generateAll().catch((err) => {
  console.error("Error generating screenshots:", err);
  process.exit(1);
});
