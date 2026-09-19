# Takeover prompt — My Little Gobbler

Continue implementing and deploying **My Little Gobbler**, a student-built Virginia Tech campus companion. Work in the existing private **JARA-org/vtevents** repository; preserve its name. User wants working V1, not a scaffold, and explicitly asks that every session push safe source changes and keep this takeover prompt current before usage runs out.

## Current authoritative checkpoint (2026-09-19)

Repository: `C:/Users/Outsi/Documents/Codex/2026-09-19/build-and-deploy-the-complete-v1/outputs/my-little-gobbler`. Main branch; gh owner `0utsights` (John Surles), JARA-org collaborator. Do not switch to inactive `theuser2012`. No AGENTS.md. No new subagents unless explicitly requested by user/skill. Read git status/log, README, PROGRESS, docs/INTEGRATIONS.md, docs/RESOURCES.md, docs/VERIFICATION.md and this file. Check for new user answers first.

**Hosting is intentionally pending for Vultr.** The user chose Vultr over free Render and explicitly confirmed **$0 beyond the $100 credit; require a hard cap**. After finding no stop-at-credit-zero cap, we offered free Render again and the user explicitly answered **Keep hosting pending for Vultr**. Do not deploy on Render or start a paid Vultr instance without new evidence resolving the cost constraint. A free-compute program application was submitted; acceptance pending. No public URL exists. No Vultr instances exist. Card was linked personally by user, and API account showed balance -100, pending charges 0. MLH credit expires 30 days after signup. Power-off does NOT stop Vultr billing.

Latest scope additions: Gobbler must be the favicon/site icon (DONE); explore Vultr/Tiger Data prize tools; add ElevenLabs narration. Official MLH VTHacks14 prizes lists Vultr, Tiger Data, ElevenLabs, Gemini and Atlas, not Render. User wants **Genie One MCP** for Databricks work. General authorization persists; do not repeatedly ask routine permissions. Personal passwords/MFA/CAPTCHA/identity/age verification remain user actions. No payment, domain purchase or uncapped paid service without specific authorization.

## What is working now

- Complete Expo57.0.24 / RN0.86.3 / React19.2.3 / Expo Router TypeScript web frontend and modular Express/TS backend with shared Zod models. Friendly turkey mascot throughout and favicon generated from existing mascot.
- Landing and fully separate sample demo; Better Auth sign-up/sign-in; persistent profiles/interests; manual recurring availability/busy blocks; discovery/search/filters/details; saved events; schedule; Gobbler; settings/connections/delete; ICS/calendar destination review.
- **Real Atlas M0 provisioned and live-tested**. Cluster my-little-gobbler, AWS N.Virginia,512MB Free; project6aae924eebb5b272725466a4, org6aae924debb5b2727254666f. Database user my-little-gobbler-app has readWrite only on my_little_gobbler and access restricted to this cluster. Workstation /32 allowlisted, no all-internet rule. Production host IP must be added later.
- **Real Gemini free-tier verified** on project gen-lang-client-0163130285, account surlezrulez@gmail.com, model gemini-3.5-flash-lite. Two real grounded flows passed: arts/music Friday-after5 recommendations contained only stored IDs. Scheduling/explanations stay deterministic, private schedule not sent. Opt-in question/interests and <=40 public event candidates; daily100 cap, no SDK retry, 12s timeout, fallback.
- Public GobblerConnect ICS:2219 records. VT Sports public JSON-LD:349. Latest live discovery1502 current/ongoing events. Sources persisted into Atlas and schema validated. Snapshots separate, canonical dedup preserves provenance/identity, removals applied transactionally, failed/partial refresh preserves last snapshot. Samples never substitute for source failure.
- Secure session cookies, origin validation/rate limits, AES-GCM token/private context encryption, user isolation, fresh-session account deletion. New York/DST handling; ambiguous/nonexistent recurring endpoints stay unknown; calendar ICS stable UID/escaping/folding/multi-day exclusive all-day end.
- Google OAuth state+PKCE/freebusy/idempotent writes/revoke; Canvas scoped/paginated OAuth/calendar/courses/announcements and permission-gated writes; Discord user/guild verification, bot allowlist, user channel selection, type5 announcements only, encrypted private content. No real Google/Canvas/Discord account connection tested yet. Discord approval now lives in per-guild owner settings; global allowlist removed.
- Databricks Node SQL Statement Execution outbox/MERGE/retries, erasure suppression and dashboard SQL implemented but no live credential/ingestion/dashboard.
- **ElevenLabs narration implemented** in apps/backend/src/narration.ts, POST/api/narration and frontend Listen to Gobbler. Only authenticated live requests, up to3 stored public event IDs, server-rendered titles/time/location only; no private context/client arbitrary text. Monthly8000-character maximum, reserved before provider request, no automatic retry, Mongo audio cache24h, concurrency lease, MP3 bound4MB, explicit playback and attribution. Provider now live: Free10,000credit plan; TTS-only key capped8,000credits per refresh. Real270,881byte MP3, identical cache replay and authenticated endpoint passed. Browser playback QA remains.
- Startup/hourly refresh + minute analytics jobs, health/redacted logs. Dockerfile/non-root read-only runtime and deploy/compose.yaml+Caddy HTTPS package added for Vultr. **Docker container build not verified**: installed Docker Desktop engine was unavailable; start requested but Docker info/status hung and queries were interrupted. App build itself passes.

## Validation at this checkpoint

23/23 tests passed after voice additions. Backend/frontend typechecks and production build passed; favicon.ico15KB generated and linked. Zero vulnerabilities at prior clean install/audit checkpoint.

Live Atlas synthetic-account HTTP flow on port3001 passed: signup -> interests/recurring availability -> persist/read ->1502 live events ->save/read ->ICS ->real Gemini grounded responses ->separate demo ->account deletion. Disposable QA account was deleted using app control. Work scripts verify-atlas-gemini.ts and verify-cloud-flow.ts contain no credentials but stay ignored.

Browser landing inspected at actual390x844 and1280x720; measured no horizontal overflow; mascot/favicon verified. Prior local full UI signup/onboarding/details/save/calendar/recommendation/conflict checks are in verification notes. Deployed HTTPS/provider QA still outstanding. Broad public launch also lacks email verification/password recovery.

## Runtime and secret storage — NEVER print values

- Node22.22.3/npm10.9.8. `npm run typecheck`, `npm test`, `npm run build`.
- Ignored `.env` now contains **live Atlas URI and Gemini key** plus local app secrets. Never cat it. `npm run dev` defaults3000; current Atlas dev process started with PORT3001 and APP_ORIGIN=http://localhost:3001 (last session53638). Existing port3000 local-Mongo process may still run (previous70802).
- Ignored work/atlas-uri, work/atlas-password, work/gemini-key, work/vultr-key and work/elevenlabs-key contain secrets. Local dev secrets in work/local-secrets.json; persistent Mongo port55739 in work/local-mongo-port. Stop local Mongo before npmci on Windows if binary EPERM.
- **Security follow-up:** Default Gemini key unexpectedly used a new AQ.-format and appeared in a tool result because redaction only matched AIza. User was informed. It was NOT committed/bundled. Rotate before public deployment. Two UI attempts to create a dedicated my-little-gobbler key returned to the unchanged key table; new key creation not verified. Existing default works for local testing. Never repeat it. Vultr key was supplied in chat by user and also needs rotation after setup. Keep production auth/encryption secrets independent from local QA secrets.
- Secret transfer through browser works with Node fs in cua_repl: read only a specific visible credential/control into a persistent variable, write directly with fs to ignored file, clear variable. Do NOT emit raw DOM/screenshot on key dialogs. Clipboard Copy/read was unreliable. Use an allowlisted DOM control, not hidden app state or browser cookies.

## Browser / pending personal steps

Browser tools available; after context compaction call cua.rewriteDocumentation. Browser1. Tab numbers may change; inspect inventory. Last known:
- App1 localhost3000; new app15 localhost3001 (Atlas/Gemini).
- Atlas4 project overview.
- AIStudio5 API keys, knownGoogleuser surlezrulez@gmail.com. Key dropdown may be open.
- Discord6: Application1550880609491222639 created after user completed CAPTCHA; description saved. Guild-only installation defaults View Channels/Read Message History saved. Bot token and client secret not retrieved; Message Content intent not enabled; production OAuth redirect pending. User clarified each server OWNER selects channels. Implemented Settings → Manage my servers, per-guild owner approval, rechecked membership/ownership/visibility, fail-closed restricted channels, revocation and tests. No particular server authorized or live-tested yet. Do not ask user to hardcode a global allowlist.
- Databricks7 FreeEdition workspace dbc-4490568c-354b.cloud.databricks.com, workspace7474656752429582. Console and OAuth page display **automated browser control not supported**. Do not bypass. User requested GenieOneMCP. See docs/GENIE_SETUP.md. CLIv1.17.0 downloaded/checksummed in work/databricks-cli. CLI OAuth reached personal consent but was cancelled; no auth completed. Direct Codex MCP endpoint registration failed Dynamic client registration not supported; incomplete entry removed. Plugin search found Databricks Genie (Plugin_1e24c86b19248191a8c6abb5bc115819) but suggestion rejected as not eligible; no plugin installed. Supported UnityGateway MCP-only route needs personal CLI OAuth; do not change coding-model provider. Managed MCP Servers preview also may need enabling. MCP is not connected.
- Vultr9 console dashboard/settings; signed JohnSurles outsightszs@Outlook.com. FreeTier application pending; credit and price verified. No billable resources.
- ElevenLabs11 API dashboard: user confirmed age20; onboarding finished. Free10,000credit plan. my-little-gobbler key has TTS only,8,000credit per-period hardcap, leak auto-disable. Saved ignored work/elevenlabs-key and .env. VoiceID JBFqnCBsd6RMkjVDRZzb from official dashboard quickstart. Real audio/caching/authenticated endpoint passed. work/gobbler-narration.mp3 is ignored proof audio; no personal data sent.
- Other user-opened GobblerConnect tabs2/3/8; leave alone.
- Previous Databricks CLI consent tab12 no longer has a listening callback after cancellation; start fresh flow if needed.

Sites project appgprj_6aae24e2bd588191a3b403b7ff3b54ba still NOT_FOUND to current Sites account; do not duplicate/substitute. Optional only, and user now explicitly waits for Vultr hosting. Both reference GoogleDocs read via Drive; prompt remains scope authority. StripeProjects catalog latest new-provider queries returned429, no resources provisioned there.

## Next useful work

1. Finish Discord bot/client credentials and Message Content intent using supported provider setup. Production redirect waits for hosting. Each server owner must install and configure its own approved announcements; no global channel list. ElevenLabs is live-tested; finish browser playback QA. Persist secrets only in ignored/server storage.
2. Resolve Genie One authentication through supported MCP/gateway setup, then configure actual Databricks SQL ingestion and dashboard using real workspace/warehouse credentials. MCP alone does not create application ingestion.
3. Rotate exposed setup credentials safely. Avoid more raw key-dialog snapshots. Confirm no secrets in staged source or frontend bundle.
4. Finish auth verification/recovery using a maintained supported provider/email path once an actual free delivery service/domain is available; keep social/calendar OAuth redirect setup aligned with chosen production origin.
5. Wait for cost-safe Vultr eligibility or a changed explicit spending constraint. Once allowed: provision smallest adequate instance, firewall/SSH, DNS for an owned hostname, narrow Atlas IP, independent production secrets, Docker/Caddy, OAuth redirects, jobs, full HTTPS browser QA. No deployment claim until reachable and verified.
6. TigerData is optional: time-series public event activity/trend metrics alongside Atlas/Databricks is a meaningful potential use. Current managed pricing shows paid30daytrial; no verified free sponsor resource yet. Do not replace required databases or enable charges to chase a prize.
7. Keep handoff/status honest, run necessary checks after new changes, commit/push all safe files to main and verify remote SHA before ending. No private credentials or local databases/builds in Git.
