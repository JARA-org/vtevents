> Current scope, September 20, 2026: provider account connections and remote calendar writes are retired. Setup collects interests only; manual availability and ICS export remain. Older deployment/checkpoint notes below are historical and must not be used to resume provider setup. See [v3 migration](docs/BACKEND_CONTRACTS.md#active-v3-migration). Check the GitHub Actions deployment run for the release status of this source revision.

## Verified live hardening release — 2026-09-19 23:57 UTC

Production now runs **3fc68ee** from `/opt/gobbler-releases/3fc68ee`.
Both app and Caddy Compose services use this directory; Caddy's identical config
was remounted from the valid new path, retaining existing TLS certificate volumes.
Teammate checkout `/opt/vtevents` remains untouched. Old image55e3420 remains for
rollback; run Compose from the NEW directory with GOBBLER_DOMAIN=vtevents.us and
GOBBLER_IMAGE=my-little-gobbler-app:55e3420 to roll back the app only.
The old /opt/vtevents/releases and /opt/vtevents/current paths DO NOT exist.
Production secrets were recovered privately from the running container into a
mode0600 .env.production in the new release, preserving identity/encryption keys.

59/59 tests, typechecks, contracts, local build and actual-host Docker build pass;
production dependency audit reports zero vulnerabilities. All seven HTTPS smoke
checks pass after app AND Caddy replacement. Fresh signup/preferences/discovery/
save/ICS/real Gemini/grounding/account deletion passed against production, with
1,513 current events. Temporary QA account deleted. Browser visual recheck was
unavailable (CUA browser session disconnected); no new UI was authored here.

User supplied Downloads/env has new Discord settings plus different auth,
encryption and analytics secrets. It has NOT been applied. Explicit question
pending: apply Discord settings only while retaining production secrets, or leave
Discord disabled. Never copy that file wholesale. Current Discord remains disabled.
Keep teammate Discord implementation intact. Google/Canvas live calendar consent,
mail delivery/account recovery, Databricks, club deletion cleanup and Vultr spending
protection/API-key rotation remain unfinished. This release is hardening, not full V1.

# Production hardening — 2026-09-19 (awaiting coordinated deployment)

Integrated team main through 2694d4f without changing Discord. Calendar sync and
OAuth callbacks now cannot restore disconnected context/connections after their
remote reads complete. Invalid Google availability preserves prior context;
empty valid busy arrays still work. Refresh writes use credential revision checks
and reject missing access tokens. Disconnect clears pending OAuth claims and
private context atomically, even when remote revocation fails. Health checks now
probe MongoDB, fail with a redacted 503 and prohibit caching.

Read-only server inspection found old image55e3420 healthy but previous release
directories and current symlink absent. Teammate deployment coordination pending;
do not overwrite current server files. See NEXT_AGENT_PROMPT.md.

# Previous live release — 2026-09-19

Live source **55e3420** at https://vtevents.us, integrating team main7bbfbf9. 50/50tests, typechecks/contracts, actual-host production build and production dependency audit pass (0 vulnerabilities). Fixed API test fixture isolation from local Google credentials. Core live HTTP flow/Gemini/OAuth initiation and HTTPS smoke pass after update; 1,519 current events. Previous3b003bb release retained. All synthetic QA accounts deleted.

Google app/client/API/scopes/test user are configured and secret deployed. Personal calendar connection is NOT complete: zero connections observed, and owner clarified they needed the site sign-in page, now opened. Next: owner signs in to vtevents.us -> Settings -> Google Calendar -> Connect. Canvas, Discord live installation, Databricks and auth recovery remain pending. New upstream Gateway/club/publication code is present but Discord stays disabled. Vultr hard spending protection is still unverified; no additional resources created. See NEXT_AGENT_PROMPT.md.

---

# Latest production checkpoint — 2026-09-19

**Online: https://vtevents.us**, deployed source `3b003bb`. SSH recovered with the new deployment key, root recovery password rotated, Atlas server `/32` activated, replacement Gemini key tested/deployed, Docker app and Caddy HTTPS healthy. No VM was created/reinstalled; existing host reused. `/opt/vtevents/current` points to `/opt/vtevents/releases/3b003bb`.

45 tests/typechecks/contracts pass; production image built on Vultr. Public HTTPS smoke and real account/preferences/live discovery/save/ICS/Gemini/deletion flow pass. Browser desktop/mobile onboarding/details/calendar export and schedule conflict pass. App restart retained session/profile/save and refreshed both official feeds. Production web bundle has zero known-secret matches.

Google OAuth client/API/testing consent and owner test user are now configured and deployed; production initiation checks pass. Personal consent/live calendar sync/write and public OAuth verification remain. Other remaining work: VT Canvas developer key, Discord bot credentials/install/collection publication, Databricks authorized ingestion/dashboard, auth email verification/recovery, audible voice QA. Vultr hard spending cap remains unverified under owner's $0-over-credit limit. Old Gemini key was deleted after owner approval; Vultr API key rotation remains a security follow-up. See NEXT_AGENT_PROMPT.md and docs/RESOURCES.md for exact state. Earlier entries below are historical and superseded.

---

# My Gobbler — progress

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

## Current production continuation — 2026-09-19

Pulled f6a4cfd and preserved v2/Discord changes. Fixed Discord production preflight/template mismatch; regression tests pass. Full prior suite 43/43, typechecks and build pass. Fresh Atlas/Gemini authenticated flow passed with 1,520 live events and disposable-account cleanup.

Owner selected vtevents.us and signed into Porkbun. Root A now 45.77.222.255; www CNAME vtevents.us; both externally verified. Existing Vultr vtevents-production VM found (Ubuntu 24.04, 2GB, New Jersey), created outside this checkout. No new paid resources. $0-over-credit/hard-cap constraint persists and no cap is verified.

SSH times out because the cloud firewall permits previous workstation 45.3.88.247/32; current workstation is 73.171.46.27. Prepared narrow SSH rule and Atlas VM /32 entry; browser policy requires at-action confirmations. Existing root credential privately recovered; no replacement key or server reinstall performed. Production env is ignored and owner-readable, with Atlas, ElevenLabs and fresh app secrets; Gemini replacement pending personal Create key action. Public deployment remains incomplete.

Deployment QA also found and fixed one-hour stale HTML caching. Current v2 mobile/desktop landing inspected; API/deployment regression tests5/5, typecheck and production build pass after fix. Full suite44/44 passed before the final cache fix. Source/frontend scan includes production/recovery secrets and reports zero matches. Pending security grants/key rotation remain owner actions.

## SSH access recovery — 2026-09-19

Owner explicitly requested generating/installing a replacement deployment key without replacing the server. Generated Ed25519 key in ignored owner-only work/my-little-gobbler-deploy and prepared an idempotent public-key installation script. Saved and verified cloud firewall SSH22 from current workstation73.171.46.27/32, preserving existing rules. TCP22 became reachable after propagation; existing root password authentication is disabled (public keys only). No remote login or key installation has succeeded yet.

Vultr View Console opens no usable popup in this in-app browser, including after fresh-page retry. Official docs confirm Reinstall SSH Keys wipes the server; it was not used. Prepared narrow API allowlist entry73.171.46.27/32 and requested at-action confirmation to obtain the supported instance console link. No API grant saved yet. A temporary read-only inspection of another existing key exposed a Delete confirmation; it was cancelled without mutation. Existing root recovery password appeared in a copy-residue accessibility field; owner informed and rotation required after access recovery. No password/secret added to source.

### 2026-09-20 account email and Discord checkpoint
- Discord-only supplied env merged; existing production keys preserved. Gateway
  connected, production interaction endpoint verified by Discord, test guild
  commands registered. Server owner must select public channels; no code edits.
- Implemented recovery/verification UI, Better Auth lifecycle hooks, encrypted
  expiring leased retry outbox and optional deployment configuration pair.
- All 60 tests passed, including verification, password reset single-use/session
  revocation, non-enumerating reset response, encryption and retry idempotency.
- Local Expo/backend build and typechecks passed. Resend signup consent is pending;
  provider delivery, Google personal consent and Databricks authorization remain
  external dependencies. Do not call this a fully completed public launch.
