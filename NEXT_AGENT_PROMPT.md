# Takeover prompt — My Little Gobbler

Continue implementing and deploying **My Little Gobbler**, a student-built Virginia Tech campus companion. The user explicitly wants a working complete V1, not a scaffold, and most recently asked: **“resume, before you run out of usage write a prompt for the next agent to take over and push everything to the git repo.”** This handoff and all safe project source must be pushed to the existing private JARA repository before stopping.

## Start here

- Repository: **https://github.com/JARA-org/vtevents**, branch `main`. Preserve the existing repo; do not rename it or create another without reason. Product/service slug is `my-little-gobbler`.
- Local checkout: `C:/Users/Outsi/Documents/Codex/2026-09-19/build-and-deploy-the-complete-v1/outputs/my-little-gobbler`.
- Read `README.md`, `PROGRESS.md`, `docs/INTEGRATIONS.md`, `docs/RESOURCES.md`, `docs/VERIFICATION.md`, and this file. Check `git status`, `git log`, current tool availability, and any new user replies.
- Latest authoring is formatted TypeScript. Original repository contained only `Idea.txt`; it is preserved.
- No AGENTS.md found during initial inspection.

## Scope and non-negotiable architecture

React Native + Expo Router + TypeScript, web release only; modular Node.js/TypeScript APIs/jobs; MongoDB Atlas; Gemini exclusively from backend; Databricks via Node supported APIs. Monorepo apps/frontend, apps/backend, packages/shared. No healthcare features, no GoDaddy ANS or HokieAI/Cloudforce V1 dependency. Friendly original turkey mascot, maroon/orange, no official VT affiliation claim.

User authorizes creating necessary **free** accounts/resources/credentials under their ownership, using existing connected accounts and browser control. Ask once for ambiguous owner email; this has already been asked and remains unanswered. Never request passwords/recovery codes in chat. User handles passwords/MFA/CAPTCHA/personal consent. No payment method/subscription/domain/uncapped billable usage without permission. A budget alert is insufficient. Secrets only in ignored configuration or service secret stores.

## Implemented

- Expo website: landing, demo, auth forms, interests/onboarding, availability/busy blocks, search/category/date discovery, details, fit notes, saves, schedule, Gobbler, connection/settings controls, ICS review/download, data deletion.
- Better Auth + Mongo adapter, scoped private APIs, origin validation/rate limits, AES-GCM encrypted provider credentials and private context.
- Official public GobblerConnect ICS normalization (observed authorized CDN redirect) and VT Sports JSON-LD extraction across linked official schedules. Direct fetch verified 2,219 and 349 records respectively on 2026-09-19. No guessed campus APIs.
- Shared Zod event/profile schemas, source provenance, UTC timestamps + source zones, DST-aware America/New_York schedule engine, deterministic recommendations, cross-source deduplication.
- Google OAuth state+PKCE, free/busy, refresh/revoke, confirmed primary-calendar write with deterministic Google ID + DB uniqueness. Canvas scoped OAuth, paginated course/calendar/announcement reads, guarded personal writes. Discord OAuth guild membership + bot/admin channel allowlist + user selection; announcements encrypted/private.
- Gemini structured query-filter parser with opt-in and deterministic fallback; no calendar/message content sent, no AI tools or writes. Real Gemini key absent.
- Databricks SQL Statement API outbox/MERGE, bounded retries, table provisioning script and useful dashboard SQL. No real workspace access yet.
- Node jobs refresh sources/private connections and drain analytics. Render free-service Blueprint. Guarded optional Actions six-hour job, checks manually dispatchable pending billing verification.
- Original imagegen mascot in frontend assets; source asset also exists under parent workspace `work/mascot`.

## Current operational state

- GitHub CLI authenticated as `0utsights` (John Surles), has JARA-org access. Other account `theuser2012` is inactive; do not switch identities casually.
- No production credentials found. No Atlas/Render/Gemini/Databricks resources provisioned. Owner email requested once; no reply yet. Browser Render tab at login, user takeover requested while implementation continued.
- Local server was started via `npm run local`, tool session 90146, port 3000, with real local Mongo replica set persisting in ignored `work/local-mongo`. It runs code from its startup and may need restart to include latest backend edits. Generated development secrets are in ignored `work/local-secrets.json`; never print/commit them.
- Browser automation available through `mcp__cua_repl`. Read its current documentation after context reset. Browser id `1`; Render tab `1`, app tab `2`. These handles may be stale; inspect before reuse. Mobile QA used 390x844; viewport was reset to default and both tabs marked for handoff.
- **Sites project already created exactly once:** `appgprj_6aae24e2bd588191a3b403b7ff3b54ba`, slug `my-little-gobbler`. `.openai/hosting.json` persists it with static directory `apps/frontend/dist`. Private, **not deployed**. DO NOT call create_site again. Obtain refreshed source write credential for this same project if needed, never expose/persist it. Prior functions store keys `gobbler.site` and `gobbler.site.result` might still hold the response, but do not rely on persistence across agents.
- Static preview is explicitly separate from production: `EXPO_PUBLIC_PREVIEW_ONLY=true`, demo runs in browser and live tab loads a dated public-event snapshot. Accounts/connections are disabled with an honest banner. Generate snapshot with `npx tsx scripts/snapshot.ts`, preview build with `npx tsx scripts/build-preview.ts`. Normal `npm run build` produces full Node deployment frontend (no preview flag). Snapshot file contains only public source records.

## Verification already performed

- Prior full typecheck and normal production build passed.
- 15 tests passed before latest changes; current suite includes mocked Google repeated-write assertion. Re-run and record final results rather than assuming.
- Desktop landing design and mobile 390px discovery visually inspected. Demo save/details/calendar destination review/ICS download exercised. Mobile document width matched viewport (no horizontal overflow).
- Test credentials are synthetic; actual personal account data was not used.
- Final handoff validation passed: typecheck, 15/15 tests (including mocked Google repeated-write check), normal production build. Source checkpoint `b9fde92462e32fe0fd7cafd83b71b566ade847e5` pushed to JARA main and remote SHA verified. A subsequent documentation-only commit records this completion.

## Priority next actions

1. **Ensure current project + this takeover prompt are committed and pushed to JARA-org/vtevents/main**, verify remote SHA. Exclude node_modules, builds, .env, work, local database/secrets, audit scratch. User explicitly requested safe push.
2. Finish/check latest typecheck/tests/build. Investigate 13 moderate npm audit findings: overrides for decode-uri-component 0.5.0 and xcode/uuid 11.1.1 were added but npm dedupe still reported vulnerable nested copies. Verify resolution; do not blindly downgrade Expo.
3. Review correctness gaps before production: persisted removed source records can return on restart because coordinator only upserts; cross-source dedup identity/provenance under refresh; analytics deletion in Databricks; private-context freshness beyond busy blocks; actual provider failure/reconnect UX; auth recovery/email verification. Add focused fixes/tests, not broad speculative features.
4. Complete **private Sites preview** publication using installed sites-building/hosting skills. Reuse existing ID. Build preview, commit/push exact source to Site source remote with ephemeral per-command credentials, package through skill helper, save version, deploy, verify terminal success, browser-check exact deployed preview. Do not claim it is full production V1. Keep JARA origin as primary remote.
5. Recheck installed provisioning plugins: **Stripe Projects and Google Drive skills appeared late in the session** but have not been inspected/used. Read relevant SKILL.md before use. Stripe Projects may offer a supported provisioning catalog; check it before manual setup, without replacing required MongoDB/Node/Gemini/Databricks architecture or violating cost/ownership constraints. Google Drive may make the two references accessible now.
6. Reference Google Docs (prompt still governs): `1QA1t7wVYXzbAYUuMJdTkDKj3cMNWRcgPD7c8jc4U544`, `1tBYK2miseZwIprdU8QeOCKGqtzA1682acL6-Nrze4UI`; initial unauthenticated fetch failed.
7. With owner response/sign-in, provision Atlas M0, Render Free Node service, free Gemini key (billing disabled), backend secrets, HTTPS origins/redirects. Atlas restricted database user + Render outbound IP allowlist. Build/start as README. Verify actual deployed onboarding → discovery → details → save → ICS with real persistence and Gemini.
8. Attempt all remaining integrations. Canvas needs VT-enabled developer key; Discord needs administrator installation + authorized channels; Google needs Cloud OAuth client/consent; Databricks Free Edition access needed for real ingestion/dashboard. Implemented paths are not live-tested claims. Finish all independent work even if university approval blocks Canvas.
9. Configure cost-safe scheduled jobs, finish phone/desktop and accessibility checks, update inventory/status/handoff with exact URLs and actual tests. Never call V1 complete while required core remains blocked.

## Communication

Be concise, act without routine permission requests, provide useful progress updates. No new subagents unless user or applicable skill explicitly authorizes them. Sites skill authorized one image-only subagent; that task is finished. Do not create a new user-visible Codex task unless requested. The requested takeover prompt is this file; no new task was created.
