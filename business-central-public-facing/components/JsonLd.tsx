import React from "react";

interface JsonLdProps {
  siteUrl: string;
}

export default function JsonLd({ siteUrl }: JsonLdProps) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: "Nano Nux",
    alternateName: "Nano Nux Co., Ltd.",
    url: siteUrl,
    logo: `${siteUrl}/nanonux_business_central_icon.png`,
    description: "Provider of high-performance operating software for retail, device repair, and enterprise commerce.",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales and customer support",
      availableLanguage: ["English", "Burmese"],
    },
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${siteUrl}/#software`,
    name: "Business Central",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser, Android, iOS, Windows, macOS, Linux",
    browserRequirements: "Requires modern JavaScript-enabled browser (Chrome, Safari, Edge, Firefox)",
    url: siteUrl,
    description:
      "Unified commerce platform combining high-speed touch POS, multi-device repair diagnostics, real-time FIFO inventory tracking, and air-gapped offline synchronization.",
    provider: {
      "@id": `${siteUrl}/#organization`,
    },
    featureList: [
      "Sub-second touch point of sale cashiering and barcode scanning",
      "Multi-device intake tickets with 20-point diagnostic workbench",
      "Real-time FIFO inventory valuation across multiple stores",
      "Zero-downtime offline edge engine with automatic cloud synchronization",
      "Split-tender payments, thermal printing, and digital audit receipts",
      "Strict enterprise tenant isolation and role-based access control",
      "Built-in AI-assisted business intelligence and inventory reorder queries",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Starter Tier",
        price: "80000",
        priceCurrency: "MMK",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "80000",
          priceCurrency: "MMK",
          unitText: "MONTH",
        },
        description: "Essential POS and real-time inventory for single-location retail shops.",
      },
      {
        "@type": "Offer",
        name: "Growth Tier",
        price: "150000",
        priceCurrency: "MMK",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "150000",
          priceCurrency: "MMK",
          unitText: "MONTH",
        },
        description: "Full retail POS, multi-device repair diagnostics, and FIFO stock ledger for up to 3 locations.",
      },
      {
        "@type": "Offer",
        name: "Enterprise Tier",
        price: "400000",
        priceCurrency: "MMK",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "400000",
          priceCurrency: "MMK",
          unitText: "MONTH",
        },
        description: "Unlimited locations, dedicated cloud cluster, 99.99% SLA, and custom ERP integrations.",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "128",
      bestRating: "5",
      worstRating: "1",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl}/#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: "How does offline protection work if our store internet cuts out?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Your registers never freeze. When your Wi-Fi or broadband drops, the register keeps scanning barcodes, ringing up customers, and printing receipts without delay. All transactions are securely stored locally on your device. The instant connectivity returns, everything syncs automatically to your central cloud dashboard with zero duplicate charges and zero lost inventory records.",
        },
      },
      {
        "@type": "Question",
        name: "Can our store operate exclusively with POS and Inventory, without the Repair module?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Business Central is completely modular. If you only run retail, your staff only see POS and Inventory screens. If you operate an electronics or device repair depot, you can enable repair tickets and service workbenches. You only pay for what you use, keeping your staff interface fast, focused, and uncluttered.",
        },
      },
      {
        "@type": "Question",
        name: "What receipt printers, barcode scanners, and cash drawers are supported?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You are never locked into proprietary hardware. We support industry-standard thermal receipt printers (Epson, Star Micronics via USB, Ethernet, or Bluetooth), standard USB/Bluetooth 1D/2D barcode scanners (Zebra, Honeywell), and standard cash drawers connected via RJ11 printer kickout.",
        },
      },
      {
        "@type": "Question",
        name: "How is Business Central hosted, backed up, and secured?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Business Central is delivered as a secure cloud platform with 99.99% uptime, automated continuous cloud backups, and end-to-end encryption. Your store data is protected by enterprise-grade tenant isolation, ensuring only authorized members of your team can access your financials and customer records. Dedicated private cloud hosting is also available for enterprise chains.",
        },
      },
      {
        "@type": "Question",
        name: "Can we use Business Central in remote locations with zero internet?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Business Central offers a dedicated standalone offline mode designed for pop-up kiosks, remote field locations, and trade shows. You can ring up sales, manage stock, and print receipts indefinitely without any internet connection.",
        },
      },
      {
        "@type": "Question",
        name: "How easily can we migrate our data from our existing POS or repair software?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We provide simple, guided import tools and dedicated onboarding assistance. You can bring over all your existing customer lists, product catalogs with variants, supplier records, and opening stock levels from systems like Lightspeed, Square, Shopify, or RepairQ with zero downtime.",
        },
      },
      {
        "@type": "Question",
        name: "Does Business Central offer AI-assisted business features?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. We have developed AI-assisted business features with structured data queries and context-based responses. Instead of manually combing through complex reporting tabs, store owners can ask natural language questions—such as inventory reorder recommendations, technician turnaround rates, and top-selling product categories—and receive immediate, accurate responses derived directly from verified store data.",
        },
      },
    ],
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "Business Central",
    url: siteUrl,
    description: "Enterprise POS, device repair management, and FIFO inventory platform.",
    publisher: {
      "@id": `${siteUrl}/#organization`,
    },
    inLanguage: "en-US",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
    </>
  );
}
