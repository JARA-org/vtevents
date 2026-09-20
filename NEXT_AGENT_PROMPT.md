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
mail delivery/account recovery, club deletion cleanup and Vultr spending
protection/API-key rotation remain unfinished. This release is hardening, not full V1.

# Resume My Gobbler production work

## Latest hardening checkpoint (supersedes deployment paths below)

Fetched and fast-forwarded team main through 2694d4f. User explicitly wants the
teammate's Discord work left alone. No Discord modules/settings changed here.
Calendar hardening adds transactional disconnect/sync/OAuth-callback fencing,
provider response validation, refresh compare-and-set, and invalid-token status.
Health now probes MongoDB with a two-second bound and returns redacted HTTP503
when unavailable. Regression coverage includes disconnect during an in-flight
read/exchange, preservation of prior context on malformed responses, isolation,
and protection of replacement credentials from failed old refreshes.

Deployment coordination is REQUIRED: read-only SSH inspection found the app still
running image my-little-gobbler-app:55e3420, but /opt/vtevents/current and the entire
/opt/vtevents/releases directory are now absent. /opt/vtevents exists and was
modified by other work. Do not assume the older runbook paths/env backups exist.
User approved deployment after inspecting teammate setup. Teammate checkout at
/opt/vtevents is clean2694d4f; preserve it. New release is prepared separately at
/opt/gobbler-releases/3fc68ee with mode0600 configuration recovered directly from
the running container (never printed). Production image build is in progress.
User supplied C:/Users/Outsi/Downloads/env: it adds Discord credentials/enables
collection but changes auth/encryption/analytics secrets and APP_ORIGIN. Asked to
confirm applying only Discord fields while preserving production identity secrets;
answer pending. Do not copy the supplied file wholesale or commit it.

Still unfinished: auth email verification/recovery (no mail delivery provider
configured), live Google consent/sync/write, Canvas institutional key, club-owned account deletion review (coordinate with
teammate), Vultr exposed API-key rotation and credit protection. Google Cloud trial
billing page reports prepayment required; $0 limit still applies. No trial payment
or Gemini backend migration performed. Do not confuse Google Cloud trial credits
with the excluded AI Studio Gemini API.

Continue the existing private **https://github.com/JARA-org/vtevents**, branch main. Do not create another repository or discard team work. Read AGENTS.md, Master.md, MAKEOVER_HANDOFF.md and packages/shared/src/contracts.ts before interface work. Latest upstream makeover uses **My Gobbler**, supplied turkey assets and a Gobbler favicon. Keep cloud/database identifiers unchanged. Current v2 requires authentication; anonymous demo retirement is intentional. Frontend is UI/transport only; all domain logic stays in the Node backend. Discord is strictly read-only toward server resources.

## Deployed and verified

**Public URL: https://vtevents.us.** Deployed application revision **55e3420**, including upstream team makeover and latest Gateway/club/publication changes. Previous release/image3b003bb retained for rollback. A regression fix now keeps API tests independent of real local provider credentials. Subsequent documentation commits do not require rebuilding this same application. Check git status/log and fetch before further changes; preserve uncommitted work.

Existing Vultr host: **45.77.222.255**, vtevents-production, UUID58a5e940-b3e2-4e68-b372-15ef3737575c, Ubuntu24.04, 1vCPU/2GB/55GB, New Jersey. This session did not create/reinstall a VM. Docker29.8.1/Compose5.5.1 are installed, about5GB swap exists. Node runs inside Docker, not on the host.

- Release `/opt/vtevents/releases/55e3420`; symlink `/opt/vtevents/current` points there.
- Image `my-little-gobbler-app:55e3420`, also latest. Containers `my-little-gobbler-app-1` and `my-little-gobbler-caddy-1` healthy/running. Compose project my-little-gobbler. Persistent Caddy volumes preserve certificates.
- Root-readable `.env.production` in release directory, mode0600. Never print it or run plain `docker compose config`; use `config --quiet`. Preserve encryption/auth/analytics secrets across updates.
- Porkbun JaraOrg owns vtevents.us. A root45.77.222.255; www CNAMEvtevents.us; TTL600. HTTPS and root redirect configured through Caddy.
- Startup/hourly source/calendar jobs and minute analytics retries run in Node. Discord collector disabled. Startup refresh passed again after restart; long-term hourly execution/whole-host reboot not yet observed.
- Runtime non-root, read-only filesystem, cap_dropALL, no-new-privileges, internal3000,768MB cap, rotated logs. Public ports80/443; SSH narrow workstation /32.

## SSH access is recovered — do not repeat the console workaround

Repo root on this Windows workstation:
`C:/Users/Outsi/Documents/Codex/2026-09-19/build-and-deploy-the-complete-v1/outputs/my-little-gobbler`

Ignored private key `work/my-little-gobbler-deploy`; pinned host keys `work/vultr-known-hosts`. Private key has owner-only Windows ACL. Example PowerShell command:

```powershell
ssh -i work/my-little-gobbler-deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=work/vultr-known-hosts root@45.77.222.255 'cd /opt/vtevents/current && export GOBBLER_DOMAIN=vtevents.us && docker compose -f deploy/compose.yaml ps'
```

Use single-quoted PowerShell remote command text so `$` remains remote shell syntax. A clean git archive was transferred, excluding ignored files; env transferred separately. Inspect/preserve remote state before any future update. Retain the old image/release before rebuilding. Never `down --volumes` or reinstall the VM.

Public key fingerprint SHA256:o60Z/WNvF495X2voZclaZXe3wdInRCdLeSv9diA0I20. The unlisted gist9fee0267b454e485aa8ca35677dafcb9 under0utsights contains ONLY its public half; it helped the owner install the key despite console clipboard failure. Original authorized keys preserved.

Recovered root password was exposed through a prior browser copy field. It has now been rotated securely over SSH, stored only in owner-readable `work/vultr-root-password`. The original Vultr console password is obsolete. Do not print credentials or ask for passwords in chat.

## Accounts, constraints, dependencies

Owner: GitHub0utsights (John Surles), JARA-org private repo. Google/Atlas identity surlezrulez@gmail.com. Vultr John Surles/outsightszs@Outlook.com. Prefer these existing accounts.

**Cost rule remains $0 beyond $100 MLH credit, with a hard cap.** Existing Vultr VM's observed plan is $10/month; credit expires after30days. Last observed accrued cost$0.05. No stop-at-credit-zero cap/free-compute approval verified. Do not claim billing safe or create new paid resources/add-ons/payment methods/subscriptions. Powering off does not stop Vultr billing. Owner rejected switching to Render. Existing resource was reused; resolve billing protection with owner/provider before assuming ongoing zero-cost hosting.

- **Atlas:** M0Free my-little-gobbler, project6aae924eebb5b272725466a4; database my_little_gobbler. App user readWrite only that DB, cluster-restricted. Both workstation73.171.46.27/32 and server45.77.222.255/32 are ACTIVE. Server rule saved after explicit owner approval. Real public account/persistence/deletion tests passed.
- **Gemini:** gen-lang-client-0163130285, free tier/no billing, gemini-3.5-flash-lite. Replacement key named my-little-gobbler-production is in ignored work/gemini-production-key, .env and .env.production, deployed and live-tested. **Old Default Gemini API Key deleted with explicit owner approval**, only production key remains. Do not re-use work/gemini-key (retired). Public IDs validated; opt-in AI, bounded candidates/request budget, deterministic fallback.
- **Vultr API:** key shared in chat remains exposed and needs rotation; current saved key is IP-restricted401. A narrow API allowlist73.171.46.27/32 was prepared but NOT saved/approved. API is unnecessary now that SSH works. Do not broaden it merely because a form exists.
- **Google Calendar:** OAuth+PKCE/freebusy/write/revoke/idempotency implemented. **Production configured**: owner approved Cloud terms, API User Data Policy, credential creation, Calendar API enablement and sole test user surlezrulez@gmail.com. My Gobbler consent is external/testing; Calendar API enabled; declared scopes calendar.freebusy + calendar.events.owned only. Web client my-little-gobbler-production has ONLY callback https://vtevents.us/api/connections/google/callback and no JS origins. Credential captured privately into ignored owner-ACL work/google-oauth.json; .env and .env.production updated and env-only deployment recreated app successfully. Original pre-Google production env preserved remotely as .env.production.before-google. Production initiation QA confirms configured=true, exact callback, PKCE S256, random state and scopes; no personal Google calendar read/write yet. User was asked to sign into their OWN vtevents.us account and complete Settings -> Google Calendar -> Connect. Do not attach their private calendar to disposable QA accounts. Await their response and verify connection without exposing busy contents. Test-mode refresh tokens expire7days; broad student access needs verification/publishing and additional test users meanwhile. No billing/trial/paid quota increases enabled.
- **Canvas:** VT-enabled OAuth developer key required. No credential/admin approval. Callback https://vtevents.us/api/connections/canvas/callback. Existing adapter/writes guarded; no live claim.
- **Discord:** app1550880609491222639 exists. Bot token/public key not configured in production; Message Content Intent off; no server installation. Needs CLIENT_ID/PUBLIC_KEY/BOT_TOKEN, never retired CLIENT_SECRET or user OAuth. Signed endpoint https://vtevents.us/api/discord/interactions. Registration script previews by default; --apply explicitly upserts named commands. Server owner/admin selects public channels and explicit submissions; exclusions override both. New upstream code uses Discord Gateway post/edit/delete IDs and a durable queue (no historical scans); per-guild budgets5/day and2/hour. Qualified events automatically publish with evidence and club ownership; authorized corrections are audited. /clubs and private /gobbler setup server-link flow are implemented. Bot is NOT configured/live in this deployment; do not enable flags before credentials, intent, installation and tests. Deferred imported-club claiming/general event CRUD/conflict review remain out of scope. Follow latest AGENTS/Master instructions; older staged-only descriptions are historical.
- **ElevenLabs:** Free10kcredits, TTS-only key cap8k/refresh + leak auto-disable. Secret deployed. Earlier real MP3/cache/authenticated endpoint tests passed. Audible browser playback remains unverified after prior browser crash; do not claim it passed.
- **Sources:** official GobblerConnect public ICS and VT Sports JSON-LD live; latest2242/349 raw records,1520 current discoverable events. No undocumented campus API.
- **Auth:** Better Auth accounts run in Atlas; email verification/recovery service still missing for broad launch.

## Verification this deployment

50/50tests passed; frontend/backend typecheck, architecture and v1/v2contract checks pass. Full Expo/backend Docker build passed on actual Vultr. Linux preflight and Compose config validation pass. Production web bundle59files/zero configured-secret matches. Source/local bundle known-secret scan170files/zero matches; repeat after edits.

Public HTTPS smoke7/7 passed before and after app restart. Synthetic signup/profile/Friday availability/live events/save/ICS/real Gemini grounded IDs/demo404/account deletion passed. Secure+HttpOnly+SameSite=Lax cookies verified. Browser onboarding/search/details/source/save/calendar destination review/ICS feedback passed. Added busy block changed saved Isidore String Quartet to schedule conflict; other unprovided availability was unknown. Desktop1280x800 and mobile390x844 inspected (docwidth390), Gobbler favicon/title verified. Settings showed providers unavailable before Google setup; Google is now configured for the sole allowed test user. Canvas remains unavailable. Restart retained session/profile/saves and refreshed both feeds.

Ignored QA helpers: work/verify-production-flow.ts (full flow + cleanup), work/production-browser-qa.mjs (create/check/delete synthetic UI account), work/scan-safe-source.mjs, work/scan-production-bundle.cjs, work/verify-google-production.mjs (OAuth initiation and disposable-account cleanup). Disposable browser QA account was deleted after reauthentication (the 5-minute fresh-session safeguard correctly rejected the initial deletion). Ignored work/production-qa-session.json contains obsolete test credentials/cookies; do not re-use. No real user data used. Do not print these files.

## Next work

1. Verify current public health/release and git state; do not redo solved SSH/DNS/Atlas/key work.
2. Google terms/client/API/test-user setup is complete. Finish personal Google consent/sync and an explicitly chosen calendar write if the owner completes connection; observe required at-action browser permission handoffs. Keep all secret capture private. Continue Discord only through supported authorized access.
3. Check auth recovery requirements, Google live write/idempotency, permitted Discord publication, and standard-browser voice playback. Record exact dependencies rather than describing required work as complete.
4. Update docs/PROGRESS/this handoff, scan secrets, commit/push main and verify remote SHA. User explicitly wants everything safe pushed before usage ends. No secrets, work files, generated production env or private keys may enter Git.

Browser available through cua_repl; call rewriteDocumentation after compaction. Native Windows browser control was blocked by tool policy; do not route around it. Existing in-app browserID2 has cloud dashboards and production QA tab. Rediscover tabs if stale. Do not dump/screenshot credential dialogs. Keep only needed deliverable/handoff tabs. Passwords/MFA/CAPTCHA/personal consent remain personal actions; generic authorization does not override browser at-action confirmations.

## Final release continuation

Integrated upstream7bbfbf9 (including0a8d8ba Discord/club work), passed50tests/typechecks/contracts, and built/deployed55e3420. Production dependency audit0vulnerabilities. Caddy/app healthy, seven HTTPS probes and synthetic live core/Gemini/OAuth-initiation flows passed after update. Public events1519 at final check; counts change with time. Configured-secret scan of actual production bundle59files/zero matches. Source/local export170files/zero matches. The old3b003bb release/image remain for rollback; Google secrets carried forward unchanged. No additional paid resources.

Owner's “I connected Google Calendar” was clarified: they had not recognized the site connection step. Actual production DB metadata showed ZERO Google connections. Opened https://vtevents.us/?page=auth visibly and explained sign in/create account -> Settings -> Google Calendar -> Connect using sole test account surlezrulez@gmail.com. Do not claim a completed personal Google connection. Never create a hidden permanent owner password or attach the owner's calendar to disposable QA. All synthetic QA accounts were deleted.

Additional audit item for the latest upstream club feature: review account-deletion cleanup of managed_clubs/club tickets/correction audit data; the existing account endpoint principally deletes userId-scoped collections while club ownership uses ownerId. No production club was created by QA. Keep Discord disabled until live setup and lifecycle checks.
