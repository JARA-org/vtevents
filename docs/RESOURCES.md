# Account and resource inventory

Updated 2026-09-19. No secrets belong in this inventory.

| Resource | Owner | Purpose / dashboard | Cost constraint / state |
|---|---|---|---|
| Existing private GitHub repository | JARA-org; authenticated collaborator `0utsights` (John Surles) | https://github.com/JARA-org/vtevents | Existing repository preserved. No new repository created. |
| Local application | User's Windows workspace | `outputs/my-little-gobbler`; http://localhost:3000 when running | Local only. No cloud charges. |
| Local MongoDB replica set | User's workstation | Started by `npm run local`; data in ignored `work/local-mongo` | Development database only; not Atlas. |
| Sites project | Original registration account currently inaccessible; connected account is `surlezrulez@gmail.com` | `appgprj_6aae24e2bd588191a3b403b7ff3b54ba`; manifest `.openai/hosting.json` | **NOT_FOUND** to current account; not deployed. Recover access, do not create another Site. |
| Render | GitHub identity `0utsights`, personal OAuth consent pending | https://dashboard.render.com | No service created. Use Free plan only, verify absence of billable overages. |
| MongoDB Atlas | Awaiting intended owner email/sign-in | https://cloud.mongodb.com | No cluster created. M0 Free only. Restrict network access and database permissions. |
| Gemini / Google Cloud | Observed Google session `surlezrulez@gmail.com`; intended-owner confirmation/first-use consent pending | https://aistudio.google.com and https://console.cloud.google.com | No key/client created. Free project with billing disabled; no uncapped billable use. |
| Canvas | University-controlled access | https://canvas.vt.edu | Requires VT-enabled OAuth developer key and scopes. No credentials available. |
| Discord | Awaiting intended owner and server admin | https://discord.com/developers/applications | No bot created. Free bot; only explicitly authorized announcement channels. |
| Databricks | Awaiting intended owner sign-in/terms | https://docs.databricks.com/aws/en/getting-started/free-edition | Free Edition signup reached. No workspace or dashboard created. Free Edition only for this student prototype. |

Owner email was requested once. Existing Google session is now known, but its first-use consent remains pending. Render is at GitHub consent, Atlas at login, AI Studio at first-use terms, Discord at developer login and Databricks at Free Edition signup. User takeover was requested for the three core services. Do not request passwords/MFA codes in chat.

Stripe Projects provisioning was investigated with official CLI/plugin. Catalog offers Render Free but not Atlas or Gemini; preflight requires Stripe browser authentication. No Stripe project/provider resources were created. The Railway MongoDB offering was not substituted for Atlas.

GitHub Actions checks are `workflow_dispatch` only. The six-hour scheduled job is guarded by `GOBBLER_JOBS_ENABLED=true`; this is unset. Verify included Actions minutes and hard spending constraints before enabling automatic usage.
