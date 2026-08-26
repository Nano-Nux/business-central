# Portal and Mobile UI/UX Parity

`business-central-portal` and `business_central_mobile` are two interfaces for the same operational product. They must share workflows and outcomes even when controls are platform-specific.

Use `PORTAL_MOBILE_PARITY.md` as the feature-by-feature release gate. Do not implement a portal-only operational feature without recording its mobile counterpart and the reason for any intentional difference.

## Shared requirements

- Same terminology and entity names
- Same navigation concepts
- Same role and permission behavior
- Same merchant-module visibility
- Same validation and error meaning
- Same lifecycle states and status labels
- Same POS sequence and totals
- Same service and repair workflows

## Allowed platform differences

- Responsive web layout versus native mobile layout
- Mouse/keyboard interactions versus touch interactions
- Web PWA installation versus native app installation
- Platform-specific dialogs, navigation controls, and accessibility conventions

Platform differences must not change the business outcome or bypass backend authorization.

### Mobile navigation adaptation

The native shell keeps the portal’s permission- and module-filtered destination
set while adapting navigation to available space:

- Phone widths below 600 px use a modal drawer opened from the app bar.
- Tablet widths at or above 600 px use a persistent, scrollable sidebar.
- The active destination, shop scope, labels, and offline-mode meaning remain
  consistent across both layouts.

## Transaction history parity record

| Field | Shared requirement |
|---|---|
| Feature | Shop-scoped cross-module transaction history, separate from Financial Reports and the stock movement ledger |
| Portal route/screens | `/transaction-history` |
| Mobile screens | To be paired with the native transaction log screen |
| Shared workflow | Select one shop → filter/search the chronological feed → inspect stock, order, refund, and repair checkout activity |
| Permissions | `tenant.read`; backend enforces merchant and assigned-shop scope |
| Module | Cross-module; repair checkout entries appear when the repair module is enabled and has payment records |
| Offline behavior | Portal reads the backend; mobile must use its existing online/offline sync policy when implemented |
| Differences | Responsive table and pagination on web; native list/table adaptation on mobile |
| Acceptance tests | A selected shop never shows another shop’s records; all canonical channels plus stock and repair checkout events appear in the feed |

## Feature parity record

For every new portal feature, record:

| Field | Required value |
|---|---|
| Feature | Name and business purpose |
| Portal route/screens | Web implementation location |
| Mobile screens | Native implementation location |
| Shared workflow | Link to `DOMAIN_FLOWS.md` or a feature flow |
| Permissions | Codes from `AUTHORIZATION_MATRIX.md` |
| Module | Required merchant module, if any |
| Offline behavior | Read/write/sync policy |
| Differences | Intentional platform-specific differences |
| Acceptance tests | Shared test scenarios |

## Design system

The shared visual language still needs to be defined. Before building substantial screens, document typography, colors, spacing, components, form patterns, tables, empty states, loading states, errors, confirmation dialogs, and POS interaction patterns. `PORTAL_MOBILE_PARITY.md` is the current checklist for this work.

The mobile foundation uses the portal's terminology while adapting the first-run
offline setup to a touch form with explicit local-only messaging. Authenticated
operational screens must continue to use the same labels, status colors, and
permission meanings as the portal.
