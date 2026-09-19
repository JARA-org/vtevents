# My Gobbler makeover — resume here

Repository: https://github.com/JARA-org/vtevents (branch: `main`).
Makeover starting revision: `df7c007`. Check `git status` before updating a checkout.

## Request
Apply Arthur's supplied rebrand brief and two turkey assets. Duolingo-inspired
tactile buttons, warm VT palette, polished landing/sign-in and app screens,
accessible popup errors. Keep the existing Expo/React Native web + Node backend.
No generated art. Open the completed app at http://localhost:3000.

## Inputs
- Arthur's My Gobbler rebrand brief (`deepseek_text_20260919_e1c18a.txt`).
- Supplied head icon, included at `apps/frontend/assets/icon.png`.
- Supplied full turkey, included at `apps/frontend/assets/logo.png`.

## Progress
- Implemented the My Gobbler rebrand, provided assets and locally hosted Nunito.
- Added `components/theme.ts`, `ui.tsx`, `Landing.tsx`, `SignInCard.tsx` and
  `ErrorModal.tsx`; retained the existing app's features and typed backend client.
- Added `scripts/brand-web.mjs` to the frontend build to install title, favicon,
  theme, manifest, description and sharing metadata in Expo's single-page export.
- Removed the old mascot. Original supplied artwork is used; SVG files wrap PNG
  artwork and are not vector tracings. No generated images or new runtime deps.
- Build/typechecks/architecture/contracts passed. All **31 tests passed**,
  including the new error-copy regression test.
- Integrated team updates through `53c34a9`, preserving the new Discord bot
  workflow and the makeover. The combined build passes all **45 tests**.
- Lighthouse Home and Sign-in accessibility both scored 100/100. Reports are
  `work/lighthouse-home.json` and `work/lighthouse-auth.json`.
- Browser verified desktop and 390px mobile layouts, sign-in errors, focus trap,
  Escape and focus return. Existing local accounts/data/settings are preserved.
- See `CHANGELOG.md` for details and deliberate compatibility exceptions.

## Current preview
- Home: http://localhost:3000/?page=landing
- Sign-in: http://localhost:3000/?page=auth
- Signed-in app: http://localhost:3000/
- A background local server is running; PID is in `work/local-server.pid`.
- Use `git log` and `git status` to check your checkout against `origin/main`.
  Keep uncommitted work when updating from the shared repository.

## Verify and start
In PowerShell in the repository:
```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run local
```
The build and tests include architecture and contract checks.
`Start-Gobbler.cmd` is Arthur's existing local launcher; preserve it.
The current server PID is recorded in ignored `work/local-server.pid`.
Before stopping a process, verify it belongs to this checkout. Preserve
`work/local-mongo`, `work/local-mongo-port` and `work/local-secrets.json`.
Previous database backup: `work/backup-before-update-20260919-153404`.

## Compatibility
Do not rename existing database names, cloud resources or calendar event UIDs
as a cosmetic rebrand: that would lose data or duplicate calendar entries.
Do not enable paid integrations, deploy or push without appropriate task scope.
