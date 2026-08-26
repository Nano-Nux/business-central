# Requirements and Acceptance Criteria

This document records cross-project requirements. Detailed feature requirements should link back here and to the relevant project records.

## R-001: Single backend

All authoritative APIs, domain rules, permissions, module checks, and persistence are implemented in `business-central-backend`.

Acceptance: no client can bypass backend authorization or create a competing source of truth.

## R-002: Tenant isolation

Merchant-owned records and operations cannot cross merchant boundaries.

Acceptance: cross-merchant reads, writes, foreign keys, and synchronization operations are rejected and tested.

## R-003: Portal/mobile parity

Portal and mobile expose the same operational workflows and business outcomes.

Acceptance: each feature has matching screens, permissions, validation, statuses, and acceptance tests.

## R-004: Mobile runtime modes

`ONLINE` mode may temporarily operate from local SQLite and later synchronize. `FULLY_OFFLINE` mode, selected through `.env`, performs no backend request at any time.

Acceptance: network interception tests prove zero requests in `FULLY_OFFLINE` mode, including background behavior, and verify that synchronization is enabled only for temporary disconnection in `ONLINE` mode.

## R-005: Safe synchronization

Reconnection does not duplicate or silently lose operations.

Acceptance: retries, app restarts, duplicates, partial sync, and conflicts are tested.

## R-006: Module-aware product

Merchant features are available only when the relevant module is enabled and the user has permission.

Acceptance: both API and clients reject or hide disabled-module capabilities.

## Feature requirement format

Every substantial feature should document:

- business purpose;
- actors and permissions;
- module dependency;
- domain entities and lifecycle;
- API contract;
- portal workflow;
- mobile workflow and offline policy;
- validation and error behavior;
- acceptance tests;
- implementation status.
