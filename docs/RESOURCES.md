# Account and resource inventory

Updated 2026-09-19. No secrets belong in this inventory.

| Resource | Owner | Dashboard / purpose | Cost and current state |
|---|---|---|---|
| Private GitHub repository | JARA-org; collaborator `0utsights` (John Surles) | https://github.com/JARA-org/vtevents | Existing repository preserved; no new repository. |
| Atlas M0 `my-little-gobbler` | Signed-in owner, John's Org - 2026-09-19 | https://cloud.mongodb.com/v2/6aae924eebb5b272725466a4#/overview | Created and live-tested. AWS N. Virginia, 512 MB Free. No Atlas payment method. |
| Atlas application user | Same owner | Atlas Database & Network Access | `my-little-gobbler-app`, readWrite only on `my_little_gobbler`, restricted to the Gobbler cluster. Workstation `73.171.46.27/32` and production `45.77.222.255/32` are active; no broad network rule. |
| Gemini project | `surlezrulez@gmail.com` | https://aistudio.google.com/api-keys?project=gen-lang-client-0163130285 | Free tier without billing. Real `gemini-3.5-flash-lite` calls passed. Replacement `my-little-gobbler-production` key deployed and live-tested. Old exposed setup key deleted with owner approval; only the production key remains. |
| Vultr | John Surles, `outsightszs@Outlook.com` | https://console.vultr.com | Existing `vtevents-production` VM, `45.77.222.255`, Ubuntu 24.04, 2 GB/1 vCPU, New Jersey; $0.05 accrued at the last dashboard check. No VM created in this deployment session. $100 MLH credit with 30-day expiry; owner requires $0 beyond credits and hard cap, which remains unverified. No additional paid resources authorized. |
| Domain `vtevents.us` | Signed-in Porkbun account `JaraOrg` | https://porkbun.com/account/domainsSpeedy | Owner selected this hostname. Saved root A `45.77.222.255`, `www` CNAME `vtevents.us`, TTL 600, replacing parking records. HTTPS app is live and verified at https://vtevents.us, including authenticated core flow and restart persistence. |
| ElevenLabs | Signed-in Google account; onboarding name Johnny | https://elevenlabs.io/app/api/api-keys | Free plan confirmed10,000credits; TTS-only key with8,000credit refresh-period cap, leak auto-disable on. Real270,881byteMP3 and cache/authenticated endpoint verified. No subscription or credit purchase. |
| Databricks Free Edition | `surlezrulez@gmail.com` | https://dbc-4490568c-354b.cloud.databricks.com | Workspace exists. Console rejects automated control. Owner requested Genie One MCP; authentication/setup blocked as detailed in GENIE_SETUP.md. No live analytics table/dashboard yet. |
| Discord | Existing signed-in developer account (personal ownership) | https://discord.com/developers/applications | Application1550880609491222639 created after personal CAPTCHA; branding saved. Guild-only installation requests View Channels and Read Message History. Bot/client secrets, intent and owner-selected server installation still pending. No unrelated bot modified. |
| Tiger Data | Not provisioned | https://www.tigerdata.com/pricing | Optional public event activity/time-series extension researched. Managed pricing showed trial/paid plans; no verified sponsor free resource configured. |
| Render | Not used | https://dashboard.render.com | Blueprint retained as fallback. Owner chose to keep hosting pending for Vultr. |
| Local app with cloud services | User's workstation | http://localhost:3001 | Real Atlas and Gemini; source refresh and disposable-account core flow passed. Not public deployment. |
| Local development app/database | User's workstation | http://localhost:3000; ignored work/local-mongo | Separate prior local Mongo replica set. No personal provider content. |
| Sites preview | Original registration account inaccessible to current connection | `.openai/hosting.json`: appgprj_6aae24e2bd588191a3b403b7ff3b54ba | NOT_FOUND; not deployed. Do not create a duplicate or substitute an unrelated site. |

Secrets are in ignored `.env`, `.env.production` and `work` files, and in the remote release's mode-0600 env file. The production Gemini credential has been replaced and tested. The old default Gemini key was deleted with owner approval; the exposed Vultr API key still requires rotation. Never repeat credential values.

Production checkpoint (2026-09-19): existing VM UUID `58a5e940-b3e2-4e68-b372-15ef3737575c`, firewall `22854a88-d716-4c27-8c6e-09edaf051959`. New deployment key is installed and SSH tested with a pinned host key. Narrow SSH access for `73.171.46.27/32` is active; original rules preserved. The recovered root password was rotated after exposure; its replacement is private owner-readable recovery storage. No server reinstall or additional paid VM was used.

Release `55e3420` is running through Docker/Caddy at https://vtevents.us. Atlas host allowlisting is active. Fresh independent application secrets, Atlas, replacement Gemini and the existing capped ElevenLabs key are configured. Personal provider connections are retired; earlier credential configuration is not an active capability. Root/www DNS and public TLS are verified. Both public source jobs refreshed on the host. A whole-host reboot and future hourly execution have not yet been observed; startup refresh and app restart were tested.

Vultr API access from this workstation still returns an IP restriction. A narrow API entry was prepared but not saved; it is unnecessary now that SSH works. Historical balance `-100` and the dashboard's resource limit are not evidence of a hard cap. The owner still requires $0 beyond credits; free-compute approval/stop-at-credit-zero protection remains unresolved. No new paid resources, backups, load balancer or subscription were added.

GitHub Actions checks remain workflow_dispatch only. Scheduled refresh is guarded by GOBBLER_JOBS_ENABLED, currently unset; do not enable potentially billable organization Actions without verifying its free allowance/hard cap. Vultr's continuously running Node process needs no paid cron service.

Public-key recovery artifact: unlisted GitHub gist owned by0utsights, https://gist.github.com/0utsights/9fee0267b454e485aa8ca35677dafcb9 . Contains only the public SSH key, no private key, credentials or application source. Free existing GitHub account. Raw HTTPS download verified against the local public-key file; created to avoid unreliable console clipboard/manual base64 typing.
