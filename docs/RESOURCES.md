# Account and resource inventory

Updated 2026-09-19. No secrets belong in this inventory.

| Resource | Owner | Dashboard / purpose | Cost and current state |
|---|---|---|---|
| Private GitHub repository | JARA-org; collaborator `0utsights` (John Surles) | https://github.com/JARA-org/vtevents | Existing repository preserved; no new repository. |
| Atlas M0 `my-little-gobbler` | Signed-in owner, John's Org - 2026-09-19 | https://cloud.mongodb.com/v2/6aae924eebb5b272725466a4#/overview | Created and live-tested. AWS N. Virginia, 512 MB Free. No Atlas payment method. |
| Atlas application user | Same owner | Atlas Database & Network Access | `my-little-gobbler-app`, readWrite only on `my_little_gobbler`, restricted to the Gobbler cluster. Workstation `/32` only; add selected host's IP later. |
| Gemini project | `surlezrulez@gmail.com` | https://aistudio.google.com/api-keys?project=gen-lang-client-0163130285 | Free tier without billing. Real `gemini-3.5-flash-lite` calls passed. Setup credential must be rotated before public deployment. |
| Vultr | John Surles, `outsightszs@Outlook.com` | https://console.vultr.com | API verified; $100 MLH promotional credit, 30-day expiry; $0 accrued at check. User personally linked a card. **No instance created.** Owner insists $0 beyond credit and hard cap; dashboard only shows resource limits. Free-compute application submitted, pending approval. |
| Domain `vtevents.us` | Signed-in Porkbun account `JaraOrg` | https://porkbun.com/account/domainsSpeedy | Ownership visible in domain management. Porkbun remains authoritative DNS; root and www resolve to existing Porkbun addresses. No DNS changes made. |
| ElevenLabs | Signed-in Google account; onboarding name Johnny | https://elevenlabs.io/app/api/api-keys | Free plan confirmed10,000credits; TTS-only key with8,000credit refresh-period cap, leak auto-disable on. Real270,881byteMP3 and cache/authenticated endpoint verified. No subscription or credit purchase. |
| Databricks Free Edition | `surlezrulez@gmail.com` | https://dbc-4490568c-354b.cloud.databricks.com | Workspace exists. Console rejects automated control. Owner requested Genie One MCP; authentication/setup blocked as detailed in GENIE_SETUP.md. No live analytics table/dashboard yet. |
| Discord | Existing signed-in developer account (personal ownership) | https://discord.com/developers/applications | Application1550880609491222639 created after personal CAPTCHA; branding saved. Guild-only installation requests View Channels and Read Message History. Bot/client secrets, intent and owner-selected server installation still pending. No unrelated bot modified. |
| Google Calendar OAuth | Intended existing Google project owner | https://console.cloud.google.com/apis/credentials | No OAuth client provisioned yet; production origin pending hosting. |
| Canvas | University-controlled access | https://canvas.vt.edu | Requires VT-enabled OAuth developer key. No credentials or approval available. |
| Tiger Data | Not provisioned | https://www.tigerdata.com/pricing | Optional public event activity/time-series extension researched. Managed pricing showed trial/paid plans; no verified sponsor free resource configured. |
| Render | Not used | https://dashboard.render.com | Blueprint retained as fallback. Owner chose to keep hosting pending for Vultr. |
| Local app with cloud services | User's workstation | http://localhost:3001 | Real Atlas and Gemini; source refresh and disposable-account core flow passed. Not public deployment. |
| Local development app/database | User's workstation | http://localhost:3000; ignored work/local-mongo | Separate prior local Mongo replica set. No personal provider content. |
| Sites preview | Original registration account inaccessible to current connection | `.openai/hosting.json`: appgprj_6aae24e2bd588191a3b403b7ff3b54ba | NOT_FOUND; not deployed. Do not create a duplicate or substitute an unrelated site. |

Secrets are in ignored `.env` / `work` files and are not part of source control. Rotate the Vultr key shared in chat and the default Gemini key that appeared in a redaction failure before public deployment. Do not repeat their values.

Current workspace access checkpoint (2026-09-19): authenticated read-only account and instance-list checks passed. API returned balance `-100`, pending charges `0`, and zero compute instances (no further page). Credential is stored only in ignored `work/vultr-api-key` with mode `0600`. The initial 401 was caused by Node selecting IPv6 while the added allowlist entry was IPv4; the CLI now prefers IPv4. The existing IPv4 entry was confirmed in the signed-in console; no allowlist changes or resources were needed. Balance alone does not verify credit expiry or a spending cap. The key was supplied in chat and should be rotated before production use.

Stripe Projects catalog/preflight was investigated; direct account setup was used where available. Latest ElevenLabs/Tiger/Vultr catalog lookups returned HTTP429, so no resources were provisioned through it.

Launch preparation (2026-09-19): registered the dedicated `vtevents-deploy` public SSH key in Vultr; private key remains only in ignored `work/`. Confirmed `vc2-1c-2gb` availability in `ewr` (New Jersey), $10/month, Ubuntu 24.04 LTS x64. This is a proposed paid configuration, awaiting resolution of the existing spending constraint. Created owner-only ignored `.env.production` with independent application secrets; Atlas URI is missing, and production preflight correctly fails on that field. No compute instance or DNS change has been made.

GitHub Actions checks remain workflow_dispatch only. Scheduled refresh is guarded by GOBBLER_JOBS_ENABLED, currently unset; do not enable potentially billable organization Actions without verifying its free allowance/hard cap. Vultr's continuously running Node process needs no paid cron service.
