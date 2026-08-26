# Portal Agent Instructions

- This is a Next.js PWA for merchant owners, managers, and staff.
- Build dashboard and POS workflows against `business-central-backend` APIs.
- The backend is authoritative for permissions, modules, validation, and state transitions.
- Keep workflows, terminology, permissions, and visual design aligned with `business_central_mobile`.
- Before implementing an operational feature, add or update its row in the root `PORTAL_MOBILE_PARITY.md`.
- Do not mark a feature complete until the matching mobile workflow, design reference, and shared acceptance tests are recorded.
- Do not duplicate domain rules in the frontend.
- Inspect the installed Next.js documentation under `node_modules/next/dist/docs/` when framework behavior is relevant.
- Run `npm run lint` and `npm run build` before finishing when applicable.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
