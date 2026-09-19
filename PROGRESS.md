# My Little Gobbler — progress

## 2026-09-19
- Existing private repository found and cloned: JARA-org/vtevents. Only Idea.txt existed. No repository instructions or configured Actions secrets/variables found.
- Stack: Expo Router web frontend, modular Express/TypeScript backend, shared Zod schemas, Better Auth + MongoDB Atlas. Prefer a single Node service serving the Expo export to simplify cookies, OAuth, and hosting.
- Browser control verified. Render currently requires sign-in. Owner email requested once; account provisioning waits for that answer.
- Official documentation checked for Expo web export, Better Auth Mongo adapter, Atlas free clusters, Gemini pricing, Google OAuth, and Render free services.
- Google reference documents inaccessible through initial web fetch. Prompt governs scope.
- Build in progress. No deployment or live integration claims yet.

## Next
Implement shared scheduling/event model, integration modules and security, frontend, tests; provision owner services; verify live sources; deploy and browser-test.

## Handoff checkpoint — 2026-09-19 06:20 UTC

- Working monorepo implemented: Expo 57 / React Native / Expo Router frontend, Express TypeScript backend, Better Auth and MongoDB adapter, shared schemas/scheduling, integration modules, analytics outbox and jobs.
- Official GobblerConnect ICS and VT Sports public JSON-LD fetched and normalized successfully (2,219 / 349 records at direct verification; counts include past records).
- Latest `npm run typecheck`, `npm test` (15/15, including account isolation/deletion and mocked duplicate Google write), and `npm run build` all passed after preview-mode and job changes.
- Desktop landing and 390px mobile demo inspected. Save, details, destination review and ICS download exercised. Full production and latest preview browser verification remain outstanding.
- Site registered: `appgprj_6aae24e2bd588191a3b403b7ff3b54ba`. Manifest saved; **not deployed**. Reuse it.
- Production Atlas, Render, Gemini, Google OAuth, Canvas, Discord and Databricks not provisioned/live-tested. Owner email and Render sign-in were requested; no answer received. No payment method or billable resource enabled.
- `NEXT_AGENT_PROMPT.md` contains the full resumable takeover prompt. README and docs cover architecture, integration status, resource inventory, tests and demo.
- 13 moderate transitive dependency audit findings remain; inspect nested lockfile resolution despite overrides. More targeted launch-readiness work is listed in the takeover prompt.
- Source checkpoint `b9fde92462e32fe0fd7cafd83b71b566ade847e5` pushed successfully to private `JARA-org/vtevents/main`; local and remote SHAs matched. 45 project files added; staged secret/path scan passed. Local secrets, database, dependencies and builds are ignored. Audit scratch moved into ignored `work/`.
- Browser viewport reset to default. App and Render sign-in tabs marked for handoff. No production deployment has been claimed.

## Resumed checkpoint — 2026-09-19 08:00 UTC

- Read both original Google reference documents through the connected Drive account; prompt still governs scope.
- Investigated Stripe Projects catalog/preflight: Render Free available, Atlas/Gemini absent, Stripe browser authentication required. No substitute database or billable resources created.
- Core account browser steps remain pending: Render GitHub consent (`0utsights`), Atlas login, AI Studio first-use terms on observed Google session. Discord developer login and Databricks Free Edition signup also reached; personal sign-in/consent required. No production URL yet.
- Existing Sites project now returns NOT_FOUND to current connected account. Preserved project ID and did not create a duplicate.
- Fixed lockfile override resolution; clean install and audits now report zero vulnerabilities.
- Added transactional per-source snapshots with removal handling and canonical identity/provenance preservation. Failed partial sports refresh retains prior records. Fixed category substring false positives.
- Extended Gemini to validated semantic ranking of bounded public candidates, with unknown-ID rejection, unique daily budget, disabled SDK retries, and deterministic fallback even if budget storage fails. Updated opt-in disclosure; private schedules/messages never sent.
- Added durable remote analytics erasure/suppression and tested it with mocked Databricks. Background failures are redacted and caught; failed manual provider sync persists error status.
- Fixed persistent local Mongo restart by preserving its port. Existing data survived stop/start. Live adapters refreshed again: 2,219 GobblerConnect / 349 Sports; 1,503 current/ongoing listings.
- Added DST ambiguous/nonexistent boundary handling and multi-day all-day ICS end dates. Fixed sign-in navigation and initial profile display name.
- 21/21 tests, frontend/backend typechecks and production build passed. Browser verified synthetic-account onboarding, live search/details/save, calendar review/export feedback, saved schedule conflict and grounded Friday-after-five fallback. Live ICS endpoint separately verified HTTP200 text/calendar.
- Latest browser viewport remained512 despite390 request; measured no overflow at512. Earlier390/1280 checks remain separate evidence. Production/real Gemini and connected provider verification remain blocked.
- Rewrote NEXT_AGENT_PROMPT.md and updated handoff/inventory/verification with exact current state. Production launch is not complete; email verification/recovery and final deployed QA also remain.
- Source fixes and handoff pushed in aefc0f0 and 393d471; remote SHA verified. Follow-up concert/gallery classification test passes. Latest local runtime restarted with current code; browser confirmed saved preferences/events survived restart.

## Cloud-services checkpoint — 2026-09-19

- Provisioned and tested Atlas M0 Free with database-scoped application user, cluster restriction and workstation /32 network rule. Real signup/preferences/saves/ICS/deletion flow passed against Atlas.
- Verified real Gemini recommendations from stored event IDs using the free project. Public source refresh yielded 2,219 GobblerConnect / 349 Sports records and 1,502 discoverable events. Private schedule context stays in normal application code.
- Added Gobbler favicon and optional ElevenLabs narration with public-event-only payloads, authenticated endpoint, monthly character reservation, cache/concurrency control, size bound and explicit playback. Provider live setup is still pending.
- Added non-root Docker build and Caddy/Compose HTTPS deployment package. Docker Desktop engine was unavailable, so container build is not yet verified.
- User chose Vultr and explicitly requires $0 beyond credits with a hard cap. Verified $100 MLH credit but no credit-zero stop cap; submitted Free Tier application. User explicitly declined Render fallback and asked to keep hosting pending. No VM or public deployment exists.
- Discord app creation completed after user CAPTCHA: application1550880609491222639; branding description saved. No server authorization/channel selection or bot credentials yet.
- Databricks Free Edition exists. Genie One requested, but no callable MCP connection: catalog plugin ineligible, direct OAuth lacks dynamic registration, personal CLI consent incomplete. Exact supported path recorded in docs/GENIE_SETUP.md; do not bypass console's automation restriction.
- 22/22 tests, typechecks and production build passed. Current live-backed landing inspected at1280x720 and390x844 with no overflow; favicon linked correctly. Disposable cloud QA account deleted through the app.
- Updated resource inventory and takeover prompt. V1 is not fully deployed; provider setup, auth email recovery/verification and production HTTPS QA remain.
- Follow-up: ElevenLabs Free plan verified, TTS-only capped key provisioned and real narration/cache/authenticated HTTP endpoint passed. User confirmed age and completed Discord CAPTCHA.
- User clarified that each Discord server owner configures allowed channels. Replaced global allowlist with current-owner-authorized per-guild settings, student selection and fresh membership/visibility checks. Restricted channels fail closed. Added owner settings UI and meaningful authorization/revocation tests; latest23/23 suite passes.

## Final browser checkpoint

The local Atlas-backed UI completed signup, saved interests, live discovery, grounded Friday-after-five recommendations and ElevenLabs generation. It displayed “Your audio is ready” and the native audio player. Clicking Play crashed the Codex in-app browser tab; the cause is not yet established, so audible playback is NOT claimed verified. The app recovered in a fresh tab, and its disposable browser QA account was deleted through Settings. A standard browser playback check is still required.

Source checkpoint ace873f was pushed to JARA-org/vtevents/main; local and remote SHAs matched. Known credential values were absent from all 56 tracked/untracked source candidates and the built frontend (99 files total). Secrets remain ignored.
