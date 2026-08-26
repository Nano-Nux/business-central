# Development Guide

## Start the local stack

From the repository root on Windows, start the backend, portal, and admin app
with fixed ports:

```powershell
.\start-dev.ps1
```

The script waits for every service to become ready and prints these URLs:

- Portal: <http://localhost:3000>
- Admin: <http://localhost:3001>
- Backend: <http://localhost:8080>
- Swagger: <http://localhost:8080/swagger/>

Use `.\start-dev.ps1 -OpenBrowser` to also open the portal and admin in the
default browser. Logs are written under `.dev-runtime`. Stop the complete
process trees with:

```powershell
.\stop-dev.ps1
```

## Backend

```text
cd business-central-backend
go test ./...
```

The backend is Go Fiber with Hexagonal Architecture and Domain-Driven Design. New business behavior belongs in domain/application layers and is exposed through adapters such as HTTP handlers and persistence implementations.

## Next.js applications

```text
cd business-central-admin
npm install
npm run dev
npm run lint
npm run build
```

Use equivalent commands in `business-central-portal` and `business-central-public-facing`. Admin and portal are intended to behave as progressive web apps.

## Mobile

```text
cd business_central_mobile
flutter pub get
flutter analyze
flutter test
```

Mobile schema changes must be considered together with `business-central-backend/schema.sql`, synchronization, migrations, and offline tests.

## Change checklist

- Identify the owning project and canonical domain model.
- Check role, permission, and merchant-module behavior.
- Keep portal and mobile workflows aligned.
- If backend schema or API changes, update clients and documentation.
- Test `ONLINE` connected, `ONLINE` temporary-offline, reconnect, retry, duplicate-operation, and `FULLY_OFFLINE` no-network scenarios where relevant.
- Update the affected project's `FEATURES.md` and `IMPLEMENTATION_STATUS.md` when implementation status changes.
