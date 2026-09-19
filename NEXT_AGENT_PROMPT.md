# Takeover prompt — My Little Gobbler

Continue building and deploying **My Little Gobbler**, the student-built Virginia Tech campus companion. The user wants working V1, not a scaffold. Latest request: **“continue working where we left off and try to get V1 fully out.”** The user also explicitly requires a takeover prompt and all safe changes pushed before usage runs out. Keep this file current and push the existing private repository before stopping.

## Workspace and repository

- Checkout: `C:/Users/Outsi/Documents/Codex/2026-09-19/build-and-deploy-the-complete-v1/outputs/my-little-gobbler`.
- Existing private repository: https://github.com/JARA-org/vtevents, `main`. Do not replace or rename it; application slug is `my-little-gobbler`.
- GitHub CLI is authenticated as `0utsights` (John Surles), with JARA-org access; `theuser2012` is inactive. Do not switch identities casually.
- Read README, PROGRESS and docs/{ARCHITECTURE,INTEGRATIONS,RESOURCES,VERIFICATION}.md. Check git status/log and pending user answers first.
- Original `Idea.txt` is preserved. No AGENTS.md found. No new subagents without explicit user/skill authorization.

## Scope and authority

React Native + Expo Router + TypeScript, web first; modular Node/TypeScript backend; MongoDB Atlas; backend-only Gemini; Databricks analytics through supported Node APIs. Interests, availability, real events, reasons/conflicts, saves, ICS, secure auth, Gobbler, Google/Canvas/Discord connections. Native builds, healthcare, ANS and Cloudforce are outside V1. Warm maroon/orange and original turkey mascot throughout; no official VT affiliation claim.

User authorizes necessary free resources, accounts, credentials and deployment under their ownership. No payment/subscription/domain/uncapped billing. Secrets only in ignored local configuration or service secret stores. No password/MFA/recovery codes in chat. Personal sign-in, CAPTCHA and required consent need user action. Owner ambiguity was already asked once; do not repeat it unnecessarily.

## Current deployment blockers — act on user replies first

Browser control is available via `mcp__cua_repl`, browser id `1`. After compaction call `cua.rewriteDocumentation()`. Existing tabs (inspect before reuse):

1. **Render** tab `1`: GitHub OAuth authorization screen, signed in as `0utsights`. User has already been asked to complete the consent and say “Render ready.” No Render service yet.
2. **App** tab `2`: http://localhost:3000, disposable synthetic QA account only. Never expose real user data in public demo.
3. Tabs `3` / `4`: user-opened GobblerConnect event pages; leave alone.
4. **Atlas** tab `5`: account.mongodb.com login. User asked to sign in. No cluster or credentials yet.
5. **AI Studio** tab `6`: https://aistudio.google.com/api-keys; existing Google session `surlezrulez@gmail.com` (Johnny G). First-use developer terms dialog. User asked to personally review/accept if this is intended owner, leave promotional checkbox unchecked. No API key created.
6. **Discord** tab `7`: developer portal welcome/login. No signed-in developer account, bot or selected server/channel. Server admin authorization still required.
7. **Databricks** tab `8`: Free Edition signup, reached via official docs. Terms acceptance and sign-in still required. No workspace. Use Free Edition for student prototype, no paid trial.

The pending core takeover requests are Render consent, Atlas sign-in, AI Studio terms. No response was received at the latest checkpoint. Do not click through personal consent just because time elapsed. Continue independent work.

**Sites:** project `appgprj_6aae24e2bd588191a3b403b7ff3b54ba`, slug my-little-gobbler, was created earlier and persisted in `.openai/hosting.json`. It now returns **NOT_FOUND**. Current Sites account list belongs to `surlezrulez@gmail.com` and contains only unrelated pre-existing sites. Do NOT create a duplicate or substitute another site's ID. Recover proper project/account access if pursuing preview. No deployed URL exists.

**Stripe Projects:** skill read and official CLI installed at parent task `work/stripe-cli/stripe.exe`, projects plugin 0.41.0. Catalog has Render Free web service and Railway MongoDB, but no Atlas or Gemini. Do not replace required Atlas with Railway. Preflight says BROWSER_AUTH_REQUIRED; no project initialized or provider resources created. Direct Render flow is already pending, so avoid redundant login detours. `.projects` secret/cache paths ignored.

Both original Google reference documents are now **read successfully via Google Drive connector**. They confirm the stack and sponsor ideas; user prompt overrides healthcare/ANS/HokieAI alternatives. IDs: `1QA1t7wVYXzbAYUuMJdTkDKj3cMNWRcgPD7c8jc4U544`, `1tBYK2miseZwIprdU8QeOCKGqtzA1682acL6-Nrze4UI`.

## Implemented and validated

- Expo 57.0.24, RN .86.3, React19.2.3, Expo Router, TypeScript and Zod monorepo. Original mascot. Responsive landing/demo, auth, onboarding/preferences, manual recurring and dated busy blocks, discovery/details, saves, schedule, Gobbler and connections/settings.
- Express + Better Auth Mongo adapter, session cookies, trusted-origin mutation validation, rate limits, AES-GCM provider token/private-context encryption, fresh-session account deletion.
- Official GobblerConnect ICS and VT Sports JSON-LD sources: 2,219 / 349 records verified repeatedly, including latest restart; 1,503 active/ongoing discoverable records at checkpoint. Sources remain separate from sample fixtures.
- Source snapshots now persist separately, transactionally rebuild canonical events and remove vanished records. Failed/partial refreshes keep last good snapshot. Provenance-based identity survives updates/disappearing duplicates; split IDs remain unique. Word-based category rules fix false matches such as participants→art and signature→nature.
- Scheduling handles UTC/source zones/New_York, known conflicts, full free coverage, unknown information. Recurring times at nonexistent/repeated DST boundaries return unknown. ICS handles escaping/folding, stable UID and multi-day all-day end dates.
- Gemini uses structured filters and semantic ranking over <=40 public event candidates, explicit question and opted-in interest categories. No private schedule/identity/messages/saves sent. Unknown IDs rejected; explanations and schedule remain deterministic grounded code. Unique daily budget counter, one SDK attempt/12s timeout, failure-safe deterministic fallback. Real key/call still blocked.
- Google state+PKCE/freebusy/write/revoke; deterministic write IDs and unique Mongo record. Canvas scoped OAuth, bounded pagination, personal-calendar writes gated by permission/env, ambiguous failure lock. Discord user membership + explicit admin/user channel selection, announcements only, encrypted private context. Manual/background sync errors persist status. No real connected provider tested yet.
- Databricks SQL outbox/MERGE and dashboard SQL. Account deletion creates durable pseudonymous suppression markers and remote DELETE retries, including in-flight write checks. SQL behavior mocked, no actual workspace.
- Startup/hourly jobs plus minute analytics flush; background failures redacted/caught. Optional six-hour GitHub job disabled until cost-safe Actions allowance verified.
- Fresh install, full audit and production audit: **0 vulnerabilities**. Corrected lockfile overrides (decode-uri-component0.5.0, xcode uuid11.1.1) compile successfully.
- Latest: **21 tests pass**, backend/frontend typechecks and Expo web + backend production build passed. See docs for exact cases. After any final code edits rerun appropriate checks.

## Local runtime

`npm ci --include=dev`, `npm run build`, `npm run local`; localhost:3000. Local MongoDB replica set persists in ignored `work/local-mongo`; development secrets in ignored `work/local-secrets.json`.

**Restart fix:** MongoMemoryReplSet reuses old replica membership, so persist its port in ignored `work/local-mongo-port`. This checkout's legacy data uses port55739; new checkouts default27027. Stop/start cycle succeeded after patch. Do not delete the database to work around startup. Stop server/Mongo before npm ci on Windows or binary removal gets EPERM.

Last local session: 70802 (may change/be stale), restarted with the latest backend changes. Frontend production export is current. Browser viewport reset to default. A synthetic QA account was created; no personal data. Test scripts may use disposable synthetic accounts, never real credentials.

Browser verified sign-in → interests → Friday recurring availability → live event search → Isidore String Quartet details → save → calendar destination review → ICS feedback. ICS endpoint separately returned HTTP200 text/calendar and valid VCALENDAR. Added busy block; UI changed free→conflict. Friday-after-five assistant returned stored events with conflict notes. Prior desktop1280/mobile390 QA passed. Latest viewport override was not honored (actual512); no horizontal overflow at512. Do not claim fresh390 validation until measured.

## Next actions

1. Keep source, docs and this takeover prompt committed/pushed to JARA main; verify local and remote SHAs. Exclude builds, node_modules, .env, work, local database and secrets.
2. After personal sign-ins, create Atlas M0 with db-scoped user and Render outbound IP allowlist (no0.0.0.0/0). Create Render Free Node service from render.yaml, same-origin frontend/backend. Verify no payment method/billable overage. Set exact HTTPS APP_ORIGIN, Atlas URI and generated backend secrets directly in secret storage.
3. Create a Gemini API key on billing-disabled free project, confirm current model availability/free quota, set backend-only key and run real grounded request. Default model gemini-3.5-flash-lite was verified against official pricing earlier; recheck if needed.
4. Run deployed onboarding→discovery→details→save→ICS and persistence/isolation tests, confirm cookies/HTTPS/trusted proxy, mobile/desktop UX. No deployed URL currently exists; do not call V1 complete.
5. Complete Google Cloud OAuth consent/client, Canvas university developer-key access, Discord app/bot/admin channel permissions and Databricks Free Edition ingestion/dashboard as access permits. Record precise blockers instead of substituting fixtures.
6. Auth email verification/password recovery is still not configured; implement with a supported delivery/auth provider before broad public launch. Further accessibility keyboard/200% zoom and actual expired-provider browser UX remain to verify.
7. Enable free-safe scheduled wake jobs once service URL and Actions spending constraints are known. Blueprint currently waits for checksPass but Actions checks are manual; choose explicit manual deployment or configure verified free checks before expecting automatic deploys.
8. Update resource inventory/status/readme with actual dashboard/deployment URLs and tests. Static Sites preview is an optional separate path, explicitly disables accounts/connections, and cannot count as deployed full V1.

Do not stop just because an optional campus/server integration is blocked, but do not claim successful production deployment without evidence. If account consent remains the hard blocker, report the concrete user steps clearly and preserve all work.
