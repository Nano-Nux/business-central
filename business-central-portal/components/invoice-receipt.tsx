"use client";

import { useEffect, useRef } from "react";
import { invoiceCanvas } from "@/lib/invoice";
import type { Invoice } from "@/lib/types";

export function InvoiceReceipt({
  invoice,
  variant = "pos",
}: {
  invoice: Invoice;
  variant?: "pos" | "repair";
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const target = host.current;
    if (!target) return;
    target.replaceChildren();
    target.textContent = "Generating invoice preview…";

    void invoiceCanvas({ ...invoice, kind: variant }).then((canvas) => {
      if (!active || !host.current) return;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        `${variant === "repair" ? "Repair ticket" : "Sales"} invoice ${invoice.number}`,
      );
      host.current.replaceChildren(canvas);
    });

    return () => {
      active = false;
    };
  }, [invoice, variant]);

  return (
    <article className={`invoice-print invoice-canvas-preview invoice-print-${variant}`}>
      <div ref={host} className="invoice-canvas-host" aria-live="polite" />
    </article>
  );
}
