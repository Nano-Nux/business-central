import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Business Central | Unified POS, Device Repair & FIFO Inventory Platform";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#020617",
          padding: "60px 80px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              backgroundColor: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 900,
              color: "#020617",
            }}
          >
            BC
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.5px" }}>
              Business Central
            </span>
            <span style={{ fontSize: "14px", color: "#34d399", fontWeight: 600 }}>
              Enterprise Unified Commerce v2.6
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
          <h1
            style={{
              fontSize: "54px",
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-1.5px",
              margin: 0,
              color: "#ffffff",
            }}
          >
            Point of Sale, Device Repair & FIFO Inventory.{" "}
            <span style={{ color: "#34d399" }}>Built as One.</span>
          </h1>
          <p style={{ fontSize: "22px", color: "#94a3b8", lineHeight: 1.4, margin: 0 }}>
            Sub-second checkout &bull; 20-point repair diagnostics &bull; Air-gapped offline synchronization
          </p>
        </div>

        <div style={{ display: "flex", gap: "16px" }}>
          <div
            style={{
              backgroundColor: "#064e3b",
              border: "1px solid #10b981",
              borderRadius: "9999px",
              padding: "10px 24px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#a7f3d0",
            }}
          >
            0 Lost Sales Offline
          </div>
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "9999px",
              padding: "10px 24px",
              fontSize: "16px",
              fontWeight: 600,
              color: "#cbd5e1",
            }}
          >
            Strict FIFO Stock Ledger
          </div>
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "9999px",
              padding: "10px 24px",
              fontSize: "16px",
              fontWeight: 600,
              color: "#cbd5e1",
            }}
          >
            Zero Hardware Lock-In
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
