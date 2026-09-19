# Resume My Gobbler production work

Continue the existing private **https://github.com/JARA-org/vtevents**, branch main. Do not create another repository or discard team work. Read AGENTS.md, Master.md, MAKEOVER_HANDOFF.md and packages/shared/src/contracts.ts before interface work. Latest upstream makeover uses **My Gobbler**, supplied turkey assets and a Gobbler favicon. Keep cloud/database identifiers unchanged. Current v2 requires authentication; anonymous demo retirement is intentional. Frontend is UI/transport only; all domain logic stays in the Node backend. Discord is strictly read-only toward server resources.

## Deployed and verified

**Public URL: https://vtevents.us.** Deployed application revision **3b003bb**, including upstream team makeover/Discord changes. Subsequent documentation commits do not require rebuilding this same application. Check git status/log and fetch before further changes; preserve uncommitted work.

Existing Vultr host: **45.77.222.255**, vtevents-production, UUID58a5e940-b3e2-4e68-b372-15ef3737575c, Ubuntu24.04, 1vCPU/2GB/55GB, New Jersey. This session did not create/reinstall a VM. Docker29.8.1/Compose5.5.1 are installed, about5GB swap exists. Node runs inside Docker, not on the host.

- Release `/opt/vtevents/releases/3b003bb`; symlink `/opt/vtevents/current` points there.
- Image `my-little-gobbler-app:3b003bb`, also latest. Containers `my-little-gobbler-app-1` and `my-little-gobbler-caddy-1` healthy/running. Compose project my-little-gobbler. Persistent Caddy volumes preserve certificates.
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

Owner: GitHub0utsights (John Surles), JARA-org private repo. Google/Atlas/Databricks identity surlezrulez@gmail.com. Vultr John Surles/outsightszs@Outlook.com. Prefer these existing accounts.

**Cost rule remains $0 beyond $100 MLH credit, with a hard cap.** Existing Vultr VM's observed plan is $10/month; credit expires after30days. Last observed accrued cost$0.05. No stop-at-credit-zero cap/free-compute approval verified. Do not claim billing safe or create new paid resources/add-ons/payment methods/subscriptions. Powering off does not stop Vultr billing. Owner rejected switching to Render. Existing resource was reused; resolve billing protection with owner/provider before assuming ongoing zero-cost hosting.

- **Atlas:** M0Free my-little-gobbler, project6aae924eebb5b272725466a4; database my_little_gobbler. App user readWrite only that DB, cluster-restricted. Both workstation73.171.46.27/32 and server45.77.222.255/32 are ACTIVE. Server rule saved after explicit owner approval. Real public account/persistence/deletion tests passed.
- **Gemini:** gen-lang-client-0163130285, free tier/no billing, gemini-3.5-flash-lite. Replacement key named my-little-gobbler-production is in ignored work/gemini-production-key, .env and .env.production, deployed and live-tested. **Old Default Gemini API Key deleted with explicit owner approval**, only production key remains. Do not re-use work/gemini-key (retired). Public IDs validated; opt-in AI, bounded candidates/request budget, deterministic fallback.
- **Vultr API:** key shared in chat remains exposed and needs rotation; current saved key is IP-restricted401. A narrow API allowlist73.171.46.27/32 was prepared but NOT saved/approved. API is unnecessary now that SSH works. Do not broaden it merely because a form exists.
- **Google Calendar:** implemented OAuth+PKCE/freebusy/write/revoke/idempotency. No OAuth app/client provisioned yet. Callback https://vtevents.us/api/connections/google/callback. Setup reached Google Cloud first-use terms for the existing Google identity; requested explicit approval to accept WITHOUT billing/trial. Check latest user reply before acting. Need enable Calendar API, configure consent/scopes/client/test users, save secrets privately, redeploy and test a personally authorized calendar connection/write. Do not call it externally approved or live yet.
- **Canvas:** VT-enabled OAuth developer key required. No credential/admin approval. Callback https://vtevents.us/api/connections/canvas/callback. Existing adapter/writes guarded; no live claim.
- **Discord:** app1550880609491222639 exists. Bot token/public key not configured in production; Message Content Intent off; no server installation. Needs CLIENT_ID/PUBLIC_KEY/BOT_TOKEN, never retired CLIENT_SECRET or user OAuth. Signed endpoint https://vtevents.us/api/discord/interactions. Registration script previews by default; --apply explicitly upserts named commands. Server owner/admin selects public channels and explicit submissions; exclusions override both. Collector/optional budgeted extraction stage validated candidates only; canonical publication unfinished. Do not enable flags before permissions/config/test.
- **ElevenLabs:** Free10kcredits, TTS-only key cap8k/refresh + leak auto-disable. Secret deployed. Earlier real MP3/cache/authenticated endpoint tests passed. Audible browser playback remains unverified after prior browser crash; do not claim it passed.
- **Databricks:** Free workspace https://dbc-4490568c-354b.cloud.databricks.com. Console explicitly blocks automated browser control. Owner requested Genie One MCP; no callable tools found. OAuthDCR unsupported, plugin catalog ineligible, personal CLI consent incomplete. Do not bypass. Node reliable outbox/SQL/dashboard queries exist; live ingestion/table/dashboard unconfigured.
- **Sources:** official GobblerConnect public ICS and VT Sports JSON-LD live; latest2242/349 raw records,1520 current discoverable events. No undocumented campus API.
- **Auth:** Better Auth accounts run in Atlas; email verification/recovery service still missing for broad launch.

## Verification this deployment

45/45tests passed; frontend/backend typecheck, architecture and v1/v2contract checks pass. Full Expo/backend Docker build passed on actual Vultr. Linux preflight and Compose config validation pass. Production web bundle59files/zero configured-secret matches. Source/local bundle known-secret scan162files/zero matches; repeat after edits.

Public HTTPS smoke7/7 passed before and after app restart. Synthetic signup/profile/Friday availability/live events/save/ICS/real Gemini grounded IDs/demo404/account deletion passed. Secure+HttpOnly+SameSite=Lax cookies verified. Browser onboarding/search/details/source/save/calendar destination review/ICS feedback passed. Added busy block changed saved Isidore String Quartet to schedule conflict; other unprovided availability was unknown. Desktop1280x800 and mobile390x844 inspected (docwidth390), Gobbler favicon/title verified. Settings correctly shows providers unavailable. Restart retained session/profile/saves and refreshed both feeds.

Ignored QA helpers: work/verify-production-flow.ts (full flow + cleanup), work/production-browser-qa.mjs (create/check/delete synthetic UI account), work/scan-safe-source.mjs, work/scan-production-bundle.cjs. Credentials/cookies for disposable browser QA are in ignored work/production-qa-session.json; delete through its API helper after UI QA if not already removed. No real user data used. Do not print these files.

## Next work

1. Verify current public health/release and git state; do not redo solved SSH/DNS/Atlas/key work.
2. Finish pending Google terms/client/API setup if owner approves; observe required at-action browser permission/credential handoffs. Keep all secret capture private. Continue Discord or Databricks only through supported authorized access.
3. Check auth recovery requirements, Google live write/idempotency, permitted Discord publication, Databricks outbox dashboard and standard-browser voice playback. Record exact dependencies rather than describing required work as complete.
4. Update docs/PROGRESS/this handoff, scan secrets, commit/push main and verify remote SHA. User explicitly wants everything safe pushed before usage ends. No secrets, work files, generated production env or private keys may enter Git.

Browser available through cua_repl; call rewriteDocumentation after compaction. Native Windows browser control was blocked by tool policy; do not route around it. Existing in-app browserID2 has cloud dashboards and production QA tab. Rediscover tabs if stale. Do not dump/screenshot credential dialogs. Keep only needed deliverable/handoff tabs. Passwords/MFA/CAPTCHA/personal consent remain personal actions; generic authorization does not override browser at-action confirmations.
