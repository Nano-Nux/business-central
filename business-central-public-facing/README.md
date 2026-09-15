# Business Central Public Facing

Public-facing enterprise advertisement, product demonstration, and marketing web application for Business Central.

## Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI / Core**: React 19, TypeScript 5
- **Styling**: Tailwind CSS v4, PostCSS, Custom glassmorphism and ambient mesh gradients
- **Icons**: Lucide React

## Architecture & Features

This project showcases the complete enterprise capabilities of Business Central:

1. **Header & Navigation (`Navbar.tsx`)**: Clean navigation header with live system status badge, capability dropdowns, and mobile menu.
2. **Hero Section (`Hero.tsx`)**: High-impact editorial headline, business owner operational metrics (sub-second checkout, 0 lost sales offline, 100% audit, role-based controls), and clear conversion CTAs.
3. **Interactive Simulator (`HeroInteractiveSimulator.tsx`)**: Centerpiece multi-tab operational simulator:
   - *Omnichannel POS*: Touch catalog, live cart calculations, split-tender selection, and instant thermal receipt preview.
   - *Device Repair Hub*: Multi-device intake ticket with 20-point diagnostics, status stepper, and FIFO parts cost deduction.
   - *FIFO Inventory Ledger*: Multi-location stock matrix and immutable movement logs.
   - *Offline Edge Engine*: Simulated network outage, local mutation buffering, and automatic reconciliation.
4. **Daily Store Operations (`StoreOperations.tsx`)**: 4 operational pillars covering the front counter, repair workbench, stockroom, and remote owner analytics, highlighting developed AI-assisted business features with structured data queries and context-based responses, plus zero hardware lock-in.
5. **Module Catalogue (`ModuleCatalogue.tsx`)**: Detailed showcase of all 7 merchant modules (`CORE`, `POS`, `INVENTORY`, `REPAIR`, `SERVICE`, `ACCOUNTING`, `CLINICAL`) with tangible business impact, AI-assisted query highlights, and staff benefits.
6. **Offline Protection Deep-Dive (`OfflineSyncDeepDive.tsx`)**: Practical breakdown of continuous offline selling and standalone offline mode for remote sites.
7. **ROI Calculator (`RoiCalculator.tsx`)**: Interactive sliders for stores, monthly orders, and technicians estimating annual staff labor savings and outage protection.
8. **Vendor Comparison Matrix (`ComparisonTable.tsx`)**: Objective comparison against legacy POS, generic ERPs, and niche repair software, including native AI-assisted business query intelligence.
9. **Customer Stories & Metrics (`TestimonialsAndMetrics.tsx`)**: Retail and repair operator testimonials with verified production metrics.
10. **Transparent Pricing (`PricingSection.tsx`)**: Clear tiers at MMK 80,000 / MMK 150,000 / MMK 400,000 per month with annual savings toggle and AI-assisted business intelligence included.
11. **Store Owner FAQ (`FaqSection.tsx`)**: Searchable accordion answering key operational questions on offline reliability, hardware compatibility, data migration, and AI-assisted tools.
12. **Demo Scheduling Modal (`DemoModal.tsx`)**: Lead capture modal with sandbox provisioning feedback.
13. **Global Footer (`Footer.tsx`)**: Structured site links and operational badges.

## Scope Rule

Operational merchant workflows and authenticated operations belong exclusively to `business-central-portal`, `business_central_mobile`, and `business-central-admin`.

## Commands

- `npm run dev` — Start the development server
- `npm run build` — Create an optimized production build
- `npm run start` — Run production server
- `npm run lint` — Run ESLint across application code
