# Architecture Decisions

## Backend ownership

There is one main backend: `business-central-backend`. All APIs and authoritative business rules live there.

## Hexagonal DDD backend

The backend uses Hexagonal Architecture and Domain-Driven Design so domain rules remain independent from HTTP, databases, and external adapters.

## Portal/mobile parity

The portal and mobile application represent the same merchant operational product. Their workflows, permissions, terminology, and business outcomes must remain consistent.

## Mobile runtime modes

Mobile has an `ONLINE` mode and a `FULLY_OFFLINE` mode. `ONLINE` mode uses local SQLite as temporary offline storage and synchronizes after reconnection. `FULLY_OFFLINE` mode is selected through `.env`, requires no internet, never connects to the backend, and never synchronizes.

## Deferred public site

The public-facing Next.js project is currently a marketing/advertising landing page and is not an immediate development priority.
