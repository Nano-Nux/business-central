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
12. **Demo Scheduling (`DemoModal.tsx` / `ReceptionistWidget.tsx`)**: Shared AI support chat and real Calendar slot selection with visitor-confirmed booking.
13. **Global Footer (`Footer.tsx`)**: Structured site links and operational badges.

## Scope Rule

Operational merchant workflows and authenticated operations belong exclusively to `business-central-portal`, `business_central_mobile`, and `business-central-admin`.

## Commands

- `npm run dev` — Start the development server
- `npm run build` — Create an optimized production build
- `npm run start` — Run production server
- `npm run lint` — Run ESLint across application code

## Privacy, terms and Google OAuth verification

Public, server-rendered `/privacy-policy` and `/terms-of-service` pages identify
Nanonux and its approved contact `nanonux808@gmail.com`. Both are linked from the
homepage footer, the receptionist notice, each other and the sitemap. Page
metadata has its own canonical URL. No account, Google sign-in or API access is
required to read either page. Set `NEXT_PUBLIC_SITE_URL` to the live HTTPS
homepage before building and register these exact live URLs in Google Auth
platform Branding. Verify domain ownership and keep OAuth branding consistent
with Nanonux Business Central / `business-central-receptionist`.

The content reflects the current implementation: administrator-only Calendar
connection, visitor-confirmed booking, free Gemini processing, admin transcript
review, browser session storage, encrypted refresh credentials, manual deletion
requests, and no automatic transcript purge. Keep disclosures synchronized with
data-flow changes. The public contact must be monitored, and deletion/access
requests need an operational process; text alone does not implement deletion.

**Verification blocker with the current free-Gemini design:** the backend sends
Calendar-derived availability, booking state and references to Gemini. Google's
unpaid Gemini terms permit model improvement/human review and prohibit submitting
sensitive, confidential or personal information. Workspace API policy restricts
Google-data transfers for generalized AI training. Do not add a categorical
no-training/Limited Use compliance claim while this conflict remains. Before
verification, isolate Google API data and personal booking details from free AI
processing, use an appropriately contracted no-training service, or disable the
affected AI integration. Review arbitrary visitor chat separately for personal
data. Free Gemini also has regional restrictions (including paid-service
requirements for EEA/UK/Switzerland). The pages disclose current behavior; they
are not evidence of Google approval, a compliance certification or a guarantee
that verification will pass.

Sources: [Google API user data policy](https://developers.google.com/terms/api-services-user-data-policy),
[Workspace API policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy),
[Gemini API terms](https://ai.google.dev/gemini-api/terms),
[OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## Public AI support and real appointments

The floating **Ask Nanonux** launcher and demo CTAs share the `ReceptionistWidget` conversation. Approved product/support answers and tool-driven availability come from the existing Go backend. Visitors choose an available time, supply contact details and explicitly confirm before booking. Pending outcomes preserve the booking request ID across retries and reloads. Session capabilities use tab-scoped session storage. The previous simulated demo/sandbox success screen is replaced; no automatic sandbox provisioning is promised. Set `NEXT_PUBLIC_API_URL` before building and configure/enable reception in Admin. See [backend setup and boundaries](../business-central-backend/internal/receptionist/README.md).

Chat messages appear immediately while the AI reply is pending. Availability is
grouped by business-local date with time ranges and timezone. Selecting a time
in chat or the booking panel opens contact details directly without asking for
the date/time again. **Change time** retains contact details and resets consent.
Expired/unavailable offers return to time selection with the details preserved;
uncertain bookings retain the same request for reconciliation. Visitors can
continue chatting after confirmation. Model text is rendered safely as text,
with basic Markdown markers and escaped entities cleaned up for readability.
