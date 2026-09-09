"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const areas = [
  {
    href: "/categories",
    icon: "catalog" as const,
    title: "Categories",
    text: "Product groups and hierarchy",
    color: "blue",
  },
  {
    href: "/brands",
    icon: "tag" as const,
    title: "Brands",
    text: "Manage product brands",
    color: "purple",
  },
  {
    href: "/products",
    icon: "box" as const,
    title: "Products",
    text: "Products, variants, SKUs and barcodes",
    color: "mint",
  },
  {
    href: "/units",
    icon: "package" as const,
    title: "Units",
    text: "Selling and stocking units of measure",
    color: "blue",
  },
  {
    href: "/unit-conversions",
    icon: "swap" as const,
    title: "Unit conversions",
    text: "Define packs, cases and base quantities",
    color: "amber",
  },
  {
    href: "/pricing",
    icon: "tag" as const,
    title: "Pricing",
    text: "Price lists and authoritative variant prices",
    color: "purple",
  },
  {
    href: "/promotions",
    icon: "tag" as const,
    title: "Promotions",
    text: "Discounts for products, POS and repair",
    color: "purple",
  },
];
export default function CatalogPage() {
  const { merchant } = useAuth();
  const simple = merchant?.pos_complexity_level === "SIMPLE";
  const visibleAreas = simple
    ? areas.filter((area) =>
        ["/categories", "/brands", "/products", "/pricing", "/units"].includes(area.href),
      )
    : areas;
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Catalog"
        description={
          simple
            ? "Create products and set the prices used at checkout."
            : "Keep everything you sell organized in one place."
        }
      />
      <div className="catalog-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleAreas.map((area) => {
          const colorStyles =
            {
              blue: "bg-status-info-soft text-status-info",
              purple: "bg-status-conflict-soft text-status-conflict",
              mint: "bg-status-success-soft text-status-success",
              amber: "bg-status-warning-soft text-status-warning",
            }[area.color] ?? "bg-canvas text-ink";

          return (
            <Link
              className="catalog-card flex items-center gap-4 p-5 rounded-2xl border border-line bg-paper hover:border-ink/40 transition cursor-pointer text-left shadow-xs"
              href={area.href}
              key={area.href}
            >
              <span
                className={`stat-icon ${area.color} flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${colorStyles}`}
              >
                <Icon name={area.icon} size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-ink m-0 truncate">{area.title}</h2>
                <p className="text-xs text-muted m-0 mt-0.5 leading-relaxed line-clamp-2">
                  {simple && area.href === "/products"
                    ? "Products and their selling details"
                    : simple && area.href === "/pricing"
                      ? "Price lists and authoritative product prices"
                      : area.text}
                </p>
              </div>
              <Icon name="arrow" size={16} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
