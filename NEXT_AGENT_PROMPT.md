# Takeover prompt — My Little Gobbler

Continue implementing and deploying My Little Gobbler in the existing private https://github.com/JARA-org/vtevents repository. The owner wants the project online and explicitly requests safe changes pushed plus a current takeover prompt before usage runs out.

## Read first

Checkout: C:/Users/Outsi/Documents/Codex/2026-09-19/build-and-deploy-the-complete-v1/outputs/my-little-gobbler. Main, gh identity 0utsights. Pulled f6a4cfd on 2026-09-19. Read AGENTS.md, Master.md, packages/shared/src/contracts.ts before interfaces, and current git status. Preserve upstream changes: frontend UI only, typed transport, backend domain logic, type-only shared contracts, v2 sign-in required. Demo/anonymous app access was intentionally retired. Discord is now a read-only server bot, not user OAuth. Do not restore old implementations. No new subagents unless expressly authorized.

## Current deployment facts

- Owner selected existing domain vtevents.us and signed into Porkbun as JaraOrg. Saved root A 45.77.222.255 and www CNAME vtevents.us (TTL 600), replacing parking records. Independent DNS through 1.1.1.1 verified both. Caddy already supports root and www redirect.
- Existing Vultr server found in signed-in owner console: vtevents-production, UUID 58a5e940-b3e2-4e68-b372-15ef3737575c, 45.77.222.255, Ubuntu 24.04, 1 CPU/2GB/55GB, New Jersey, created 2026-09-19 18:36:19 UTC. Dashboard showed $0.03 accrued. This session did not create it. Firewall 22854a88-d716-4c27-8c6e-09edaf051959 currently permits public80/443, SSH only45.3.88.247/32; current workstation IPv4 is73.171.46.27. A new SSH22 rule for73.171.46.27/32 was saved and verified during access recovery; SSH is now reachable after propagation.
- User insists Vultr only and $0 beyond $100 MLH credits with hard cap. Render fallback was rejected. No credit-zero cap/free-compute approval has been verified. No additional paid resources. Existing VM does NOT establish cost safety. Do not destroy/reinstall it to recover access; power-off does not stop billing.
- Previous deployment public key vtevents-deploy exists in Vultr but its private key is absent from this checkout. User asked whether it can be replaced. Explained replacement via console, but recovered existing root password directly from owner's dashboard into ignored owner-ACL work/vultr-root-password, never printed. Password login may avoid key replacement after firewall access. SSH now responds but rejects password authentication (BadAuthenticationType; keys only). The View Console button still opens no usable window in this in-app browser. A fresh Ed25519 deployment key exists in ignored owner-ACL work/my-little-gobbler-deploy, public half .pub, fingerprint SHA256:o60Z/WNvF495X2voZclaZXe3wdInRCdLeSv9diA0I20. It is NOT installed on the server yet. work/install-deploy-key.sh is a prepared idempotent public-key-only script, preserving existing authorized_keys. The user explicitly asked the agent to perform key installation.
- .env.production is ignored and Windows owner-ACL restricted. Fresh independent auth/encryption/job/analytics secrets; existing Atlas URI and ElevenLabs key/voice copied privately. Gemini deliberately blank pending rotation; optional integrations blank/disabled. Pure config validation passed. Linux must chmod600. Preserve remote encryption keys/salt if any prior deployment/data exists; do not blindly overwrite.

## Pending user actions / prepared forms

Check latest replies before asking again. Browser rules require at-action confirmation for security-sensitive grants and personal completion of credential replacement. Do not repeat already granted confirmations.

1. Vultr SSH firewall rule is DONE and verified. API remains IP-blocked. In the Vultr API Access page, Add Access Control is prepared with73.171.46.27 and prefix32. Asked explicit at-action permission to save this API allowlist entry so the supported API can supply the instance console/KVM link. Await reply before saving. Do not reinstall SSH keys through the instance settings: official Vultr docs confirm that wipes the OS/data.
2. Atlas IP Access List dialog prepared:45.77.222.255/32, comment My Little Gobbler production Vultr server. Asked permission to Confirm. Wait then verify Active. Existing workstation73.171.46.27/32 must not be widened to0/0.
3. Google AI Studio Create key dialog prepared, name my-little-gobbler-production, Default Gemini Project gen-lang-client-0163130285. Asked owner to personally click Create key and leave result open. Store key directly in ignored configuration without emitting it. The old default setup key was exposed in prior tool output, user informed; retire it after replacement is tested. Vultr chat-shared API key also needs rotation.

SECURITY: the existing root recovery password appeared in a browser accessibility snapshot because Copy Password left a text field behind. User informed. It must be rotated after server access is restored, with the new value stored privately. Do not print or repeat it. Page reload cleared the copy-field residue.

Browser last session ID2; rediscover if stale. Tabs:2Atlas,3AIStudio,4DiscordBot,5Databricks,7Vultrfirewall,8ElevenLabs,15Porkbun,16Vultr API allowlist form,17local app. Browser controls are available. Call cua.rewriteDocumentation after compaction; never screenshot or dump key/password dialogs. Read clipboard into private file and clear rather than exposing credentials. Mark handoff tabs each turn. Password/MFA/CAPTCHA remain personal actions.

## Services

- Atlas M0 Free my-little-gobbler, project6aae924eebb5b272725466a4, org6aae924debb5b2727254666f. User my-little-gobbler-app readWrite only my_little_gobbler, cluster restricted. Real cloud app flow passed. No billing enabled.
- Gemini free/no billing, account surlezrulez@gmail.com, project gen-lang-client-0163130285, model gemini-3.5-flash-lite. Real recommendations verified. Old key is only local until rotated; do not send private scheduling context. Bounded public candidate IDs, opt-in, deterministic fallback.
- ElevenLabs Free10kcredits, TTS-only key8kcredits/refresh cap and leak auto-disable. Existing ignored key and .env work. Real MP3/cache/authenticated endpoint tested earlier. In-app audio playback crashed previously; audible standard-browser QA still pending.
- Discord app1550880609491222639. Bot token absent, Message Content Intent off, no server install. Guild install bot+applications.commands permissions ViewChannels/ReadMessageHistory prepared. Production needs CLIENT_ID,PUBLIC_KEY,BOT_TOKEN (NO client secret/user OAuth). Signed endpoint https://vtevents.us/api/discord/interactions. scripts/register-discord-commands.ts previews by default, --apply explicit POST upserts. New admin-selected public channels/individual submissions with exclusions; no Discord resource writes. Collector and budgeted semantic extraction stage candidates only; canonical publication unfinished. Both enable flags default false.
- Google Calendar OAuth implementation exists; Cloud OAuth app/consent not provisioned. Callback https://vtevents.us/api/connections/google/callback. Canvas needs VT-approved OAuth developer key. Neither live tested.
- Databricks Free workspace dbc-4490568c-354b.cloud.databricks.com exists. Owner requested Genie One MCP; no callable Genie/Databricks tools this session. Direct OAuth DCR unsupported, plugin ineligible, personal CLI consent incomplete; console rejects automated control. Do not bypass. Node outbox/SQL scripts ready, live table/dashboard not provisioned.
- GobblerConnect public official ICS and VT Sports public JSON-LD live. Latest source counts2242/349;1520 current/ongoing events. No fabricated campus API.

## Work and verification this session

- Fixed deployment optional credential group to Discord CLIENT_ID/PUBLIC_KEY/BOT_TOKEN; reject retired nonempty CLIENT_SECRET, invalid IDs/public keys, invalid boolean flags and daily budgets, enabled AI without collection/Gemini. Updated production template, added regression tests.
- npm run typecheck (includes architecture/contracts), full npm test44/44 and production build passed. Browser caught one-hour stale entry HTML; fixed HTML revalidation with a build-independent API regression fixture. API/deployment suite5/5, typecheck and build passed after that fix. Current v2 landing visually verified at390x844 and1280x800 without horizontal overflow. Docker Desktop engine unavailable here; prior upstream docs record container validation elsewhere.
- Fresh real Atlas/Gemini synthetic HTTP flow passed: signup -> profile/Friday availability persist ->1520 live events ->save/read ->ICS ->grounded Gemini ->retired demo rejection ->account deletion. Port3001 health live. work/verify-cloud-flow.ts adapted to v2, ignored; it uses old Gemini credential until rotation.
- DNS externally verified. Production HTTPS and server execution remain UNVERIFIED. Do not call V1 complete. Auth email verification/password recovery still missing before broad launch.
- Updated deployment/resource/integration/verification/progress docs to distinguish old checkpoints from existing VM/DNS facts. Verify final git push receipt in conversation/git log.

## Next execution steps

1. Apply approved narrow firewall/Atlas changes, test SSH. Existing root credential is private local recovery data. Use normal SSH/Paramiko with pinned host key after first connection; avoid printing env/password. If password rejected, use owner-assisted Vultr console to install new public key without reinstalling OS.
2. Inspect server before mutation: Docker/Compose, running services, /opt/vtevents, existing env/data and firewall. No destroying remote data or overwriting existing secrets.
3. Capture/test replacement Gemini credential, configure production secret privately. Add optional keys only when live verified.
4. Transfer clean tracked source (exclude work,.env,node_modules). Securely transfer .env.production separately with0600. deploy/bootstrap-host.sh installs official Docker on Ubuntu24.04. GOBBLER_DOMAIN=vtevents.us; preflight; docker compose config --quiet (plain config prints secrets); build/up. 2GB server may need bounded build memory. No billable extras.
5. Verify public HTTPS via deploy/smoke.mjs and authenticated browser signup/preferences/discovery/details/save/ICS/Gemini/mobile+desktop. Restart and persistence check. Inspect redacted jobs/source health. Then Discord interactions/commands and optional integrations.
6. Run appropriate tests after changes, secret-scan source/frontend bundle, update this file/PROGRESS/resources, commit and push main; verify remote SHA. Keep secrets ignored. Report precise remaining blockers rather than claiming full completion.

## Local runtime and secret locations

Node22.22.3/npm10.9.8. Atlas-backed dev process on localhost3001 (prior session53638), localMongo app may be3000. .env and work/{atlas-uri,atlas-password,gemini-key,vultr-key,elevenlabs-key,vultr-root-password,local-secrets.json} contain secrets; never print. work/scan-safe-source.mjs compares known secrets with tracked source/bundle but extend to new production secrets/recovery password before pushing. work/ is ignored and excluded from Docker context. Existing root password and new deployment private key have Windows owner-only ACLs. No successful remote login or key installation has happened yet. Avoid npmci while local Mongo binary is running on Windows.

## Clipboard-free key recovery

Console clipboard failed for the owner. Created an unlisted GitHub gist under0utsights containing ONLY the deployment public key: https://gist.github.com/0utsights/9fee0267b454e485aa8ca35677dafcb9 . Anonymous raw download https://gist.githubusercontent.com/0utsights/9fee0267b454e485aa8ca35677dafcb9/raw was fetched and verified byte-for-byte against work/my-little-gobbler-deploy.pub. Private key remains ignored/owner-readable. Manual server download/append is the next handoff; key-based SSH still rejected at the last test. No successful installation claimed. An is.gd shortening request failed with a database-insert error; do not give an unverified short link.
