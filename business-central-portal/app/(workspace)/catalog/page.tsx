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
      <div className="catalog-grid">
        {visibleAreas.map((area) => (
          <Link className="catalog-card" href={area.href} key={area.href}>
            <span className={`stat-icon ${area.color}`}>
              <Icon name={area.icon} />
            </span>
            <div>
              <h2>{area.title}</h2>
              <p>
                {simple && area.href === "/products"
                  ? "Products and their selling details"
                  : simple && area.href === "/pricing"
                    ? "Price lists and authoritative product prices"
                    : area.text}
              </p>
            </div>
            <Icon name="arrow" />
          </Link>
        ))}
      </div>
    </>
  );
}
