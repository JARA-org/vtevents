# Account and resource inventory

Updated 2026-09-19. No secrets belong in this inventory.

| Resource | Owner | Purpose / dashboard | Cost constraint / state |
|---|---|---|---|
| Existing private GitHub repository | JARA-org; authenticated collaborator `0utsights` (John Surles) | https://github.com/JARA-org/vtevents | Existing repository preserved. No new repository created. |
| Local application | User's Windows workspace | `outputs/my-little-gobbler`; http://localhost:3000 when running | Local only. No cloud charges. |
| Local MongoDB replica set | User's workstation | Started by `npm run local`; data in ignored `work/local-mongo` | Development database only; not Atlas. |
| Sites project | Current connected Sites account | `appgprj_6aae24e2bd588191a3b403b7ff3b54ba`; manifest `.openai/hosting.json` | Registered, private, **not yet deployed**. No live URL claimed. Reuse this ID; do not create another Site. |
| Render | Awaiting intended owner email/sign-in | https://dashboard.render.com | No service created. Use Free plan only, verify absence of billable overages. |
| MongoDB Atlas | Awaiting intended owner email/sign-in | https://cloud.mongodb.com | No cluster created. M0 Free only. Restrict network access and database permissions. |
| Gemini / Google Cloud | Awaiting intended owner email/sign-in | https://aistudio.google.com and https://console.cloud.google.com | No key/client created. Free project with billing disabled; no uncapped billable use. |
| Canvas | University-controlled access | https://canvas.vt.edu | Requires VT-enabled OAuth developer key and scopes. No credentials available. |
| Discord | Awaiting intended owner and server admin | https://discord.com/developers/applications | No bot created. Free bot; only explicitly authorized announcement channels. |
| Databricks | Awaiting intended owner sign-in | https://www.databricks.com/learn/free | No workspace or dashboard created. Free Edition only. |

Owner email was requested once and has not been supplied. Render's browser tab is at sign-in. Do not select an unrelated identity or request passwords/MFA codes in chat. The user's authorization covers free account/resource creation and deployment, but personal authentication and required consent still need user takeover.

GitHub Actions checks are `workflow_dispatch` only. The six-hour scheduled job is guarded by `GOBBLER_JOBS_ENABLED=true`; this is unset. Verify included Actions minutes and hard spending constraints before enabling automatic usage.
