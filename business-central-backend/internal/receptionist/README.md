# Nanonux public receptionist

This platform-owned bounded context serves the Nanonux marketing website. It
does not use `internal/ai`, merchant query tools, merchant quotas, tenant customer
records, portal workflows, or mobile synchronization. All external provider calls
and booking decisions execute in this Go backend.

## Setup

1. Apply migration `0056_public_receptionist` (`AUTO_MIGRATE=true` runs the
   embedded migration at startup). Fresh `schema.sql` includes the same tables.
2. Set `RECEPTIONIST_GEMINI_API_KEY` (falls back to `GEMINI_API_KEY`) and
   `RECEPTIONIST_AI_MODEL` (default `gemini-2.5-flash`, configurable independently
   of merchant AI).
3. Enable Google Calendar API in a Google Cloud project. Configure the OAuth
   consent screen and a **Web application** OAuth client. In testing mode, add
   the calendar owner as a test user. Register exactly:
   `https://YOUR_API/api/v1/public/receptionist/google/callback`.
4. Set these **backend-only** variables:

   ```dotenv
   RECEPTIONIST_GOOGLE_CLIENT_ID=
   RECEPTIONIST_GOOGLE_CLIENT_SECRET=
   RECEPTIONIST_GOOGLE_REDIRECT_URL=https://YOUR_API/api/v1/public/receptionist/google/callback
   RECEPTIONIST_ADMIN_URL=https://YOUR_ADMIN/receptionist
   RECEPTIONIST_ENCRYPTION_KEY=
   ```

   Generate a key using PowerShell:

   ```powershell
   $receptionistKey = New-Object byte[] 32
   [System.Security.Cryptography.RandomNumberGenerator]::Fill($receptionistKey)
   [Convert]::ToBase64String($receptionistKey)
   ```

   Keep the key stable and backed up with secrets; changing it requires
   reconnecting Google. Refresh tokens and short-lived PKCE verifiers are
   encrypted using AES-256-GCM. Secrets are never returned to either frontend.
5. Set `NEXT_PUBLIC_API_URL=https://YOUR_API/api/v1` in the public site and
   Admin **before building**. Add both frontend origins to backend `CORS_ORIGIN`.
6. Open **Admin → Public receptionist → Settings & integrations**. Review the
   approved knowledge and greeting, choose the business timezone, working days,
   hours, duration, daily turn limit and calendar ID. Save, then connect the
   calendar owner with Google. Use a dedicated support calendar; `primary`
   means the connected user's primary calendar. Enable reception when ready.

Local callback example: `http://localhost:8080/api/v1/public/receptionist/google/callback`.
Set the Admin return URL to its actual development port. Production requires HTTPS.
Google testing-mode refresh tokens can expire; configure the consent app's
publishing/verification as required by Google for the intended deployment.

## Workflow and invariants

- The floating launcher and existing demo CTAs share a conversation. The site
  shows its AI/data-storage notice before collecting a message. Session access
  uses a random 256-bit bearer capability, hashed in PostgreSQL, with a 30-day
  expiry. The browser retains its capability in tab-scoped session storage.
- Only server-persisted history and approved Admin knowledge go to Gemini.
  Outputs render as plain text. The only model-accessible tool is
  `check_calendar_slots(date)`. Function identifiers and opaque thought
  signatures are preserved between tool rounds. Unknown tool names cannot run.
- The visitor selects an offered slot, supplies name/email and optional business
  and notes, and explicitly consents before the backend booking operation runs.
  The LLM cannot create events from an instruction embedded in chat text.
- Appointments are offered at configured duration intervals in the business
  timezone, strictly more than one hour ahead, up to 60 calendar days ahead.
  Both Google's busy intervals (including per-calendar errors) and local pending
  reservations are respected. Offers expire after 15 minutes and are rechecked
  against current policy and Google availability during confirmation.
- An advisory lock serializes booking and calendar-configuration changes across
  backend instances sharing PostgreSQL. A conversation may have one active
  booking. Local reservation and contact details commit before provider writes.
  Google Calendar cannot atomically reserve a free/busy result against unrelated
  external schedulers; use the dedicated calendar consistently.
- A client-generated UUID is the booking idempotency key. Its normalized value
  is the Google event ID. A retry with changed details is rejected. Ambiguous
  provider outcomes remain `PENDING`, and the same request looks up its owned
  event before attempting creation again. Definitive event-creation rejections
  become `FAILED` and release the local reservation. The browser persists the request
  before sending it and restores pending requests after a reload. Never mark a
  pending booking confirmed based on model text. Guest notifications are
  requested with `sendUpdates=all`; Google controls delivery/acceptance.
- OAuth begins on an authenticated, platform-admin-only endpoint. A top-level
  backend redirect sets an HttpOnly, host-only SameSite=Lax state cookie, avoiding
  third-party-cookie requirements between Admin and API. Callback requires the
  matching cookie, unexpired single-use state and PKCE verifier. Callback query
  strings and tokens are not logged by the application's request logger.
- Public requests have IP limits (30/minute; conversation creation 5/minute).
  Chats have 4KB input, bounded history/tool rounds, a conversation limit, and an
  atomic UTC daily turn budget. Provider errors consume a turn. Availability and
  booking endpoints do not consume AI turns. Configure proxy/IP attribution and
  edge abuse controls for your deployment; application limits are per process.
- `/admin/receptionist/*` requires an authenticated platform administrator.
  Paginated chat history includes full transcripts and linked bookings; booking
  lists support status filtering and details include contact, notes, timezone,
  calendar/event IDs, provider issue and conversation link. No merchant header
  selects or grants access to these platform records.

The new tables use RLS with a transaction-local receptionist repository context.
They are platform support records, not another customer or order master. Visitor
capability expiry does not purge history. Retention/deletion policy should be
set before production use; no automatic deletion is introduced here. Existing
merchant AI purge controls do not affect these records.

## Boundaries

This version supports Nanonux support/product chat and demo/support appointments.
It does not add a merchant-hosted receptionist product, Slack/CRM integrations,
budget qualification, autonomous sandbox provisioning, appointment cancellation,
rescheduling or Google change webhooks. Booking status is the integration's
creation outcome, not a live mirror of edits/cancellations made in Google.
Disconnect removes the locally stored credential and leaves existing Google
events intact; Google account permissions can also be revoked in Google settings.

## Verification

```powershell
go test ./...
$env:RECEPTIONIST_TEST_DATABASE_URL='postgres://test_user:test_password@localhost:5432/test_database?sslmode=disable'
go test -count=1 -v ./internal/receptionist/...
```

The database test creates and drops only a randomly named private schema and
test role; its database user must be allowed to create both. It tests the real
migration and RLS under a restricted role, visitor isolation, encrypted OAuth
state/token storage, full tool and booking flow, lost Google response recovery,
idempotency, pending reservations, history/detail queries, budgets and expiry.
Adapters use HTTP test servers; no real Google event or LLM call is made by tests.

Provider references: [Gemini tool calling](https://ai.google.dev/gemini-api/docs/function-calling),
[Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query),
[event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Browser verification (after building both Next.js apps):

```powershell
cd business-central-public-facing
npm run test:e2e
```

The Playwright suite uses local production servers on ports 3211/3212 and mocks
only API responses. Chrome is the configured browser; install it or select an
available Playwright browser in `playwright.config.ts`. It verifies public chat,
explicit booking consent, retry after reload, Admin pagination/transcripts/booking
links, settings and the Google connection launch. Provider integration tests above
verify the server-side Calendar/OAuth requests separately.
