# Account and resource inventory

Updated 2026-09-19. No secrets belong in this inventory.

| Resource | Owner | Dashboard / purpose | Cost and current state |
|---|---|---|---|
| Private GitHub repository | JARA-org; collaborator `0utsights` (John Surles) | https://github.com/JARA-org/vtevents | Existing repository preserved; no new repository. |
| Atlas M0 `my-little-gobbler` | Signed-in owner, John's Org - 2026-09-19 | https://cloud.mongodb.com/v2/6aae924eebb5b272725466a4#/overview | Created and live-tested. AWS N. Virginia, 512 MB Free. No Atlas payment method. |
| Atlas application user | Same owner | Atlas Database & Network Access | `my-little-gobbler-app`, readWrite only on `my_little_gobbler`, restricted to the Gobbler cluster. Workstation `/32` only; add selected host's IP later. |
| Gemini project | `surlezrulez@gmail.com` | https://aistudio.google.com/api-keys?project=gen-lang-client-0163130285 | Free tier without billing. Real `gemini-3.5-flash-lite` calls passed. Setup credential must be rotated before public deployment. |
| Vultr | John Surles, `outsightszs@Outlook.com` | https://console.vultr.com | Existing `vtevents-production` VM, `45.77.222.255`, Ubuntu 24.04, 2 GB/1 vCPU, New Jersey; $0.03 accrued at current check. No VM created in this deployment session. $100 MLH credit with 30-day expiry; owner requires $0 beyond credits and hard cap, which remains unverified. No additional paid resources authorized. |
| Domain `vtevents.us` | Signed-in Porkbun account `JaraOrg` | https://porkbun.com/account/domainsSpeedy | Owner selected this hostname. Saved root A `45.77.222.255`, `www` CNAME `vtevents.us`, TTL 600, replacing parking records. HTTPS app not yet verified. |
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

Earlier workspace access checkpoint (2026-09-19): read-only API checks passed with balance `-100`, pending charges `0`, and zero instances. That is historical, not the current inventory. This Windows checkout's saved key now receives an explicit API IP restriction; the current workstation is `73.171.46.27`, while the server's SSH rule permits the previous workstation `45.3.88.247/32`. The key supplied in chat still requires rotation. Balance alone does not prove a hard spending cap.

Stripe Projects catalog/preflight was investigated; direct account setup was used where available. Latest ElevenLabs/Tiger/Vultr catalog lookups returned HTTP429, so no resources were provisioned through it.

Latest launch preparation (2026-09-19): VM UUID `58a5e940-b3e2-4e68-b372-15ef3737575c`, firewall group `22854a88-d716-4c27-8c6e-09edaf051959`. The earlier `vtevents-deploy` private key is absent from this checkout. Existing root login was captured into ignored owner-readable recovery storage. A later browser accessibility snapshot exposed the copy-field value; the owner was informed and it requires rotation after recovery. Password authentication over SSH is disabled. SSH allowlisting for73.171.46.27/32 is saved and verified. SSH now accepts connections but allows only public-key authentication. The new ignored owner-ACL deployment key is generated but not yet installed. Atlas VM allowlisting and a narrow Vultr API allowlist entry remain prepared, awaiting required confirmations. The API route is needed because the in-app browser is not opening the console popup. Local ignored `.env.production` contains Atlas, ElevenLabs and fresh independent application secrets; Gemini is intentionally blank pending replacement of the exposed setup credential. Preserve any existing remote encryption key/salt if remote data is found.

GitHub Actions checks remain workflow_dispatch only. Scheduled refresh is guarded by GOBBLER_JOBS_ENABLED, currently unset; do not enable potentially billable organization Actions without verifying its free allowance/hard cap. Vultr's continuously running Node process needs no paid cron service.
