"use client";

import Link from "next/link";
import { RepairsPage } from "@/components/repairs-page";
import { Icon } from "@/components/icons";

export default function RepairDeskPage() {
  return (
    <>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          href="/repairs"
          className="text-link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <Icon name="arrow" size={14} />
          </span>
          <span>Back to Repairs</span>
        </Link>
      </div>
      <RepairsPage />
    </>
  );
}
