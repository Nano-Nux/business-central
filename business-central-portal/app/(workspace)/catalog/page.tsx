"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

const secondaryAreas = [
  {
    href: "/categories",
    icon: "catalog" as const,
    titleKey: "catalog.categories_title",
    titleFallback: "Categories",
    descKey: "catalog.categories_description",
    descFallback: "Product groups and hierarchy",
    color: "blue",
  },
  {
    href: "/brands",
    icon: "tag" as const,
    titleKey: "catalog.brands_title",
    titleFallback: "Brands",
    descKey: "catalog.brands_description",
    descFallback: "Manage product brands",
    color: "purple",
  },
  {
    href: "/units",
    icon: "package" as const,
    titleKey: "catalog.units_title",
    titleFallback: "Units",
    descKey: "catalog.units_description",
    descFallback: "Selling and stocking units of measure",
    color: "blue",
  },
  {
    href: "/unit-conversions",
    icon: "swap" as const,
    titleKey: "catalog.unit_conversions_title",
    titleFallback: "Unit conversions",
    descKey: "catalog.unit_conversions_description",
    descFallback: "Define packs, cases and base quantities",
    color: "amber",
  },
  {
    href: "/pricing",
    icon: "tag" as const,
    titleKey: "catalog.pricing_title",
    titleFallback: "Pricing",
    descKey: "catalog.pricing_description",
    descFallback: "Price lists and authoritative variant prices",
    color: "purple",
  },
];

export default function CatalogPage() {
  const { merchant } = useAuth();
  const { t } = useTranslation();
  const mini = merchant?.pos_complexity_level === "MINI";
  const simple = merchant?.pos_complexity_level === "SIMPLE";

  const visibleSecondary = mini
    ? secondaryAreas.filter((area) => ["/categories", "/brands"].includes(area.href))
    : simple
      ? secondaryAreas.filter((area) =>
          ["/categories", "/brands", "/pricing", "/units"].includes(area.href),
        )
      : secondaryAreas;

  const productDescription = mini
    ? t("catalog.products_mini_desc", "Products with original and sell prices")
    : simple
      ? t("catalog.products_simple_desc", "Products and their selling details")
      : t("catalog.products_desc", "Products, variants, SKUs and barcodes");

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Catalog"
        description={
          mini
            ? "Create products with direct original and sell prices."
            : simple
              ? "Create products and set the prices used at checkout."
              : "Keep everything you sell organized in one place."
        }
      />
      <div className="catalog-grid">
        <Link className="catalog-card product-hero-card" href="/products">
          <span className="stat-icon blue product-hero-icon">
            <Icon name="box" />
          </span>
          <div className="product-hero-content">
            <div className="product-hero-header">
              <h2>{t("catalog.products_title", "Products")}</h2>
              <span className="product-hero-badge">
                {t("catalog.primary_catalog", "Primary catalog")}
              </span>
            </div>
            <p>{productDescription}</p>
          </div>
          <div className="product-hero-action">
            <span>{t("catalog.open_products", "Open products")}</span>
            <Icon name="arrow" />
          </div>
        </Link>
        {visibleSecondary.map((area) => (
          <Link className="catalog-card" href={area.href} key={area.href}>
            <span className={`stat-icon ${area.color}`}>
              <Icon name={area.icon} />
            </span>
            <div>
              <h2>{t(area.titleKey, area.titleFallback)}</h2>
              <p>
                {simple && area.href === "/pricing"
                  ? t("catalog.pricing_simple_desc", "Price lists and authoritative product prices")
                  : t(area.descKey, area.descFallback)}
              </p>
            </div>
            <Icon name="arrow" />
          </Link>
        ))}
      </div>
    </>
  );
}
